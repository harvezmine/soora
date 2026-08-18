import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config';
import { clearCache, getCacheStats } from './services/cache';
import { notifyError } from './services/telegram';
import { isUrlAllowed } from './utils/ssrfGuard';

// Routes
import animeRoutes from './routes/anime';
import movieRoutes from './routes/movies';
import mangaRoutes from './routes/manga';
import doujindesuRoutes from './routes/doujindesu';
import komikplusRoutes from './routes/komikplus';
import proxyRoutes from './routes/proxy';
import appRoutes from './routes/app';
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import adminRoutes from './routes/admin';
import commentRoutes from './routes/comments';
import roomRoutes from './routes/rooms';
import availabilityRoutes from './routes/availability';
import { attachWatchParty } from './ws';
import { contentTypeOf } from './utils/normalize';
import axios from 'axios';

const app = express();

// ========== MIDDLEWARE ==========
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(compression());
app.use(cors({
  origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(','),
  // DELETE dipakai /user/mylist/:type/:id dan /user/progress/:key. Tanpa
  // tercantum di sini, preflight peramban menolaknya dan penghapusan dari
  // web diam-diam gagal.
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Request logging (lightweight)
app.use((req, _res, next) => {
  const start = Date.now();
  _res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 100) { // Only log slow requests
      console.log(`${req.method} ${req.path} ${_res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// ========== HEALTH & STATUS ==========
app.get('/', (_req, res) => {
  res.json({
    name: 'Soora Backend',
    version: '1.0.0',
    status: 'ok',
    consumet: config.consumetUrl,
    tmdb: config.tmdbKey ? 'configured' : 'missing',
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/cache/stats', (_req, res) => {
  res.json(getCacheStats());
});

app.post('/cache/clear', (_req, res) => {
  clearCache();
  res.json({ message: 'Cache cleared' });
});

// ========== ORCHESTRATED ROUTES ==========
// These routes aggregate multiple API calls into single responses
// Never cache auth/user responses (Cloudflare would otherwise cache a logged-in
// GET like /auth/me and serve one user's data to everyone — auth leak).
app.use(['/auth', '/user', '/admin'], (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, private, max-age=0');
  next();
});
// Ruang nonton bareng bersifat per-pengguna dan berumur pendek.
app.use('/rooms', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, private, max-age=0');
  next();
});
// Komentar boleh dibaca tamu, tapi tetap tidak boleh disinggahi cache
// bersama: isinya berubah tiap kali ada yang menulis, dan balasan POST
// bersifat per-pengguna.
app.use('/comments', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  next();
});
app.use('/auth', authRoutes);
app.use('/user', userRoutes);
app.use('/admin', adminRoutes);
app.use('/comments', commentRoutes);
app.use('/rooms', roomRoutes);
app.use('/anime', animeRoutes);
app.use('/movies', movieRoutes);
app.use('/manga', mangaRoutes);
app.use('/doujindesu', doujindesuRoutes);
app.use('/komikplus', komikplusRoutes);

// ========== PROXY ROUTES ==========
app.use('/proxy', proxyRoutes);
// Pemeriksaan versi untuk APK — distribusi di luar Play Store tidak punya
// update otomatis, jadi app yang menanyakannya sendiri.
app.use('/app', appRoutes);
/**
 * Catatan ketersediaan. Modul dan route-nya sudah lama ada tapi tidak pernah
 * didaftarkan, jadi setiap panggilan ke sini menjawab 404 — termasuk
 * `POST /availability/report`, satu-satunya cara halaman melaporkan judul yang
 * ternyata tidak bisa diputar. Tanpa itu catatannya hanya bisa diisi dari
 * dalam proses, dan tidak ada cara memeriksa isinya dari luar.
 */
app.use('/availability', availabilityRoutes);

// Manga image proxy (separate mount point)
import { default as proxyRouter } from './routes/proxy';
app.get('/manga-img', async (req, res) => {
  const targetUrl = String(req.query.url || '');
  if (!targetUrl) return res.status(400).send('Missing url');
  if (!isUrlAllowed(targetUrl)) return res.status(403).send('Forbidden target');
  // Per-host Referer — komiku's CDN 403s hotlinks unless Referer is its own origin.
  let referer = 'https://mangapill.com/';
  try {
    const host = new URL(targetUrl).hostname.toLowerCase();
    if (host.endsWith('komiku.org') || host.endsWith('komiku.id')) referer = 'https://komiku.org/';
    else if (host.endsWith('mangadex.org')) referer = 'https://mangadex.org/';
  } catch { /* keep default */ }
  try {
    const axios = (await import('axios')).default;
    const response = await axios.get(targetUrl, {
      headers: { 'Referer': referer, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      responseType: 'arraybuffer', timeout: 15000,
    });
    res.setHeader('Content-Type', contentTypeOf(response.headers['content-type'], 'image/jpeg'));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(Buffer.from(response.data));
  } catch { res.status(502).send('Image proxy error'); }
});

// ========== ERROR REPORTING (Frontend → Telegram) ==========
app.post('/report-error', (req, res) => {
  const report = req.body;
  if (!report?.status || !report?.url) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  notifyError({
    ...report,
    source: 'frontend',
    timestamp: report.timestamp || new Date().toISOString(),
  });
  res.json({ ok: true });
});

// ========== TMDB PASSTHROUGH (server-side key) ==========
// Frontend hits /tmdb/* instead of api.themoviedb.org directly, so the API key
// stays server-side (Vercel build doesn't carry VITE_TMDB_API_KEY).
app.get('/tmdb/*', async (req, res) => {
  try {
    const tmdbSvc = await import('./services/tmdb');
    const path = req.originalUrl.replace(/^\/tmdb/, '').split('?')[0];
    const data = await tmdbSvc.passthrough(path, req.query as Record<string, any>);
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.json(data);
  } catch (err: any) {
    res.status(err.response?.status || 502).json(err.response?.data || { error: 'TMDB error' });
  }
});

// ========== GLOBAL PASSTHROUGH ==========
// Any route not handled by orchestrated routes gets forwarded to Consumet directly.
// This ensures existing frontend calls still work during migration.
app.use('*', async (req, res, next) => {
  // Skip if already handled or is an internal route
  if (req.originalUrl === '/' || req.originalUrl === '/health' || req.originalUrl.startsWith('/cache')) {
    return next();
  }
  try {
    const { passthrough } = await import('./services/consumet');
    const data = await passthrough(req.originalUrl.split('?')[0], req.query as Record<string, any>);
    res.json(data);
  } catch (err: any) {
    const status = err.response?.status || 502;
    const message = err.response?.data || { error: 'Upstream error' };
    notifyError({
      status,
      method: req.method,
      url: req.originalUrl,
      source: 'backend',
      trigger: 'passthrough',
      timestamp: new Date().toISOString(),
      details: {
        responseBody: message,
        stack: err.stack,
      },
    });
    res.status(status).json(message);
  }
});

// ========== ERROR HANDLING ==========
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err.message || err);
  notifyError({
    status: err.status || 500,
    method: _req.method,
    url: _req.originalUrl,
    source: 'backend',
    trigger: 'global-error-handler',
    timestamp: new Date().toISOString(),
    details: {
      requestHeaders: _req.headers as Record<string, any>,
      requestBody: _req.body,
      stack: err.stack,
    },
  });
  res.status(err.status || 500).json({
    error: config.nodeEnv === 'development' ? err.message : 'Internal server error',
  });
});

// ========== START ==========
// WebSocket menumpang server HTTP yang sama, jadi app.listen diganti server
// eksplisit — nonton bareng butuh peristiwa 'upgrade' yang tidak tersedia
// pada nilai balik app.listen sebelum server dibuat sendiri.
const server = http.createServer(app);
attachWatchParty(server);

server.listen(config.port, '0.0.0.0', () => {
  console.log(`🚀 Soora Backend running on http://0.0.0.0:${config.port}`);
  console.log(`   Nonton bareng: ws://0.0.0.0:${config.port}/ws`);
  console.log(`   Consumet API: ${config.consumetUrl}`);
  console.log(`   TMDB Key: ${config.tmdbKey ? '✓ configured' : '✗ missing'}`);
  console.log(`   CORS: ${config.corsOrigin}`);
  console.log(`   Environment: ${config.nodeEnv}`);
  panaskanBeranda();
});

/**
 * Susun bundel beranda sekali di latar begitu server siap.
 *
 * Penyusunannya memverifikasi tiap judul ke penyedianya, dan pada cache yang
 * masih kosong itu memakan waktu — cachedSWR baru menyegarkan di latar setelah
 * ada isinya; permintaan pertama pada cache kosong ditunggu sampai selesai.
 *
 * Proses ini dimulai ulang tiap pukul 04.00 oleh PM2, jadi cache kosong itu
 * keadaan yang pasti berulang, bukan kemungkinan. Tanpa pemanas ini yang
 * menanggung penantiannya adalah orang pertama yang membuka beranda pagi itu.
 *
 * Kegagalannya sengaja diabaikan: ini hanya pemanasan, dan permintaan
 * sungguhan tetap bisa menyusunnya sendiri.
 */
function panaskanBeranda() {
  setTimeout(() => {
    axios.get(`http://127.0.0.1:${config.port}/movies/home`, { timeout: 120_000 })
      .then(() => console.log('   Beranda film sudah dipanaskan'))
      .catch(() => { /* permintaan sungguhan akan menyusunnya sendiri */ });
  }, 3000);
}

export default app;
