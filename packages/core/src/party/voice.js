// Suara ruang: mesh WebRTC.
//
// Tiap peserta bersuara menyambung langsung ke tiap peserta bersuara lainnya.
// Suaranya tidak melewati server sama sekali — server hanya meneruskan amplop
// sinyal. Jumlah sambungan tumbuh kuadratik, jadi jumlah orang di suara
// dibatasi jauh lebih kecil daripada jumlah penonton.
//
// Tanpa TURN, jaringan dengan NAT simetris tidak akan tersambung. Itu batas
// yang disadari: menyediakan TURN berarti menjalankan server relai sendiri.
import { tuneOpusSdp, createVad, rmsDari } from './audio-tune.js';

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
 * Siapa yang menawarkan lebih dulu ditentukan dari perbandingan id, bukan
 * dari siapa yang lebih dulu tahu. Tanpa aturan tetap, dua sisi bisa
 * menawarkan bersamaan dan sambungannya saling menolak.
 */
const akuYangMenawar = (idSaya, idLawan) => idSaya < idLawan;

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

export function createVoice({ selfId, sendRtc, onLevel, onError, onQuality }) {
  /** @type {Map<string, RTCPeerConnection>} */
  const koneksi = new Map();
  /** @type {Map<string, HTMLAudioElement>} */
  const suara = new Map();
  const analisis = new Map(); // id -> { an, data, vad }
  let lokal = null;
  let audioCtx = null;
  let meterTimer = null;
  let statsTimer = null;
  let mati = false;
  let bisu = false;

  const buatKoneksi = (idLawan) => {
    if (koneksi.has(idLawan)) return koneksi.get(idLawan);
    const pc = new RTCPeerConnection(RTC_CONFIG);

    pc.onicecandidate = (e) => {
      if (e.candidate) sendRtc(idLawan, 'ice', e.candidate);
    };

    pc.ontrack = (e) => {
      kecilkanPenyangga(e.receiver);
      let el = suara.get(idLawan);
      if (!el) {
        el = new Audio();
        el.autoplay = true;
        suara.set(idLawan, el);
      }
      el.srcObject = e.streams[0];
      el.play().catch(() => { /* butuh gerak pengguna; tombol mic sudah itu */ });
      pasangMeter(idLawan, e.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        // Hampir selalu berarti NAT simetris tanpa TURN. Dikatakan, bukan
        // dibiarkan terlihat seperti lawan bicara yang diam saja.
        onError?.('Sambungan suara ke salah satu peserta gagal. Jaringanmu mungkin memblokirnya.');
        putus(idLawan);
      } else if (pc.connectionState === 'closed') {
        putus(idLawan);
      }
    };

    if (lokal) {
      for (const t of lokal.getTracks()) setelPengirim(pc.addTrack(t, lokal));
    }
    koneksi.set(idLawan, pc);
    return pc;
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

  /** Laporkan mutu sambungan sesekali: paket hilang dan waktu pulang-pergi. */
  const mulaiStats = () => {
    if (statsTimer || !onQuality) return;
    statsTimer = setInterval(async () => {
      for (const [id, pc] of koneksi) {
        try {
          const stats = await pc.getStats();
          let hilang = 0, diterima = 0, rtt = null;
          stats.forEach((r) => {
            if (r.type === 'inbound-rtp' && r.kind === 'audio') {
              hilang = r.packetsLost || 0;
              diterima = r.packetsReceived || 0;
            }
            if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.currentRoundTripTime != null) {
              rtt = Math.round(r.currentRoundTripTime * 1000);
            }
          });
          const total = hilang + diterima;
          onQuality(id, {
            rtt,
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
    onLevel?.(idLawan, false, 0);
  };

  const api = {
    async nyalakan() {
      if (lokal) return lokal;
      lokal = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: false });
      bisu = false;
      pasangMeter(selfId, lokal);
      mulaiStats();
      for (const [id, pc] of koneksi) {
        for (const t of lokal.getTracks()) setelPengirim(pc.addTrack(t, lokal));
        if (akuYangMenawar(selfId, id)) api.tawarkan(id);
      }
      return lokal;
    },

    /** Ganti perangkat masukan tanpa memutus sambungan yang sudah ada. */
    async gantiPerangkat(deviceId) {
      const baru = await navigator.mediaDevices.getUserMedia({
        audio: { ...AUDIO_CONSTRAINTS, deviceId: { exact: deviceId } },
        video: false,
      });
      const trekBaru = baru.getAudioTracks()[0];
      // replaceTrack menukar sumbernya di tempat — tidak perlu menawar ulang,
      // jadi suara tidak terputus saat berganti mikrofon.
      for (const pc of koneksi.values()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
        if (sender) await sender.replaceTrack(trekBaru);
      }
      lokal?.getTracks().forEach((t) => t.stop());
      lokal = baru;
      trekBaru.enabled = !bisu;
      analisis.delete(selfId);
      pasangMeter(selfId, lokal);
      return lokal;
    },

    matikan() {
      lokal?.getTracks().forEach((t) => t.stop());
      lokal = null;
      bisu = false;
      analisis.delete(selfId);
      onLevel?.(selfId, false, 0);
      for (const id of [...koneksi.keys()]) putus(id);
    },

    /** Diam sementara tanpa memutus sambungan — dasar untuk tekan-untuk-bicara. */
    setBisu(nilai) {
      bisu = !!nilai;
      lokal?.getAudioTracks().forEach((t) => { t.enabled = !bisu; });
      if (bisu) onLevel?.(selfId, false, 0);
    },

    get sedangBisu() { return bisu; },
    get punyaMic() { return !!lokal; },

    async tawarkan(idLawan) {
      const pc = buatKoneksi(idLawan);
      const offer = await pc.createOffer();
      offer.sdp = tuneOpusSdp(offer.sdp);
      await pc.setLocalDescription(offer);
      sendRtc(idLawan, 'offer', { type: offer.type, sdp: offer.sdp });
    },

    async terima({ from, kind, data }) {
      if (mati || !from) return;
      const pc = buatKoneksi(from);
      try {
        if (kind === 'offer') {
          await pc.setRemoteDescription(data);
          const answer = await pc.createAnswer();
          // Setelan Opus juga dipasang di jawaban: keduanya harus sepakat
          // agar berlaku dua arah.
          answer.sdp = tuneOpusSdp(answer.sdp);
          await pc.setLocalDescription(answer);
          sendRtc(from, 'answer', { type: answer.type, sdp: answer.sdp });
        } else if (kind === 'answer') {
          await pc.setRemoteDescription(data);
        } else if (kind === 'ice') {
          await pc.addIceCandidate(data);
        }
      } catch {
        // Sinyal yang datang tidak berurutan wajar terjadi; percobaan
        // berikutnya biasanya berhasil.
      }
    },

    selaraskan(idBersuara) {
      const perlu = new Set(idBersuara.filter((id) => id !== selfId));
      for (const id of koneksi.keys()) if (!perlu.has(id)) putus(id);
      if (!lokal) return;
      for (const id of perlu) {
        if (koneksi.has(id)) continue;
        if (akuYangMenawar(selfId, id)) api.tawarkan(id);
        else buatKoneksi(id);
      }
    },

    putus,

    tutup() {
      mati = true;
      clearInterval(meterTimer); meterTimer = null;
      clearInterval(statsTimer); statsTimer = null;
      api.matikan();
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
