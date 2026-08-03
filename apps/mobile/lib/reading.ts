import { getRuntime } from '@soora/core';

/**
 * Posisi baca manga, per judul.
 *
 * Disimpan di MMKV persisten (bukan cache): ini milik user, bukan data yang
 * boleh dibuang saat "Bersihkan cache". Satu entri per manga — yang dibutuhkan
 * hanya "terakhir sampai mana", bukan riwayat lengkap.
 */
const KEY = 'soora_manga_progress';

export type ReadingPos = {
  mangaId: string;
  chId: string;
  /** Nomor chapter untuk ditampilkan, mis. "52". Kosong kalau tidak diketahui. */
  chLabel: string;
  /** Indeks halaman di dalam chapter tersebut, dimulai dari 0. */
  page: number;
  updatedAt: number;
};

type Store = Record<string, ReadingPos>;

function baca(): Store {
  const raw = getRuntime().kv.get(KEY);
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Store) : {};
  } catch {
    // Data rusak lebih baik diperlakukan sebagai kosong daripada menjatuhkan
    // layar baca; posisi baca bukan data yang layak bikin app gagal.
    return {};
  }
}

export function getReadingPos(mangaId: string): ReadingPos | null {
  if (!mangaId) return null;
  return baca()[mangaId] ?? null;
}

export function saveReadingPos(pos: Omit<ReadingPos, 'updatedAt'>): void {
  if (!pos.mangaId || !pos.chId) return;
  const store = baca();
  store[pos.mangaId] = { ...pos, updatedAt: Date.now() };

  // Batasi 200 judul, buang yang paling lama tidak disentuh. Tanpa batas,
  // objek ini di-parse dan ditulis ulang tiap kali gulir berhenti, dan
  // biayanya tumbuh selamanya.
  const semua = Object.values(store);
  if (semua.length > 200) {
    semua.sort((a, b) => b.updatedAt - a.updatedAt);
    const dipangkas: Store = {};
    for (const p of semua.slice(0, 200)) dipangkas[p.mangaId] = p;
    getRuntime().kv.set(KEY, JSON.stringify(dipangkas));
    return;
  }

  getRuntime().kv.set(KEY, JSON.stringify(store));
}

/** Id chapter yang sudah pernah dibuka untuk satu judul. */
export function getLastChapterId(mangaId: string): string | null {
  return getReadingPos(mangaId)?.chId ?? null;
}
