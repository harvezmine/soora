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
    // Harus > versionCode APK Capacitor lama (yang bernilai 1), kalau tidak
    // Android menolak memasangnya sebagai pembaruan.
    //
    // Dinaikkan MANUAL tiap rilis. `autoIncrement` di eas.json sengaja tidak
    // dipakai: EAS harus menulis balik nilainya ke berkas konfigurasi, dan itu
    // mustahil untuk app.config.ts yang dinamis — build-nya gagal sebelum
    // menyentuh apa pun.
    versionCode: 2,
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
    // supportsBackgroundPlayback WAJIB di sini, bukan cukup menyetel
    // `staysActiveInBackground` di JS: opsi plugin inilah yang menambahkan
    // izin dan foreground service media di manifest Android saat prebuild.
    // Tanpanya audio berhenti begitu app di-background — fitur yang justru
    // jadi salah satu alasan utama APK ini dibuat.
    ['expo-video', { supportsPictureInPicture: true, supportsBackgroundPlayback: true }],
    'expo-image',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      // Project Expo: @harvezmine/soora. Ditempel manual karena konfigurasi ini
      // TypeScript (dinamis) — `eas init` melaporkan "Cannot automatically
      // write to dynamic config" dan mencetak id-nya untuk disalin.
      // Bukan rahasia: id ini hanya penunjuk project, bukan kredensial.
      //
      // `slug` di atas harus sama dengan slug project di Expo, kalau tidak EAS
      // menolak dengan "does not match the slug field".
      projectId: '24e3039b-0a0d-45fc-b2ba-62debd68506e',
    },
  },
};

export default config;
