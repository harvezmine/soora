/**
 * Test cache katalog memakai `node:sqlite` (bawaan Node 22) sebagai engine.
 *
 * Sengaja bukan tiruan buatan sendiri: dengan SQLite asli, skema, tipe kolom,
 * PRIMARY KEY gabungan, dan perilaku INSERT OR REPLACE ikut tervalidasi.
 * Tiruan buatan sendiri hanya akan menguji ulang asumsi saya sendiri.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createCatalogCache, TTL, NEVER_CACHE } from './catalog.js';

/** Membungkus node:sqlite jadi SqlitePort yang dipakai catalog.js. */
function sqlitePort() {
  const db = new DatabaseSync(':memory:');
  return {
    exec: (sql) => db.exec(sql),
    getFirst: (sql, params = []) => db.prepare(sql).get(...params),
    run: (sql, params = []) => db.prepare(sql).run(...params),
  };
}

let clock;
let db;
const mk = () => createCatalogCache(db, { now: () => clock });

beforeEach(() => {
  clock = 1_000_000;
  db = sqlitePort();
});

describe('skema', () => {
  it('membuat tabel dan bisa dipanggil ulang tanpa error', () => {
    mk();
    expect(() => mk()).not.toThrow(); // CREATE TABLE IF NOT EXISTS
  });

  it('kind + key adalah primary key gabungan, bukan key saja', () => {
    const c = mk();
    c.putEntry('title', 'naruto', { a: 1 });
    c.putEntry('episodes', 'naruto', { b: 2 });
    // Key sama, kind beda — dua-duanya harus hidup berdampingan.
    expect(c.getEntry('title', 'naruto').data).toEqual({ a: 1 });
    expect(c.getEntry('episodes', 'naruto').data).toEqual({ b: 2 });
  });

  it('menulis ulang key yang sama menggantikan, bukan menggandakan', () => {
    const c = mk();
    c.putEntry('title', 'naruto', { v: 1 });
    c.putEntry('title', 'naruto', { v: 2 });
    expect(c.getEntry('title', 'naruto').data).toEqual({ v: 2 });
    expect(db.getFirst('SELECT COUNT(*) AS n FROM catalog', []).n).toBe(1);
  });
});

describe('TTL', () => {
  it('entri baru dianggap fresh', () => {
    const c = mk();
    c.putEntry('title', 'x', { a: 1 });
    expect(c.getEntry('title', 'x').fresh).toBe(true);
  });

  it('title basi setelah 7 hari', () => {
    const c = mk();
    c.putEntry('title', 'x', { a: 1 });
    clock += TTL.title - 1;
    expect(c.getEntry('title', 'x').fresh).toBe(true);
    clock += 2;
    expect(c.getEntry('title', 'x').fresh).toBe(false);
  });

  it('episodes punya TTL jauh lebih pendek dari title', () => {
    // Daftar episode berubah mingguan; metadata judul praktis statis.
    expect(TTL.episodes).toBeLessThan(TTL.title);
    const c = mk();
    c.putEntry('episodes', 'x', []);
    clock += TTL.episodes + 1;
    expect(c.getEntry('episodes', 'x').fresh).toBe(false);
  });

  it('kind tak dikenal memakai TTL terpendek, bukan tak terbatas', () => {
    const c = mk();
    c.putEntry('sesuatu-yang-baru', 'x', { a: 1 });
    clock += TTL.search + 1;
    expect(c.getEntry('sesuatu-yang-baru', 'x').fresh).toBe(false);
  });

  it('data basi tetap dikembalikan — stale bukan berarti hilang', () => {
    const c = mk();
    c.putEntry('home', 'bundle', { hero: 1 });
    clock += TTL.home * 10;
    const hit = c.getEntry('home', 'bundle');
    expect(hit.fresh).toBe(false);
    expect(hit.data).toEqual({ hero: 1 }); // inilah yang bikin app buka tanpa spinner
  });
});

describe('penolakan cache source', () => {
  it('menolak menyimpan URL stream', () => {
    const c = mk();
    // m3u8 membawa token kedaluwarsa — kalau di-cache, playback rusak beberapa
    // menit kemudian dengan gejala yang menyesatkan.
    expect(() => c.putEntry('source', 'ep-1', { url: 'x.m3u8' })).toThrow(/tidak boleh di-cache/);
    expect(() => c.putEntry('stream', 'ep-1', {})).toThrow();
  });

  it('daftar terlarang mencakup source dan stream', () => {
    expect(NEVER_CACHE.has('source')).toBe(true);
    expect(NEVER_CACHE.has('stream')).toBe(true);
    expect(NEVER_CACHE.has('title')).toBe(false);
  });
});

describe('ketahanan', () => {
  it('baris dengan JSON rusak diperlakukan sebagai miss dan dibuang', () => {
    const c = mk();
    db.run('INSERT INTO catalog (kind, key, payload, fetched_at) VALUES (?, ?, ?, ?)', [
      'title',
      'rusak',
      '{bukan json',
      clock,
    ]);
    expect(c.getEntry('title', 'rusak')).toBeNull();
    expect(db.getFirst('SELECT COUNT(*) AS n FROM catalog', []).n).toBe(0);
  });

  it('payload undefined tidak disimpan', () => {
    const c = mk();
    c.putEntry('title', 'x', undefined);
    expect(c.getEntry('title', 'x')).toBeNull();
  });

  it('null tersimpan dan berbeda dari tidak ada', () => {
    const c = mk();
    c.putEntry('title', 'x', null);
    expect(c.getEntry('title', 'x').data).toBeNull();
  });
});

describe('invalidate / clearAll', () => {
  it('invalidate satu key hanya menghapus key itu', () => {
    const c = mk();
    c.putEntry('title', 'a', 1);
    c.putEntry('title', 'b', 2);
    c.invalidate('title', 'a');
    expect(c.getEntry('title', 'a')).toBeNull();
    expect(c.getEntry('title', 'b').data).toBe(2);
  });

  it('invalidate tanpa key menghapus seluruh kind', () => {
    const c = mk();
    c.putEntry('title', 'a', 1);
    c.putEntry('episodes', 'a', 2);
    c.invalidate('title');
    expect(c.getEntry('title', 'a')).toBeNull();
    expect(c.getEntry('episodes', 'a').data).toBe(2);
  });

  it('clearAll mengosongkan semuanya', () => {
    const c = mk();
    c.putEntry('title', 'a', 1);
    c.putEntry('home', 'b', 2);
    c.clearAll();
    expect(db.getFirst('SELECT COUNT(*) AS n FROM catalog', []).n).toBe(0);
  });
});

describe('read (stale-while-revalidate)', () => {
  it('cache kosong — menunggu fetcher lalu menyimpan', async () => {
    const c = mk();
    const fetcher = vi.fn().mockResolvedValue({ v: 1 });
    expect(await c.read('title', 'x', fetcher)).toEqual({ v: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(c.getEntry('title', 'x').data).toEqual({ v: 1 });
  });

  it('cache fresh — fetcher tidak dipanggil sama sekali', async () => {
    const c = mk();
    c.putEntry('title', 'x', { v: 1 });
    const fetcher = vi.fn();
    expect(await c.read('title', 'x', fetcher)).toEqual({ v: 1 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('cache basi — data lama dikembalikan seketika, refresh jalan di belakang', async () => {
    const c = mk();
    c.putEntry('home', 'b', { v: 1 });
    clock += TTL.home + 1;

    let resolveFetch;
    const fetcher = vi.fn(() => new Promise((r) => (resolveFetch = r)));
    const onRefresh = vi.fn();

    // Kembali duluan tanpa menunggu jaringan — ini inti SWR.
    expect(await c.read('home', 'b', fetcher, onRefresh)).toEqual({ v: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);

    resolveFetch({ v: 2 });
    await vi.waitFor(() => expect(onRefresh).toHaveBeenCalledWith({ v: 2 }));
    expect(c.getEntry('home', 'b').data).toEqual({ v: 2 });
  });

  it('refresh background gagal — pemanggil tetap dapat data basi', async () => {
    const c = mk();
    c.putEntry('home', 'b', { v: 1 });
    clock += TTL.home + 1;
    const fetcher = vi.fn().mockRejectedValue(new Error('backend mati'));
    const onRefresh = vi.fn();

    await expect(c.read('home', 'b', fetcher, onRefresh)).resolves.toEqual({ v: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(onRefresh).not.toHaveBeenCalled();
    expect(c.getEntry('home', 'b').data).toEqual({ v: 1 }); // tidak tertimpa
  });

  it('fetcher melempar sinkron di jalur refresh tidak menjatuhkan pemanggil', async () => {
    const c = mk();
    c.putEntry('home', 'b', { v: 1 });
    clock += TTL.home + 1;
    const fetcher = vi.fn(() => {
      throw new Error('meledak sebelum promise');
    });
    await expect(c.read('home', 'b', fetcher)).resolves.toEqual({ v: 1 });
  });

  it('cache kosong + fetcher gagal — error diteruskan ke pemanggil', async () => {
    const c = mk();
    const fetcher = vi.fn().mockRejectedValue(new Error('backend mati'));
    // Tidak ada data lama untuk ditampilkan, jadi UI harus tahu ini gagal.
    await expect(c.read('title', 'x', fetcher)).rejects.toThrow('backend mati');
  });
});

/**
 * Regresi untuk bug yang ditemukan audit 2026-08-03. Tiap test di bawah gagal
 * pada implementasi sebelum perbaikan.
 */
describe('regresi audit', () => {
  it('tidak menyajikan baris kind terlarang yang sudah terlanjur ada di DB', () => {
    // Ditulis versi app lama, saat NEVER_CACHE masih lebih pendek.
    db.exec(`CREATE TABLE IF NOT EXISTS catalog (
      kind TEXT NOT NULL, key TEXT NOT NULL, payload TEXT NOT NULL,
      fetched_at INTEGER NOT NULL, PRIMARY KEY (kind, key));`);
    db.run('INSERT INTO catalog (kind, key, payload, fetched_at) VALUES (?, ?, ?, ?)', [
      'stream',
      'ep-1',
      JSON.stringify({ url: 'x.m3u8?token=KEDALUWARSA' }),
      clock,
    ]);

    const c = mk(); // konstruksi harus membersihkannya
    expect(c.getEntry('stream', 'ep-1')).toBeNull();
    expect(db.getFirst('SELECT COUNT(*) AS n FROM catalog WHERE kind = ?', ['stream']).n).toBe(0);
  });

  it('read pada kind terlarang tetap mengembalikan data, hanya tidak menyimpan', async () => {
    const c = mk();
    const fetcher = vi.fn().mockResolvedValue({ url: 'segar.m3u8' });
    // Dulu putEntry melempar dan menjatuhkan read, padahal datanya sudah ada.
    await expect(c.read('source', 'ep-1', fetcher)).resolves.toEqual({ url: 'segar.m3u8' });
    expect(c.getEntry('source', 'ep-1')).toBeNull();
  });

  it('gagal menulis tidak membatalkan fetch yang sudah sukses', async () => {
    const c = createCatalogCache(
      {
        exec: db.exec,
        getFirst: db.getFirst,
        run: (sql, p) => {
          if (sql.startsWith('INSERT')) throw new Error('SQLITE_FULL');
          return db.run(sql, p);
        },
      },
      { now: () => clock }
    );
    await expect(c.read('title', 'x', vi.fn().mockResolvedValue({ v: 1 }))).resolves.toEqual({
      v: 1,
    });
  });

  it('read bersamaan untuk key sama hanya memicu satu fetch', async () => {
    const c = mk();
    let resolveFetch;
    const fetcher = vi.fn(() => new Promise((r) => (resolveFetch = r)));

    const all = Promise.all([1, 2, 3, 4, 5].map(() => c.read('home', 'b', fetcher)));
    resolveFetch({ v: 1 });
    const results = await all;

    // Lima komponen memanggil saat mount; hanya boleh satu request jaringan.
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results).toEqual([{ v: 1 }, { v: 1 }, { v: 1 }, { v: 1 }, { v: 1 }]);
  });

  it('refresh stale bersamaan juga hanya satu fetch', async () => {
    const c = mk();
    c.putEntry('home', 'b', { v: 0 });
    clock += TTL.home + 1;
    let resolveFetch;
    const fetcher = vi.fn(() => new Promise((r) => (resolveFetch = r)));

    await Promise.all([c.read('home', 'b', fetcher), c.read('home', 'b', fetcher)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolveFetch({ v: 1 });
  });

  it('jam mundur tidak membuat entri fresh selamanya', async () => {
    const c = mk();
    c.putEntry('home', 'b', { v: 1 });
    // NTP mengoreksi jam yang tadinya kelewat maju.
    clock -= 1_000_000_000;

    const hit = c.getEntry('home', 'b');
    expect(hit.age).toBeLessThan(0);
    expect(hit.fresh).toBe(false); // dulu true → cache beku berhari-hari

    const fetcher = vi.fn().mockResolvedValue({ v: 2 });
    await c.read('home', 'b', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('fetched_at rusak diperlakukan sebagai miss, bukan NaN', () => {
    const c = mk();
    db.run('INSERT OR REPLACE INTO catalog (kind, key, payload, fetched_at) VALUES (?, ?, ?, ?)', [
      'title',
      'x',
      JSON.stringify({ v: 1 }),
      'bukan-angka',
    ]);
    expect(c.getEntry('title', 'x')).toBeNull();
  });

  it('onRefresh yang melempar tidak jadi unhandled rejection', async () => {
    const c = mk();
    c.putEntry('home', 'b', { v: 1 });
    clock += TTL.home + 1;
    const onRefresh = vi.fn(() => {
      throw new Error('setState pada komponen ter-unmount');
    });
    await expect(
      c.read('home', 'b', vi.fn().mockResolvedValue({ v: 2 }), onRefresh)
    ).resolves.toEqual({ v: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(onRefresh).toHaveBeenCalled(); // dipanggil, tapi lemparannya tertelan
  });

  it('kind bernama seperti properti Object.prototype tidak mengacaukan TTL', () => {
    const c = mk();
    c.putEntry('constructor', 'x', { v: 1 });
    // Dulu TTL['constructor'] berupa function → age < ttl selalu false.
    expect(c.getEntry('constructor', 'x').fresh).toBe(true);
  });

  it('invalidate(kind, null) menghapus seluruh kind, bukan diam saja', () => {
    const c = mk();
    c.putEntry('title', 'a', 1);
    c.invalidate('title', null);
    expect(c.getEntry('title', 'a')).toBeNull();
  });
});
