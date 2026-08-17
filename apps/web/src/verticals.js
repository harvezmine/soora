/**
 * Identitas vertikal: mana yang sedang dibuka, dan ke mana halamannya.
 *
 * Berdiri sendiri, bukan di App.jsx, supaya Navbar bisa memakainya tanpa
 * mengimpor App — App sudah mengimpor Navbar, dan lingkaran impor antar
 * modul rapuh terhadap urutan pemuatan.
 */

export const VERTIKAL = ['sooranime', 'sooraflix', 'sooramics'];

/** Vertikal terakhir yang dikunjungi. sessionStorage: cukup bertahan selama
 *  tab dibuka, dan tidak membekukan pilihan lama saat pengguna kembali
 *  berhari-hari kemudian. */
const KUNCI = 'soora_last_vertical';

export function lastVertical() {
  try {
    const v = sessionStorage.getItem(KUNCI);
    return VERTIKAL.includes(v) ? v : 'sooranime';
  } catch {
    return 'sooranime';
  }
}

export function rememberVertical(v) {
  try { sessionStorage.setItem(KUNCI, v); } catch { /* mode privat */ }
}

/** Alamat profil untuk sebuah vertikal. */
export const jalurProfil = (vertikal) =>
  vertikal === 'sooraflix' ? '/movies/profile'
    : vertikal === 'sooramics' ? '/manga/profile'
      : '/anime/profile';

/** Kelas tema halaman untuk sebuah vertikal. Anime memakai token bawaan,
 *  jadi tidak butuh kelas sendiri. */
export const kelasVertikal = (vertikal) =>
  vertikal === 'sooraflix' ? 'sooraflix-page'
    : vertikal === 'sooramics' ? 'sooramics-page'
      : '';

/** Bagian data (progress, My List) untuk sebuah vertikal. */
export const bagianVertikal = (vertikal) =>
  vertikal === 'sooraflix' ? 'movie'
    : vertikal === 'sooramics' ? 'manga'
      : 'anime';
