import { Router, Request, Response } from 'express';
import * as doujin from '../services/doujin';
import { halamanSah, batasSah, slugSah, idChapterSah } from '../services/doujinRules';
import { isUrlAllowed } from '../utils/ssrfGuard';
import { reportRouteError } from '../services/telegram';

/**
 * Pustaka tambahan (sooramics+), dilayani dari server sendiri.
 *
 * Semua parameter dari luar disaring lewat doujinRules sebelum dipakai —
 * bukan diteruskan apa adanya ke API sumber.
 */
const router = Router();

const gagal = (req: Request, res: Response, err: any, tempat: string, pesan: string) => {
  console.error(`[${tempat}]`, err?.message || err);
  reportRouteError(req, err, tempat);
  res.status(502).json({ error: pesan });
};

// GET /doujin/list?page&sort&type&genre&limit&q
router.get('/list', async (req: Request, res: Response) => {
  try {
    res.json(await doujin.daftar({
      page: halamanSah(req.query.page),
      limit: batasSah(req.query.limit),
      sort: req.query.sort as string,
      type: req.query.type as string,
      genre: req.query.genre as string,
      query: req.query.q as string,
    }));
  } catch (err: any) { gagal(req, res, err, 'doujin/list', 'Gagal memuat daftar'); }
});

// GET /doujin/search?q=&page=
router.get('/search', async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    res.json(await doujin.daftar({
      query: q,
      page: halamanSah(req.query.page),
      limit: batasSah(req.query.limit),
    }));
  } catch (err: any) { gagal(req, res, err, 'doujin/search', 'Gagal mencari'); }
});

// GET /doujin/genres
router.get('/genres', async (req: Request, res: Response) => {
  try {
    res.json(await doujin.genres());
  } catch (err: any) { gagal(req, res, err, 'doujin/genres', 'Gagal memuat genre'); }
});

// GET /doujin/genre/:slug?page=
router.get('/genre/:slug', async (req: Request, res: Response) => {
  const slug = slugSah(req.params.slug);
  if (!slug) return res.status(400).json({ error: 'Genre tidak dikenal' });
  try {
    res.json(await doujin.daftar({
      genre: slug,
      page: halamanSah(req.query.page),
      limit: batasSah(req.query.limit),
      sort: req.query.sort as string,
    }));
  } catch (err: any) { gagal(req, res, err, 'doujin/genre', 'Gagal memuat genre'); }
});

// GET /doujin/detail/:slug
router.get('/detail/:slug', async (req: Request, res: Response) => {
  const slug = slugSah(req.params.slug);
  if (!slug) return res.status(400).json({ error: 'Judul tidak dikenal' });
  try {
    const data = await doujin.detail(slug);
    if (!data) return res.status(404).json({ error: 'Judul tidak ditemukan' });
    res.json(data);
  } catch (err: any) { gagal(req, res, err, 'doujin/detail', 'Gagal memuat judul'); }
});

// GET /doujin/chapter/:id
router.get('/chapter/:id', async (req: Request, res: Response) => {
  const id = idChapterSah(req.params.id);
  if (!id) return res.status(400).json({ error: 'Chapter tidak dikenal' });
  try {
    res.json(await doujin.chapter(id));
  } catch (err: any) { gagal(req, res, err, 'doujin/chapter', 'Gagal memuat chapter'); }
});

/**
 * Host gambar yang boleh diambil.
 *
 * Daftar-izin, bukan sekadar tolak-alamat-internal: rute ini mengambil URL
 * kiriman siapa pun, dan yang dibutuhkannya cuma segelintir CDN yang sudah
 * diketahui. Membiarkan host lain lewat berarti menyediakan proxy terbuka
 * atas nama server kita, walau alamat internal sudah ditutup.
 */
const HOST_GAMBAR = ['desu.xxx', 'desu.pics'];

const hostGambarSah = (url: string): boolean => {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return HOST_GAMBAR.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
};

/**
 * GET /doujin/img?url=
 *
 * CDN-nya menolak permintaan tanpa Referer yang benar, dan peramban tidak
 * mengizinkan JavaScript menyetel Referer pada <img>. Jadi gambarnya harus
 * lewat sini.
 */
router.get('/img', async (req: Request, res: Response) => {
  const url = String(req.query.url || '');
  if (!url) return res.status(400).send('Missing url');
  if (!isUrlAllowed(url) || !hostGambarSah(url)) return res.status(403).send('Forbidden target');

  const ac = new AbortController();
  const jam = setTimeout(() => ac.abort(), 20_000);
  // Klien menutup tab di tengah unduhan gambar itu hal biasa; ambilannya
  // ikut dihentikan supaya tidak ada unduhan yatim yang tetap jalan.
  req.on('close', () => ac.abort());

  try {
    const hulu = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: 'https://doujin.desu.xxx/',
      },
      signal: ac.signal,
    });
    if (!hulu.ok || !hulu.body) return res.status(502).send('Image proxy error');

    const tipe = hulu.headers.get('content-type') || '';
    // Hanya gambar yang diteruskan. Tanpa ini rute gambar bisa dipakai
    // menyajikan HTML apa pun dari domain kita sendiri.
    if (!tipe.startsWith('image/')) return res.status(502).send('Bukan gambar');

    res.setHeader('Content-Type', tipe);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const buf = Buffer.from(await hulu.arrayBuffer());
    res.end(buf);
  } catch {
    if (!res.headersSent) res.status(502).send('Image proxy error');
  } finally {
    clearTimeout(jam);
  }
});

// GET /doujin/health — apakah rahasia sudah terpegang
router.get('/health', (_req: Request, res: Response) => {
  res.json(doujin.statusRahasia());
});

export default router;
