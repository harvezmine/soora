/**
 * Aturan kelayakan katalog — murni, tanpa jaringan.
 *
 * Dipisahkan supaya bisa diuji: ambangnya diturunkan dari pengukuran, bukan
 * ditebak, dan satu-satunya cara menjaga angka itu tidak digeser sembarangan
 * adalah menguncinya di tes.
 *
 * Masalah yang diselesaikan: `/search/multi` mengembalikan SELURUH indeks
 * TMDB. Yang bisa diputar hanya sebagian kecilnya — kolam embed internasional
 * (VixSrc, VidLink) cuma memuat film dan serial arus utama. Sisanya album
 * soundtrack (TMDB mencatatnya sebagai film), film pendek, rekaman acara,
 * dan rilis daerah yang tidak pernah masuk katalog mana pun.
 *
 * Pencarian "inception" mengembalikan 13 hasil; satu bisa diputar. Dua belas
 * sisanya membawa orang ke layar hitam — dan itu lebih buruk daripada tidak
 * menemukan apa-apa, sebab mereka menyalahkan pemutarnya, bukan katalognya.
 */

/**
 * Ambang jumlah suara.
 *
 * Diukur pada 202 judul dari 13 kueri (dua set terpisah, yang kedua dipakai
 * sebagai holdout). Judul dengan suara di bawah 5 tidak pernah sekali pun
 * bisa diputar — 27 dari 27 gagal. Ambangnya ditaruh di 10, sedikit di atas
 * titik itu, dan pada seluruh 202 sampel hanya satu judul yang benar-benar
 * bisa diputar ikut terbuang.
 */
export const MIN_VOTE_COUNT = 10;

/**
 * Ambang popularitas.
 *
 * Jumlah suara saja belum cukup: film lawas yang pernah terkenal
 * mengumpulkan ratusan suara selama puluhan tahun tapi tidak ada di katalog
 * embed mana pun. Popularitas TMDB bergerak mengikuti minat sekarang, jadi
 * keduanya dipakai bersama.
 *
 * Angkanya sengaja rendah. Dinaikkan ke 3 presisinya memang naik (78% → 85%),
 * tapi judul asli yang ikut terbuang naik dari 3 jadi 5 — dan membuang judul
 * yang benar-benar bisa ditonton lebih merugikan daripada sesekali
 * meloloskan yang tidak. Sisa yang lolos dibersihkan sendiri oleh catatan
 * ketersediaan (services/availability.ts), yang belajar dari percobaan nyata.
 */
export const MIN_POPULARITY = 2;

/**
 * Bahasa yang ditangani kolam lokal, bukan kolam internasional.
 *
 * Film berbahasa Indonesia tidak ada di VixSrc maupun VidLink dan tidak akan
 * pernah bisa diputar di sana. Judul Indonesia dilayani LK21 lewat jalurnya
 * sendiri, jadi menampilkannya di cabang TMDB hanya menghasilkan layar hitam.
 */
export const BAHASA_KOLAM_LOKAL = 'id';

export interface KandidatKatalog {
  /** Id TMDB berupa angka; penyedia lain memakai teks. */
  id?: string | number;
  originalLanguage?: string;
  voteCount?: number;
  popularity?: number;
}

/**
 * Apakah satu hasil TMDB layak ditampilkan di pencarian kolam internasional.
 *
 * Ini saringan kemungkinan, bukan jaminan — yang lolos belum tentu bisa
 * diputar. Yang dijanjikan cuma satu: yang jelas-jelas mustahil tidak ikut
 * tampil.
 */
export function layakDiputar(item: KandidatKatalog | null | undefined): boolean {
  if (!item) return false;
  if (item.originalLanguage === BAHASA_KOLAM_LOKAL) return false;
  return (item.voteCount ?? 0) >= MIN_VOTE_COUNT
    && (item.popularity ?? 0) >= MIN_POPULARITY;
}

/** Saring daftar hasil TMDB. Urutan aslinya dipertahankan. */
export function saringLayakDiputar<T extends KandidatKatalog>(items: T[] | null | undefined): T[] {
  if (!Array.isArray(items)) return [];
  return items.filter(layakDiputar);
}
