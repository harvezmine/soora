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
 * Jarak antar-sapuan sambungan yang macet. Cukup lama supaya sambungan yang
 * sedang berjalan normal tidak pernah tersapu, cukup sering supaya orang
 * tidak sempat menyimpulkan temannya diam saja.
 */
const PENGAWAS_MS = 5000;

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
  const analisis = new Map(); // id -> { an, data, vad, src, gain, tersambung }
  // Keadaan tawar-menawar per lawan. Harus per sambungan, bukan satu untuk
  // semua: tabrakan dengan satu orang tidak boleh membatalkan tawaran ke
  // orang lain.
  const nego = new Map(); // id -> { menawar, abaikan, sudahUlangIce }
  const gagalUlang = new Map(); // id -> berapa kali sudah dibangun ulang
  const jadwalPulih = new Map(); // id -> timer
  /** Siapa saja yang seharusnya ada di mesh sekarang. */
  let roster = new Set();
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
  let pengawasTimer = null;
  let mati = false;
  let bisu = false;
  let deafen = false;
  // Status mikrofon sebelum dipaksa bisu oleh deafen, supaya bisa
  // dikembalikan persis begitu deafen dimatikan.
  let bisuSebelumDeafen = false;

  /**
   * Terapkan volume seseorang, 0..VOLUME_MAX.
   *
   * Dua lapis, karena HTMLMediaElement.volume dibatasi peramban ke 0..1:
   * sampai 100% cukup elemennya sendiri, di atas itu elemennya dibisukan dan
   * Web Audio yang memutar sekaligus menguatkan.
   *
   * Sebelumnya penguatnya tidak pernah ada — nilainya cuma dititipkan ke
   * sebuah properti lalu tidak pernah dibaca siapa pun, jadi menggeser slider
   * ke atas 100% sama sekali tidak terdengar. Itu sebabnya orang yang
   * mikrofonnya pelan tetap pelan walau volumenya sudah dinaikkan.
   */
  const terapkanVolume = (id, el) => {
    const target = el || suara.get(id);
    const { element, gain } = volumeToElementGain(volumeDiminta.get(id) ?? 1);
    const a = analisis.get(id);
    // Penguat hanya dipakai bila konteks audionya benar-benar berjalan.
    // Kalau tidak, memindahkan pemutaran ke Web Audio justru membuat sunyi
    // total — lebih buruk daripada sekadar kurang keras.
    const pakaiPenguat = gain > 1 && a?.gain && audioCtx?.state === 'running';

    if (pakaiPenguat) {
      if (target) target.muted = true;
      a.gain.gain.value = deafen ? 0 : gain;
      if (!a.tersambung) { a.gain.connect(audioCtx.destination); a.tersambung = true; }
      return;
    }
    if (a?.tersambung) {
      try { a.gain.disconnect(audioCtx.destination); } catch { /* sudah lepas */ }
      a.tersambung = false;
    }
    if (target) { target.muted = deafen; target.volume = element; }
  };

  /** Lepas simpul Web Audio milik seseorang. */
  const lepasAudio = (id) => {
    const a = analisis.get(id);
    if (!a) return;
    try { if (a.tersambung) a.gain.disconnect(audioCtx.destination); } catch { /* sudah lepas */ }
    try { a.src.disconnect(); } catch { /* sudah lepas */ }
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
    // Menawar hanya dari keadaan tenang. Bila sedang di tengah tawar-menawar,
    // peramban menyalakan lagi peristiwa negotiationneeded begitu keadaannya
    // kembali stabil — jadi menundanya di sini tidak menghilangkan apa pun,
    // sementara memaksa createOffer di keadaan lain justru melempar galat.
    if (pc.signalingState !== 'stable') return;
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
        // dulu, dan hanya oleh sisi yang tidak sopan, supaya dua sisi tidak
        // me-restart bersamaan lalu saling membatalkan.
        if (n && !n.sudahUlangIce && !akuYangSopan(selfId, idLawan)) {
          n.sudahUlangIce = true;
          try { pc.restartIce(); return; } catch { /* peramban lama: bangun ulang saja */ }
        }
        bangunUlang(idLawan);
      } else if (keadaan === 'closed') {
        putus(idLawan);
      } else if (keadaan === 'connected') {
        // Pulih: hitungan percobaan disetel ulang, supaya gangguan berikutnya
        // dapat jatah penuh lagi dan bukan langsung menyerah.
        const n = nego.get(idLawan);
        if (n) n.sudahUlangIce = false;
        gagalUlang.delete(idLawan);
      }
    };

    // Jalur audio TIDAK dibuat di sini. Lihat bukaJalur().
    koneksi.set(idLawan, pc);
    return pc;
  };

  /**
   * Buka satu-satunya jalur audio untuk sebuah sambungan.
   *
   * Hanya sisi yang tidak sopan yang boleh membukanya, dan hanya secara
   * proaktif — tidak pernah sebagai reaksi atas sinyal yang masuk. Sisi sopan
   * sengaja tidak membuat apa pun; ia menerima jalurnya dari tawaran lawan.
   *
   * Aturan sekaku ini lahir dari dua kali salah. Kalau kedua sisi sama-sama
   * membuat transceiver lalu sama-sama menawar, sisi sopan membatalkan
   * tawarannya sendiri dan menerima tawaran lawan — tapi Chrome TIDAK memakai
   * ulang transceiver yang telanjur ia buat. Ia membuat yang kedua. Hasilnya
   * SDP dengan dua m=audio; yang kedua tidak pernah selesai dirundingkan, dan
   * justru ke situlah trek mikrofon dipasang. Sambungan tampak "connected",
   * penanda bicara menyala, paket audio nol.
   *
   * Sekali sisi pembuka ditetapkan, tawaran pertama tidak pernah bertabrakan,
   * dan seterusnya cuma ada satu m=audio yang dipakai bersama.
   */
  const bukaJalur = (pc, idLawan) => {
    if (akuYangSopan(selfId, idLawan)) return; // menunggu tawaran
    if (transceiverAudio(pc)) return;          // sudah terbuka
    if (lokal) setelPengirim(pc.addTrack(lokal.getAudioTracks()[0], lokal));
    else pc.addTransceiver('audio', { direction: 'recvonly' });
  };

  /** Pasang atau ganti trek kirim pada satu sambungan, ubah arahnya jadi sendrecv. */
  const pasangTrekKirim = async (pc, track, idLawan) => {
    const trans = transceiverAudio(pc);
    if (!trans) {
      // Belum ada jalur. Sisi sopan tidak boleh membuatnya sendiri — treknya
      // dipasang di terima(), begitu tawaran lawan membuka jalurnya. Kalau ia
      // memaksa addTrack di sini, lahir m=audio kedua dan suaranya hilang.
      if (akuYangSopan(selfId, idLawan)) return;
      setelPengirim(pc.addTrack(track, lokal));
      return;
    }
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
      lepasAudio(id); // simpul lama, bila trek diganti di tengah jalan
      const src = audioCtx.createMediaStreamSource(stream);
      const an = audioCtx.createAnalyser();
      an.fftSize = 512;
      an.smoothingTimeConstant = 0.2;
      src.connect(an);
      // Penguat disiapkan tapi belum tersambung ke keluaran: selama volumenya
      // masih 100% ke bawah, elemen audio yang memutar.
      const gain = audioCtx.createGain();
      gain.gain.value = 1;
      src.connect(gain);
      analisis.set(id, {
        an, data: new Uint8Array(an.frequencyBinCount), vad: createVad(),
        src, gain, tersambung: false,
      });
      // Volume dipasang ulang sekarang penguatnya ada — permintaan di atas
      // 100% yang datang sebelum ini baru bisa berlaku di sini.
      if (id !== selfId) terapkanVolume(id);
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

  /** Berapa kali sambungan ke satu orang boleh dibangun ulang sebelum menyerah. */
  const MAKS_BANGUN_ULANG = 3;

  /**
   * Bangun ulang sambungan yang gagal.
   *
   * Sebelumnya sambungan gagal hanya ditutup lalu dilupakan — dan tidak ada
   * yang pernah mencobanya lagi, sebab mesh cuma disusun ulang saat daftar
   * peserta berubah. Akibatnya satu gangguan sesaat membuat satu orang bisu
   * selamanya bagi satu orang lain, sementara semua pasangan lain terdengar
   * normal. Persis keluhan "cuma dia yang tidak kedengaran".
   */
  const bangunUlang = (idLawan) => {
    if (mati) return;
    const percobaan = (gagalUlang.get(idLawan) || 0) + 1;
    putus(idLawan);
    if (!roster.has(idLawan)) return; // orangnya memang sudah pergi
    if (percobaan > MAKS_BANGUN_ULANG) {
      gagalUlang.delete(idLawan);
      // Baru sekarang dikatakan, setelah benar-benar dicoba berkali-kali —
      // bukan pada kedipan pertama.
      onError?.('Tidak bisa menyambung suara ke salah satu peserta. Biasanya karena jaringan salah satu pihak memblokir sambungan langsung.');
      return;
    }
    gagalUlang.set(idLawan, percobaan);
    // Mundur bertahap: dua sisi bisa sama-sama mencoba, dan jeda yang makin
    // panjang mencegah keduanya terus bertabrakan.
    const jeda = Math.min(8000, 800 * 2 ** (percobaan - 1));
    clearTimeout(jadwalPulih.get(idLawan));
    jadwalPulih.set(idLawan, setTimeout(() => {
      jadwalPulih.delete(idLawan);
      if (mati || !roster.has(idLawan) || koneksi.has(idLawan)) return;
      const pc = buatKoneksi(idLawan);
      bukaJalur(pc, idLawan);
      // Sisi sopan tidak membuka jalur, jadi ia hanya menunggu. Kalau lawan
      // juga sedang menunggu, ronde berikutnya yang menyelesaikan.
      if (lokal) pasangTrekKirim(pc, lokal.getAudioTracks()[0], idLawan);
    }, jeda));
  };

  /**
   * Sapu berkala sambungan yang tidak pernah berangkat.
   *
   * `connectionState` yang masih "new" beberapa detik setelah sambungan
   * dibuat berarti tawarannya tidak pernah terkirim atau hilang di jalan —
   * bukan sekadar lambat, sebab begitu tawaran terpasang keadaannya langsung
   * pindah ke "connecting". Tanpa sapuan ini satu amplop sinyal yang hilang
   * membuat sepasang orang bisu satu sama lain selamanya, sementara semua
   * pasangan lain terdengar normal — dan itu yang paling membingungkan
   * dilihat dari dalam ruang.
   */
  const mulaiPengawas = () => {
    if (pengawasTimer) return;
    pengawasTimer = setInterval(() => {
      for (const [id, pc] of koneksi) {
        if (!roster.has(id) || pc.connectionState !== 'new') continue;
        if (akuYangSopan(selfId, id)) continue; // bukan pembuka; menunggu saja
        bukaJalur(pc, id);
        tawarkan(id);
      }
    }, PENGAWAS_MS);
  };

  const putus = (idLawan) => {
    clearTimeout(jadwalPulih.get(idLawan));
    jadwalPulih.delete(idLawan);
    lepasAudio(idLawan);
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
      for (const [id, pc] of koneksi) await pasangTrekKirim(pc, track, id);
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
      // Lewat terapkanVolume, bukan menyetel `muted` langsung: yang volumenya
      // di atas 100% diputar oleh penguat Web Audio, dan membisukan elemennya
      // saja tidak menghentikan apa pun di jalur itu.
      for (const id of suara.keys()) terapkanVolume(id);
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
      // Konteks audio bisa masih tertahan sampai ada gerak pengguna; menggeser
      // slider itu sendiri sudah gerak pengguna, jadi dibangunkan di sini —
      // tanpa itu penguat di atas 100% tidak akan berbunyi.
      if (audioCtx?.state === 'suspended') {
        audioCtx.resume().then(() => terapkanVolume(idLawan)).catch(() => {});
      }
      terapkanVolume(idLawan);
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
            // Sisi sopan tidak pernah membuka jalur sendiri, jadi inilah saat
            // pertama trek mikrofonnya punya tempat. Dipasang SEBELUM jawaban
            // dibuat supaya arah sendrecv ikut terbawa — kalau dipasang
            // sesudahnya, perlu satu putaran tawar-menawar lagi dan ada jeda
            // bisu di antaranya.
            if (lokal) await pasangTrekKirim(pc, lokal.getAudioTracks()[0], from);
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
      roster = perlu;
      for (const id of koneksi.keys()) if (!perlu.has(id)) putus(id);
      // bukaJalur dipanggil juga untuk sambungan yang sudah ada: sambungan
      // bisa lahir lebih dulu dari sinyal yang masuk (mis. kandidat ICE
      // menyusul lebih cepat), dan yang lahir begitu sengaja belum berjalur.
      for (const id of perlu) bukaJalur(buatKoneksi(id), id);
      if (perlu.size) mulaiPengawas();
    },

    putus,

    /** Keluar kanal suara sepenuhnya: mikrofon dimatikan, semua sambungan ditutup. */
    tutup() {
      mati = true;
      clearInterval(meterTimer); meterTimer = null;
      clearInterval(statsTimer); statsTimer = null;
      clearInterval(pengawasTimer); pengawasTimer = null;
      for (const t of jadwalPulih.values()) clearTimeout(t);
      jadwalPulih.clear();
      gagalUlang.clear();
      roster = new Set();
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
