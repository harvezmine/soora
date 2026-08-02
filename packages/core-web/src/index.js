/**
 * Adapter browser untuk port @soora/core.
 *
 * Satu-satunya tempat di jalur data web yang boleh menyentuh localStorage,
 * sessionStorage, dan window. Padanan native-nya adalah @soora/core-native
 * (MMKV + expo-router), dibuat di fase 1.
 */

/**
 * @typedef {import('@soora/core/ports').KVPort} KVPort
 */

/**
 * Membungkus Storage bawaan browser jadi KVPort.
 *
 * `safeKV()` di core sudah menelan error, tapi akses ke `window.localStorage`
 * itu sendiri bisa melempar (iframe cross-origin, Safari private mode), jadi
 * pengambilan objek storage-nya juga dilindungi.
 *
 * @param {() => Storage} getStorage
 * @returns {KVPort}
 */
function fromStorage(getStorage) {
  return {
    get: (key) => {
      try {
        return getStorage().getItem(key);
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        getStorage().setItem(key, value);
      } catch {
        /* quota penuh atau storage diblokir */
      }
    },
    remove: (key) => {
      try {
        getStorage().removeItem(key);
      } catch {
        /* sama seperti di atas */
      }
    },
  };
}

/** Penyimpanan persisten — auth token. Bertahan antar sesi browser. */
export const webPersistentKV = fromStorage(() => window.localStorage);

/** Penyimpanan sesi — cache respons API. Hilang saat tab ditutup. */
export const webSessionKV = fromStorage(() => window.sessionStorage);

/** Lokasi user saat ini, untuk pelaporan error ke Telegram. */
export const webPageRef = () => {
  try {
    return window.location.pathname + window.location.search;
  } catch {
    return '';
  }
};

/**
 * Konfigurasi lengkap untuk `configureCore()` di web.
 *
 * @param {string} apiBase
 * @returns {{ apiBase: string, kv: KVPort, cache: KVPort, getPage: () => string }}
 */
export const webCoreConfig = (apiBase) => ({
  apiBase,
  kv: webPersistentKV,
  cache: webSessionKV,
  getPage: webPageRef,
  // Browser tidak mengizinkan JavaScript menyetel Referer pada <img>, jadi
  // gambar dari CDN yang memblokir hotlink harus lewat proxy. imgProxyBase
  // dibiarkan kosong: /manga-img adalah fungsi serverless Vercel di origin
  // yang sama, bukan endpoint di api.soora.fun.
  imageStrategy: 'proxy',
  imgProxyBase: '',
});
