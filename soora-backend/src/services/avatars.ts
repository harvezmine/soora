import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

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

/** Tempat avatar unggahan disimpan dan disajikan. */
const UPLOAD_DIR = process.env.AVATAR_UPLOAD_DIR || path.join(process.env.HOME || '/home/sigma', 'soora', 'uploads', 'avatars');
const UPLOAD_BASE = process.env.AVATAR_UPLOAD_BASE_URL || 'https://api.soora.fun/uploads/avatars';

/** 2 MB sudah sangat longgar untuk gambar 256px. */
export const MAKS_UNGGAH = 2 * 1024 * 1024;

/**
 * Nama berkas avatar bawaan, tanpa akhiran.
 *
 * Daftar nama, bukan jumlah: nama memberi tahu isinya, dan menghapus satu
 * gambar dari tengah tidak menggeser yang lain. Diatur lewat env supaya
 * menambah gambar tidak perlu menyentuh kode.
 */
const NAMA_BAWAAN = (process.env.AVATAR_NAMES || 'dino,panda,penguin,rabbit,shiba')
  .split(',')
  .map((n) => n.trim())
  .filter(Boolean);

/** WebP: gambar-gambar ini tidak punya transparansi, dan ukurannya
 *  seperdelapan PNG pada mutu yang sama. */
const AKHIRAN = process.env.AVATAR_EXT || 'webp';

export const urlAvatar = (nama: string) => `${BASE}/${nama}.${AKHIRAN}`;

export function daftarAvatar(): string[] {
  return NAMA_BAWAAN.map(urlAvatar);
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
  if (!NAMA_BAWAAN.length) return avatarInisial(namaUntukCadangan);
  return urlAvatar(NAMA_BAWAAN[Math.floor(Math.random() * NAMA_BAWAAN.length)]);
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

export const jumlahAvatar = () => NAMA_BAWAAN.length;

// ── Unggahan ──

/**
 * Jenis gambar yang diterima, dikenali dari byte awalnya — bukan dari header
 * Content-Type yang dikirim klien. Header itu ditulis oleh pengirim dan bisa
 * berisi apa saja.
 *
 * SVG sengaja tidak ada di daftar: ia berupa dokumen XML yang boleh memuat
 * <script>, dan disajikan dari domain sendiri itu berarti skrip asing berjalan
 * dengan wewenang situs kita.
 */
const TANDA_TANGAN: Array<{ ext: string; mime: string; cocok: (b: Buffer) => boolean }> = [
  {
    ext: 'png',
    mime: 'image/png',
    cocok: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    ext: 'jpg',
    mime: 'image/jpeg',
    cocok: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: 'webp',
    mime: 'image/webp',
    cocok: (b) =>
      b.length > 12 &&
      b.toString('ascii', 0, 4) === 'RIFF' &&
      b.toString('ascii', 8, 12) === 'WEBP',
  },
];

export function kenaliGambar(buf: Buffer): { ext: string; mime: string } | null {
  return TANDA_TANGAN.find((t) => t.cocok(buf)) || null;
}

/** URL unggahan milik pengguna tertentu. Nama berkas selalu diawali id-nya. */
const namaUnggahan = (userId: string, ext: string) =>
  `${userId}-${crypto.randomBytes(6).toString('hex')}.${ext}`;

/**
 * Simpan avatar unggahan, lalu hapus unggahan lama milik orang yang sama.
 *
 * Nama berkas dibuat server dari id pengguna dan angka acak — tidak pernah
 * dari nama berkas kiriman. Nama kiriman bisa memuat "../" dan menulis ke
 * mana saja di disk.
 */
export async function simpanUnggahan(userId: string, buf: Buffer): Promise<string> {
  const jenis = kenaliGambar(buf);
  if (!jenis) throw new Error('Format gambar tidak dikenali');

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const nama = namaUnggahan(userId, jenis.ext);
  await fs.writeFile(path.join(UPLOAD_DIR, nama), buf);

  // Bersihkan unggahan lama supaya disk tidak menumpuk gambar yang tidak
  // lagi dipakai siapa pun.
  try {
    const isi = await fs.readdir(UPLOAD_DIR);
    await Promise.all(
      isi
        .filter((f) => f.startsWith(`${userId}-`) && f !== nama)
        .map((f) => fs.unlink(path.join(UPLOAD_DIR, f)).catch(() => {}))
    );
  } catch { /* pembersihan gagal bukan alasan menolak unggahan */ }

  return `${UPLOAD_BASE}/${nama}`;
}

/**
 * Apakah URL ini unggahan milik pengguna tersebut.
 *
 * Diperiksa dengan mengurai URL, bukan mencocokkan awalan teks:
 * "https://jahat.example/?x=https://api.soora.fun/uploads/avatars/u_1-a.png"
 * lolos dari pencocokan awalan yang naif.
 */
export function unggahanMilik(url: string, userId: string): boolean {
  try {
    const u = new URL(String(url || ''));
    const dasar = new URL(UPLOAD_BASE);
    if (u.origin !== dasar.origin) return false;
    if (!u.pathname.startsWith(`${dasar.pathname}/`)) return false;
    const nama = u.pathname.slice(dasar.pathname.length + 1);
    return /^[A-Za-z0-9_-]+\.(png|jpg|webp)$/.test(nama) && nama.startsWith(`${userId}-`);
  } catch {
    return false;
  }
}

/**
 * Apakah avatar ini pemberian sistem yang belum pernah disentuh pemiliknya.
 *
 * Avatar inisial dari dicebear adalah penanda "belum pernah memilih": ia
 * hanya pernah dipasang otomatis, tidak pernah bisa dipilih dari antarmuka.
 *
 * Foto dari Google sengaja tidak dihitung. Ia memang tidak dipilih di dalam
 * Soora, tapi ia wajah asli orangnya — menggantinya dengan gambar hewan acak
 * adalah kehilangan data yang akan mengejutkan.
 */
export function avatarPemberianSistem(url: string): boolean {
  const u = String(url || '');
  return !u || u.includes('api.dicebear.com');
}

/**
 * Berikan avatar bawaan kepada pengguna yang belum pernah memilih sendiri.
 * Mengembalikan URL baru bila memang diganti, atau null bila dibiarkan.
 */
export function avatarSusulan(user: { avatar: string; avatarDipilih?: boolean; name: string }): string | null {
  if (user.avatarDipilih) return null;
  if (!avatarPemberianSistem(user.avatar)) return null;
  if (!jumlahAvatar()) return null;
  return avatarAcak(user.name);
}
