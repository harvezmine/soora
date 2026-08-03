import { getRuntime } from '@soora/core';

/**
 * Catatan percobaan pemutaran.
 *
 * Ada karena kegagalan pemutaran tidak bisa diperbaiki dengan menebak: yang
 * dibutuhkan adalah judul mana, penyedia mana, mode apa, dan pesan apa. Layar
 * pemutar memakainya untuk menjelaskan kegagalan kepada user, dan layar
 * diagnostik di Profil memakainya untuk disalin saat melapor.
 *
 * Disimpan di cache, bukan penyimpanan persisten: ini data diagnostik, dan
 * "Bersihkan cache" memang seharusnya menghapusnya.
 */
const KEY = 'soora_playback_log';
const MAKS = 40;

export type Percobaan = {
  waktu: number;
  judul: string;
  kind: string;
  /** Penyedia atau langkah yang dicoba, mis. 'subindo-m3u8', 'embed', 'vixsrc'. */
  sumber: string;
  hasil: 'ok' | 'kosong' | 'galat';
  pesan?: string;
};

function baca(): Percobaan[] {
  const raw = getRuntime().cache.get(KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as Percobaan[]) : [];
  } catch {
    return [];
  }
}

export function catatPercobaan(p: Omit<Percobaan, 'waktu'>): void {
  const log = baca();
  log.unshift({ ...p, waktu: Date.now() });
  // Dipotong agar tidak tumbuh selamanya; 40 entri terakhir sudah cukup untuk
  // melihat pola kegagalan satu sesi.
  getRuntime().cache.set(KEY, JSON.stringify(log.slice(0, MAKS)));
}

export function bacaLog(): Percobaan[] {
  return baca();
}

export function bersihkanLog(): void {
  getRuntime().cache.remove(KEY);
}

/** Ringkasan sekali baca untuk ditempel ke laporan. */
export function ringkasLog(): string {
  const log = baca();
  if (log.length === 0) return 'Belum ada percobaan pemutaran yang tercatat.';
  return log
    .map((p) => {
      const t = new Date(p.waktu).toISOString().slice(11, 19);
      return `${t}  ${p.kind}  ${p.sumber}  ${p.hasil}${p.pesan ? `  ${p.pesan}` : ''}  ${p.judul}`;
    })
    .join('\n');
}
