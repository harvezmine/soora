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
/** Menerima true/1/yes dalam huruf besar-kecil apa pun. */
function envFlag(v: string | undefined): boolean {
  return ['true', '1', 'yes', 'on'].includes(String(v ?? '').trim().toLowerCase());
}

router.get('/version', (_req: Request, res: Response) => {
  const rawCode = String(process.env.APP_VERSION_CODE ?? '').trim();
  // Wajib bilangan bulat murni. `parseInt` menerima "1.0.2" dan diam-diam
  // menghasilkan 1 — artinya admin yang salah mengisi versionName ke sini
  // membuat pembaruan tidak pernah terdeteksi, tanpa gejala apa pun.
  const versionCode = /^\d+$/.test(rawCode) ? Number(rawCode) : 1;
  if (rawCode && !/^\d+$/.test(rawCode)) {
    console.warn(`[app/version] APP_VERSION_CODE bukan bilangan bulat: "${rawCode}", memakai 1`);
  }

  const versionName = process.env.APP_VERSION_NAME || '1.0.0';

  // Hanya http(s) absolut. URL relatif atau tanpa skema membuat tombol unduh
  // di app tidak melakukan apa pun saat ditekan.
  const rawUrl = String(process.env.APP_APK_URL ?? '').trim();
  const apkUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : '';
  if (rawUrl && !apkUrl) {
    console.warn(`[app/version] APP_APK_URL harus diawali http(s)://, diabaikan: "${rawUrl}"`);
  }

  const mandatory = envFlag(process.env.APP_UPDATE_MANDATORY);
  const changelog = process.env.APP_CHANGELOG || '';

  // Tidak di-cache. Ini justru endpoint yang harus langsung mencerminkan
  // rilis baru; cache satu jam berarti sebagian user tidak melihat pembaruan
  // sampai jam berikutnya.
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    versionCode,
    versionName,
    apkUrl,
    mandatory,
    changelog,
  });
});

export default router;
