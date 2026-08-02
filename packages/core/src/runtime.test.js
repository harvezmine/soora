import { describe, it, expect, beforeEach } from 'vitest';
import { configureCore, getRuntime, resetCoreRuntime } from './runtime.js';
import { createMemoryKV, safeKV } from './ports/index.js';

beforeEach(() => resetCoreRuntime());

describe('configureCore', () => {
  it('memakai default yang aman sebelum dikonfigurasi', () => {
    const rt = getRuntime();
    expect(rt.apiBase).toBe('/api');
    expect(rt.getPage()).toBe('');
    // KV default harus berfungsi, bukan null — supaya core tidak crash
    // kalau ada request yang jalan sebelum bootstrap selesai.
    rt.kv.set('k', 'v');
    expect(rt.kv.get('k')).toBe('v');
  });

  it('menerapkan apiBase', () => {
    configureCore({ apiBase: 'https://api.soora.fun' });
    expect(getRuntime().apiBase).toBe('https://api.soora.fun');
  });

  it('membuang trailing slash supaya subpath tidak jadi double slash', () => {
    configureCore({ apiBase: 'https://api.soora.fun///' });
    expect(getRuntime().apiBase).toBe('https://api.soora.fun');
    expect(`${getRuntime().apiBase}/tmdb`).toBe('https://api.soora.fun/tmdb');
  });

  it('merge parsial — field yang tidak disebut tetap seperti sebelumnya', () => {
    const kv = createMemoryKV();
    configureCore({ apiBase: 'https://a.test', kv });
    configureCore({ apiBase: 'https://b.test' });
    expect(getRuntime().apiBase).toBe('https://b.test');
    getRuntime().kv.set('token', 'abc');
    expect(kv.get('token')).toBe('abc'); // kv sebelumnya masih terpasang
  });

  it('menolak apiBase kosong atau bukan string', () => {
    expect(() => configureCore({ apiBase: '' })).toThrow(TypeError);
    expect(() => configureCore({ apiBase: 42 })).toThrow(TypeError);
  });

  it('menolak getPage yang bukan function', () => {
    expect(() => configureCore({ getPage: '/home' })).toThrow(TypeError);
  });

  it('kv dan cache adalah penyimpanan terpisah', () => {
    configureCore({ kv: createMemoryKV(), cache: createMemoryKV() });
    getRuntime().kv.set('x', 'persisten');
    getRuntime().cache.set('x', 'sesi');
    expect(getRuntime().kv.get('x')).toBe('persisten');
    expect(getRuntime().cache.get('x')).toBe('sesi');
  });

  it('resetCoreRuntime mengembalikan ke default dan tidak membawa data lama', () => {
    configureCore({ apiBase: 'https://api.soora.fun' });
    getRuntime().kv.set('token', 'abc');
    resetCoreRuntime();
    expect(getRuntime().apiBase).toBe('/api');
    expect(getRuntime().kv.get('token')).toBeNull();
  });
});

describe('safeKV', () => {
  const throwingKV = {
    get: () => {
      throw new Error('storage diblokir');
    },
    set: () => {
      throw new Error('quota penuh');
    },
    remove: () => {
      throw new Error('storage diblokir');
    },
  };

  it('mengubah storage yang melempar jadi cache miss, bukan crash', () => {
    const kv = safeKV(throwingKV);
    expect(kv.get('x')).toBeNull();
    expect(() => kv.set('x', 'y')).not.toThrow();
    expect(() => kv.remove('x')).not.toThrow();
  });

  it('configureCore membungkus kv yang diinjeksi dengan safeKV', () => {
    configureCore({ kv: throwingKV, cache: throwingKV });
    // Tanpa pembungkusan, baris ini akan melempar.
    expect(getRuntime().kv.get('token')).toBeNull();
    expect(() => getRuntime().cache.set('k', 'v')).not.toThrow();
  });
});

describe('createMemoryKV', () => {
  it('get mengembalikan null untuk key yang tidak ada', () => {
    expect(createMemoryKV().get('hilang')).toBeNull();
  });

  it('remove menghapus key', () => {
    const kv = createMemoryKV();
    kv.set('a', '1');
    kv.remove('a');
    expect(kv.get('a')).toBeNull();
  });

  it('instance terpisah tidak berbagi data', () => {
    const a = createMemoryKV();
    const b = createMemoryKV();
    a.set('k', 'v');
    expect(b.get('k')).toBeNull();
  });
});
