// Penyetelan audio yang murni — tanpa peramban, tanpa jaringan.
//
// Dipisahkan supaya bisa diuji: penyuntingan SDP, penentuan "sedang bicara",
// dan keputusan tawar-menawar sinyal adalah bagian yang paling mudah salah,
// dan tidak satu pun butuh RTCPeerConnection sungguhan.

/**
 * Setelan Opus.
 *
 * Nilai bawaan peramban aman tapi konservatif: paket 20 ms dan bitrate
 * rendah. Untuk obrolan sambil nonton, yang paling terasa adalah
 * ketahanan terhadap paket hilang, bukan bitrate tinggi.
 */
export const OPUS_DEFAULT = {
  /** Paket 10 ms memangkas separuh penundaan paketisasi dibanding 20 ms. */
  minptime: 10,
  /** Koreksi galat di dalam aliran: paket hilang dipulihkan tanpa kirim
   *  ulang — kirim ulang selalu terlambat untuk suara langsung. */
  useinbandfec: 1,
  /** Berhenti mengirim saat hening. Menghemat jalur dan mengurangi antrean
   *  saat banyak orang diam. */
  usedtx: 1,
  /** Suara manusia tidak butuh stereo; mono memangkas separuh kebutuhan. */
  stereo: 0,
  /** 48 kbps sudah jernih untuk suara; lebih tinggi hanya menambah antrean
   *  pada jaringan sempit. */
  maxaveragebitrate: 48000,
};

const paramStr = (opsi) =>
  Object.entries(opsi).map(([k, v]) => `${k}=${v}`).join(';');

/**
 * Sisipkan setelan Opus ke SDP.
 *
 * Peramban tidak menyediakan API untuk ini, jadi SDP-nya disunting langsung —
 * cara yang sama dipakai semua aplikasi suara berbasis WebRTC.
 * SDP tanpa Opus dikembalikan apa adanya.
 */
export function tuneOpusSdp(sdp, opsi = OPUS_DEFAULT) {
  if (typeof sdp !== 'string' || !sdp) return sdp;

  // Nomor payload Opus berbeda-beda antar peramban, jadi dicari dari
  // rtpmap-nya, bukan diandaikan.
  const rtpmap = sdp.match(/^a=rtpmap:(\d+)\s+opus\/48000(?:\/2)?/im);
  if (!rtpmap) return sdp;
  const pt = rtpmap[1];

  const params = paramStr(opsi);
  const fmtpRe = new RegExp(`^a=fmtp:${pt} (.*)$`, 'im');

  if (fmtpRe.test(sdp)) {
    return sdp.replace(fmtpRe, (baris, isi) => {
      // Pertahankan parameter yang sudah ada dan belum kita atur, supaya
      // setelan peramban tidak terbuang.
      const punya = new Set(Object.keys(opsi));
      const sisa = isi
        .split(';')
        .map((x) => x.trim())
        .filter((x) => x && !punya.has(x.split('=')[0]));
      return `a=fmtp:${pt} ${[...sisa, params].join(';')}`;
    });
  }

  // Belum ada baris fmtp — sisipkan tepat setelah rtpmap-nya.
  return sdp.replace(rtpmap[0], `${rtpmap[0]}\r\na=fmtp:${pt} ${params}`);
}

/**
 * Penentu "sedang bicara" dengan histeresis.
 *
 * Satu ambang saja membuat penanda berkedip-kedip di sekitar batasnya.
 * Dipakai dua ambang: naik cepat saat mulai bicara, turun setelah hening
 * bertahan — persis seperti penanda bicara yang terasa wajar.
 */
export function createVad({
  ambangNyala = 0.035,
  ambangMati = 0.02,
  tahanMs = 300,
} = {}) {
  let bicara = false;
  let heningSejak = 0;

  return {
    /** @param {number} rms tenaga suara 0..1 @param {number} now waktu ms */
    perbarui(rms, now) {
      if (!Number.isFinite(rms)) return bicara;
      if (rms >= ambangNyala) {
        bicara = true;
        heningSejak = 0;
        return true;
      }
      if (bicara && rms < ambangMati) {
        if (!heningSejak) heningSejak = now;
        // Jeda antar-kata tidak boleh mematikan penandanya.
        if (now - heningSejak >= tahanMs) bicara = false;
      } else if (bicara) {
        heningSejak = 0;
      }
      return bicara;
    },
    get aktif() { return bicara; },
    reset() { bicara = false; heningSejak = 0; },
  };
}

/**
 * Keputusan saat deskripsi sesi (offer/answer) masuk — pola "perfect
 * negotiation" dari spesifikasi WebRTC.
 *
 * Sebelumnya hanya satu sisi (id lebih kecil) yang boleh menawar. Itu tampak
 * aman, tapi berakibat: begitu sisi yang TIDAK menawar menyalakan mikrofon,
 * arah transceiver-nya berubah jadi sendrecv dan `negotiationneeded` menyala —
 * lalu diabaikan, karena ia bukan penawar. Lawannya tidak pernah diberi tahu
 * ada trek baru, jadi suaranya tak pernah mengalir sementara arah sebaliknya
 * berjalan normal. Gejalanya: "aku tidak bisa mendengar dia, dia bisa
 * mendengarku", dan tampak acak sebab bergantung id siapa yang lebih kecil.
 *
 * Jadi kedua sisi kini boleh menawar, dan tabrakan diselesaikan lewat peran:
 * yang "sopan" membatalkan tawarannya sendiri lalu menerima tawaran lawan,
 * yang tidak sopan mengabaikan tawaran yang datang dan meneruskan miliknya.
 * Perannya harus berlawanan di dua sisi — di sini ditentukan dari
 * perbandingan id, satu-satunya nilai yang keduanya sama-sama tahu.
 */
export function keputusanSinyal({ tipe, sopan, sedangMenawar, signalingState }) {
  const bentrok = tipe === 'offer' && (sedangMenawar || signalingState !== 'stable');
  if (bentrok && !sopan) return { abaikan: true, rollback: false, jawab: false };
  return {
    abaikan: false,
    // Rollback hanya sah bila tawaran sendiri memang sudah terpasang.
    // `sedangMenawar` bisa true saat createOffer masih berjalan dan
    // signalingState masih 'stable' — membatalkan di keadaan itu justru galat.
    rollback: bentrok && signalingState === 'have-local-offer',
    jawab: tipe === 'offer',
  };
}

/**
 * Tenaga suara (RMS) dari cuplikan gelombang byte AnalyserNode.
 * 128 adalah titik diam pada data 8-bit.
 */
export function rmsDari(data) {
  if (!data || !data.length) return 0;
  let jumlah = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    jumlah += v * v;
  }
  return Math.sqrt(jumlah / data.length);
}

/**
 * Tenaga suara dibulatkan ke beberapa tingkat, untuk penanda bicara di layar.
 *
 * RMS mentah berubah tiap 60 ms; kalau nilainya langsung masuk keadaan React,
 * seluruh daftar peserta ikut dirender ulang ~16 kali per detik hanya untuk
 * menggerakkan satu cincin. Dibulatkan lebih dulu, keadaan hanya berubah saat
 * tingkatnya benar-benar berpindah, dan kehalusan gerakannya diserahkan ke
 * transisi CSS yang jalan di luar utas utama.
 *
 * Skalanya logaritmik: telinga menilai kenyaringan secara logaritmik, dan RMS
 * percakapan biasa menumpuk di bawah 0.15 — dipetakan linier, hampir semua
 * suara terlihat lirih.
 */
export const TINGKAT_SUARA_MAKS = 5;

export function tingkatSuara(rms) {
  const n = Number(rms);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const db = 20 * Math.log10(n);
  // -50 dB dianggap hening, -15 dB dianggap penuh.
  const norm = (db + 50) / 35;
  return Math.max(0, Math.min(TINGKAT_SUARA_MAKS, Math.round(norm * TINGKAT_SUARA_MAKS)));
}

/**
 * Latensi penyangga jitter dari dua cuplikan statistik WebRTC.
 *
 * `jitterBufferDelay` bersifat kumulatif sejak sambungan dibuka — dibagi
 * langsung dengan totalnya hanya memberi rata-rata seumur sesi, yang makin
 * lama makin tidak mencerminkan keadaan sekarang. Selisih antara dua cuplikan
 * memberi nilai yang sedang berlaku.
 *
 * Kembalian null berarti belum cukup data, bukan nol milidetik — keduanya
 * jangan disamakan saat ditampilkan.
 */
export function jitterDelayMs(sebelum, sesudah) {
  if (!sesudah) return null;
  const dDelay = (sesudah.delay ?? 0) - (sebelum?.delay ?? 0);
  const dCount = (sesudah.count ?? 0) - (sebelum?.count ?? 0);
  if (dCount > 0) return Math.round((dDelay / dCount) * 1000);
  // Belum ada paket baru sejak cuplikan lalu — pakai rata-rata seumur sesi
  // sebagai perkiraan kasar, selama memang ada isinya.
  if ((sesudah.count ?? 0) > 0) return Math.round((sesudah.delay / sesudah.count) * 1000);
  return null;
}

/**
 * Perkiraan latensi mulut-ke-telinga.
 *
 * Yang bisa diukur hanya perjalanan jaringan dan antrean penyangga. Waktu
 * tangkap, enkode, dan dekode tidak terlihat dari statistik WebRTC, jadi
 * ditambahkan sebagai tetapan — diakui sebagai perkiraan, bukan hasil ukur.
 */
export const LATENSI_TETAP_MS = 35;

export function perkiraanLatensiMs({ rttMs, jitterMs }) {
  if (rttMs == null && jitterMs == null) return null;
  const setengahJalan = rttMs != null ? rttMs / 2 : 0;
  return Math.round(setengahJalan + (jitterMs ?? 0) + LATENSI_TETAP_MS);
}

/** Penilaian yang bisa dibaca manusia, bukan angka telanjang. */
export function nilaiLatensi(ms) {
  if (ms == null) return null;
  if (ms <= 120) return 'bagus';
  if (ms <= 250) return 'cukup';
  return 'lambat';
}

/**
 * Volume per peserta.
 *
 * 0 berarti diam total, 1 adalah suara asli, sampai 2 (200%) untuk peserta
 * yang mikrofonnya pelan. Di atas 100% Web Audio API dipakai untuk
 * memperkuat — HTMLMediaElement.volume sendiri dibatasi peramban ke 0..1.
 */
export const VOLUME_MIN = 0;
export const VOLUME_DEFAULT = 1;
export const VOLUME_MAX = 2;

export function clampVolume(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return VOLUME_DEFAULT;
  return Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, n));
}

/**
 * Pecah volume 0..2 jadi bagian yang dipahami dua lapisan peramban:
 * `element` (0..1) untuk HTMLMediaElement.volume, dan `gain` (>=1) untuk
 * GainNode Web Audio yang menguatkan di atas 100%.
 */
export function volumeToElementGain(v) {
  const c = clampVolume(v);
  return c <= 1 ? { element: c, gain: 1 } : { element: 1, gain: c };
}
