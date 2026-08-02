/**
 * Test lapisan cache setelah dipisah dari sessionStorage ke port.
 *
 * File ini juga berfungsi sebagai bukti bahwa @soora/core tidak lagi
 * bergantung pada browser: test berjalan di environment node polos, tanpa
 * jsdom. Kalau ada `window`/`sessionStorage` yang bocor masuk ke core,
 * import di baris bawah akan gagal.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { cachedGet, cachedGetSWR, clearApiMemCache } from './index.js';
import { configureCore, resetCoreRuntime, getRuntime } from '../runtime.js';
import { createMemoryKV } from '../ports/index.js';

const TTL = 1000;

beforeEach(() => {
  vi.useFakeTimers();
  resetCoreRuntime();
  clearApiMemCache();
  configureCore({ cache: createMemoryKV() });
});

afterEach(() => vi.useRealTimers());

describe('cachedGet', () => {
  it('memanggil fetcher saat cache kosong', async () => {
    const fetcher = vi.fn().mockResolvedValue('segar');
    expect(await cachedGet('k1', fetcher, TTL)).toBe('segar');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('memakai cache dan tidak memanggil fetcher lagi dalam TTL', async () => {
    const fetcher = vi.fn().mockResolvedValue('segar');
    await cachedGet('k2', fetcher, TTL);
    vi.advanceTimersByTime(TTL - 1);
    expect(await cachedGet('k2', fetcher, TTL)).toBe('segar');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('fetch ulang setelah TTL lewat', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce('lama').mockResolvedValueOnce('baru');
    await cachedGet('k3', fetcher, TTL);
    vi.advanceTimersByTime(TTL + 1);
    expect(await cachedGet('k3', fetcher, TTL)).toBe('baru');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('menulis ke port cache, bukan ke sessionStorage', async () => {
    await cachedGet('k4', vi.fn().mockResolvedValue({ a: 1 }), TTL);
    const raw = getRuntime().cache.get('soora_cache:k4');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw).data).toEqual({ a: 1 });
  });

  it('memulihkan dari port cache walau memori sudah kosong (simulasi reload)', async () => {
    const fetcher = vi.fn().mockResolvedValue('dari-disk');
    await cachedGet('k5', fetcher, TTL);
    clearApiMemCache(); // reload halaman: memori hilang, cache persisten tetap
    expect(await cachedGet('k5', fetcher, TTL)).toBe('dari-disk');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('memperlakukan JSON rusak sebagai cache miss, bukan crash', async () => {
    getRuntime().cache.set('soora_cache:k6', '{bukan json}');
    const fetcher = vi.fn().mockResolvedValue('pulih');
    expect(await cachedGet('k6', fetcher, TTL)).toBe('pulih');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('tetap berfungsi saat port cache selalu gagal', async () => {
    configureCore({
      cache: {
        get: () => {
          throw new Error('storage diblokir');
        },
        set: () => {
          throw new Error('quota penuh');
        },
        remove: () => {
          throw new Error('storage diblokir');
        },
      },
    });
    const fetcher = vi.fn().mockResolvedValue('tetap jalan');
    expect(await cachedGet('k7', fetcher, TTL)).toBe('tetap jalan');
  });

  it('meneruskan error fetcher ke pemanggil', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('backend mati'));
    await expect(cachedGet('k8', fetcher, TTL)).rejects.toThrow('backend mati');
  });
});

describe('cachedGetSWR', () => {
  it('mengembalikan data stale langsung lalu revalidasi di background', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');
    expect(await cachedGetSWR('s1', fetcher, TTL, TTL * 3)).toBe('v1');

    // Lewat TTL tapi belum lewat staleTTL → stale-but-usable.
    vi.advanceTimersByTime(TTL + 1);
    expect(await cachedGetSWR('s1', fetcher, TTL, TTL * 3)).toBe('v1'); // instan, stale
    expect(fetcher).toHaveBeenCalledTimes(2); // refresh sudah jalan di background

    await vi.runAllTimersAsync();
    expect(await cachedGetSWR('s1', fetcher, TTL, TTL * 3)).toBe('v2'); // sudah segar
  });

  it('menunggu fetch kalau data melewati staleTTL', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');
    await cachedGetSWR('s2', fetcher, TTL, TTL * 3);
    vi.advanceTimersByTime(TTL * 3 + 1);
    expect(await cachedGetSWR('s2', fetcher, TTL, TTL * 3)).toBe('v2');
  });

  it('tidak menjatuhkan pemanggil saat revalidasi background gagal', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce('v1')
      .mockRejectedValue(new Error('backend mati'));
    await cachedGetSWR('s3', fetcher, TTL, TTL * 3);
    vi.advanceTimersByTime(TTL + 1);
    // Data stale tetap dikembalikan meski refresh di belakang gagal.
    expect(await cachedGetSWR('s3', fetcher, TTL, TTL * 3)).toBe('v1');
    await vi.runAllTimersAsync();
    expect(await cachedGetSWR('s3', fetcher, TTL, TTL * 3)).toBe('v1');
  });

  it('bertahan saat fetcher melempar sinkron di jalur revalidasi', async () => {
    let call = 0;
    const fetcher = vi.fn(() => {
      call += 1;
      if (call === 1) return Promise.resolve('v1');
      throw new Error('meledak sebelum mengembalikan promise');
    });
    await cachedGetSWR('s4', fetcher, TTL, TTL * 3);
    vi.advanceTimersByTime(TTL + 1);
    // Tanpa try/catch di _revalidate, baris ini melempar.
    expect(await cachedGetSWR('s4', fetcher, TTL, TTL * 3)).toBe('v1');
  });

  it('bertahan saat fetcher mengembalikan nilai non-promise', async () => {
    let call = 0;
    const fetcher = vi.fn(() => {
      call += 1;
      return call === 1 ? Promise.resolve('v1') : 'bukan-promise';
    });
    await cachedGetSWR('s5', fetcher, TTL, TTL * 3);
    vi.advanceTimersByTime(TTL + 1);
    expect(await cachedGetSWR('s5', fetcher, TTL, TTL * 3)).toBe('v1');
    await vi.runAllTimersAsync();
    expect(await cachedGetSWR('s5', fetcher, TTL, TTL * 3)).toBe('bukan-promise');
  });
});
