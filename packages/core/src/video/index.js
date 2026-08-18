/**
 * Klien video pustaka tambahan (sooramics+).
 *
 * Semua lewat backend sendiri di /video: sumbernya tidak menyediakan API dan
 * halamannya dibaca dari HTML, jadi peramban tidak bisa mengambilnya langsung
 * (CORS), dan penyaringan bingkai pemutar harus terjadi di server.
 */
import { getRuntime } from '../runtime.js';

const dasar = () => getRuntime().apiBase;

async function ambil(path, params) {
  const qs = new URLSearchParams(
    Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  const res = await fetch(`${dasar()}${path}${qs ? `?${qs}` : ''}`);
  if (!res.ok) {
    let pesan = 'Gagal memuat video';
    try { pesan = (await res.json())?.error || pesan; } catch { /* bukan JSON */ }
    const err = new Error(pesan);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const daftarVideo = (page = 1) => ambil('/video/list', { page });

export const kategoriVideo = () => ambil('/video/categories');

export const videoPerKategori = (slug, page = 1) =>
  ambil(`/video/category/${encodeURIComponent(slug)}`, { page });

export const cariVideo = (q, page = 1) => ambil('/video/search', { q, page });

export const detailVideo = (slug) =>
  ambil(`/video/detail/${encodeURIComponent(slug)}`);
