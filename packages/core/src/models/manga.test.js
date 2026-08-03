import { describe, it, expect, beforeEach } from 'vitest';
import { configureCore, resetCoreRuntime } from '../runtime.js';
import {
  normalizeChapterPages,
  flattenChapterSegments,
  nextChapterAfter,
  buildEpisodeRanges,
  splitLabel,
} from './manga.js';

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

describe('buildEpisodeRanges', () => {
  const buat = (n, mulai = 1) =>
    Array.from({ length: n }, (_, i) => ({ number: mulai + i }));

  it('daftar pendek jadi satu rentang — pemilih untuk 12 episode tidak berguna', () => {
    const r = buildEpisodeRanges(buat(12));
    expect(r).toHaveLength(1);
    expect(r[0].label).toBe('1–12');
  });

  it('37 sampai 100 episode dipotong per 25', () => {
    const r = buildEpisodeRanges(buat(60));
    expect(r).toHaveLength(3);
    expect(r[0].label).toBe('1–25');
    expect(r[2].label).toBe('51–60');
  });

  it('di atas 100 episode dipotong per 50', () => {
    const r = buildEpisodeRanges(buat(120));
    expect(r).toHaveLength(3);
    expect(r[0].label).toBe('1–50');
    expect(r[2].label).toBe('101–120');
  });

  it('label memakai nomor episode, bukan indeks array', () => {
    // Penyedia kerap mengembalikan episode 0 (spesial) atau melompati nomor.
    const r = buildEpisodeRanges([{ number: 0 }, { number: 1 }, { number: 5 }]);
    expect(r[0].label).toBe('0–5');
  });

  it('rentang menutupi seluruh daftar tanpa celah maupun tumpang tindih', () => {
    const r = buildEpisodeRanges(buat(120));
    expect(r[0].start).toBe(0);
    r.forEach((x, i) => {
      if (i > 0) expect(x.start).toBe(r[i - 1].end);
    });
    expect(r[r.length - 1].end).toBe(120);
  });

  it('daftar kosong atau bukan array tidak melempar', () => {
    expect(buildEpisodeRanges([])).toEqual([]);
    expect(buildEpisodeRanges(null)).toEqual([]);
  });
});

describe('splitLabel', () => {
  it('memakai chapterNumber saat ada', () => {
    expect(splitLabel({ chapterNumber: 52, title: 'Chapter 52' }).nomor).toBe('52');
  });

  it('membuang judul yang hanya mengulang nomor', () => {
    // "Chapter 52" sebagai judul tidak menambah apa pun di samping nomor 52.
    expect(splitLabel({ chapterNumber: 52, title: 'Chapter 52' }).judul).toBe('');
    expect(splitLabel({ number: 3, title: 'Episode 3' }).judul).toBe('');
  });

  it('mempertahankan judul yang benar-benar berisi', () => {
    const r = splitLabel({ chapterNumber: 52, title: 'Chapter 52 - Pertarungan Terakhir' });
    expect(r.nomor).toBe('52');
    expect(r.judul).toBe('Pertarungan Terakhir');
  });

  it('mengambil nomor dari judul saat field nomor kosong', () => {
    expect(splitLabel({ title: 'Chapter 108' }).nomor).toBe('108');
  });

  it('menerima nomor desimal', () => {
    // Chapter sisipan seperti 10.5 lazim di manga.
    expect(splitLabel({ title: 'Chapter 10.5 - Omake' })).toEqual({
      nomor: '10.5',
      judul: 'Omake',
    });
  });

  it('jatuh ke indeks kalau tidak ada nomor sama sekali', () => {
    expect(splitLabel({ title: 'Prolog' }, 0).nomor).toBe('1');
    expect(splitLabel({ title: 'Prolog' }, 0).judul).toBe('Prolog');
  });

  it('item kosong tidak melempar', () => {
    expect(splitLabel(null, 4).nomor).toBe('5');
    expect(splitLabel(undefined, 0).judul).toBe('');
  });
});
