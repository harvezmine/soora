/**
 * Klien pustaka tambahan (sooramics+).
 *
 * Seluruh isinya dilayani backend kita sendiri di /doujin — tidak ada
 * panggilan langsung ke sumber dari peramban. Alasannya bukan sekadar rapi:
 * sumbernya mengenkripsi response dan menolak permintaan tanpa Referer yang
 * benar, dan peramban tidak mengizinkan JavaScript menyetel Referer.
 */
import { getRuntime } from '../runtime.js';

const dasar = () => getRuntime().apiBase;

async function ambil(path, params) {
  const qs = new URLSearchParams(
    Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  const res = await fetch(`${dasar()}${path}${qs ? `?${qs}` : ''}`);
  if (!res.ok) {
    let pesan = 'Gagal memuat';
    try { pesan = (await res.json())?.error || pesan; } catch { /* bukan JSON */ }
    const err = new Error(pesan);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** Pengurutan yang didukung sumber, beserta namanya untuk manusia. */
export const URUTAN = [
  { nilai: 'latest_chapter', label: 'Update terbaru' },
  { nilai: 'views', label: 'Paling banyak dibaca' },
  { nilai: 'rating', label: 'Rating tertinggi' },
  { nilai: 'created_at', label: 'Baru ditambahkan' },
];

/** Jenis terbitan. Kosong berarti semua. */
export const JENIS = [
  { nilai: '', label: 'Semua jenis' },
  { nilai: 'manga', label: 'Manga' },
  { nilai: 'manhwa', label: 'Manhwa' },
  { nilai: 'manhua', label: 'Manhua' },
  { nilai: 'doujinshi', label: 'Doujinshi' },
];

export const daftarDoujin = ({ page = 1, sort, type, genre, limit } = {}) =>
  ambil('/doujin/list', { page, sort, type, genre, limit });

export const cariDoujin = (q, { page = 1, limit } = {}) =>
  ambil('/doujin/search', { q, page, limit });

export const genreDoujin = () => ambil('/doujin/genres');

export const detailDoujin = (slug) =>
  ambil(`/doujin/detail/${encodeURIComponent(slug)}`);

export const chapterDoujin = (id) =>
  ambil(`/doujin/chapter/${encodeURIComponent(id)}`);

/**
 * Alamat gambar lewat proxy kita.
 *
 * Semua gambar sumber ini butuh Referer, jadi tidak ada jalur langsung —
 * berbeda dari komikplus yang justru harus tanpa Referer.
 */
export const gambarDoujin = (url) =>
  url ? `${dasar()}/doujin/img?url=${encodeURIComponent(url)}` : '';

/** Status pengambilan rahasia di server — dipakai halaman diagnosa. */
export const sehatDoujin = () => ambil('/doujin/health');
