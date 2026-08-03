/**
 * Daftar Saya — lokal dulu, sinkron ke akun kalau login.
 *
 * Selalu menulis ke MMKV lebih dulu, baru mencoba backend. Urutannya penting:
 * user yang menyimpan judul saat sinyal buruk tetap melihat judulnya tersimpan,
 * dan sinkronisasi menyusul. Kalau dibalik, tombol simpan akan terasa gagal
 * padahal hanya jaringannya yang lambat.
 */

import { getRuntime } from '@soora/core';
import { isLoggedIn, apiGetMyList, apiAddMyList, apiRemoveMyList } from '@soora/core/user';

const KEY = 'soora_mylist';
const TOMBSTONE_KEY = 'soora_mylist_removed';

export type ListType = 'anime' | 'movie' | 'tv' | 'manga';

export type ListItem = {
  id: string;
  listType: ListType;
  title: string;
  poster?: string;
  addedAt: number;
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = getRuntime().kv.get(key);
    const parsed = raw ? JSON.parse(raw) : fallback;
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    getRuntime().kv.set(key, JSON.stringify(value));
    return true;
  } catch {
    // Penyimpanan penuh. Pemanggil perlu tahu supaya UI tidak berbohong.
    return false;
  }
}

const readAll = (): ListItem[] => {
  const v = readJson<ListItem[]>(KEY, []);
  return Array.isArray(v) ? v : [];
};

/**
 * Kunci judul yang sengaja dihapus user.
 *
 * Tanpa ini, penghapusan bisa hidup lagi: user menghapus judul saat offline
 * (atau saat belum login), lalu sinkronisasi berikutnya menarik judul itu dari
 * server dan mengembalikannya. Nisan ini membuat penggabungan tahu bedanya
 * "belum pernah ada di sini" dan "sengaja dibuang".
 */
const readTombstones = (): string[] => {
  const v = readJson<string[]>(TOMBSTONE_KEY, []);
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
};

const keyOf = (listType: string, id: string) => `${listType}:${id}`;

export function listMyList(): ListItem[] {
  return readAll().sort((a, b) => b.addedAt - a.addedAt);
}

export function isInMyList(listType: string, id: string): boolean {
  return readAll().some((e) => keyOf(e.listType, e.id) === keyOf(listType, id));
}

/** @returns false kalau penyimpanan gagal, supaya UI tidak menampilkan status palsu. */
export function addToMyList(item: Omit<ListItem, 'addedAt'>): boolean {
  if (!item?.id) return false;

  const k = keyOf(item.listType, item.id);
  const list = readAll().filter((e) => keyOf(e.listType, e.id) !== k);
  const entry: ListItem = { ...item, addedAt: Date.now() };

  if (!writeJson(KEY, [entry, ...list])) return false;

  // Ditambahkan lagi setelah pernah dihapus — cabut nisannya.
  const tombs = readTombstones();
  if (tombs.includes(k)) writeJson(TOMBSTONE_KEY, tombs.filter((t) => t !== k));

  if (isLoggedIn()) {
    // Kegagalan sinkron ditelan: datanya sudah aman di lokal, dan sinkronisasi
    // berikutnya akan mendorongnya lagi.
    void Promise.resolve(apiAddMyList(toRemote(entry))).catch(() => {});
  }
  return true;
}

export function removeFromMyList(listType: string, id: string): boolean {
  const k = keyOf(listType, id);
  if (!writeJson(KEY, readAll().filter((e) => keyOf(e.listType, e.id) !== k))) return false;

  const tombs = readTombstones();
  if (!tombs.includes(k)) writeJson(TOMBSTONE_KEY, [k, ...tombs].slice(0, 200));

  if (isLoggedIn()) void Promise.resolve(apiRemoveMyList(listType, id)).catch(() => {});
  return true;
}

/**
 * Bentuk yang dikirim ke backend.
 *
 * Web menyimpan `image` dan tidak mengenal `listType: 'tv'` sama sekali —
 * halaman MyList di web hanya menangani anime/movie/manga. Kalau app mengirim
 * `tv`, judulnya masuk akun tapi tidak pernah muncul di web. Jadi serial
 * dikirim sebagai `movie` (ruang id-nya sama, TMDB), dan jenis aslinya dititip
 * di `mediaType` supaya app bisa memulihkannya.
 */
function toRemote(e: ListItem) {
  return {
    id: e.id,
    listType: e.listType === 'tv' ? 'movie' : e.listType,
    mediaType: e.listType === 'tv' ? 'tv' : undefined,
    title: e.title,
    image: e.poster,
    poster: e.poster,
    addedAt: e.addedAt,
  };
}

function fromRemote(r: Record<string, unknown>): ListItem | null {
  const id = String(r?.id ?? '');
  if (!id) return null;
  const raw = String(r?.listType ?? 'movie');
  const listType: ListType =
    r?.mediaType === 'tv'
      ? 'tv'
      : raw === 'anime' || raw === 'manga' || raw === 'tv' || raw === 'movie'
        ? (raw as ListType)
        : 'movie';
  return {
    id,
    listType,
    title: String(r?.title ?? 'Tanpa judul'),
    // Web menulis `image`, app menulis `poster`. Terima keduanya, kalau tidak
    // judul yang disimpan dari web muncul tanpa thumbnail di app.
    poster: r?.poster ? String(r.poster) : r?.image ? String(r.image) : undefined,
    // Pertahankan waktu asli. Memberi Date.now() membuat seluruh judul lama
    // melompat ke atas saat login di perangkat baru.
    addedAt: Number(r?.addedAt) || Date.now(),
  };
}

/**
 * Menyelaraskan daftar lokal dengan akun, dua arah.
 *
 * - Judul yang hanya ada di lokal (mis. disimpan sebelum login) DIDORONG ke
 *   server. Tanpa ini, judul-judul itu hilang begitu user ganti perangkat.
 * - Judul yang hanya ada di server ditarik ke lokal, KECUALI yang bernisan.
 */
export async function syncMyList(): Promise<ListItem[]> {
  if (!isLoggedIn()) return listMyList();

  try {
    const remote = await apiGetMyList();
    if (!Array.isArray(remote)) return listMyList();

    const local = readAll();
    const tombs = new Set(readTombstones());
    const merged = new Map<string, ListItem>();
    for (const e of local) merged.set(keyOf(e.listType, e.id), e);

    const remoteKeys = new Set<string>();
    for (const r of remote) {
      const item = fromRemote(r as Record<string, unknown>);
      if (!item) continue;
      const k = keyOf(item.listType, item.id);
      remoteKeys.add(k);

      // Sengaja dihapus user — jangan hidupkan lagi, dan beri tahu server.
      if (tombs.has(k)) {
        void Promise.resolve(apiRemoveMyList(item.listType, item.id)).catch(() => {});
        continue;
      }
      if (!merged.has(k)) merged.set(k, item);
    }

    // Dorong yang hanya ada di lokal.
    for (const e of local) {
      if (!remoteKeys.has(keyOf(e.listType, e.id))) {
        void Promise.resolve(apiAddMyList(toRemote(e))).catch(() => {});
      }
    }

    const list = [...merged.values()];
    writeJson(KEY, list);
    return list.sort((a, b) => b.addedAt - a.addedAt);
  } catch {
    return listMyList();
  }
}

export function clearMyList() {
  getRuntime().kv.remove(KEY);
  getRuntime().kv.remove(TOMBSTONE_KEY);
}
