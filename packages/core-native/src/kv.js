/**
 * Adapter KVPort di atas MMKV — bagian murni, tanpa import modul native.
 *
 * File ini sengaja TIDAK meng-import `react-native-mmkv` supaya logikanya bisa
 * diuji di node biasa. Penyambungan ke instance MMKV asli ada di ./index.js.
 */

/**
 * @typedef {import('@soora/core/ports').KVPort} KVPort
 *
 * Bentuk minimal instance MMKV yang kita butuhkan. Sengaja sempit supaya
 * mudah dipalsukan di test dan tidak terikat versi react-native-mmkv.
 *
 * @typedef {object} MMKVLike
 * @property {(key: string) => string | undefined} getString
 * @property {(key: string, value: string) => void} set
 * @property {(key: string) => void} delete
 */

/**
 * Membungkus instance MMKV jadi KVPort.
 *
 * Perbedaan penting: MMKV mengembalikan `undefined` untuk key yang tidak ada,
 * sedangkan KVPort mensyaratkan `null`. Tanpa normalisasi ini, pemeriksaan
 * `=== null` di core akan meleset dan `getToken()` mengembalikan `undefined`
 * yang lalu jadi string "undefined" saat dirangkai ke header Authorization.
 *
 * @param {MMKVLike} storage
 * @returns {KVPort}
 */
export function createMMKVKV(storage) {
  const missing = ['getString', 'set', 'delete'].filter((m) => typeof storage?.[m] !== 'function');
  if (missing.length) {
    throw new TypeError(`createMMKVKV: instance MMKV kekurangan method: ${missing.join(', ')}`);
  }

  // try/catch di tiap operasi karena kontrak KVPort mensyaratkan method tidak
  // pernah melempar (lihat packages/core/src/ports/index.js). `configureCore`
  // memang membungkus dengan safeKV, tapi ekspor `nativePersistentKV` juga
  // dipakai langsung — dan di jalur itu tidak ada pembungkus apa pun.
  return {
    get: (key) => {
      try {
        const v = storage.getString(key);
        return v === undefined ? null : v;
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        storage.set(key, value);
      } catch {
        /* MMKV tertutup, disk penuh, atau kegagalan enkripsi */
      }
    },
    remove: (key) => {
      try {
        storage.delete(key);
      } catch {
        /* sama seperti di atas */
      }
    },
  };
}
