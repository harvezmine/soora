/**
 * Avatar bawaan Soora.
 *
 * Berkas gambarnya tinggal di `apps/web/public/avatars/` dan disajikan Vercel
 * dari soora.fun, bukan dari VPS — CDN-nya gratis dan lebih dekat ke
 * pengguna daripada server di satu lokasi.
 *
 * Yang disimpan pada akun adalah URL penuh, bukan nomor. Alasannya: avatar
 * ikut disalin ke tiap komentar dan tiap peserta ruang saat ditulis, jadi
 * membaca komentar lama tidak perlu tahu aturan penomoran yang mungkin sudah
 * berubah.
 */

const BASE = process.env.AVATAR_BASE_URL || 'https://soora.fun/avatars';

/**
 * Berapa banyak avatar bawaan yang tersedia.
 *
 * Diatur lewat env supaya menambah gambar tidak perlu menyentuh kode:
 * taruh berkasnya, naikkan angkanya, mulai ulang backend. Nol berarti belum
 * ada gambar sama sekali — pemanggil jatuh ke avatar inisial.
 */
const JUMLAH = parseInt(process.env.AVATAR_COUNT || '0', 10) || 0;

/** Nama berkas: soora-01.png, soora-02.png, ... */
const namaBerkas = (n: number) => `soora-${String(n).padStart(2, '0')}.png`;

export const urlAvatar = (n: number) => `${BASE}/${namaBerkas(n)}`;

export function daftarAvatar(): string[] {
  return Array.from({ length: JUMLAH }, (_, i) => urlAvatar(i + 1));
}

/** Avatar inisial, dipakai selama belum ada gambar bawaan. */
export function avatarInisial(nama: string): string {
  // Warna latar mengikuti merah sooraflix; sebelumnya ungu yang tertinggal
  // dari sebelum rebrand.
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(nama)}&backgroundColor=e50914`;
}

/**
 * Satu avatar acak untuk pendaftar baru.
 *
 * Acak, bukan urut atau berdasarkan nama: urut membuat pendaftar berurutan
 * terlihat berpasangan, dan berdasarkan nama membuat dua orang bernama sama
 * selalu kembar.
 */
export function avatarAcak(namaUntukCadangan: string): string {
  if (JUMLAH < 1) return avatarInisial(namaUntukCadangan);
  return urlAvatar(1 + Math.floor(Math.random() * JUMLAH));
}

/**
 * Apakah sebuah URL termasuk avatar bawaan yang sah.
 *
 * Dipakai saat pengguna mengganti avatarnya: tanpa pemeriksaan ini, kolom
 * avatar berubah jadi tempat menitipkan URL apa pun — termasuk gambar
 * pelacak, atau alamat yang memuat isi tak pantas di kolom komentar orang.
 */
export function avatarSah(url: string): boolean {
  return daftarAvatar().includes(String(url || ''));
}

export const jumlahAvatar = () => JUMLAH;
