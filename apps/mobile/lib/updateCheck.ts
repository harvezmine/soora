/**
 * Pemeriksaan pembaruan APK.
 *
 * APK Soora didistribusikan lewat unduhan langsung, bukan Play Store, jadi
 * tidak ada pembaruan otomatis sama sekali. Tanpa pemeriksaan ini, user yang
 * memasang sekali akan tertinggal selamanya — termasuk ketika versi yang
 * dipakainya rusak karena penyedia berubah.
 */

import Constants from 'expo-constants';
import { API_BASE } from './config';

export type VersionInfo = {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  mandatory: boolean;
  changelog: string;
};

/** versionCode APK yang sedang berjalan, dari app.config.ts. */
export function currentVersionCode(): number {
  const v = Constants.expoConfig?.android?.versionCode;
  return typeof v === 'number' ? v : 1;
}

/**
 * Menanyakan versi terbaru ke backend.
 *
 * Mengembalikan null kalau tidak ada pembaruan, atau kalau pemeriksaannya
 * gagal. Kegagalan sengaja diperlakukan sebagai "tidak ada pembaruan": user
 * yang sedang offline atau backend yang sedang bermasalah tidak boleh disambut
 * dialog error saat membuka app.
 */
export async function checkForUpdate(): Promise<VersionInfo | null> {
  try {
    const res = await fetch(`${API_BASE}/app/version`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;

    const info = (await res.json()) as Partial<VersionInfo>;
    const latest = Number(info?.versionCode);
    if (!Number.isFinite(latest)) return null;

    // Tanpa apkUrl, memberitahu user ada pembaruan hanya membuat frustrasi —
    // tidak ada yang bisa dilakukannya.
    if (latest <= currentVersionCode() || !info?.apkUrl) return null;

    return {
      versionCode: latest,
      versionName: String(info.versionName ?? ''),
      apkUrl: String(info.apkUrl),
      mandatory: Boolean(info.mandatory),
      changelog: String(info.changelog ?? ''),
    };
  } catch {
    return null;
  }
}
