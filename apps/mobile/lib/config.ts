/**
 * Konfigurasi runtime app.
 *
 * Berbeda dari web yang memakai '/api' relatif lalu di-proxy Vite/Vercel,
 * app native tidak punya origin — harus menunjuk backend secara absolut.
 */

/** Backend Soora. Sama dengan cabang IS_NATIVE di apps/web/src/config.js. */
export const API_BASE = 'https://api.soora.fun';

/** Proxy stream yang menambahkan header Referer untuk CDN yang mensyaratkannya. */
export const STREAM_PROXY = 'https://stream.soora.fun/proxy';

/**
 * Google OAuth client ID untuk Android.
 *
 * PENTING: ini BUKAN client ID web yang dipakai soora.fun. Android butuh
 * client ID bertipe "Android" tersendiri, dan SHA-1 fingerprint dari
 * soora-keystore.jks harus didaftarkan di Google Cloud Console untuk client
 * itu. Kalau salah satu tidak cocok, login gagal dengan DEVELOPER_ERROR yang
 * tidak menjelaskan apa-apa.
 *
 * Diisi di fase 1 setelah client ID Android dibuat. Selama masih kosong,
 * layar login menampilkan pesan setup, bukan mencoba lalu gagal misterius.
 */
export const GOOGLE_ANDROID_CLIENT_ID = '';

/** Client ID web — dipakai backend untuk memverifikasi ID token. */
export const GOOGLE_WEB_CLIENT_ID =
  '1046486298812-a3oh36rdeicvjmdr7l38ia174264iq1g.apps.googleusercontent.com';

export const isGoogleLoginConfigured = () => GOOGLE_ANDROID_CLIENT_ID.length > 0;
