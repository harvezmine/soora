import { Router, Request, Response, NextFunction } from 'express';
import * as store from '../services/store';
import { reportRouteError } from '../services/telegram';

const router = Router();

// Hardcoded admin password (overridable via env). Simple gate — low-stakes
// internal monitoring page, not user-facing auth.
const ADMIN_PASS = process.env.ADMIN_PASS || 'IndonesiaRaya';

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const pass = (req.headers['x-admin-pass'] as string) || req.query.pass || req.body?.pass || '';
  if (pass !== ADMIN_PASS) return res.status(401).json({ error: 'Wrong password' });
  next();
}

const DAY = 86400 * 1000;
const ONLINE_MS = 2 * 60 * 1000;

// POST /admin/login {pass}
router.post('/login', (req: Request, res: Response) => {
  if (String(req.body?.pass || '') !== ADMIN_PASS) return res.status(401).json({ error: 'Password salah' });
  res.json({ ok: true });
});

// GET /admin/users — full list + stats + rich aggregate analytics
router.get('/users', requireAdmin, async (req: Request, res: Response) => {
  try {
    const list = await store.listAllUsers();
    const now = Date.now();

    const rows = await Promise.all(
      list.map(async (u) => {
        const [s, mylistCount, progressCount, historyCount, progress] = await Promise.all([
          store.getStats(u.id),
          store.countMyList(u.id),
          store.countProgress(u.id),
          store.countHistory(u.id),
          store.getProgress(u.id),
        ]);
        const sections = { anime: 0, movie: 0, manga: 0 };
        progress.forEach((p: any) => { if (p?.section && sections[p.section as keyof typeof sections] !== undefined) sections[p.section as keyof typeof sections]++; });
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          avatar: u.avatar,
          provider: u.googleSub ? 'google' : 'email',
          createdAt: u.createdAt,
          banned: !!u.banned,
          bannedAt: u.bannedAt || 0,
          online: !!(s.lastSeen && now - s.lastSeen < ONLINE_MS),
          totalSeconds: s.totalSeconds,
          lastSeen: s.lastSeen,
          firstSeen: s.firstSeen,
          sessions: s.sessions,
          lastPath: s.lastPath || '',
          mylistCount,
          progressCount,
          historyCount,
          sections,
        };
      })
    );
    rows.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

    // ── signups over the last 7 days (oldest → newest) ──
    const signups7d: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now - i * DAY);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = dayStart.getTime() + DAY;
      const count = rows.filter((r) => r.createdAt >= dayStart.getTime() && r.createdAt < dayEnd).length;
      signups7d.push({ date: dayStart.toISOString().slice(0, 10), count });
    }

    const totalWatchSeconds = rows.reduce((a, r) => a + (r.totalSeconds || 0), 0);
    const totalSessions = rows.reduce((a, r) => a + (r.sessions || 0), 0);
    const withTime = rows.filter((r) => r.totalSeconds > 0).length;
    const sectionTotals = rows.reduce(
      (acc, r) => { acc.anime += r.sections.anime; acc.movie += r.sections.movie; acc.manga += r.sections.manga; return acc; },
      { anime: 0, movie: 0, manga: 0 }
    );

    const summary = {
      totalUsers: rows.length,
      online: rows.filter((r) => r.online).length,
      activeToday: rows.filter((r) => r.lastSeen && now - r.lastSeen < DAY).length,
      activeWeek: rows.filter((r) => r.lastSeen && now - r.lastSeen < 7 * DAY).length,
      newToday: rows.filter((r) => r.createdAt && now - r.createdAt < DAY).length,
      newWeek: rows.filter((r) => r.createdAt && now - r.createdAt < 7 * DAY).length,
      bannedCount: rows.filter((r) => r.banned).length,
      googleUsers: rows.filter((r) => r.provider === 'google').length,
      emailUsers: rows.filter((r) => r.provider === 'email').length,
      totalWatchSeconds,
      totalSessions,
      avgSessionSeconds: totalSessions ? Math.round(totalWatchSeconds / totalSessions) : 0,
      avgTimePerUser: withTime ? Math.round(totalWatchSeconds / withTime) : 0,
      totalSaved: rows.reduce((a, r) => a + r.mylistCount, 0),
      totalProgress: rows.reduce((a, r) => a + r.progressCount, 0),
      sectionTotals,
      signups7d,
      topUsers: [...rows].sort((a, b) => b.totalSeconds - a.totalSeconds).slice(0, 5)
        .map((r) => ({ name: r.name, avatar: r.avatar, totalSeconds: r.totalSeconds })),
    };
    res.json({ summary, users: rows });
  } catch (err: any) {
    reportRouteError(req, err, 'admin/users');
    res.status(500).json({ error: 'failed' });
  }
});

// POST /admin/terminate/:id — invalidate the user's active sessions
router.post('/terminate/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const v = await store.bumpTokenVersion(String(req.params.id));
    if (!v) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json({ ok: true, tokenVersion: v });
  } catch (err: any) { reportRouteError(req, err, 'admin/terminate'); res.status(500).json({ error: 'failed' }); }
});

// POST /admin/ban/:id  and  POST /admin/unban/:id
router.post('/ban/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const ok = await store.setBanned(String(req.params.id), true);
    if (!ok) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json({ ok: true });
  } catch (err: any) { reportRouteError(req, err, 'admin/ban'); res.status(500).json({ error: 'failed' }); }
});
router.post('/unban/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const ok = await store.setBanned(String(req.params.id), false);
    if (!ok) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json({ ok: true });
  } catch (err: any) { reportRouteError(req, err, 'admin/unban'); res.status(500).json({ error: 'failed' }); }
});

// DELETE /admin/user/:id — hard delete account + all data
router.delete('/user/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const ok = await store.deleteUser(String(req.params.id));
    if (!ok) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json({ ok: true });
  } catch (err: any) { reportRouteError(req, err, 'admin/delete'); res.status(500).json({ error: 'failed' }); }
});

export default router;
