import { Router, Request, Response } from 'express';
import * as consumet from '../services/consumet';
import * as tmdb from '../services/tmdb';
import { cached, cachedSWR, CACHE_TTL } from '../services/cache';
import { parallel, normalizeLK21, extractResults } from '../utils/normalize';
import { markAvailability, filterAvailable } from '../services/availability';
import {
  saringLayakDiputar,
  ukuranVidlinkBisaDipercaya,
  vidlinkBerisi,
} from '../services/catalogRules';
import { reportRouteError } from '../services/telegram';

const qs = (v: any): string => String(v ?? '');

const router = Router();

// ========== VIXSRC DIRECT RESOLVER (ad-free, raw HLS) ==========
// TMDB id → vixsrc.to/api → embed page → master m3u8 (token+expires).
// Returns { m3u8, ref } so the frontend plays it through our /proxy (which
// adds the embed Referer). No iframe, no ads, sandbox stays on.
import axios from 'axios';
const VIX_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function resolveVixsrc(kind: 'movie' | 'tv', tmdbId: string, season?: string, episode?: string) {
  const apiPath = kind === 'tv'
    ? `https://vixsrc.to/api/tv/${tmdbId}/${season}/${episode}`
    : `https://vixsrc.to/api/movie/${tmdbId}`;
  /**
   * 404 berarti judulnya memang tidak ada di katalog VixSrc — itu jawaban yang
   * sah, bukan kegagalan. Secara bawaan axios melempar untuk status 4xx, dan
   * lemparan itu dulu melompati SELURUH sisa penangan: catatan ketersediaan
   * tidak pernah terisi untuk judul yang tidak ada, dan pemeriksaan iframe
   * cadangan tidak pernah dijalankan — padahal justru judul-judul inilah yang
   * jadi alasan keduanya dibuat. Yang terlihat dari luar cuma `{ m3u8: null }`
   * dari blok catch, sama persis seperti sebelum keduanya ada.
   */
  const terima = (s: number) => s === 200 || s === 404;
  // step 1: get embed src
  const a = await axios.get(apiPath, { headers: { 'User-Agent': VIX_UA, Referer: 'https://vixsrc.to/' }, timeout: 12000, validateStatus: terima });
  const src = a.status === 404 ? null : a.data?.src;
  if (!src) return null;
  const embed = `https://vixsrc.to${src}`;
  // step 2: embed page → masterPlaylist
  const e = await axios.get(embed, { headers: { 'User-Agent': VIX_UA, Referer: 'https://vixsrc.to/' }, timeout: 12000, responseType: 'text', validateStatus: terima });
  if (e.status === 404) return null;
  const html: string = e.data;
  const url = html.match(/url: *'([^']+)'/)?.[1];
  const token = html.match(/'token': *'([^']+)'/)?.[1];
  const expires = html.match(/'expires': *'?([0-9]+)/)?.[1];
  if (!url || !token) return null;
  const sep = url.includes('?') ? '&' : '?';
  const m3u8 = `${url}${sep}token=${token}${expires ? `&expires=${expires}` : ''}&h=1&lang=en`;
  return { m3u8, ref: embed };
}

/**
 * Ukuran halaman VidLink dalam byte, atau null bila gagal diambil.
 *
 * Dipakai hanya sebagai jalan terakhir, saat VixSrc tidak punya sumber.
 * Halamannya paling besar sekitar 130 KB, jadi diambil utuh — tidak ada
 * jalan lain, sebab isinya ditentukan skrip di dalam halaman dan tidak
 * tercermin di header mana pun.
 */
async function ukuranHalamanVidlink(
  kind: 'movie' | 'tv', tmdbId: string, season?: string, episode?: string
): Promise<number | null> {
  const url = kind === 'tv'
    ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`
    : `https://vidlink.pro/movie/${tmdbId}`;
  try {
    const r = await axios.get(url, {
      headers: { 'User-Agent': VIX_UA },
      timeout: 8000,
      responseType: 'text',
      validateStatus: () => true,
    });
    if (r.status >= 400 || typeof r.data !== 'string') return null;
    return Buffer.byteLength(r.data);
  } catch {
    return null;
  }
}

router.get('/vixsrc/:type/:tmdbId', async (req: Request, res: Response) => {
  try {
    const type = req.params.type === 'tv' ? 'tv' : 'movie';
    const tmdbId = qs(req.params.tmdbId);
    const season = qs(req.query.season) || '1';
    const episode = qs(req.query.episode) || '1';
    const key = `vixsrc:${type}:${tmdbId}:${type === 'tv' ? `${season}:${episode}` : ''}`;
    const data = await cached(key, () => resolveVixsrc(type, tmdbId, season, episode), CACHE_TTL.STREAM);

    /**
     * Catat hasilnya. Inilah satu-satunya tempat yang benar-benar tahu sebuah
     * judul punya sumber atau tidak, dan sebelumnya tidak pernah melapor —
     * satu-satunya pelapor film adalah /movies/stream, yang penyedianya
     * (goku, flixhq) sudah lama mati sehingga selalu melapor "tidak ada" —
     * route itu ikut dihapus bersama perubahan ini.
     * Akibatnya catatan ketersediaan film tidak pernah terisi, dan
     * filterAvailable di /movies/home menyaring dari daftar kosong.
     *
     * Film dicatat dua arah. Serial hanya dicatat saat berhasil: satu episode
     * yang hilang bukan berarti seluruh serialnya tidak bisa ditonton, dan
     * kuncinya tidak membawa nomor musim — mencatat gagal di sini akan
     * menyembunyikan serial utuh gara-gara satu episode.
     */
    const ketemu = !!data?.m3u8;
    if (type === 'movie' || ketemu) markAvailability('movie', tmdbId, ketemu);
    if (ketemu) return res.json({ ...data, embed: null });

    /**
     * VixSrc tidak punya sumber, jadi halaman akan jatuh ke iframe VidLink.
     * Masalahnya iframe itu lintas-asal: kalau VidLink juga tidak punya
     * judulnya, tidak ada satu pun peristiwa yang bisa ditangkap — pengguna
     * cuma melihat kotak hitam yang diam, tanpa penjelasan, selamanya.
     *
     * Jadi dicek di sini, dari sisi server, di mana aturan lintas-asal tidak
     * berlaku. Hanya di jalur gagal: yang berhasil sudah pulang di atas dan
     * tidak ikut menanggung tambahan waktu ini.
     *
     * `embed` bernilai false hanya bila benar-benar diketahui kosong. null
     * berarti tidak bisa disimpulkan — untuk serial, atau saat halamannya
     * gagal diambil — dan yang tidak diketahui tetap ditawarkan.
     */
    const bytes = ukuranVidlinkBisaDipercaya(type)
      ? await cached(`vidlink:size:${type}:${tmdbId}`,
          () => ukuranHalamanVidlink(type, tmdbId, season, episode), CACHE_TTL.STREAM)
      : null;

    res.json({ m3u8: null, embed: vidlinkBerisi(type, bytes) });
  } catch (err: any) {
    reportRouteError(req, err, 'movies/vixsrc');
    res.json({ m3u8: null });
  }
});

// TMDB genre IDs for home page sections
const MOVIE_GENRE_SECTIONS = [
  { id: 28, key: 'action', label: 'Action' },
  { id: 35, key: 'comedy', label: 'Comedy' },
  { id: 18, key: 'drama', label: 'Drama' },
  { id: 27, key: 'horror', label: 'Horror' },
  { id: 10749, key: 'romance', label: 'Romance' },
  { id: 878, key: 'scifi', label: 'Sci-Fi' },
  { id: 53, key: 'thriller', label: 'Thriller' },
  { id: 16, key: 'animation', label: 'Animation' },
  { id: 10751, key: 'family', label: 'Family' },
  { id: 99, key: 'documentary', label: 'Documentary' },
];

/**
 * GET /movies/home
 * Orchestrated home page: TMDB (kolam internasional) + LK21 (kolam lokal).
 */
router.get('/home', async (req: Request, res: Response) => {
  try {
    const data = await cachedSWR('movies:home', async () => {
      // Beranda internasional dilayani TMDB, beranda lokal oleh LK21.
      const [
        trendingRes, popularMoviesRes, popularTVRes,
        lk21PopularRes, lk21RecentRes, lk21SeriesRes,
      ] = await parallel(
        tmdb.trending('all', 'week'),
        tmdb.popularMovies(1),
        tmdb.popularTV(1),
        consumet.lk21Popular(1).catch(() => null),
        consumet.lk21Recent(1).catch(() => null),
        consumet.lk21LatestSeries(1).catch(() => null),
      );

      // Genre sections (run in parallel alongside Phase 1 via Promise.allSettled)
      const genreResults = await Promise.allSettled(
        MOVIE_GENRE_SECTIONS.map((g) =>
          tmdb.discoverByGenre(g.id, 1, 'movie').catch(() => null)
        )
      );

      const genres: Record<string, any> = {};
      MOVIE_GENRE_SECTIONS.forEach((g, i) => {
        const result = genreResults[i];
        genres[g.key] = {
          label: g.label,
          genreId: g.id,
          results: result.status === 'fulfilled' && result.value ? result.value.results.slice(0, 20) : [],
        };
      });

      return {
        trending: filterAvailable('movie', trendingRes?.results || []),
        popularMovies: filterAvailable('movie', popularMoviesRes?.results || []),
        popularTV: filterAvailable('movie', popularTVRes?.results || []),
        lk21Popular: filterAvailable('movie', (Array.isArray(lk21PopularRes) ? lk21PopularRes : []).map(normalizeLK21)),
        lk21Recent: filterAvailable('movie', (Array.isArray(lk21RecentRes) ? lk21RecentRes : []).map(normalizeLK21)),
        lk21Series: filterAvailable('movie', (Array.isArray(lk21SeriesRes) ? lk21SeriesRes : []).map(normalizeLK21)),
        genres,
      };
    }, CACHE_TTL.HOME_BUNDLE);

    res.json(data);
  } catch (err: any) {
    console.error('[movies/home]', err.message);
    reportRouteError(req, err, 'movies/home');
    res.status(500).json({ error: 'Failed to load movie home' });
  }
});

/**
 * GET /movies/info/:id?type=movie|tv
 * TMDB details.
 */
router.get('/info/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(qs(req.params.id));
    const type = qs(req.query.type) || 'movie';

    const data = await cached(`movies:info:${type}:${id}`, async () => {
      const details = type === 'tv' ? await tmdb.tvDetails(id) : await tmdb.movieDetails(id);
      return details;
    }, CACHE_TTL.INFO, 'long');

    res.json(data);
  } catch (err: any) {
    console.error('[movies/info]', err.message);
    reportRouteError(req, err, 'movies/info');
    res.status(500).json({ error: 'Failed to load movie info' });
  }
});

/**
 * GET /movies/tv-season/:id/:season
 */
router.get('/tv-season/:id/:season', async (req: Request, res: Response) => {
  try {
    const id = parseInt(qs(req.params.id));
    const season = parseInt(qs(req.params.season));
    const data = await cached(`movies:tv-season:${id}:${season}`,
      () => tmdb.tvSeason(id, season), CACHE_TTL.INFO, 'long');
    res.json(data);
  } catch (err: any) {
    reportRouteError(req, err, 'movies/tv-season');
    res.status(500).json({ error: 'Failed to load season' });
  }
});

/**
 * GET /movies/search?q=query&page=1
 * Pencarian dua kolam: TMDB (internasional) + LK21 (lokal).
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = qs(req.query.q);
    const page = parseInt(qs(req.query.page) || '1');
    if (!query) return res.status(400).json({ error: 'Missing query' });

    const data = await cached(`movies:search:${query}:${page}`, async () => {
      const [tmdbRes, lk21Res] = await parallel(
        tmdb.searchMulti(query, page),
        consumet.lk21Search(query).catch(() => null),
      );

      // TMDB mengindeks jauh lebih banyak daripada yang bisa diputar: album
      // soundtrack, film pendek, rekaman acara, rilis daerah. Diukur pada 202
      // judul, hanya 38% hasil pencarian mentah benar-benar punya sumber —
      // sisanya membawa orang ke layar hitam. Saringannya di catalogRules.ts,
      // termasuk membuang judul Indonesia yang memang jatah kolam LK21.
      const tmdbResults = saringLayakDiputar(tmdbRes?.results || []);

      return {
        tmdb: { results: tmdbResults, totalPages: tmdbRes?.totalPages || 0 },
        lk21: { results: extractResults(lk21Res).map(normalizeLK21) },
      };
    }, CACHE_TTL.SEARCH);

    /**
     * Saringan ketersediaan ditaruh DI LUAR cache, bukan di dalam pembangunnya.
     *
     * Isi cache dibekukan sepuluh menit; catatan ketersediaan berubah tiap
     * kali ada yang mencoba memutar. Kalau disaring di dalam, hasil pencarian
     * yang sudah terlanjur tersimpan tidak akan pernah ikut belajar sampai
     * cache-nya kedaluwarsa.
     */
    res.json({
      ...data,
      tmdb: { ...data.tmdb, results: filterAvailable('movie', data.tmdb?.results || []) },
    });
  } catch (err: any) {
    reportRouteError(req, err, 'movies/search');
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * GET /movies/discover?mediaType=&genre=&year=&sort=&page=
 */
router.get('/discover', async (req: Request, res: Response) => {
  try {
    const mediaType = qs(req.query.mediaType) || 'movie';
    const genre = qs(req.query.genre);
    const year = qs(req.query.year);
    const sort = qs(req.query.sort) || 'popularity.desc';
    const page = qs(req.query.page) || '1';
    const params = {
      mediaType,
      genre: genre ? parseInt(genre) : undefined,
      year: year || undefined,
      sort,
      page: parseInt(page),
    };
    const cacheKey = `movies:discover:${JSON.stringify(params)}`;
    const data = await cached(cacheKey, () => tmdb.discover(params), CACHE_TTL.GENRE);
    res.json(data);
  } catch (err: any) {
    reportRouteError(req, err, 'movies/discover');
    res.status(500).json({ error: 'Discover failed' });
  }
});

/**
 * GET /movies/genres
 */
router.get('/genres', async (req: Request, res: Response) => {
  try {
    const data = await cached('movies:genres', () => tmdb.getGenres(), CACHE_TTL.TMDB, 'long');
    res.json(data);
  } catch (err: any) {
    reportRouteError(req, err, 'movies/genres');
    res.status(500).json({ error: 'Failed to load genres' });
  }
});

/**
 * GET /movies/trending?type=all&time=week
 */
router.get('/trending', async (req: Request, res: Response) => {
  try {
    const type = qs(req.query.type) || 'all';
    const time = qs(req.query.time) || 'week';
    const data = await cached(`movies:trending:${type}:${time}`, () => tmdb.trending(type, time), CACHE_TTL.GENRE);
    res.json(data);
  } catch (err: any) {
    reportRouteError(req, err, 'movies/trending');
    res.status(500).json({ error: 'Failed to load trending' });
  }
});

/**
 * GET /movies/find-tmdb?title=&type=movie&year=
 */
router.get('/find-tmdb', async (req: Request, res: Response) => {
  try {
    const title = qs(req.query.title);
    const ftype = qs(req.query.type) || 'movie';
    const fyear = qs(req.query.year);
    if (!title) return res.status(400).json({ error: 'Missing title' });
    const data = await cached(
      `movies:find-tmdb:${title}:${ftype}:${fyear}`,
      () => tmdb.findDetailsByTitle(title, ftype, fyear),
      CACHE_TTL.TMDB, 'long'
    );
    res.json(data);
  } catch (err: any) {
    reportRouteError(req, err, 'movies/find-tmdb');
    res.status(500).json({ error: 'TMDB lookup failed' });
  }
});

// ========== LK21 DIRECT ==========

router.get('/lk21/info/:id', async (req: Request, res: Response) => {
  try {
    const data = await cached(`lk21:info:${req.params.id}`,
      () => consumet.lk21Info(qs(req.params.id)), CACHE_TTL.INFO, 'long');
    res.json(data);
  } catch (err: any) {
    reportRouteError(req, err, 'movies/lk21/info');
    res.status(500).json({ error: 'Failed to get LK21 info' });
  }
});

router.get('/lk21/series/info/:id', async (req: Request, res: Response) => {
  try {
    const data = await cached(`lk21:series:info:${req.params.id}`,
      () => consumet.lk21SeriesInfo(qs(req.params.id)), CACHE_TTL.INFO, 'long');
    res.json(data);
  } catch (err: any) {
    reportRouteError(req, err, 'movies/lk21/series/info');
    res.status(500).json({ error: 'Failed to get LK21 series info' });
  }
});

router.get('/lk21/streams/:id', async (req: Request, res: Response) => {
  try {
    const data = await consumet.lk21MovieStreams(qs(req.params.id));
    res.json(data);
  } catch (err: any) {
    reportRouteError(req, err, 'movies/lk21/streams');
    res.status(500).json({ error: 'Failed to get LK21 streams' });
  }
});

router.get('/lk21/series/streams/:id', async (req: Request, res: Response) => {
  try {
    const season = parseInt(qs(req.query.season) || '1');
    const episode = parseInt(qs(req.query.episode) || '1');
    const data = await consumet.lk21SeriesStreams(qs(req.params.id), season, episode);
    res.json(data);
  } catch (err: any) {
    reportRouteError(req, err, 'movies/lk21/series/streams');
    res.status(500).json({ error: 'Failed to get LK21 series streams' });
  }
});

/**
 * GET /movies/lk21/search/:query
 * LK21 search with home-bundle fallback.
 * The upstream Consumet LK21 search is often blocked by Cloudflare,
 * so we fall back to fetching the home bundle and filtering client-side.
 */
router.get('/lk21/search/:query', async (req: Request, res: Response) => {
  try {
    const query = qs(req.params.query);
    if (!query) return res.status(400).json({ error: 'Missing query' });
    const page = parseInt(qs(req.query.page) || '1');

    const data = await cached(`lk21:search:${query}:${page}`, async () => {
      // 1) Try upstream Consumet search first
      try {
        const upstream = await consumet.lk21Search(query);
        const results = extractResults(upstream);
        if (results.length > 0) {
          return { results: results.map(normalizeLK21), totalPages: upstream?.totalPages || 1 };
        }
      } catch { /* Consumet search failed, fall through */ }

      // 2) Fallback: fetch home bundle and filter by title match
      try {
        const bundle = await consumet.passthrough('/movies/lk21/home-bundle', {});
        const allItems: any[] = [];
        const seen = new Set<string>();

        const addItems = (arr: any[]) => {
          if (!Array.isArray(arr)) return;
          for (const item of arr) {
            const id = item._id || item.id;
            if (id && !seen.has(id)) {
              seen.add(id);
              allItems.push(item);
            }
          }
        };

        addItems(bundle?.popularMovies);
        addItems(bundle?.recentMovies);
        addItems(bundle?.topRatedMovies);
        addItems(bundle?.latestSeries);
        addItems(bundle?.popularSeries);

        // Fuzzy title matching
        const queryLower = query.toLowerCase();
        const queryWords = queryLower.split(/\s+/).filter(Boolean);

        const scored = allItems.map((item) => {
          const title = (item.title || '').toLowerCase();
          let score = 0;
          if (title === queryLower) score += 100;
          else if (title.includes(queryLower)) score += 50;
          else {
            const matchedWords = queryWords.filter((w) => title.includes(w));
            score += matchedWords.length * 15;
          }
          return { item, score };
        });

        const matched = scored
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .map((s) => normalizeLK21(s.item));

        return { results: matched, totalPages: 1 };
      } catch { /* home bundle fallback also failed */ }

      return { results: [], totalPages: 0 };
    }, CACHE_TTL.SEARCH);

    res.json(data);
  } catch (err: any) {
    console.error('[movies/lk21/search]', err.message);
    reportRouteError(req, err, 'movies/lk21/search');
    res.status(500).json({ error: 'LK21 search failed' });
  }
});

// ========== CATCH-ALL: Forward unmatched /movies/* to Consumet ==========
router.all('/*', async (req: Request, res: Response) => {
  try {
    const data = await consumet.passthrough(`/movies${req.path}`, req.query as Record<string, any>);
    res.json(data);
  } catch (err: any) {
    const status = err.response?.status || 502;
    const message = err.response?.data || { error: 'Upstream error' };
    res.status(status).json(message);
  }
});

export default router;
