// Penyetelan audio yang murni — tanpa peramban, tanpa jaringan.
//
// Dipisahkan supaya bisa diuji: penyuntingan SDP dan penentuan "sedang
// bicara" adalah bagian yang paling mudah salah, dan keduanya tidak butuh
// RTCPeerConnection sama sekali.

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
