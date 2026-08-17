import express, { Router, Request, Response } from 'express';
import { requireAuth } from './auth';
import * as store from '../services/store';
import * as avatars from '../services/avatars';
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

// ── Heartbeat (active-time tracking) ──
router.post('/heartbeat', async (req, res) => {
  try {
    await store.recordHeartbeat(uid(req), Date.now(), req.body?.path);
    res.json({ ok: true });
  } catch (e: any) { reportRouteError(req, e, 'user/heartbeat'); res.status(500).json({ error: 'failed' }); }
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

// ── Avatar ──

// GET /user/avatars — pilihan avatar bawaan yang tersedia
router.get('/avatars', async (_req, res) => {
  res.json({ items: avatars.daftarAvatar() });
});

// POST /user/avatar {url} — ganti avatar ke salah satu bawaan
router.post('/avatar', async (req, res) => {
  try {
    const url = String(req.body?.url || '');
    // Hanya avatar bawaan yang diterima. Tanpa pemeriksaan ini kolom avatar
    // jadi tempat menitipkan URL apa pun, dan URL itu ikut tampil di kolom
    // komentar orang lain.
    // Hanya avatar bawaan, atau unggahan milik orang ini sendiri.
    if (!avatars.avatarSah(url) && !avatars.unggahanMilik(url, uid(req))) {
      return res.status(400).json({ error: 'Avatar tidak dikenal' });
    }
    const user = await store.getUserById(uid(req));
    if (!user) return res.status(401).json({ error: 'Sesi tidak valid' });
    user.avatar = url;
    // Sekali dipilih sendiri, tidak pernah lagi ditimpa pemberian otomatis.
    user.avatarDipilih = true;
    await store.saveUser(user);
    res.json({ user: store.publicUser(user) });
  } catch (e: any) {
    reportRouteError(req, e, 'user/avatar');
    res.status(500).json({ error: 'Gagal mengganti avatar' });
  }
});

// POST /user/avatar/upload — unggah gambar sendiri
//
// Badannya berupa biner mentah, bukan multipart: satu berkas kecil tidak
// membutuhkan pengurai multipart beserta dependensinya.
router.post(
  '/avatar/upload',
  express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: avatars.MAKS_UNGGAH }),
  async (req: Request, res: Response) => {
    try {
      const buf = req.body as Buffer;
      if (!Buffer.isBuffer(buf) || buf.length === 0) {
        return res.status(400).json({ error: 'Tidak ada gambar yang dikirim' });
      }
      // Jenisnya ditentukan dari byte awal berkas, bukan dari header yang
      // dikirim klien — header itu ditulis pengirim dan bisa berisi apa saja.
      if (!avatars.kenaliGambar(buf)) {
        return res.status(400).json({ error: 'Hanya PNG, JPG, atau WebP yang bisa dipakai' });
      }
      const user = await store.getUserById(uid(req));
      if (!user) return res.status(401).json({ error: 'Sesi tidak valid' });

      user.avatar = await avatars.simpanUnggahan(uid(req), buf);
      user.avatarDipilih = true;
      await store.saveUser(user);
      res.json({ user: store.publicUser(user) });
    } catch (e: any) {
      reportRouteError(req, e, 'user/avatar-upload');
      res.status(500).json({ error: 'Gagal mengunggah gambar' });
    }
  }
);

export default router;
