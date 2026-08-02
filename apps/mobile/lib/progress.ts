/**
 * Posisi tontonan, disimpan lokal di MMKV.
 *
 * Inilah alasan MMKV dipilih di fase 1 dan bukan AsyncStorage: posisi ditulis
 * tiap beberapa detik selama memutar, dan API async akan menambahkan pekerjaan
 * ke jalur yang sedang merender video. MMKV sinkron, jadi penulisannya tidak
 * pernah menyentuh event loop yang sibuk.
 */

import { getRuntime } from '@soora/core';

const KEY = 'soora_progress';

/** Berapa lama sebuah judul dianggap "sedang ditonton". */
const MAX_ENTRIES = 40;

export type ProgressEntry = {
  id: string;
  kind: 'anime' | 'movie' | 'tv' | 'manga';
  title: string;
  /** Detik. */
  position: number;
  /** Detik. 0 kalau durasi belum diketahui. */
  duration: number;
  updatedAt: number;
  poster?: string;
};

function readAll(): ProgressEntry[] {
  try {
    const raw = getRuntime().kv.get(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list: ProgressEntry[]) {
  try {
    getRuntime().kv.set(KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
  } catch {
    /* penyimpanan penuh — kehilangan posisi tidak boleh menjatuhkan pemutaran */
  }
}

/**
 * Sudah dianggap selesai kalau lewat 92% durasi.
 *
 * Ambangnya bukan 100% karena hampir tidak ada yang menonton sampai detik
 * terakhir credit. Judul yang selesai dibuang dari daftar "Lanjut Tonton" —
 * kalau tidak, daftar itu penuh judul yang sudah tamat.
 */
export function isFinished(position: number, duration: number) {
  return duration > 0 && position / duration > 0.92;
}

export function saveProgress(entry: Omit<ProgressEntry, 'updatedAt'>) {
  if (!entry.id) return;

  // Jangan simpan posisi yang belum berarti. Menyimpan detik ke-3 hanya
  // membuat "Lanjut Tonton" penuh judul yang sebenarnya cuma dibuka sekilas.
  if (entry.position < 10) return;

  const list = readAll().filter((e) => e.id !== entry.id);

  if (isFinished(entry.position, entry.duration)) {
    writeAll(list); // selesai — hapus saja dari daftar
    return;
  }

  writeAll([{ ...entry, updatedAt: Date.now() }, ...list]);
}

export function getProgress(id: string): ProgressEntry | null {
  return readAll().find((e) => e.id === id) ?? null;
}

/** Daftar "Lanjut Tonton", terbaru dulu. */
export function listProgress(): ProgressEntry[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function clearProgress(id?: string) {
  if (!id) {
    getRuntime().kv.remove(KEY);
    return;
  }
  writeAll(readAll().filter((e) => e.id !== id));
}
