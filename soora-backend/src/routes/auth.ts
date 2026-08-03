import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config';
import { getUserByEmail, getUserById, saveUser, publicUser, UserRecord } from '../services/store';
import { reportRouteError } from '../services/telegram';

const router = Router();
const googleClient = new OAuth2Client(config.googleClientId);

const sign = (id: string, tv = 0) => jwt.sign({ id, tv }, config.jwtSecret, { expiresIn: '60d' });
const newId = () => `u_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const avatarFor = (name: string) =>
  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=7c5cfc`;

// ── JWT middleware (attaches req.userId) ──
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { id: string; tv?: number };
    const user = await getUserById(payload.id);
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    if (user.banned) return res.status(403).json({ error: 'Akun diblokir', banned: true });
    // tokenVersion mismatch → session was terminated by admin
    if ((user.tokenVersion || 0) !== (payload.tv || 0)) {
      return res.status(401).json({ error: 'Sesi berakhir', expired: true });
    }
    (req as any).userId = payload.id;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// POST /auth/register {name,email,password}
router.post('/register', async (req: Request, res: Response) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!name || !email || password.length < 6) {
      return res.status(400).json({ error: 'Nama, email, dan password (min 6 karakter) wajib diisi' });
    }
    if (await getUserByEmail(email)) {
      return res.status(409).json({ error: 'Email sudah terdaftar' });
    }
    const user: UserRecord = {
      id: newId(), email, name,
      avatar: avatarFor(name),
      passHash: await bcrypt.hash(password, 10),
      createdAt: Date.now(),
    };
    await saveUser(user);
    res.json({ token: sign(user.id, user.tokenVersion), user: publicUser(user) });
  } catch (err: any) {
    reportRouteError(req, err, 'auth/register');
    res.status(500).json({ error: 'Gagal mendaftar' });
  }
});

// POST /auth/login {email,password}
router.post('/login', async (req: Request, res: Response) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const user = await getUserByEmail(email);
    if (!user || !user.passHash || !(await bcrypt.compare(password, user.passHash))) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }
    if (user.banned) return res.status(403).json({ error: 'Akun ini diblokir' });
    res.json({ token: sign(user.id, user.tokenVersion), user: publicUser(user) });
  } catch (err: any) {
    reportRouteError(req, err, 'auth/login');
    res.status(500).json({ error: 'Gagal masuk' });
  }
});

// POST /auth/google {idToken}
router.post('/google', async (req: Request, res: Response) => {
  try {
    const idToken = String(req.body?.idToken || '');
    if (!idToken) return res.status(400).json({ error: 'Missing idToken' });
    // Terima client web DAN client Android. Token dari peramban ber-`aud`
    // client web; token dari APK ber-`aud` client Android. google-auth-library
    // menerima array untuk kasus persis ini.
    const audience = [config.googleClientId, config.googleAndroidClientId].filter(Boolean);
    if (audience.length === 0) {
      return res.status(500).json({ error: 'GOOGLE_CLIENT_ID belum dikonfigurasi di server' });
    }
    const ticket = await googleClient.verifyIdToken({ idToken, audience });
    const p = ticket.getPayload();
    if (!p?.email) return res.status(401).json({ error: 'Token Google tidak valid' });

    let user = await getUserByEmail(p.email);
    if (!user) {
      user = {
        id: newId(), email: p.email.toLowerCase(),
        name: p.name || p.email.split('@')[0],
        avatar: p.picture || avatarFor(p.name || p.email),
        googleSub: p.sub,
        createdAt: Date.now(),
      };
      await saveUser(user);
    } else if (!user.googleSub) {
      user.googleSub = p.sub;
      if (p.picture) user.avatar = p.picture;
      await saveUser(user);
    }
    if (user.banned) return res.status(403).json({ error: 'Akun ini diblokir' });
    res.json({ token: sign(user.id, user.tokenVersion), user: publicUser(user) });
  } catch (err: any) {
    reportRouteError(req, err, 'auth/google');
    res.status(401).json({ error: 'Verifikasi Google gagal' });
  }
});

// GET /auth/me (auth) — current profile
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = await getUserById((req as any).userId);
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
  res.json({ user: publicUser(user) });
});

export default router;
