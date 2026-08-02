/**
 * Fixture yang disalin dari respons produksi api.soora.fun pada 2026-08-03.
 *
 * Sengaja data asli, bukan karangan: bentuk yang saya bayangkan dan bentuk yang
 * benar-benar dikirim provider ternyata berbeda di beberapa tempat. Kalau
 * provider mengubah bentuknya, perbarui fixture di sini — test yang gagal
 * setelah itu menunjukkan persis apa yang perlu disesuaikan.
 */

/** GET /movies/home → trending[0]. TMDB, id numerik, rating 0–100. */
export const TMDB_MOVIE = {
  id: 969681,
  tmdbId: 969681,
  title: 'Spider-Man: Brand New Day',
  image: 'https://image.tmdb.org/t/p/w500/iPOn6DinuVyLY17YM9mKuPofV08.jpg',
  cover: 'https://image.tmdb.org/t/p/original/qeQJx07rK2xm8SD2sJxFKhE7gs0.jpg',
  releaseDate: '2026-07-28',
  rating: 80,
  type: 'Movie',
  mediaType: 'movie',
  overview: 'Fighting crime full-time as Spider-Man…',
};

/** GET /movies/home → popularTV[0]. */
export const TMDB_TV = {
  id: 5920,
  tmdbId: 5920,
  title: 'The Mentalist',
  image: 'https://image.tmdb.org/t/p/w500/acYXu4KaDj1NIkMgObnhe4C4a0T.jpg',
  cover: 'https://image.tmdb.org/t/p/original/q3pCsNvJ7CmdJUz2sJEEUY3pOPC.jpg',
  releaseDate: '2008-09-23',
  rating: 84,
  type: 'TV Series',
  mediaType: 'tv',
  overview: 'Patrick Jane, a former celebrity psychic medium…',
};

/**
 * GET /manga/home → sections.Trending[0]. Bentuknya minimal, dan justru inilah
 * yang gambarnya 403 tanpa header Referer.
 */
export const MANGAPILL_ITEM = {
  id: '2/one-piece',
  title: 'One Piece',
  image:
    'https://cdn.readdetectiveconan.com/file/mangapill/i/2.webp?h=01971742-5d7f-7f32-8d2b-d038279f8a73',
};

/** Bentuk anime HiAnime. Provider sedang mati 2026-08-03, jadi ini dari kode web. */
export const HIANIME_ITEM = {
  id: 'one-piece-100',
  title: 'One Piece',
  image: 'https://cdn.noitatnemucod.net/thumbnail/300x400/100/bcd84731a3eda4f4a306250769675065.jpg',
  type: 'TV',
  episodes: { sub: 1122, dub: 1105 },
};

/** Bentuk LK21 — id di `_id`, poster di `posterImg`. */
export const LK21_ITEM = {
  _id: 'the-substance-2024',
  title: 'The Substance',
  posterImg: 'https://poster.lk21.example/the-substance.jpg',
  type: 'movie',
  qualityResolution: 'HD',
  rating: '7.3',
  genres: ['Horror'],
};

/** Judul multi-bahasa ala AniList. */
export const ANILIST_TITLE_ITEM = {
  id: 'sousou-no-frieren',
  title: { english: 'Frieren: Beyond Journey’s End', romaji: 'Sousou no Frieren', native: '葬送のフリーレン' },
  image: 'https://example.test/frieren.jpg',
  type: 'TV',
};
