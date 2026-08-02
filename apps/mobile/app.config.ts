import type { ExpoConfig } from 'expo/config';
import { BRAND_BG } from './theme/brand';

/**
 * Konfigurasi Expo sebagai TypeScript, bukan app.json.
 *
 * Alasannya satu: warna latar. Sebelumnya `#06060e` ditulis di app.json untuk
 * latar jendela dan ikon adaptif, sekaligus ada di theme/tokens.ts sebagai
 * `BRAND_BG`. JSON tidak bisa meng-import TS, jadi mengganti warna merek
 * berarti mengubah dua tempat — dan kalau salah satu terlewat, akan terlihat
 * kedipan warna lama tiap kali app dibuka dingin.
 *
 * Sekarang token adalah satu-satunya sumber kebenaran.
 */
const config: ExpoConfig = {
  name: 'Soora',
  slug: 'soora',
  version: '1.0.0',
  orientation: 'default',
  // Dua skema: 'soora' untuk deep link biasa, dan 'fun.soora.app' yang wajib
  // ada karena expo-auth-session memakai redirect fun.soora.app:/oauthredirect.
  // Tanpa yang kedua, login Google gagal dengan ERR_UNKNOWN_URL_SCHEME.
  scheme: ['soora', 'fun.soora.app'],
  userInterfaceStyle: 'dark',
  backgroundColor: BRAND_BG,
  android: {
    package: 'fun.soora.app',
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: BRAND_BG,
    },
  },
  ios: {
    bundleIdentifier: 'fun.soora.app',
    supportsTablet: true,
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-web-browser',
    ['expo-video', { supportsPictureInPicture: true }],
    'expo-image',
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
