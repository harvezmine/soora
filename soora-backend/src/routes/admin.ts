import { Router, Request, Response, NextFunction } from 'express';
import * as store from '../services/store';
import { reportRouteError } from '../services/telegram';

const router = Router();

// Hardcoded admin password (overridable via env). Simple gate — this is a
// low-stakes internal monitoring page, not user-facing auth.
const ADMIN_PASS = process.env.ADMIN_PASS || 'IndonesiaRaya';

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const pass = (req.headers['x-admin-pass'] as string) || req.query.pass || req.body?.pass || '';
  if (pass !== ADMIN_PASS) return res.status(401).json({ error: 'Wrong password' });
  next();
}

// POST /admin/login {pass} — verify password (used by the page to gate access)
router.post('/login', (req: Request, res: Response) => {
  const pass = String(req.body?.pass || '');
  if (pass !== ADMIN_PASS) return res.status(401).json({ error: 'Password salah' });
  res.json({ ok: true });
});

// GET /admin/users — full user list joined with usage stats + aggregate summary
router.get('/users', requireAdmin, async (req: Request, res: Response) => {
  try {
    const users = await store.listAllUsers();
    const rows = await Promise.all(
      users.map(async (u) => {
        const s = await store.getStats(u.id);
        const [mylistCount, progressCount, historyCount] = await Promise.all([
          store.countMyList(u.id),
          store.countProgress(u.id),
          store.countHistory(u.id),
        ]);
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          avatar: u.avatar,
          provider: u.googleSub ? 'google' : 'email',
          createdAt: u.createdAt,
          totalSeconds: s.totalSeconds,
          lastSeen: s.lastSeen,
          firstSeen: s.firstSeen,
          sessions: s.sessions,
          lastPath: s.lastPath || '',
          mylistCount,
          progressCount,
          historyCount,
        };
      })
    );
    rows.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

    const now = Date.now();
    const DAY = 86400 * 1000;
    const summary = {
      totalUsers: rows.length,
      activeToday: rows.filter((r) => r.lastSeen && now - r.lastSeen < DAY).length,
      activeWeek: rows.filter((r) => r.lastSeen && now - r.lastSeen < 7 * DAY).length,
      online: rows.filter((r) => r.lastSeen && now - r.lastSeen < 2 * 60 * 1000).length,
      totalWatchSeconds: rows.reduce((a, r) => a + (r.totalSeconds || 0), 0),
      googleUsers: rows.filter((r) => r.provider === 'google').length,
      emailUsers: rows.filter((r) => r.provider === 'email').length,
      newToday: rows.filter((r) => r.createdAt && now - r.createdAt < DAY).length,
    };
    res.json({ summary, users: rows });
  } catch (err: any) {
    reportRouteError(req, err, 'admin/users');
    res.status(500).json({ error: 'failed' });
  }
});

export default router;
