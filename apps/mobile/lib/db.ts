/**
 * Penyambungan expo-sqlite ke cache katalog di @soora/core-native.
 *
 * `createCatalogCache` sengaja tidak tahu apa-apa soal expo-sqlite — dia hanya
 * menerima port bergaya { exec, getFirst, run }. Itu yang membuat logikanya
 * bisa diuji dengan SQLite asli di node (lihat catalog.test.js).
 */

import * as SQLite from 'expo-sqlite';
import { createCatalogCache } from '@soora/core-native/catalog';

const DB_NAME = 'soora.db';

let cache: ReturnType<typeof createCatalogCache> | null = null;

/**
 * Cache katalog, dibuat sekali lalu dipakai ulang.
 *
 * Memakai API sinkron expo-sqlite: pembacaan katalog terjadi saat layar
 * dirender pertama kali, dan versi async akan menambahkan satu frame kosong
 * sebelum konten muncul — persis hal yang ingin dihindari cache ini.
 */
export function getCatalogCache() {
  if (cache) return cache;
  const db = SQLite.openDatabaseSync(DB_NAME);

  // WAL: baca dan tulis tidak saling mengunci. Penting karena refresh
  // background menulis sementara UI masih membaca.
  db.execSync('PRAGMA journal_mode = WAL;');

  cache = createCatalogCache({
    exec: (sql: string) => db.execSync(sql),
    getFirst: (sql: string, params: unknown[] = []) =>
      db.getFirstSync(sql, params as SQLite.SQLiteBindParams),
    run: (sql: string, params: unknown[] = []) =>
      db.runSync(sql, params as SQLite.SQLiteBindParams),
  });

  return cache;
}
