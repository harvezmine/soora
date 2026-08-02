/**
 * Bootstrap @soora/core untuk React Native.
 *
 * Modul ini di-import sekali dari app/_layout.tsx, dan efek sampingnya
 * (memanggil configureCore) berjalan saat import. Harus terjadi sebelum
 * request pertama — kalau tidak, core memakai default in-memory dan token
 * login tidak terbaca.
 */

import { configureCore } from '@soora/core';
import { nativeCoreConfig } from '@soora/core-native';
import { API_BASE } from './config';

/**
 * Route saat ini, untuk laporan error ke Telegram.
 *
 * Disimpan di variabel modul, bukan diambil dari hook, karena `getPage`
 * dipanggil dari lapisan non-React (interceptor axios) yang tidak punya akses
 * ke context router. Root layout memperbaruinya tiap navigasi.
 */
let currentPath = '';

export const setCurrentPath = (path: string) => {
  currentPath = path;
};

configureCore(
  nativeCoreConfig({
    apiBase: API_BASE,
    getPage: () => currentPath,
  })
);
