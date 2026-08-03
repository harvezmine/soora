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

export type ListItem = {
  id: string;
  listType: 'anime' | 'movie' | 'tv' | 'manga';
  title: string;
  poster?: string;
  addedAt: number;
};

function readAll(): ListItem[] {
  try {
    const raw = getRuntime().kv.get(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list: ListItem[]) {
  try {
    getRuntime().kv.set(KEY, JSON.stringify(list));
  } catch {
    /* penyimpanan penuh — jangan jatuhkan UI */
  }
}

const keyOf = (listType: string, id: string) => `${listType}:${id}`;

export function listMyList(): ListItem[] {
  return readAll().sort((a, b) => b.addedAt - a.addedAt);
}

export function isInMyList(listType: string, id: string): boolean {
  return readAll().some((e) => keyOf(e.listType, e.id) === keyOf(listType, id));
}

export function addToMyList(item: Omit<ListItem, 'addedAt'>) {
  if (!item?.id) return;
  const list = readAll().filter((e) => keyOf(e.listType, e.id) !== keyOf(item.listType, item.id));
  writeAll([{ ...item, addedAt: Date.now() }, ...list]);

  if (isLoggedIn()) {
    // Kegagalan sinkron sengaja ditelan — datanya sudah aman di lokal, dan
    // memunculkan error di sini hanya membingungkan user yang tidak bisa
    // berbuat apa-apa soal itu.
    void apiAddMyList(item).catch(() => {});
  }
}

export function removeFromMyList(listType: string, id: string) {
  writeAll(readAll().filter((e) => keyOf(e.listType, e.id) !== keyOf(listType, id)));
  if (isLoggedIn()) void apiRemoveMyList(listType, id).catch(() => {});
}

/**
 * Menarik daftar dari akun lalu menggabungkannya dengan yang lokal.
 *
 * Digabung, bukan ditimpa: user bisa saja menyimpan judul saat belum login,
 * lalu login. Menimpa dengan data server akan menghapus judul-judul itu tanpa
 * peringatan.
 */
export async function syncMyList(): Promise<ListItem[]> {
  if (!isLoggedIn()) return listMyList();

  try {
    const remote = await apiGetMyList();
    if (!Array.isArray(remote)) return listMyList();

    const merged = new Map<string, ListItem>();
    for (const e of readAll()) merged.set(keyOf(e.listType, e.id), e);

    for (const r of remote) {
      const id = String(r?.id ?? '');
      if (!id) continue;
      const listType = (r?.listType ?? 'movie') as ListItem['listType'];
      const k = keyOf(listType, id);
      if (!merged.has(k)) {
        merged.set(k, {
          id,
          listType,
          title: String(r?.title ?? 'Tanpa judul'),
          poster: r?.poster ? String(r.poster) : undefined,
          addedAt: Number(r?.addedAt) || Date.now(),
        });
      }
    }

    const list = [...merged.values()];
    writeAll(list);
    return list.sort((a, b) => b.addedAt - a.addedAt);
  } catch {
    return listMyList();
  }
}

export function clearMyList() {
  getRuntime().kv.remove(KEY);
}
