import dotenv from 'dotenv';
dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';

/**
 * Rahasia penanda tangan JWT sesi.
 *
 * Sebelumnya ada fallback literal di sini. Itu berbahaya: repo ini publik,
 * jadi begitu produksi berjalan tanpa JWT_SECRET, siapa pun yang membaca repo
 * bisa menempa token sesi yang valid untuk user id mana pun — dan tidak ada
 * gejala apa pun yang menandakannya.
 *
 * Sekarang produksi menolak start kalau variabel ini tidak ada. Lebih baik
 * backend mati saat deploy dan langsung ketahuan, daripada hidup tapi bisa
 * dipalsukan diam-diam.
 */
function resolveJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;

  if (nodeEnv === 'production') {
    throw new Error(
      'JWT_SECRET wajib di-set (minimal 32 karakter) saat NODE_ENV=production. ' +
        'Set di ecosystem.config.js lalu restart dengan `pm2 restart <app> --update-env`.'
    );
  }

  if (fromEnv) {
    console.warn('[config] JWT_SECRET terlalu pendek (<32 karakter) — hanya diterima di dev.');
    return fromEnv;
  }
  console.warn('[config] JWT_SECRET tidak di-set — memakai rahasia dev sementara.');
  return 'dev-only-insecure-secret-do-not-use-in-production';
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  consumetUrl: process.env.CONSUMET_URL || 'http://localhost:3000',
  tmdbKey: process.env.TMDB_KEY || '',
  tmdbBase: 'https://api.themoviedb.org/3',
  tmdbImg: 'https://image.tmdb.org/t/p',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  nodeEnv,
  telegramBotToken: process.env.BOT_TOKEN || '',
  telegramChatId: process.env.CHAT_ID || '',
  jwtSecret: resolveJwtSecret(),
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  // Client ID Android terpisah.
  //
  // Google memvalidasi client web lewat "Authorized JavaScript origins" —
  // itu sebabnya login di soora.fun bekerja: browsernya memang berada di
  // origin tersebut. Aplikasi Android tidak punya origin sama sekali, jadi
  // Google memvalidasinya lewat nama paket + sidik jari SHA-1 penandatangan,
  // dan itu mengharuskan OAuth client bertipe "Android".
  //
  // Akibatnya ID token dari app membawa `aud` milik client Android, bukan
  // client web. Verifikasi harus menerima keduanya; kalau hanya menerima
  // client web, login di app selalu ditolak meski Google-nya sendiri sukses.
  googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID || '',
  samehadakuBase: 'https://www.sankavollerei.com/anime/samehadaku',
  jikanBase: 'https://api.jikan.moe/v4',
};
