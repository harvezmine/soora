/**
 * Bentuk data pembaca manga — bagian murni, tanpa React dan tanpa modul native.
 *
 * Ditaruh di core supaya web dan app memakai normalisasi yang sama, dan supaya
 * logikanya bisa diuji tanpa perlu menjalankan app.
 */

import { resolveImage } from './images.js';

/**
 * Ubah respons chapter jadi daftar sumber gambar.
 *
 * Bentuk respons berbeda antar penyedia: mangapill mengembalikan objek
 * `{ img, page }`, komiku kadang array string biasa. Entri tanpa URL dibuang,
 * bukan dijadikan gambar kosong — halaman kosong di tengah chapter terlihat
 * seperti gambar gagal dimuat dan membuat pembaca mengira ada yang rusak.
 *
 * @param {unknown} data
 * @returns {{ uri: string, headers?: Record<string, string> }[]}
 */
export function normalizeChapterPages(data) {
  const raw = Array.isArray(data) ? data : [];
  return raw
    .map((p) => {
      if (typeof p === 'string') return p;
      if (p && typeof p === 'object') return p.img || p.url || '';
      return '';
    })
    .filter(Boolean)
    .map((url) => resolveImage(url))
    .filter((s) => Boolean(s && s.uri));
}

/**
 * @typedef {object} ChapterSegment
 * @property {string} chId
 * @property {string} label
 * @property {{ uri: string, headers?: Record<string, string> }[]} pages
 */

/**
 * Ratakan beberapa segmen chapter jadi satu daftar untuk daftar tervirtualisasi.
 *
 * Nomor halaman dibuat relatif terhadap chapter, bukan terhadap gabungan
 * seluruh segmen: setelah tiga chapter tersambung, angka seperti 212/540 tidak
 * berarti apa-apa bagi pembaca.
 *
 * Chapter pertama sengaja tidak diberi pemisah — judulnya sudah ada di bar
 * atas, dan pemisah di baris paling atas hanya memakan layar pertama.
 *
 * @param {ChapterSegment[]} segments
 */
export function flattenChapterSegments(segments) {
  const out = [];
  const list = Array.isArray(segments) ? segments : [];
  // Dihitung dari segmen yang benar-benar dikeluarkan, bukan dari indeks array.
  // Kalau segmen awal rusak dan dilewati, segmen valid pertama akan berada di
  // indeks > 0 dan mendapat pemisah — pemisah di baris paling atas layar.
  let sudahAda = false;
  list.forEach((s) => {
    if (!s || !Array.isArray(s.pages)) return;
    if (sudahAda) {
      out.push({ kind: 'divider', key: `sep-${s.chId}`, chId: s.chId, label: s.label });
    }
    sudahAda = true;
    s.pages.forEach((p, pi) => {
      out.push({
        kind: 'page',
        key: `${s.chId}-${pi}`,
        chId: s.chId,
        uri: p.uri,
        headers: p.headers,
        index: pi + 1,
        total: s.pages.length,
      });
    });
  });
  return out;
}

/**
 * Chapter setelah `chId` pada daftar, atau null kalau sudah yang terakhir.
 *
 * Menerima id yang tidak ada di daftar (kembali null) karena reader bisa dibuka
 * lewat deep link ke chapter yang sudah dihapus penyedia.
 *
 * @param {{ id?: string }[]} chapters
 * @param {string} chId
 */
export function nextChapterAfter(chapters, chId) {
  const list = Array.isArray(chapters) ? chapters.filter((c) => c && c.id) : [];
  const i = list.findIndex((c) => c.id === chId);
  if (i < 0 || i >= list.length - 1) return null;
  return list[i + 1];
}

/**
 * Bagi daftar episode jadi rentang untuk pemilih "1–50", "51–100", dan
 * seterusnya.
 *
 * Ukuran potongan mengikuti web: 50 untuk judul di atas 100 episode, 25 untuk
 * di atas 36, dan satu rentang saja untuk sisanya. Judul pendek tidak perlu
 * pemilih — menampilkannya untuk 12 episode hanya menambah satu ketukan tanpa
 * memberi apa pun.
 *
 * Label memakai `number` episode kalau ada, bukan indeks array: penyedia kerap
 * mengembalikan episode 0 (spesial) atau melompati nomor, dan label berbasis
 * indeks akan menyesatkan.
 *
 * @param {{ number?: number|string }[]} episodes
 * @returns {{ label: string, start: number, end: number }[]}
 */
export function buildEpisodeRanges(episodes) {
  const list = Array.isArray(episodes) ? episodes : [];
  if (list.length === 0) return [];

  const chunk = list.length > 100 ? 50 : list.length > 36 ? 25 : list.length;
  const out = [];
  for (let i = 0; i < list.length; i += chunk) {
    const bagian = list.slice(i, i + chunk);
    const awal = bagian[0]?.number ?? i + 1;
    const akhir = bagian[bagian.length - 1]?.number ?? i + bagian.length;
    out.push({ label: `${awal}–${akhir}`, start: i, end: i + bagian.length });
  }
  return out;
}
