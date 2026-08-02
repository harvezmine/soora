/**
 * Hook yang menjembatani @soora/core dengan cache katalog SQLite.
 *
 * Layar tidak boleh memanggil cache langsung — di situ letak jebakannya:
 * callback refresh datang belakangan dan gampang memanggil setState setelah
 * layar hilang, dan tiap layar akan menulis ulang penanganan status yang sama.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getCatalogCache } from './db';

export type Status = 'loading' | 'ready' | 'error';

export type CatalogResult<T> = {
  data: T | null;
  status: Status;
  error: string;
  /** Data berasal dari cache dan penyegaran sedang berjalan di belakang. */
  stale: boolean;
  refreshing: boolean;
  refresh: () => void;
};

/**
 * Membaca satu entri katalog dengan pola stale-while-revalidate.
 *
 * @param kind  Jenis data — menentukan TTL. Lihat TTL di @soora/core-native/catalog.
 * @param key   Kunci unik dalam kind tersebut.
 * @param fetcher Pengambil data. Harus stabil, bungkus dengan useCallback.
 * @param enabled Setel false untuk menunda (mis. menunggu input pencarian).
 */
export function useCatalog<T>(
  kind: string,
  key: string,
  fetcher: () => Promise<T>,
  enabled = true
): CatalogResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Layar tab tidak pernah di-unmount, tapi layar detail iya — dan refresh
  // background bisa selesai setelah user menekan back.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Menghindari balapan saat key berubah cepat (mis. mengetik di pencarian):
  // hanya hasil untuk key terakhir yang boleh masuk state.
  const latestKey = useRef(key);
  latestKey.current = key;

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(
    async (isRefresh: boolean) => {
      const myKey = key;
      if (isRefresh) setRefreshing(true);
      else setStatus('loading');
      setError('');

      try {
        const cache = getCatalogCache();
        const cached = cache.getEntry(kind, myKey);
        setStale(Boolean(cached) && !cached?.fresh);

        const result = (await cache.read(kind, myKey, () => fetcherRef.current(), (fresh) => {
          // Penyegaran background selesai. Diabaikan kalau layar sudah hilang
          // atau user sudah berpindah ke key lain.
          if (!alive.current || latestKey.current !== myKey) return;
          setData(fresh as T);
          setStale(false);
        })) as T;

        if (!alive.current || latestKey.current !== myKey) return;
        setData(result);
        setStatus('ready');
      } catch (e) {
        if (!alive.current || latestKey.current !== myKey) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      } finally {
        if (alive.current) setRefreshing(false);
      }
    },
    [kind, key]
  );

  useEffect(() => {
    if (!enabled) {
      setStatus('ready');
      setData(null);
      return;
    }
    void load(false);
  }, [enabled, load]);

  const refresh = useCallback(() => {
    void load(true);
  }, [load]);

  return { data, status, error, stale, refreshing, refresh };
}

/**
 * Varian untuk pencarian: menunda kueri sampai user berhenti mengetik.
 *
 * Tanpa debounce, mengetik "one piece" mengirim sembilan request dan hasilnya
 * bisa datang tidak berurutan sehingga daftar berkedip ke hasil kueri lama.
 *
 * @param query Teks mentah dari input.
 * @param delay Milidetik menunggu. 350 ms terasa responsif tanpa memicu badai request.
 */
export function useDebounced<T>(query: T, delay = 350): T {
  const [debounced, setDebounced] = useState(query);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), delay);
    return () => clearTimeout(t);
  }, [query, delay]);

  return debounced;
}
