import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /app/version
 *
 * Dipakai APK untuk memeriksa pembaruan saat cold start.
 *
 * Ada karena distribusinya di luar Play Store: tidak ada mekanisme update
 * otomatis, jadi tanpa endpoint ini user akan tertinggal di versi lama tanpa
 * pernah tahu ada yang baru — termasuk saat versi lama rusak karena penyedia
 * berubah.
 *
 * Nilainya dibaca dari environment supaya bisa diubah lewat
 * `ecosystem.config.js` + `pm2 restart --update-env`, tanpa build ulang
 * backend. Kalau belum di-set, endpoint tetap menjawab dengan versi 1 dan
 * `mandatory: false` — aman, artinya "tidak ada pembaruan".
 */
router.get('/version', (_req: Request, res: Response) => {
  const versionCode = parseInt(process.env.APP_VERSION_CODE || '1', 10);
  const versionName = process.env.APP_VERSION_NAME || '1.0.0';
  const apkUrl = process.env.APP_APK_URL || '';
  const mandatory = process.env.APP_UPDATE_MANDATORY === 'true';
  const changelog = process.env.APP_CHANGELOG || '';

  // Tidak di-cache. Ini justru endpoint yang harus langsung mencerminkan
  // rilis baru; cache satu jam berarti sebagian user tidak melihat pembaruan
  // sampai jam berikutnya.
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    versionCode: Number.isFinite(versionCode) ? versionCode : 1,
    versionName,
    apkUrl,
    mandatory,
    changelog,
  });
});

export default router;
