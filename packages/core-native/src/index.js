/**
 * Adapter React Native untuk port @soora/core.
 *
 * Padanan @soora/core-web. File ini meng-import modul native, jadi hanya bisa
 * dijalankan di dalam app RN — bukan di node. Logika murninya ada di ./kv.js
 * supaya tetap bisa diuji.
 */

import { MMKV } from 'react-native-mmkv';
import { createMMKVKV } from './kv.js';

/**
 * Dua instance MMKV terpisah, bukan satu dengan prefix key.
 *
 * `kv` menyimpan data yang harus bertahan (auth token, progress tontonan).
 * `cache` menyimpan respons API yang boleh dibuang kapan saja. Memisahkannya
 * di level instance berarti tombol "Bersihkan cache" nanti cukup memanggil
 * `cacheStorage.clearAll()` tanpa risiko ikut menghapus sesi login user.
 */
export const kvStorage = new MMKV({ id: 'soora-kv' });
export const cacheStorage = new MMKV({ id: 'soora-cache' });

/** Penyimpanan persisten — auth token, progress, settings. */
export const nativePersistentKV = createMMKVKV(kvStorage);

/** Penyimpanan cache respons API. Boleh hilang. */
export const nativeCacheKV = createMMKVKV(cacheStorage);

/** Mengosongkan seluruh cache API tanpa menyentuh sesi login. */
export const clearNativeCache = () => cacheStorage.clearAll();

/**
 * Konfigurasi untuk `configureCore()` di React Native.
 *
 * `getPage` diinjeksi dari pemanggil, bukan di-import dari expo-router di sini,
 * supaya package ini tidak terikat pada pustaka navigasi tertentu.
 *
 * @param {object} opts
 * @param {string} opts.apiBase
 * @param {() => string} [opts.getPage] Lokasi user untuk laporan error.
 * @returns {{
 *   apiBase: string,
 *   kv: import('@soora/core/ports').KVPort,
 *   cache: import('@soora/core/ports').KVPort,
 *   getPage: () => string
 * }}
 */
export const nativeCoreConfig = ({ apiBase, getPage = () => '' }) => ({
  apiBase,
  kv: nativePersistentKV,
  cache: nativeCacheKV,
  getPage,
});

export { createMMKVKV };
