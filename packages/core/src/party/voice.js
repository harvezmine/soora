// Suara ruang: mesh WebRTC.
//
// Tiap peserta yang bergabung ke kanal suara menyambung langsung ke tiap
// peserta lain yang juga bergabung — server hanya meneruskan amplop sinyal,
// suaranya sendiri tidak pernah melewatinya. Jumlah sambungan tumbuh
// kuadratik, jadi jumlah orang di kanal suara dibatasi jauh lebih kecil
// daripada jumlah penonton.
//
// Bergabung ke kanal itu terpisah dari menyalakan mikrofon: bergabung berarti
// mendengarkan, dan itu terjadi otomatis tanpa perlu membuka mikrofon sendiri
// dulu. Tiap sambungan dibawa lewat satu transceiver audio yang arahnya
// diubah di tempat — recvonly selama mendengarkan saja, sendrecv begitu
// mikrofon dibuka — jadi menyalakan/mematikan mikrofon tidak pernah memutus
// sambungan yang sudah ada.
//
// Tanpa TURN, jaringan dengan NAT simetris tidak akan tersambung. Itu batas
// yang disadari: menyediakan TURN berarti menjalankan server relai sendiri.
import {
  tuneOpusSdp,
  createVad,
  rmsDari,
  jitterDelayMs,
  keputusanSinyal,
  perkiraanLatensiMs,
  volumeToElementGain,
} from './audio-tune.js';

const RTC_CONFIG = {
  iceServers: [{
    urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
    ],
  }],
  // Kumpulkan kandidat lebih awal supaya penawaran pertama tidak menunggu
  // proses penemuan jalur.
  iceCandidatePoolSize: 4,
  // Satu jalur untuk semua aliran: lebih sedikit port, lebih cepat siap,
  // dan lebih tahan pada jaringan yang membatasi.
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

/** Batas laju kirim per sambungan. Suara jernih jauh di bawah ini. */
const BITRATE_MAKS = 48_000;

/** Sesering apa tenaga suara diperiksa. 60 ms terasa seketika tanpa boros. */
const METER_MS = 60;

/**
 * Setelan tangkapan mikrofon.
 *
 * `latency` hanya berupa petunjuk; peramban boleh mengabaikannya, tapi bila
 * dituruti ia memperkecil penyangga masukan. Mono 48 kHz adalah laju asli
 * Opus, jadi tidak ada pengubahan laju yang menambah penundaan.
 */
const AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48_000,
  latency: 0.01,
};

/**
 * Peran saat tawaran bertabrakan. Kedua sisi boleh menawar kapan pun perlu;
 * yang sopan mengalah bila keduanya menawar bersamaan. Perannya wajib
 * berlawanan di dua sisi, jadi ditentukan dari perbandingan id — satu-satunya
 * nilai yang keduanya sama-sama tahu tanpa bertanya.
 */
const akuYangSopan = (idSaya, idLawan) => idSaya > idLawan;

/**
 * Perkecil penyangga jitter penerima.
 *
 * Peramban memilih penyangga yang aman namun besar; untuk percakapan
 * langsung, penundaannya lebih terasa daripada sesekali tersendat.
 * Dua nama properti dipakai karena namanya berubah antar versi peramban.
 */
function kecilkanPenyangga(receiver) {
  try {
    if ('jitterBufferTarget' in receiver) receiver.jitterBufferTarget = 0;
    else if ('playoutDelayHint' in receiver) receiver.playoutDelayHint = 0;
  } catch { /* petunjuk saja; kegagalannya tidak fatal */ }
}

/** Prioritas jaringan tinggi + batas bitrate pada pengirim. */
async function setelPengirim(sender) {
  try {
    const p = sender.getParameters();
    p.encodings = p.encodings?.length ? p.encodings : [{}];
    p.encodings[0].maxBitrate = BITRATE_MAKS;
    p.encodings[0].priority = 'high';
    p.encodings[0].networkPriority = 'high';
    await sender.setParameters(p);
  } catch { /* sebagian peramban menolak sebagian bidang */ }
}

/** Transceiver audio pada sebuah sambungan — selalu tepat satu per desain kita. */
const transceiverAudio = (pc) =>
  pc.getTransceivers().find((t) => t.receiver.track?.kind === 'audio') || null;

export function createVoice({ selfId, sendRtc, onLevel, onError, onQuality }) {
  /** @type {Map<string, RTCPeerConnection>} */
  const koneksi = new Map();
  /** @type {Map<string, HTMLAudioElement>} */
  const suara = new Map();
  const analisis = new Map(); // id -> { an, data, vad }
  // Keadaan tawar-menawar per lawan. Harus per sambungan, bukan satu untuk
  // semua: tabrakan dengan satu orang tidak boleh membatalkan tawaran ke
  // orang lain.
  const nego = new Map(); // id -> { menawar, abaikan, sudahUlangIce }
  // Cuplikan statistik sebelumnya per lawan, untuk menghitung selisih.
  const statsLalu = new Map(); // id -> { delay, count }
  // Volume yang diminta per peserta, 0..2. Disimpan lepas dari elemen audio
  // supaya tetap berlaku begitu sambungan dibuat ulang (mis. setelah
  // terputus lalu menyambung lagi).
  const volumeDiminta = new Map(); // id -> number

  let lokal = null;
  let audioCtx = null;
  let meterTimer = null;
  let statsTimer = null;
  let mati = false;
  let bisu = false;
  let deafen = false;
  // Status mikrofon sebelum dipaksa bisu oleh deafen, supaya bisa
  // dikembalikan persis begitu deafen dimatikan.
  let bisuSebelumDeafen = false;

  /** Terapkan volume tersimpan (bila ada) ke sebuah elemen audio yang baru dibuat. */
  const terapkanVolume = (id, el) => {
    const v = volumeDiminta.get(id);
    const { element, gain } = volumeToElementGain(v ?? 1);
    el.volume = element;
    el._soorGain = gain; // dibaca ulang kalau nanti dipasangi GainNode
  };

  /**
   * Kirim tawaran ke satu lawan.
   *
   * `menawar` ditandai selama proses berjalan, bukan cuma dibaca dari
   * signalingState: antara createOffer dan setLocalDescription keadaannya
   * masih 'stable', jadi tabrakan di celah itu tak akan terlihat tanpa
   * penanda ini.
   */
  const tawarkan = async (idLawan) => {
    const pc = koneksi.get(idLawan);
    const n = nego.get(idLawan);
    if (!pc || !n) return;
    try {
      n.menawar = true;
      const offer = await pc.createOffer();
      offer.sdp = tuneOpusSdp(offer.sdp);
      await pc.setLocalDescription(offer);
      sendRtc(idLawan, 'offer', { type: pc.localDescription.type, sdp: pc.localDescription.sdp });
    } catch {
      /* sambungan sedang ditutup, atau keadaannya sudah berubah */
    } finally {
      n.menawar = false;
    }
  };

  const buatKoneksi = (idLawan) => {
    if (koneksi.has(idLawan)) return koneksi.get(idLawan);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    nego.set(idLawan, { menawar: false, abaikan: false, sudahUlangIce: false });

    pc.onicecandidate = (e) => {
      if (e.candidate) sendRtc(idLawan, 'ice', e.candidate);
    };

    pc.ontrack = (e) => {
      kecilkanPenyangga(e.receiver);
      /**
       * Trek yang dipasang lewat replaceTrack TIDAK membawa MediaStream apa
       * pun: yang menuliskan msid ke SDP hanyalah addTrack(track, stream).
       * Padahal replaceTrack justru jalur yang dipakai pada urutan paling
       * biasa — bergabung dulu untuk mendengarkan, mikrofon menyusul.
       *
       * Akibatnya e.streams kosong, `srcObject` diisi undefined, dan hasilnya
       * sunyi total meski sambungannya sehat dan penanda bicara menyala.
       * Jadi stream-nya dirakit sendiri dari treknya, bukan diandaikan ada.
       */
      const arus = e.streams?.[0] || new MediaStream([e.track]);
      let el = suara.get(idLawan);
      if (!el) {
        el = new Audio();
        el.autoplay = true;
        // Elemen baru yang dibuat saat sedang deafen harus ikut bisu sejak
        // awal — bukan berbunyi sesaat lalu baru dibisukan.
        el.muted = deafen;
        terapkanVolume(idLawan, el);
        suara.set(idLawan, el);
      }
      el.srcObject = arus;
      el.play().catch((err) => {
        // Peramban menolak memutar tanpa gerak pengguna. Tombol "Gabung
        // Suara" seharusnya sudah cukup, tapi bila tetap ditolak, sunyinya
        // harus dijelaskan — bukan dibiarkan tampak seperti teman yang diam.
        if (err?.name === 'NotAllowedError') {
          onError?.('Peramban memblokir pemutaran suara. Ketuk halaman ini sekali lalu coba lagi.');
        }
      });
      pasangMeter(idLawan, arus);
    };

    // Renegosiasi otomatis: transceiver baru saat bergabung (recvonly), atau
    // arahnya berubah saat mikrofon dibuka/ditutup, keduanya memicu peristiwa
    // ini. KEDUA sisi menawar di sini — tabrakannya diselesaikan di terima().
    pc.onnegotiationneeded = () => { tawarkan(idLawan); };

    pc.onconnectionstatechange = () => {
      const keadaan = pc.connectionState;
      if (keadaan === 'failed') {
        const n = nego.get(idLawan);
        // ICE bisa pulih tanpa membangun sambungan baru — jalur yang tadinya
        // hilang sering kembali setelah kandidat dikumpulkan ulang. Dicoba
        // sekali, dan hanya oleh sisi yang tidak sopan, supaya dua sisi tidak
        // me-restart bersamaan lalu saling membatalkan.
        if (n && !n.sudahUlangIce && !akuYangSopan(selfId, idLawan)) {
          n.sudahUlangIce = true;
          try { pc.restartIce(); return; } catch { /* peramban lama: lanjut menyerah */ }
        }
        // Hampir selalu berarti NAT simetris tanpa TURN. Dikatakan, bukan
        // dibiarkan terlihat seperti lawan bicara yang diam saja.
        onError?.('Sambungan suara ke salah satu peserta gagal. Jaringanmu mungkin memblokirnya.');
        putus(idLawan);
      } else if (keadaan === 'closed') {
        putus(idLawan);
      } else if (keadaan === 'connected') {
        // Pulih: izinkan satu percobaan ICE lagi bila nanti gagal lagi.
        const n = nego.get(idLawan);
        if (n) n.sudahUlangIce = false;
      }
    };

    /**
     * Siapa yang menyiapkan jalur audio pertama.
     *
     * Punya mikrofon berarti harus addTrack — tanpa itu tidak ada yang
     * dikirim. Tanpa mikrofon, jalurnya dibuka HANYA oleh sisi yang tidak
     * sopan; sisi sopan sengaja tidak membuat apa-apa dan menunggu tawaran
     * datang.
     *
     * Alasannya ditemukan lewat uji dua peramban sungguhan: kalau kedua sisi
     * sama-sama memanggil addTransceiver lalu sama-sama menawar, sisi sopan
     * membatalkan tawarannya dan menerima tawaran lawan — tapi Chrome TIDAK
     * memakai ulang transceiver yang sudah telanjur ia buat sendiri. Ia
     * membuat yang kedua. Hasilnya SDP dengan dua m=audio; yang kedua tidak
     * pernah selesai dirundingkan, dan justru ke situlah trek mikrofon
     * dipasang belakangan. Sambungan tampak "connected", penanda bicara
     * menyala, paket audio nol.
     *
     * Dengan hanya satu sisi yang membuka, tawaran pertama tidak pernah
     * bertabrakan sama sekali, dan sisi sopan mendapat transceiver-nya dari
     * tawaran itu — satu m=audio, dipakai bersama selamanya.
     */
    if (lokal) {
      setelPengirim(pc.addTrack(lokal.getAudioTracks()[0], lokal));
    } else if (!akuYangSopan(selfId, idLawan)) {
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }
    koneksi.set(idLawan, pc);
    return pc;
  };

  /** Pasang atau ganti trek kirim pada satu sambungan, ubah arahnya jadi sendrecv. */
  const pasangTrekKirim = async (pc, track) => {
    const trans = transceiverAudio(pc);
    if (!trans) { setelPengirim(pc.addTrack(track, lokal)); return; }
    if (trans.direction !== 'sendrecv') trans.direction = 'sendrecv';
    await trans.sender.replaceTrack(track);
    // Lekatkan stream-nya supaya msid ikut tertulis di SDP. Penerima sudah
    // punya jalan mundur bila msid tidak ada, tapi mengirim SDP yang benar
    // sejak awal lebih baik daripada mengandalkan seberang menambalnya —
    // tidak semua penerima kode kita.
    try { trans.sender.setStreams?.(lokal); } catch { /* belum didukung peramban ini */ }
    setelPengirim(trans.sender);
  };

  /** Lepas trek kirim, kembalikan arah ke recvonly — sambungan tetap hidup. */
  const lepasTrekKirim = (pc) => {
    const trans = transceiverAudio(pc);
    if (!trans) return;
    trans.sender.replaceTrack(null).catch(() => {});
    if (trans.direction !== 'recvonly') trans.direction = 'recvonly';
  };

  const pasangMeter = (id, stream) => {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      // Peramban memulai konteks audio dalam keadaan tertahan sampai ada
      // gerak pengguna.
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      const src = audioCtx.createMediaStreamSource(stream);
      const an = audioCtx.createAnalyser();
      an.fftSize = 512;
      an.smoothingTimeConstant = 0.2;
      src.connect(an);
      analisis.set(id, { an, data: new Uint8Array(an.frequencyBinCount), vad: createVad() });
      mulaiMeter();
    } catch { /* meter hanya penanda; kegagalannya tidak boleh mematikan suara */ }
  };

  const mulaiMeter = () => {
    if (meterTimer) return;
    meterTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, { an, data, vad }] of analisis) {
        // Mikrofon sendiri yang sedang dibisukan tidak boleh terlihat bicara.
        if (id === selfId && bisu) { onLevel?.(id, false, 0); continue; }
        an.getByteTimeDomainData(data);
        const rms = rmsDari(data);
        onLevel?.(id, vad.perbarui(rms, now), rms);
      }
    }, METER_MS);
  };

  /**
   * Laporkan mutu dan latensi sesekali.
   *
   * Angkanya diukur, bukan ditebak: waktu pulang-pergi dari pasangan kandidat
   * yang terpakai, dan antrean penyangga jitter dari selisih dua cuplikan.
   */
  const mulaiStats = () => {
    if (statsTimer || !onQuality) return;
    statsTimer = setInterval(async () => {
      for (const [id, pc] of koneksi) {
        try {
          const stats = await pc.getStats();
          let hilang = 0, diterima = 0, rtt = null;
          let jbDelay = 0, jbCount = 0;
          stats.forEach((r) => {
            if (r.type === 'inbound-rtp' && r.kind === 'audio') {
              hilang = r.packetsLost || 0;
              diterima = r.packetsReceived || 0;
              jbDelay = r.jitterBufferDelay || 0;
              jbCount = r.jitterBufferEmittedCount || 0;
            }
            if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.currentRoundTripTime != null) {
              rtt = Math.round(r.currentRoundTripTime * 1000);
            }
          });

          const cuplikan = { delay: jbDelay, count: jbCount };
          const jitterMs = jitterDelayMs(statsLalu.get(id), cuplikan);
          statsLalu.set(id, cuplikan);

          const total = hilang + diterima;
          onQuality(id, {
            rtt,
            jitterMs,
            latencyMs: perkiraanLatensiMs({ rttMs: rtt, jitterMs }),
            lossPct: total > 0 ? Math.round((hilang / total) * 100) : 0,
          });
        } catch { /* sambungan sedang ditutup */ }
      }
    }, 4000);
  };

  const putus = (idLawan) => {
    koneksi.get(idLawan)?.close();
    koneksi.delete(idLawan);
    const el = suara.get(idLawan);
    if (el) { el.srcObject = null; suara.delete(idLawan); }
    analisis.delete(idLawan);
    statsLalu.delete(idLawan);
    nego.delete(idLawan);
    onLevel?.(idLawan, false, 0);
  };

  const api = {
    /**
     * Nyalakan mikrofon. Tidak menyentuh sambungan yang sudah ada selain
     * mengizinkannya mengirim — mendengarkan tetap berjalan tanpa ini.
     */
    async nyalakanMic() {
      if (!lokal) {
        lokal = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: false });
      }
      bisu = false;
      pasangMeter(selfId, lokal);
      mulaiStats();
      const track = lokal.getAudioTracks()[0];
      for (const pc of koneksi.values()) await pasangTrekKirim(pc, track);
      return lokal;
    },

    /**
     * Matikan mikrofon sepenuhnya — perangkat dilepas. Sambungan TIDAK
     * diputus: mendengarkan tetap berjalan seperti sebelum mikrofon
     * dinyalakan.
     */
    matikanMic() {
      lokal?.getTracks().forEach((t) => t.stop());
      lokal = null;
      bisu = false;
      for (const pc of koneksi.values()) lepasTrekKirim(pc);
      analisis.delete(selfId);
      onLevel?.(selfId, false, 0);
    },

    /** Ganti perangkat masukan tanpa memutus sambungan yang sudah ada. */
    async gantiPerangkat(deviceId) {
      const baru = await navigator.mediaDevices.getUserMedia({
        audio: { ...AUDIO_CONSTRAINTS, deviceId: { exact: deviceId } },
        video: false,
      });
      const trekBaru = baru.getAudioTracks()[0];
      for (const pc of koneksi.values()) {
        const trans = transceiverAudio(pc);
        if (trans) await trans.sender.replaceTrack(trekBaru);
      }
      lokal?.getTracks().forEach((t) => t.stop());
      lokal = baru;
      trekBaru.enabled = !bisu;
      analisis.delete(selfId);
      pasangMeter(selfId, lokal);
      return lokal;
    },

    /** Diam sementara tanpa memutus sambungan — dasar untuk tekan-untuk-bicara. */
    setBisu(nilai) {
      bisu = !!nilai;
      lokal?.getAudioTracks().forEach((t) => { t.enabled = !bisu; });
      if (bisu) onLevel?.(selfId, false, 0);
    },

    /**
     * Bisukan semua suara masuk. Ikut memaksa mikrofon sendiri bisu — kalau
     * tidak bisa mendengar balasan, bicara sendirian jadi aneh — dan status
     * mikrofon sebelumnya dikembalikan begitu deafen dimatikan.
     */
    setDeafen(nilai) {
      const mau = !!nilai;
      if (mau === deafen) return;
      deafen = mau;
      for (const el of suara.values()) el.muted = deafen;
      if (deafen) {
        bisuSebelumDeafen = bisu;
        api.setBisu(true);
      } else {
        api.setBisu(bisuSebelumDeafen);
      }
    },

    /**
     * Volume satu peserta, 0..2. Berlaku langsung bila sambungannya sudah
     * ada, dan tersimpan untuk diterapkan ke sambungan berikutnya.
     */
    setVolume(idLawan, v) {
      volumeDiminta.set(idLawan, v);
      const el = suara.get(idLawan);
      if (el) terapkanVolume(idLawan, el);
    },
    getVolume(idLawan) { return volumeDiminta.get(idLawan) ?? 1; },

    get sedangBisu() { return bisu; },
    get sedangDeafen() { return deafen; },
    get punyaMic() { return !!lokal; },

    async terima({ from, kind, data }) {
      if (mati || !from) return;
      const pc = buatKoneksi(from);
      const n = nego.get(from);
      try {
        if (kind === 'offer' || kind === 'answer') {
          const putusan = keputusanSinyal({
            tipe: kind,
            sopan: akuYangSopan(selfId, from),
            sedangMenawar: !!n?.menawar,
            signalingState: pc.signalingState,
          });
          if (putusan.abaikan) {
            // Tawaran lawan dibuang; tawaran sendiri yang diteruskan. Ditandai
            // supaya kandidat ICE yang menyusul untuk tawaran itu tidak
            // dianggap galat.
            if (n) n.abaikan = true;
            return;
          }
          if (n) n.abaikan = false;
          if (putusan.rollback) await pc.setLocalDescription({ type: 'rollback' });
          await pc.setRemoteDescription(data);
          if (putusan.jawab) {
            const answer = await pc.createAnswer();
            // Setelan Opus juga dipasang di jawaban: keduanya harus sepakat
            // agar berlaku dua arah.
            answer.sdp = tuneOpusSdp(answer.sdp);
            await pc.setLocalDescription(answer);
            sendRtc(from, 'answer', { type: answer.type, sdp: answer.sdp });
          }
        } else if (kind === 'ice') {
          try {
            await pc.addIceCandidate(data);
          } catch (e) {
            // Kandidat milik tawaran yang sengaja diabaikan memang tidak bisa
            // dipasang. Selain itu, biarkan tertangkap penangan di bawah.
            if (!n?.abaikan) throw e;
          }
        }
      } catch {
        // Sinyal yang datang tidak berurutan wajar terjadi; percobaan
        // berikutnya biasanya berhasil.
      }
    },

    /**
     * Samakan mesh dengan roster "bergabung kanal suara" terbaru — bukan
     * roster mikrofon. Selalu membentuk sambungan untuk mendengarkan,
     * terlepas dari status mikrofon sendiri.
     */
    selaraskan(idBergabung) {
      const perlu = new Set(idBergabung.filter((id) => id !== selfId));
      for (const id of koneksi.keys()) if (!perlu.has(id)) putus(id);
      for (const id of perlu) if (!koneksi.has(id)) buatKoneksi(id);
    },

    putus,

    /** Keluar kanal suara sepenuhnya: mikrofon dimatikan, semua sambungan ditutup. */
    tutup() {
      mati = true;
      clearInterval(meterTimer); meterTimer = null;
      clearInterval(statsTimer); statsTimer = null;
      api.matikanMic();
      for (const id of [...koneksi.keys()]) putus(id);
      audioCtx?.close().catch(() => {});
      audioCtx = null;
    },
  };

  return api;
}

/** Daftar mikrofon yang tersedia. Label baru terisi setelah izin diberikan. */
export async function daftarMikrofon() {
  try {
    const semua = await navigator.mediaDevices.enumerateDevices();
    return semua
      .filter((d) => d.kind === 'audioinput')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Mikrofon ${i + 1}` }));
  } catch {
    return [];
  }
}
