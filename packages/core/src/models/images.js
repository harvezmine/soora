/**
 * Penyelesaian URL gambar untuk CDN yang memblokir hotlink.
 *
 * Beberapa CDN penyedia konten mengembalikan 403 kalau request tidak membawa
 * header Referer yang benar. Browser tidak mengizinkan JavaScript menyetel
 * Referer pada <img>, jadi web harus melewatkan gambar ke proxy server.
 * React Native tidak punya batasan itu — expo-image bisa mengirim header
 * sendiri, sehingga gambar diambil langsung dari CDN.
 *
 * Diverifikasi 2026-08-03 terhadap cdn.readdetectiveconan.com:
 *   tanpa Referer                       → 403 (4,5 KB halaman error)
 *   Referer: https://mangapill.com/     → 200 (91 KB image/webp)
 */

import { getRuntime } from '../runtime.js';

/**
 * Host yang mensyaratkan Referer, beserta nilai yang diterimanya.
 *
 * Dicocokkan dengan substring, bukan regex, karena nama host penyedia sering
 * berganti angka (i7.nhentai.net, t7.nhentai.net, cdn2.…) dan pencocokan
 * substring tetap bekerja saat itu terjadi.
 */
export const REFERER_RULES = [
  { match: 'readdetectiveconan.com', referer: 'https://mangapill.com/' },
  { match: 'mangapill', referer: 'https://mangapill.com/' },
  { match: 'komiku.', referer: 'https://komiku.id/' },
  { match: 'doujindesu', referer: 'https://doujindesu.tv/' },
];

/**
 * Referer yang dibutuhkan URL ini, atau null kalau bisa diambil langsung.
 *
 * @param {string} url
 * @returns {string | null}
 */
export function refererFor(url) {
  if (!url) return null;
  for (const rule of REFERER_RULES) {
    if (url.includes(rule.match)) return rule.referer;
  }
  return null;
}

/**
 * Menyelesaikan URL gambar jadi sumber yang siap dirender.
 *
 * Bentuk kembaliannya cocok untuk `expo-image` maupun `<img>`:
 * `{ uri, headers? }`. Web mengabaikan `headers` dan menerima `uri` yang sudah
 * mengarah ke proxy; native memakai `headers` dan `uri` CDN asli.
 *
 * @param {string} url
 * @returns {{ uri: string, headers?: Record<string, string> }}
 */
export function resolveImage(url) {
  if (!url) return { uri: '' };

  const referer = refererFor(url);
  if (!referer) return { uri: url };

  const { imageStrategy, imgProxyBase } = getRuntime();

  if (imageStrategy === 'headers') {
    return { uri: url, headers: { Referer: referer } };
  }

  return { uri: `${imgProxyBase}/manga-img?url=${encodeURIComponent(url)}` };
}

/**
 * Mengganti ukuran gambar TMDB.
 *
 * TMDB menyajikan beberapa ukuran dari path yang sama. Kartu katalog hanya
 * butuh w342; memakai `original` di grid berarti mengunduh beberapa megabyte
 * per layar tanpa perbedaan yang terlihat.
 *
 * @param {string} url URL TMDB apa pun
 * @param {'w185'|'w342'|'w500'|'w780'|'original'} size
 * @returns {string}
 */
export function tmdbSize(url, size) {
  if (!url || !url.includes('image.tmdb.org')) return url || '';
  return url.replace(/\/t\/p\/[^/]+\//, `/t/p/${size}/`);
}
