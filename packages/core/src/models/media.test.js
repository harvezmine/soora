import { describe, it, expect, beforeEach } from 'vitest';
import {
  unwrap,
  normalizeAnime,
  normalizeMovie,
  normalizeManga,
  normalizeList,
  buildSections,
} from './media.js';
import { configureCore, resetCoreRuntime } from '../runtime.js';
import {
  TMDB_MOVIE,
  TMDB_TV,
  MANGAPILL_ITEM,
  HIANIME_ITEM,
  LK21_ITEM,
  ANILIST_TITLE_ITEM,
} from './fixtures.js';

beforeEach(() => resetCoreRuntime());

describe('unwrap', () => {
  it('mengupas respons axios', () => {
    expect(unwrap({ data: { a: 1 } })).toEqual({ a: 1 });
  });

  it('mengupas pembungkus ganda { data: { data } }', () => {
    // Beberapa fungsi di api/index.js membungkus dua kali.
    expect(unwrap({ data: { data: { a: 1 } } })).toEqual({ a: 1 });
  });

  it('meneruskan array polos apa adanya', () => {
    expect(unwrap([1, 2])).toEqual([1, 2]);
  });

  it('tidak mengupas array yang kebetulan berisi objek', () => {
    expect(unwrap([{ data: 1 }])).toEqual([{ data: 1 }]);
  });

  it('menangani null dan undefined', () => {
    expect(unwrap(null)).toBeNull();
    expect(unwrap(undefined)).toBeUndefined();
  });
});

describe('normalizeMovie — fixture TMDB nyata', () => {
  it('memetakan film', () => {
    const m = normalizeMovie(TMDB_MOVIE);
    expect(m).toMatchObject({
      id: '969681',
      title: 'Spider-Man: Brand New Day',
      kind: 'movie',
      rating: 80,
    });
    expect(m.subtitle).toBe('Film · 2026');
  });

  it('mengenali serial dari mediaType', () => {
    expect(normalizeMovie(TMDB_TV).kind).toBe('tv');
    expect(normalizeMovie(TMDB_TV).subtitle).toBe('Serial · 2008');
  });

  it('menurunkan ukuran gambar TMDB ke w342 untuk kartu', () => {
    // `original` di grid berarti mengunduh beberapa MB per layar tanpa
    // perbedaan yang terlihat.
    expect(normalizeMovie(TMDB_MOVIE).poster.uri).toContain('/t/p/w342/');
    expect(normalizeMovie(TMDB_MOVIE).poster.uri).not.toContain('/w500/');
  });

  it('menangani bentuk LK21 dengan _id dan posterImg', () => {
    const m = normalizeMovie(LK21_ITEM, 'lk21');
    expect(m.id).toBe('the-substance-2024');
    expect(m.poster.uri).toContain('the-substance.jpg');
    expect(m.badge).toBe('HD');
    expect(m.source).toBe('lk21');
  });

  it('rating berupa string tidak diloloskan sebagai angka', () => {
    // LK21 mengirim rating sebagai string; komponen mengharapkan angka.
    expect(normalizeMovie(LK21_ITEM, 'lk21').rating).toBeUndefined();
  });
});

describe('normalizeAnime', () => {
  it('memetakan bentuk HiAnime', () => {
    const a = normalizeAnime(HIANIME_ITEM, 'hianime');
    expect(a).toMatchObject({ id: 'one-piece-100', title: 'One Piece', kind: 'anime' });
  });

  it('memakai episodes.sub sebagai badge saat tidak ada nomor episode langsung', () => {
    expect(normalizeAnime(HIANIME_ITEM).badge).toBe('SUB 1122');
  });

  it('menandai DUB di subtitle kalau tersedia', () => {
    expect(normalizeAnime(HIANIME_ITEM).subtitle).toContain('DUB');
  });

  it('menerima animeId sebagai ganti id (Samehadaku)', () => {
    const a = normalizeAnime({ animeId: 'naruto', title: 'Naruto', poster: 'x.jpg' });
    expect(a.id).toBe('naruto');
  });

  it('memilih judul English dari objek judul multi-bahasa', () => {
    expect(normalizeAnime(ANILIST_TITLE_ITEM).title).toBe('Frieren: Beyond Journey’s End');
  });

  it('jatuh ke romaji kalau English tidak ada', () => {
    const a = normalizeAnime({ id: 'x', title: { romaji: 'Sousou no Frieren' }, image: 'i.jpg' });
    expect(a.title).toBe('Sousou no Frieren');
  });
});

describe('normalizeManga — fixture mangapill nyata', () => {
  it('memetakan item minimal', () => {
    const m = normalizeManga(MANGAPILL_ITEM);
    expect(m).toMatchObject({ id: '2/one-piece', title: 'One Piece', kind: 'manga' });
  });

  it('id yang mengandung garis miring dipertahankan utuh', () => {
    // mangapill memakai "2/one-piece" sebagai id; memecahnya merusak rute.
    expect(normalizeManga(MANGAPILL_ITEM).id).toBe('2/one-piece');
  });
});

describe('penolakan entri cacat', () => {
  const bad = [
    ['null', null],
    ['objek kosong', {}],
    ['tanpa id', { title: 'Ada judul' }],
    ['tanpa judul', { id: 'x' }],
    ['judul spasi saja', { id: 'x', title: '   ' }],
    ['string', 'bukan objek'],
  ];

  for (const [label, raw] of bad) {
    it(`membuang ${label}`, () => {
      expect(normalizeAnime(raw)).toBeNull();
      expect(normalizeMovie(raw)).toBeNull();
      expect(normalizeManga(raw)).toBeNull();
    });
  }
});

describe('normalizeList', () => {
  it('membuang entri cacat, bukan meloloskannya sebagai kartu kosong', () => {
    const list = [TMDB_MOVIE, null, {}, { title: 'tanpa id' }, TMDB_TV];
    expect(normalizeList(list, 'movie')).toHaveLength(2);
  });

  it('mengurangi duplikat id dalam satu daftar', () => {
    expect(normalizeList([TMDB_MOVIE, { ...TMDB_MOVIE }], 'movie')).toHaveLength(1);
  });

  it('mengembalikan array kosong untuk input non-array', () => {
    for (const v of [null, undefined, {}, 'x', 0]) {
      expect(normalizeList(v, 'movie')).toEqual([]);
    }
  });

  it('kind tak dikenal menghasilkan array kosong, bukan lemparan', () => {
    expect(normalizeList([TMDB_MOVIE], 'entah')).toEqual([]);
  });
});

describe('buildSections', () => {
  it('membuang section yang kosong', () => {
    const sections = buildSections([
      { title: 'Trending', items: [TMDB_MOVIE], kind: 'movie' },
      { title: 'LK21 Populer', items: [], kind: 'movie' },
      { title: 'Rusak', items: null, kind: 'movie' },
    ]);
    expect(sections.map((s) => s.title)).toEqual(['Trending']);
  });

  it('semua provider mati menghasilkan array kosong', () => {
    // Persis keadaan anime pada 2026-08-03: bundle 200 tapi semua array kosong.
    // Layar harus bisa membedakan ini dari "sedang memuat".
    const sections = buildSections([
      { title: 'Spotlight', items: [], kind: 'anime' },
      { title: 'Terbaru', items: [], kind: 'anime' },
    ]);
    expect(sections).toEqual([]);
  });
});

describe('strategi gambar', () => {
  it('web: URL yang butuh Referer dialihkan ke proxy', () => {
    configureCore({ imageStrategy: 'proxy', imgProxyBase: '' });
    const m = normalizeManga(MANGAPILL_ITEM);
    expect(m.poster.uri).toContain('/manga-img?url=');
    expect(m.poster.headers).toBeUndefined();
  });

  it('native: URL asli dipakai, Referer dikirim lewat header', () => {
    configureCore({ imageStrategy: 'headers' });
    const m = normalizeManga(MANGAPILL_ITEM);
    expect(m.poster.uri).toBe(MANGAPILL_ITEM.image);
    expect(m.poster.headers).toEqual({ Referer: 'https://mangapill.com/' });
  });

  it('URL yang tidak butuh Referer tidak disentuh di kedua mode', () => {
    for (const strategy of ['proxy', 'headers']) {
      configureCore({ imageStrategy: strategy });
      const m = normalizeMovie(TMDB_MOVIE);
      expect(m.poster.uri).toContain('image.tmdb.org');
      expect(m.poster.headers).toBeUndefined();
    }
  });
});
