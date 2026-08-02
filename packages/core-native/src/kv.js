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
  if (!storage || typeof storage.getString !== 'function') {
    throw new TypeError('createMMKVKV: butuh instance MMKV dengan getString/set/delete');
  }
  return {
    get: (key) => {
      const v = storage.getString(key);
      return v === undefined ? null : v;
    },
    set: (key, value) => storage.set(key, value),
    remove: (key) => storage.delete(key),
  };
}
