import { describe, it, expect } from 'vitest';
import { createMMKVKV } from './kv.js';

/** Tiruan MMKV — sengaja meniru perilaku `undefined` untuk key yang tidak ada. */
function fakeMMKV(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getString: (k) => (store.has(k) ? store.get(k) : undefined),
    set: (k, v) => store.set(k, v),
    delete: (k) => store.delete(k),
    _store: store,
  };
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

  it('remove menghapus key', () => {
    const kv = createMMKVKV(fakeMMKV({ a: '1' }));
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

  it('memenuhi kontrak KVPort yang sama dengan adapter web', () => {
    const kv = createMMKVKV(fakeMMKV());
    for (const m of ['get', 'set', 'remove']) expect(typeof kv[m]).toBe('function');
  });
});
