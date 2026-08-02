/**
 * Runtime config untuk @soora/core.
 *
 * Core tidak tahu dia berjalan di browser atau di React Native. Semua yang
 * platform-specific diinjeksi sekali saat aplikasi start lewat `configureCore()`.
 *
 * Web   : apps/web/src/main.jsx        → adapter dari @soora/core-web
 * Native: apps/mobile/app/_layout.tsx  → adapter dari @soora/core-native (fase 1)
 */

import { createMemoryKV, safeKV } from './ports/index.js';

/**
 * @typedef {import('./ports/index.js').KVPort} KVPort
 * @typedef {import('./ports/index.js').PageRefPort} PageRefPort
 *
 * @typedef {object} CoreRuntime
 * @property {string} apiBase
 *   Base URL semua request backend. Web pakai nilai VITE_API_URL, native pakai
 *   'https://api.soora.fun'.
 * @property {KVPort} kv
 *   Penyimpanan persisten, bertahan antar sesi. Menyimpan auth token.
 *   Web → localStorage, native → MMKV.
 * @property {KVPort} cache
 *   Penyimpanan sesi, boleh hilang saat app ditutup. Menyimpan respons API.
 *   Web → sessionStorage, native → MMKV instance terpisah.
 * @property {PageRefPort} getPage
 *   Lokasi user saat ini, disertakan di laporan error.
 * @property {'proxy'|'headers'} imageStrategy
 *   Cara mengambil gambar dari CDN yang mensyaratkan header Referer.
 *
 *   'proxy'   — web. Browser melarang menyetel Referer pada <img>, jadi URL
 *               dialihkan ke proxy server yang menambahkannya.
 *   'headers' — native. expo-image bisa mengirim Referer sendiri, jadi gambar
 *               diambil langsung dari CDN: satu hop lebih pendek, dan tidak
 *               memakai bandwidth proxy sama sekali.
 *
 *   Diverifikasi 2026-08-03 terhadap cdn.readdetectiveconan.com: tanpa Referer
 *   403, dengan Referer 200.
 * @property {string} streamProxy
 *   URL penuh proxy stream. Semua video wajib lewat sini — token m3u8 terikat
 *   IP VPS, jadi perangkat tidak bisa mengambil langsung (diverifikasi
 *   2026-08-03). Dipisah dari `apiBase` karena proxy bisa dipindah ke host
 *   lain tanpa memindahkan API.
 * @property {string} imgProxyBase
 *   Awalan URL proxy gambar saat imageStrategy 'proxy'. Web memakai '' (relatif
 *   terhadap origin) karena /manga-img adalah fungsi serverless Vercel, bukan
 *   endpoint di api.soora.fun.
 */

/** @type {CoreRuntime} */
const DEFAULTS = {
  apiBase: '/api',
  kv: createMemoryKV(),
  cache: createMemoryKV(),
  getPage: () => '',
  imageStrategy: 'proxy',
  imgProxyBase: '',
  streamProxy: '/api/proxy',
};

/** @type {CoreRuntime} */
let runtime = { ...DEFAULTS };

/**
 * Menginjeksi implementasi platform. Panggil sekali saat aplikasi start,
 * sebelum request apa pun dibuat.
 *
 * Aman dipanggil berkali-kali (test memanfaatkan ini). Field yang dihilangkan
 * mempertahankan nilai sebelumnya.
 *
 * @param {Partial<CoreRuntime>} partial
 * @returns {CoreRuntime} runtime setelah merge
 */
export function configureCore(partial = {}) {
  if (partial.apiBase !== undefined) {
    if (typeof partial.apiBase !== 'string' || partial.apiBase === '') {
      throw new TypeError('configureCore: apiBase harus string tidak kosong');
    }
    // Buang trailing slash supaya `${apiBase}/tmdb` tidak jadi '//tmdb'.
    runtime.apiBase = partial.apiBase.replace(/\/+$/, '');
  }
  if (partial.kv !== undefined) runtime.kv = safeKV(partial.kv);
  if (partial.cache !== undefined) runtime.cache = safeKV(partial.cache);
  if (partial.getPage !== undefined) {
    if (typeof partial.getPage !== 'function') {
      throw new TypeError('configureCore: getPage harus function');
    }
    runtime.getPage = partial.getPage;
  }
  if (partial.imageStrategy !== undefined) {
    if (partial.imageStrategy !== 'proxy' && partial.imageStrategy !== 'headers') {
      throw new TypeError("configureCore: imageStrategy harus 'proxy' atau 'headers'");
    }
    runtime.imageStrategy = partial.imageStrategy;
  }
  if (partial.streamProxy !== undefined) {
    if (typeof partial.streamProxy !== 'string' || partial.streamProxy === '') {
      throw new TypeError('configureCore: streamProxy harus string tidak kosong');
    }
    runtime.streamProxy = partial.streamProxy.replace(/\/+$/, '');
  }
  if (partial.imgProxyBase !== undefined) {
    if (typeof partial.imgProxyBase !== 'string') {
      throw new TypeError('configureCore: imgProxyBase harus string');
    }
    runtime.imgProxyBase = partial.imgProxyBase.replace(/\/+$/, '');
  }
  return runtime;
}

/**
 * Runtime aktif. Selalu baca lewat fungsi ini, jangan simpan hasilnya di
 * variabel modul — `configureCore()` bisa dipanggil setelah modul di-load.
 *
 * @returns {CoreRuntime}
 */
export function getRuntime() {
  return runtime;
}

/**
 * Mengembalikan runtime ke default (memory KV, apiBase '/api').
 * Dipakai test untuk mengisolasi antar case.
 */
export function resetCoreRuntime() {
  runtime = { ...DEFAULTS, kv: createMemoryKV(), cache: createMemoryKV() };
}
