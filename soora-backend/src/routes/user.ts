import { Router, Request, Response } from 'express';
import { requireAuth } from './auth';
import * as store from '../services/store';
import { reportRouteError } from '../services/telegram';

const router = Router();
const uid = (req: Request) => (req as any).userId as string;

router.use(requireAuth);

// ── Progress (continue watching/reading) ──
router.get('/progress', async (req, res) => {
  try { res.json({ items: await store.getProgress(uid(req)) }); }
  catch (e: any) { reportRouteError(req, e, 'user/progress:get'); res.json({ items: [] }); }
});
router.post('/progress', async (req, res) => {
  try {
    const { key, ...data } = req.body || {};
    if (!key) return res.status(400).json({ error: 'key required' });
    await store.setProgress(uid(req), key, data);
    res.json({ ok: true });
  } catch (e: any) { reportRouteError(req, e, 'user/progress:post'); res.status(500).json({ error: 'failed' }); }
});
router.delete('/progress/:key', async (req, res) => {
  try { await store.deleteProgress(uid(req), req.params.key); res.json({ ok: true }); }
  catch (e: any) { reportRouteError(req, e, 'user/progress:del'); res.status(500).json({ error: 'failed' }); }
});

// ── History ──
router.get('/history', async (req, res) => {
  try { res.json({ items: await store.getHistory(uid(req)) }); }
  catch (e: any) { reportRouteError(req, e, 'user/history:get'); res.json({ items: [] }); }
});
router.post('/history', async (req, res) => {
  try { await store.addHistory(uid(req), req.body || {}); res.json({ ok: true }); }
  catch (e: any) { reportRouteError(req, e, 'user/history:post'); res.status(500).json({ error: 'failed' }); }
});

// ── My List ──
router.get('/mylist', async (req, res) => {
  try { res.json({ items: await store.getMyList(uid(req)) }); }
  catch (e: any) { reportRouteError(req, e, 'user/mylist:get'); res.json({ items: [] }); }
});
router.post('/mylist', async (req, res) => {
  try { await store.addMyList(uid(req), req.body || {}); res.json({ ok: true }); }
  catch (e: any) { reportRouteError(req, e, 'user/mylist:post'); res.status(500).json({ error: 'failed' }); }
});
router.delete('/mylist/:type/:id', async (req, res) => {
  try { await store.removeMyList(uid(req), req.params.type, req.params.id); res.json({ ok: true }); }
  catch (e: any) { reportRouteError(req, e, 'user/mylist:del'); res.status(500).json({ error: 'failed' }); }
});

// ── Prefs ──
router.get('/prefs', async (req, res) => {
  try { res.json({ prefs: await store.getPrefs(uid(req)) }); }
  catch (e: any) { reportRouteError(req, e, 'user/prefs:get'); res.json({ prefs: {} }); }
});
router.post('/prefs', async (req, res) => {
  try { await store.setPrefs(uid(req), req.body || {}); res.json({ ok: true }); }
  catch (e: any) { reportRouteError(req, e, 'user/prefs:post'); res.status(500).json({ error: 'failed' }); }
});

export default router;
