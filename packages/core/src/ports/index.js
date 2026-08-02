/**
 * Ports — interface yang harus disediakan setiap platform.
 *
 * `packages/core` TIDAK BOLEH menyentuh localStorage, sessionStorage, window,
 * document, atau AsyncStorage secara langsung. Semua akses penyimpanan lewat
 * port di file ini, dan implementasinya di-inject lewat `configureCore()`.
 *
 * Implementasi:
 *   - web    → packages/core-web  (localStorage / sessionStorage)
 *   - native → packages/core-native (MMKV / expo-sqlite) — fase 1
 */

/**
 * Penyimpanan key-value sinkron berbasis string.
 *
 * Sinkron, bukan async, karena dipakai di jalur panas (baca token tiap request,
 * tulis progress tiap 5 detik). MMKV sinkron; AsyncStorage tidak — itu sebabnya
 * MMKV yang dipilih untuk native.
 *
 * Setiap method harus menelan error internal dan tidak melempar. Quota penuh
 * atau storage tidak tersedia harus berperilaku seperti cache miss, bukan crash.
 *
 * @typedef {object} KVPort
 * @property {(key: string) => string | null} get
 * @property {(key: string, value: string) => void} set
 * @property {(key: string) => void} remove
 */

/**
 * Fungsi yang mengembalikan lokasi user saat ini, untuk pelaporan error.
 * Web mengembalikan pathname + query; native mengembalikan nama route.
 *
 * @typedef {() => string} PageRefPort
 */

/**
 * Membuat KVPort in-memory. Ini default yang dipakai kalau `configureCore()`
 * belum dipanggil, dan juga dipakai di test.
 *
 * @returns {KVPort}
 */
export function createMemoryKV() {
  const store = new Map();
  return {
    get: (key) => (store.has(key) ? store.get(key) : null),
    set: (key, value) => {
      store.set(key, value);
    },
    remove: (key) => {
      store.delete(key);
    },
  };
}

/**
 * Membungkus KVPort yang mungkin melempar (mis. localStorage saat quota penuh
 * atau di private mode Safari) supaya tidak pernah melempar ke pemanggil.
 *
 * @param {KVPort} kv
 * @returns {KVPort}
 */
export function safeKV(kv) {
  return {
    get: (key) => {
      try {
        return kv.get(key);
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        kv.set(key, value);
      } catch {
        /* quota penuh atau storage tidak tersedia — perlakukan sebagai no-op */
      }
    },
    remove: (key) => {
      try {
        kv.remove(key);
      } catch {
        /* sama seperti di atas */
      }
    },
  };
}
