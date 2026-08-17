// Suara ruang: mesh WebRTC.
//
// Tiap peserta bersuara menyambung langsung ke tiap peserta bersuara lainnya.
// Suaranya tidak melewati server sama sekali — server hanya meneruskan amplop
// sinyal. Jumlah sambungan tumbuh kuadratik, jadi jumlah orang di suara
// dibatasi jauh lebih kecil daripada jumlah penonton.
//
// Tanpa TURN, jaringan dengan NAT simetris tidak akan tersambung. Itu batas
// yang disadari: menyediakan TURN berarti menjalankan server relai sendiri.
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

/** Ambang tenaga suara untuk menyalakan penanda "sedang bicara". */
const AMBANG_BICARA = 0.045;

/**
 * Siapa yang menawarkan lebih dulu ditentukan dari perbandingan id, bukan
 * dari siapa yang lebih dulu tahu. Tanpa aturan tetap, dua sisi bisa
 * menawarkan bersamaan dan sambungannya saling menolak.
 */
const akuYangMenawar = (idSaya, idLawan) => idSaya < idLawan;

export function createVoice({ selfId, sendRtc, onLevel, onError }) {
  /** @type {Map<string, RTCPeerConnection>} */
  const koneksi = new Map();
  /** @type {Map<string, HTMLAudioElement>} */
  const suara = new Map();
  let lokal = null;          // MediaStream mikrofon sendiri
  let audioCtx = null;
  let meterTimer = null;
  const analisis = new Map(); // id -> {analyser, data}
  let mati = false;

  const buatKoneksi = (idLawan) => {
    if (koneksi.has(idLawan)) return koneksi.get(idLawan);
    const pc = new RTCPeerConnection({ iceServers: ICE });

    pc.onicecandidate = (e) => {
      if (e.candidate) sendRtc(idLawan, 'ice', e.candidate);
    };

    pc.ontrack = (e) => {
      let el = suara.get(idLawan);
      if (!el) {
        el = new Audio();
        el.autoplay = true;
        // Suara lawan tidak boleh ikut teredam saat kita membisukan diri.
        el.muted = false;
        suara.set(idLawan, el);
      }
      el.srcObject = e.streams[0];
      el.play().catch(() => { /* butuh gerak pengguna; tombol mic sudah itu */ });
      pasangMeter(idLawan, e.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) {
        // Gagal biasanya berarti NAT simetris tanpa TURN. Dilaporkan, bukan
        // dibiarkan diam-diam.
        if (pc.connectionState === 'failed') {
          onError?.('Sambungan suara ke salah satu peserta gagal. Jaringanmu mungkin memblokirnya.');
        }
        putus(idLawan);
      }
    };

    if (lokal) for (const t of lokal.getTracks()) pc.addTrack(t, lokal);
    koneksi.set(idLawan, pc);
    return pc;
  };

  const pasangMeter = (id, stream) => {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(stream);
      const an = audioCtx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      analisis.set(id, { an, data: new Uint8Array(an.frequencyBinCount) });
      mulaiMeter();
    } catch { /* meter hanya hiasan; kegagalannya tidak boleh mematikan suara */ }
  };

  const mulaiMeter = () => {
    if (meterTimer) return;
    meterTimer = setInterval(() => {
      for (const [id, { an, data }] of analisis) {
        an.getByteTimeDomainData(data);
        let jumlah = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          jumlah += v * v;
        }
        const rms = Math.sqrt(jumlah / data.length);
        onLevel?.(id, rms > AMBANG_BICARA);
      }
    }, 180);
  };

  const putus = (idLawan) => {
    koneksi.get(idLawan)?.close();
    koneksi.delete(idLawan);
    const el = suara.get(idLawan);
    if (el) { el.srcObject = null; suara.delete(idLawan); }
    analisis.delete(idLawan);
    onLevel?.(idLawan, false);
  };

  return {
    /** Nyalakan mikrofon. Melempar bila izin ditolak. */
    async nyalakan() {
      if (lokal) return lokal;
      lokal = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      pasangMeter(selfId, lokal);
      // Sambungan yang sudah ada perlu diberi jalur suara yang baru dibuka.
      for (const [id, pc] of koneksi) {
        for (const t of lokal.getTracks()) pc.addTrack(t, lokal);
        if (akuYangMenawar(selfId, id)) this.tawarkan(id);
      }
      return lokal;
    },

    matikan() {
      lokal?.getTracks().forEach((t) => t.stop());
      lokal = null;
      analisis.delete(selfId);
      onLevel?.(selfId, false);
      for (const id of [...koneksi.keys()]) putus(id);
    },

    /** Diam sementara tanpa memutus sambungan. */
    setBisu(bisu) {
      lokal?.getAudioTracks().forEach((t) => { t.enabled = !bisu; });
      if (bisu) onLevel?.(selfId, false);
    },

    async tawarkan(idLawan) {
      const pc = buatKoneksi(idLawan);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendRtc(idLawan, 'offer', offer);
    },

    /** Tangani amplop sinyal dari lawan. */
    async terima({ from, kind, data }) {
      if (mati || !from) return;
      const pc = buatKoneksi(from);
      try {
        if (kind === 'offer') {
          await pc.setRemoteDescription(data);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendRtc(from, 'answer', answer);
        } else if (kind === 'answer') {
          await pc.setRemoteDescription(data);
        } else if (kind === 'ice') {
          await pc.addIceCandidate(data);
        }
      } catch {
        // Sinyal yang datang tidak berurutan wajar terjadi; sambungan
        // berikutnya biasanya berhasil.
      }
    },

    /**
     * Samakan mesh dengan daftar peserta bersuara terbaru: sambungkan yang
     * baru, putuskan yang sudah pergi.
     */
    selaraskan(idBersuara) {
      const perlu = new Set(idBersuara.filter((id) => id !== selfId));
      for (const id of koneksi.keys()) if (!perlu.has(id)) putus(id);
      if (!lokal) return;
      for (const id of perlu) {
        if (!koneksi.has(id) && akuYangMenawar(selfId, id)) this.tawarkan(id);
        else if (!koneksi.has(id)) buatKoneksi(id);
      }
    },

    putus,

    tutup() {
      mati = true;
      clearInterval(meterTimer);
      meterTimer = null;
      this.matikan();
      audioCtx?.close().catch(() => {});
      audioCtx = null;
    },
  };
}
