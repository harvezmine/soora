import { describe, it, expect } from 'vitest';
import { createMMKVKV } from './kv.js';

/**
 * Tiruan MMKV — sengaja meniru perilaku `undefined` untuk key yang tidak ada.
 *
 * `bentuk` memilih nama method penghapus: v4 memakai `remove` yang
 * mengembalikan boolean, v3 memakai `delete`. Keduanya diuji karena adapter
 * menjanjikan netral terhadap versi, dan justru pergantian nama seperti inilah
 * yang lolos ke rilis pertama.
 */
function fakeMMKV(initial = {}, bentuk = 'v4') {
  const store = new Map(Object.entries(initial));
  const dasar = {
    getString: (k) => (store.has(k) ? store.get(k) : undefined),
    set: (k, v) => store.set(k, v),
    _store: store,
  };
  return bentuk === 'v4'
    ? { ...dasar, remove: (k) => store.delete(k) }
    : { ...dasar, delete: (k) => store.delete(k) };
}

describe('createMMKVKV', () => {
  it('menormalkan undefined dari MMKV jadi null sesuai kontrak KVPort', () => {
    const kv = createMMKVKV(fakeMMKV());
    // MMKV mengembalikan undefined; core memeriksa null. Kalau normalisasi ini
    // hilang, getToken() menghasilkan "undefined" di header Authorization.
    expect(kv.get('tidak-ada')).toBeNull();
    expect(kv.get('tidak-ada')).not.toBeUndefined();
  });

  it('set lalu get mengembalikan nilai yang sama', () => {
    const kv = createMMKVKV(fakeMMKV());
    kv.set('soora_token', 'jwt-abc');
    expect(kv.get('soora_token')).toBe('jwt-abc');
  });

  it('remove menghapus key lewat method remove (v4)', () => {
    const kv = createMMKVKV(fakeMMKV({ a: '1' }, 'v4'));
    kv.remove('a');
    expect(kv.get('a')).toBeNull();
  });

  it('remove menghapus key lewat method delete (v3)', () => {
    const kv = createMMKVKV(fakeMMKV({ a: '1' }, 'v3'));
    kv.remove('a');
    expect(kv.get('a')).toBeNull();
  });

  it('string kosong dipertahankan, tidak diubah jadi null', () => {
    // Beda makna: "" berarti tersimpan tapi kosong, null berarti tidak ada.
    const kv = createMMKVKV(fakeMMKV({ a: '' }));
    expect(kv.get('a')).toBe('');
  });

  it('menolak instance yang bukan MMKV', () => {
    expect(() => createMMKVKV(null)).toThrow(TypeError);
    expect(() => createMMKVKV({})).toThrow(TypeError);
  });

  it('menyebutkan method mana yang kurang', () => {
    expect(() => createMMKVKV({ getString: () => '' })).toThrow(/set, remove\/delete/);
  });

  it('tidak pernah melempar walau MMKV gagal — kontrak KVPort', () => {
    // Konsumen yang memakai nativePersistentKV langsung tidak lewat safeKV,
    // jadi perlindungannya harus ada di sini.
    const broken = {
      getString: () => {
        throw new Error('MMKV tertutup');
      },
      set: () => {
        throw new Error('disk penuh');
      },
      delete: () => {
        throw new Error('MMKV tertutup');
      },
    };
    const kv = createMMKVKV(broken);
    expect(kv.get('x')).toBeNull();
    expect(() => kv.set('x', 'y')).not.toThrow();
    expect(() => kv.remove('x')).not.toThrow();
  });

  it('memenuhi kontrak KVPort yang sama dengan adapter web', () => {
    const kv = createMMKVKV(fakeMMKV());
    for (const m of ['get', 'set', 'remove']) expect(typeof kv[m]).toBe('function');
  });
});
