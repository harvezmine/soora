import { Router, Request, Response } from 'express';
import * as neko from '../services/neko';
import { halamanSah, slugSah, kategoriSah } from '../services/nekoRules';
import { reportRouteError } from '../services/telegram';

/** Video pustaka tambahan (sooramics+), dilayani dari server sendiri. */
const router = Router();

const gagal = (req: Request, res: Response, err: any, tempat: string, pesan: string) => {
  console.error(`[${tempat}]`, err?.message || err);
  reportRouteError(req, err, tempat);
  res.status(502).json({ error: pesan });
};

// GET /video/list?page=
router.get('/list', async (req: Request, res: Response) => {
  try {
    res.json(await neko.daftar(halamanSah(req.query.page)));
  } catch (err: any) { gagal(req, res, err, 'video/list', 'Gagal memuat video'); }
});

// GET /video/categories
router.get('/categories', async (req: Request, res: Response) => {
  try {
    res.json(await neko.kategoriTersedia());
  } catch (err: any) { gagal(req, res, err, 'video/categories', 'Gagal memuat kategori'); }
});

// GET /video/category/:slug?page=
router.get('/category/:slug', async (req: Request, res: Response) => {
  const slug = kategoriSah(req.params.slug);
  if (!slug) return res.status(400).json({ error: 'Kategori tidak dikenal' });
  try {
    res.json(await neko.kategori(slug, halamanSah(req.query.page)));
  } catch (err: any) { gagal(req, res, err, 'video/category', 'Gagal memuat kategori'); }
});

// GET /video/search?q=&page=
router.get('/search', async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ videos: [], hasNext: false });
  try {
    res.json(await neko.cari(q, halamanSah(req.query.page)));
  } catch (err: any) { gagal(req, res, err, 'video/search', 'Gagal mencari video'); }
});

// GET /video/detail/:slug
router.get('/detail/:slug', async (req: Request, res: Response) => {
  const slug = slugSah(req.params.slug);
  if (!slug) return res.status(400).json({ error: 'Video tidak dikenal' });
  try {
    const data = await neko.detail(slug);
    if (!data) return res.status(404).json({ error: 'Video tidak ditemukan' });
    res.json(data);
  } catch (err: any) { gagal(req, res, err, 'video/detail', 'Gagal memuat video'); }
});

export default router;
