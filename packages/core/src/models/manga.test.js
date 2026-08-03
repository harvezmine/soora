import { describe, it, expect, beforeEach } from 'vitest';
import { configureCore, resetCoreRuntime } from '../runtime.js';
import { normalizeChapterPages, flattenChapterSegments, nextChapterAfter } from './manga.js';

beforeEach(() => {
  resetCoreRuntime();
  // resolveImage membaca imageStrategy dari runtime; 'headers' adalah jalur
  // yang dipakai app, dan itu yang perlu diuji di sini.
  configureCore({ imageStrategy: 'headers' });
});

describe('normalizeChapterPages', () => {
  it('menerima bentuk objek mangapill', () => {
    const out = normalizeChapterPages([
      { img: 'https://cdn.mangapill.com/a.jpg', page: 1 },
      { img: 'https://cdn.mangapill.com/b.jpg', page: 2 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].uri).toContain('a.jpg');
  });

  it('menerima array string biasa dari komiku', () => {
    const out = normalizeChapterPages(['https://img.komiku.id/1.jpg']);
    expect(out).toHaveLength(1);
    expect(out[0].uri).toContain('1.jpg');
  });

  it('membuang entri tanpa URL, bukan menjadikannya halaman kosong', () => {
    // Halaman kosong di tengah chapter terbaca sebagai gambar rusak.
    const out = normalizeChapterPages([{ img: '' }, null, undefined, { page: 3 }, 'https://x/y.jpg']);
    expect(out).toHaveLength(1);
  });

  it('data yang bukan array tidak melempar', () => {
    // Penyedia kadang membalas 200 dengan objek galat, bukan array.
    expect(normalizeChapterPages(null)).toEqual([]);
    expect(normalizeChapterPages({ error: 'not found' })).toEqual([]);
    expect(normalizeChapterPages(undefined)).toEqual([]);
  });
});

describe('flattenChapterSegments', () => {
  const seg = (chId, label, n) => ({
    chId,
    label,
    pages: Array.from({ length: n }, (_, i) => ({ uri: `${chId}-${i}.jpg` })),
  });

  it('chapter pertama tidak diberi pemisah', () => {
    const out = flattenChapterSegments([seg('c1', 'Chapter 1', 3)]);
    expect(out).toHaveLength(3);
    expect(out.some((r) => r.kind === 'divider')).toBe(false);
  });

  it('menyisipkan satu pemisah sebelum tiap chapter lanjutan', () => {
    const out = flattenChapterSegments([seg('c1', 'Chapter 1', 2), seg('c2', 'Chapter 2', 2)]);
    const pemisah = out.filter((r) => r.kind === 'divider');
    expect(pemisah).toHaveLength(1);
    expect(pemisah[0].label).toBe('Chapter 2');
    // Pemisah harus berada TEPAT sebelum halaman pertama chapter kedua.
    expect(out[2].kind).toBe('divider');
    expect(out[3].chId).toBe('c2');
  });

  it('nomor halaman relatif per chapter, bukan terhadap gabungan', () => {
    const out = flattenChapterSegments([seg('c1', 'Chapter 1', 3), seg('c2', 'Chapter 2', 4)]);
    const halamanC2 = out.filter((r) => r.kind === 'page' && r.chId === 'c2');
    expect(halamanC2[0].index).toBe(1);
    expect(halamanC2[0].total).toBe(4);
    expect(halamanC2[3].index).toBe(4);
  });

  it('kunci unik antar chapter', () => {
    const out = flattenChapterSegments([seg('c1', 'A', 2), seg('c2', 'B', 2)]);
    const kunci = out.map((r) => r.key);
    expect(new Set(kunci).size).toBe(kunci.length);
  });

  it('segmen rusak dilewati, tidak menjatuhkan sisanya', () => {
    const out = flattenChapterSegments([null, { chId: 'x' }, seg('c1', 'A', 1)]);
    expect(out).toHaveLength(1);
  });
});

describe('nextChapterAfter', () => {
  const daftar = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('mengembalikan chapter sesudahnya', () => {
    expect(nextChapterAfter(daftar, 'a').id).toBe('b');
  });

  it('null di chapter terakhir', () => {
    expect(nextChapterAfter(daftar, 'c')).toBeNull();
  });

  it('null untuk id yang tidak ada di daftar', () => {
    // Deep link ke chapter yang sudah dihapus penyedia.
    expect(nextChapterAfter(daftar, 'zzz')).toBeNull();
  });

  it('mengabaikan entri tanpa id saat menghitung urutan', () => {
    expect(nextChapterAfter([{ id: 'a' }, {}, { id: 'b' }], 'a').id).toBe('b');
  });
});
