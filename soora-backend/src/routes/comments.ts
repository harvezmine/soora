import { Router, Request, Response } from 'express';
import { requireAuth } from './auth';
import { getUserById, publicUser } from '../services/store';
import * as comments from '../services/comments';
import { CommentError } from '../services/comments';
import { reportRouteError } from '../services/telegram';

const router = Router();
const uid = (req: Request) => (req as any).userId as string;

/**
 * Kunci konten dikirim lewat query, bukan segmen path, sebab isinya memuat
 * ':' dan bisa memuat '/' (id anime dari beberapa penyedia).
 */
const keyOf = (req: Request) => comments.assertValidKey(String(req.query.key || req.body?.key || ''));

/** Balasan HTTP seragam untuk kesalahan yang memang diperkirakan. */
function fail(req: Request, res: Response, err: any, where: string) {
  if (err instanceof CommentError) return res.status(err.status).json({ error: err.message });
  reportRouteError(req, err, where);
  return res.status(500).json({ error: 'Gagal memproses komentar' });
}

/**
 * Bentuk komentar yang boleh dilihat publik. userId tetap dikirim supaya
 * peramban bisa menandai "komentarmu", tapi email dan data akun lain tidak
 * pernah ikut.
 */
const publicComment = (c: comments.Comment) => ({
  id: c.id,
  name: c.name,
  avatar: c.avatar,
  text: c.deleted ? '' : c.text,
  deleted: !!c.deleted,
  userId: c.userId,
  parentId: c.parentId,
  createdAt: c.createdAt,
  replyCount: c.replyCount ?? 0,
});

// ── Baca (publik — tamu boleh membaca) ──

// GET /comments?key=movie:1315772&cursor=<createdAt>&limit=20
router.get('/', async (req: Request, res: Response) => {
  try {
    const key = keyOf(req);
    const cursor = parseInt(String(req.query.cursor || ''), 10);
    const limit = parseInt(String(req.query.limit || ''), 10);
    const page = await comments.listComments(key, Number.isFinite(cursor) ? cursor : undefined, limit);
    res.json({
      items: page.items.map(publicComment),
      nextCursor: page.nextCursor,
      total: page.total,
    });
  } catch (err: any) { fail(req, res, err, 'comments:list'); }
});

// GET /comments/:id/replies
router.get('/:id/replies', async (req: Request, res: Response) => {
  try {
    const items = await comments.listReplies(String(req.params.id));
    res.json({ items: items.map(publicComment) });
  } catch (err: any) { fail(req, res, err, 'comments:replies'); }
});

// ── Tulis (wajib masuk) ──

// POST /comments {key, text, parentId?}
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const key = keyOf(req);
    const text = comments.normalizeText(req.body?.text);
    await comments.assertWithinRateLimit(uid(req));
    await comments.assertNotDuplicate(uid(req), text);

    const user = await getUserById(uid(req));
    if (!user) return res.status(401).json({ error: 'Sesi tidak valid' });
    const pub = publicUser(user);

    const created = await comments.addComment({
      key,
      userId: pub.id,
      name: pub.name,
      avatar: pub.avatar,
      text,
      parentId: req.body?.parentId || null,
    });
    res.json({ comment: publicComment(created) });
  } catch (err: any) { fail(req, res, err, 'comments:add'); }
});

// POST /comments/:id/delete — pemilik komentar
// Memakai POST agar tidak bergantung pada preflight DELETE; semua penulisan
// komentar lewat satu metode yang sama.
router.post('/:id/delete', requireAuth, async (req: Request, res: Response) => {
  try {
    const remaining = await comments.deleteComment(String(req.params.id), uid(req));
    res.json({ ok: true, comment: remaining ? publicComment(remaining) : null });
  } catch (err: any) { fail(req, res, err, 'comments:delete'); }
});

// POST /comments/:id/report {reason}
router.post('/:id/report', requireAuth, async (req: Request, res: Response) => {
  try {
    const report = await comments.reportComment(String(req.params.id), uid(req), req.body?.reason || '');
    // Laporan ikut dikirim ke Telegram supaya tidak menunggu ada yang
    // membuka panel Admin.
    reportRouteError(
      req,
      new Error(`Komentar dilaporkan: ${report.commentId} (${report.reason || 'tanpa alasan'})`),
      'comments:report'
    );
    res.json({ ok: true });
  } catch (err: any) { fail(req, res, err, 'comments:report'); }
});

export default router;
