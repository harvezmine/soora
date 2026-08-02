/**
 * Cache katalog berbasis SQLite — bagian murni, tanpa import expo-sqlite.
 *
 * Kenapa SQLite dan bukan MMKV untuk data ini: daftar chapter manga bisa
 * ratusan baris per judul, dan katalog perlu dibaca saat offline. MMKV bagus
 * untuk nilai kecil yang sering ditulis, bukan untuk kumpulan baris.
 *
 * Pola bacanya stale-while-revalidate, sama seperti `cachedGetSWR` di
 * @soora/core, tapi dengan penyimpanan yang bertahan antar sesi app.
 */

/**
 * Bentuk minimal database yang dibutuhkan. Sengaja sempit supaya bisa
 * dipalsukan di test dan tidak terikat versi expo-sqlite.
 *
 * @typedef {object} SqlitePort
 * @property {(sql: string) => void} exec
 * @property {(sql: string, params?: any[]) => any} getFirst
 * @property {(sql: string, params?: any[]) => void} run
 */

/**
 * TTL per jenis data, sesuai §3.3 design spec.
 *
 * `source` sengaja TIDAK ada di sini. URL m3u8 membawa token yang kedaluwarsa;
 * menyimpannya berarti playback rusak beberapa menit kemudian dengan gejala
 * yang menyesatkan (video "tidak bisa diputar" padahal sumbernya baik-baik saja).
 * Kalau ada yang mencoba menyimpan `source`, `putEntry` akan menolaknya.
 */
export const TTL = {
  title: 7 * 24 * 60 * 60 * 1000, // metadata judul — jarang berubah
  episodes: 6 * 60 * 60 * 1000, // daftar episode / chapter
  home: 60 * 60 * 1000, // home / trending / recent
  search: 15 * 60 * 1000, // hasil pencarian
};

/** Jenis data yang haram di-cache, berapa pun TTL-nya. */
export const NEVER_CACHE = new Set(['source', 'stream']);

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS catalog (
  kind       TEXT NOT NULL,
  key        TEXT NOT NULL,
  payload    TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (kind, key)
);
CREATE INDEX IF NOT EXISTS idx_catalog_fetched ON catalog (fetched_at);
`;

/**
 * Membuat cache katalog di atas database yang diberikan.
 *
 * @param {SqlitePort} db
 * @param {object} [opts]
 * @param {() => number} [opts.now] Sumber waktu — diinjeksi supaya bisa dites.
 */
export function createCatalogCache(db, { now = () => Date.now() } = {}) {
  if (!db || typeof db.exec !== 'function') {
    throw new TypeError('createCatalogCache: butuh SqlitePort dengan exec/getFirst/run');
  }

  db.exec(SCHEMA);

  /**
   * Menyimpan satu entri.
   * @param {string} kind Salah satu kunci TTL.
   * @param {string} key
   * @param {unknown} payload Harus bisa di-JSON.stringify.
   */
  const putEntry = (kind, key, payload) => {
    if (NEVER_CACHE.has(kind)) {
      throw new Error(
        `createCatalogCache: "${kind}" tidak boleh di-cache — URL stream membawa token kedaluwarsa`
      );
    }
    if (payload === undefined) return; // jangan simpan hasil kosong
    db.run('INSERT OR REPLACE INTO catalog (kind, key, payload, fetched_at) VALUES (?, ?, ?, ?)', [
      kind,
      key,
      JSON.stringify(payload),
      now(),
    ]);
  };

  /**
   * Membaca satu entri beserta umurnya.
   * @returns {{ data: unknown, fetchedAt: number, age: number, fresh: boolean } | null}
   */
  const getEntry = (kind, key) => {
    const row = db.getFirst('SELECT payload, fetched_at FROM catalog WHERE kind = ? AND key = ?', [
      kind,
      key,
    ]);
    if (!row) return null;
    let data;
    try {
      data = JSON.parse(row.payload);
    } catch {
      // Baris rusak — buang dan perlakukan sebagai cache miss.
      db.run('DELETE FROM catalog WHERE kind = ? AND key = ?', [kind, key]);
      return null;
    }
    const fetchedAt = row.fetched_at;
    const age = now() - fetchedAt;
    const ttl = TTL[kind] ?? TTL.search;
    return { data, fetchedAt, age, fresh: age < ttl };
  };

  const invalidate = (kind, key) => {
    if (key === undefined) db.run('DELETE FROM catalog WHERE kind = ?', [kind]);
    else db.run('DELETE FROM catalog WHERE kind = ? AND key = ?', [kind, key]);
  };

  const clearAll = () => db.run('DELETE FROM catalog', []);

  /**
   * Stale-while-revalidate.
   *
   * Mengembalikan data cache seketika kalau ada — bahkan yang sudah basi —
   * lalu menyegarkan di belakang. Ini yang membuat layar terbuka tanpa spinner.
   * Fetch hanya ditunggu kalau memang tidak ada apa pun di cache.
   *
   * @param {string} kind
   * @param {string} key
   * @param {() => Promise<unknown>} fetcher
   * @param {(data: unknown) => void} [onRefresh] Dipanggil kalau refresh
   *   background menghasilkan data. Dipakai UI untuk re-render.
   */
  const read = async (kind, key, fetcher, onRefresh) => {
    const hit = getEntry(kind, key);

    const refresh = () => {
      try {
        return Promise.resolve(fetcher())
          .then((data) => {
            if (data === undefined) return undefined;
            putEntry(kind, key, data);
            return data;
          })
          .catch(() => undefined);
      } catch {
        // fetcher melempar sinkron — jangan jatuhkan pemanggil
        return Promise.resolve(undefined);
      }
    };

    if (hit) {
      if (!hit.fresh) {
        refresh().then((data) => {
          if (data !== undefined && onRefresh) onRefresh(data);
        });
      }
      return hit.data;
    }

    // Tidak ada apa pun — terpaksa menunggu.
    const data = await fetcher();
    putEntry(kind, key, data);
    return data;
  };

  return { putEntry, getEntry, invalidate, clearAll, read };
}
