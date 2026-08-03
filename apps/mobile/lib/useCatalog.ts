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
  enabled = true,
  /**
   * Kembalikan false untuk menolak menyimpan hasil ini ke cache.
   * Dipakai layar Cari untuk kegagalan parsial.
   */
  shouldCache?: (data: T) => boolean
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

  // Token request monoton, bukan perbandingan key.
  //
  // Menulis `latestKey.current = key` di badan render tidak aman di React 19:
  // render yang dibatalkan tetap meninggalkan nilainya, sehingga load yang
  // sudah commit bisa membuang hasilnya sendiri dan layar tertahan di
  // status 'loading' selamanya. Token hanya dinaikkan di dalam `load`, yang
  // pasti berjalan setelah commit.
  const requestToken = useRef(0);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const shouldCacheRef = useRef(shouldCache);
  shouldCacheRef.current = shouldCache;

  const load = useCallback(
    async (isRefresh: boolean) => {
      const myToken = ++requestToken.current;
      const isCurrent = () => alive.current && requestToken.current === myToken;

      if (isRefresh) setRefreshing(true);
      else setStatus('loading');
      setError('');

      try {
        const cache = getCatalogCache();

        // Penyegaran eksplisit harus benar-benar menembus jaringan.
        //
        // Tanpa baris ini, `read()` mengembalikan entri yang masih fresh tanpa
        // memanggil fetcher sama sekali — sehingga tombol "Coba lagi" dan
        // tarik-untuk-segarkan tidak berefek apa pun sampai TTL habis. Untuk
        // kind 'title' itu berarti 7 hari: kalau sebuah judul sempat ter-cache
        // saat penyedia setengah mati (mis. daftar episode kosong), user tidak
        // punya cara apa pun memaksa muat ulang.
        if (isRefresh) cache.invalidate(kind, key);

        const cached = cache.getEntry(kind, key);
        if (isCurrent()) setStale(Boolean(cached) && !cached?.fresh);

        const result = (await cache.read(kind, key, () => fetcherRef.current(), (fresh) => {
          // Penyegaran background selesai. Diabaikan kalau layar sudah hilang
          // atau sudah ada request yang lebih baru.
          if (!isCurrent()) return;
          setData(fresh as T);
          setStale(false);
          setRefreshing(false);
        }, {
          shouldCache: (d) =>
            typeof shouldCacheRef.current === 'function'
              ? shouldCacheRef.current(d as T)
              : true,
        })) as T;

        if (!isCurrent()) return;
        setData(result);
        setStatus('ready');

        // Kalau data yang dikembalikan basi, penyegaran masih berjalan di
        // belakang — spinner dibiarkan sampai callback di atas mendarat, supaya
        // daftar tidak berubah setelah indikator sudah hilang.
        if (!(cached && !cached.fresh)) setRefreshing(false);
      } catch (e) {
        if (!isCurrent()) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
        setRefreshing(false);
      }
    },
    [kind, key]
  );

  useEffect(() => {
    if (!enabled) {
      // Naikkan token supaya hasil request sebelumnya tidak mendarat setelah
      // layar berpindah ke keadaan nonaktif.
      requestToken.current += 1;
      setStatus('ready');
      setData(null);
      setError('');
      setStale(false);
      setRefreshing(false);
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
 * @param delay Milidetik menunggu. 500 ms, sama dengan pencarian di web, supaya
 *   ritme mengetik terasa sama di kedua platform.
 */
export function useDebounced<T>(query: T, delay = 500): T {
  const [debounced, setDebounced] = useState(query);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), delay);
    return () => clearTimeout(t);
  }, [query, delay]);

  return debounced;
}
