import { getRuntime } from '@soora/core';

/**
 * Bahasa manga pilihan user.
 *
 * Web menyimpannya di localStorage dengan kunci `soora_manga_lang`. Kunci yang
 * sama dipakai di sini supaya artinya tetap satu di kedua platform kalau nanti
 * preferensi ini ikut disinkronkan ke akun.
 */
const KEY = 'soora_manga_lang';

export type MangaLang = 'id' | 'en';

export const MANGA_LANGS: { id: MangaLang; label: string }[] = [
  { id: 'id', label: 'Indonesia' },
  { id: 'en', label: 'English' },
];

/**
 * Default 'id', berbeda dari web yang default 'en'.
 *
 * Soora dipakai pembaca Indonesia dan seluruh antarmuka app berbahasa
 * Indonesia; membuka katalog berbahasa Inggris lebih dulu berarti hampir semua
 * user harus mengganti pilihan di kunjungan pertama.
 */
export function getMangaLang(): MangaLang {
  const v = getRuntime().kv.get(KEY);
  return v === 'en' || v === 'id' ? v : 'id';
}

export function setMangaLang(lang: MangaLang): void {
  getRuntime().kv.set(KEY, lang);
}
