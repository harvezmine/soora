import { getRuntime } from '@soora/core';
import { resolveImage } from '@soora/core/models';
import type { ListType } from './mylist';

/**
 * "Tonton nanti" — daftar terpisah dari Daftar Saya.
 *
 * Keduanya sengaja berbeda dan tidak digabung. Daftar Saya adalah koleksi yang
 * dipelihara user dan ikut tersinkron dengan akun soora.fun. Tonton nanti
 * adalah antrean sekali pakai: judul masuk, ditonton, lalu keluar. Menyatukan
 * keduanya membuat koleksi terus tercemar oleh judul yang sudah selesai.
 *
 * Lokal saja, tidak disinkronkan — backend belum punya endpoint untuknya, dan
 * berpura-pura menyinkronkan akan membuat user mengira antreannya aman di
 * server padahal tidak.
 */
const KEY = 'soora_watch_later';
const MAKS = 300;

export type WatchLaterItem = {
  id: string;
  listType: ListType;
  title: string;
  poster?: string;
  addedAt: number;
};

function baca(): WatchLaterItem[] {
  const raw = getRuntime().kv.get(KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as WatchLaterItem[]) : [];
  } catch {
    return [];
  }
}

function tulis(list: WatchLaterItem[]): void {
  getRuntime().kv.set(KEY, JSON.stringify(list.slice(0, MAKS)));
}

export function listWatchLater(): WatchLaterItem[] {
  // Terbaru di depan: antrean dibaca dari yang paling akhir ditambahkan.
  return baca().sort((a, b) => b.addedAt - a.addedAt);
}

export function inWatchLater(id: string, listType: ListType): boolean {
  return baca().some((x) => x.id === id && x.listType === listType);
}

export function toggleWatchLater(item: Omit<WatchLaterItem, 'addedAt'>): boolean {
  const list = baca();
  const i = list.findIndex((x) => x.id === item.id && x.listType === item.listType);
  if (i >= 0) {
    list.splice(i, 1);
    tulis(list);
    return false;
  }
  list.unshift({ ...item, addedAt: Date.now() });
  tulis(list);
  return true;
}

/** Bentuk yang bisa dipakai SectionRow dan MediaCard. */
export function toMediaItems(list: { id: string; listType: ListType; title: string; poster?: string }[]) {
  return list.map((x) => ({
    id: x.id,
    title: x.title,
    poster: resolveImage(x.poster ?? ''),
    // MediaCard memakai `kind` untuk menentukan rute tujuan; 'tv' dan 'movie'
    // sama-sama menuju /movie dengan parameter kind.
    kind: x.listType,
    source: x.listType === 'manga' ? 'mangapill' : x.listType === 'anime' ? 'samehadaku' : 'tmdb',
  }));
}
