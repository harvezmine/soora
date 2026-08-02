/**
 * Test bahwa auth token dibaca lewat KV port, bukan localStorage langsung.
 * Ini yang membuat modul user bisa dipakai ulang di React Native (MMKV).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getToken, isLoggedIn, TOKEN_KEY } from './index.js';
import { configureCore, resetCoreRuntime, getRuntime } from '../runtime.js';
import { createMemoryKV } from '../ports/index.js';

beforeEach(() => {
  resetCoreRuntime();
  configureCore({ kv: createMemoryKV() });
});

describe('getToken', () => {
  it('mengembalikan string kosong kalau belum login', () => {
    expect(getToken()).toBe('');
    expect(isLoggedIn()).toBe(false);
  });

  it('membaca token dari KV port', () => {
    getRuntime().kv.set(TOKEN_KEY, 'jwt-abc');
    expect(getToken()).toBe('jwt-abc');
    expect(isLoggedIn()).toBe(true);
  });

  it('memakai key yang sama dengan yang ditulis web (soora_token)', () => {
    // AuthContext di apps/web menulis langsung ke localStorage dengan key ini.
    // Kalau key berubah, user yang sudah login akan tampak logout.
    expect(TOKEN_KEY).toBe('soora_token');
  });

  it('token kosong dianggap belum login', () => {
    getRuntime().kv.set(TOKEN_KEY, '');
    expect(isLoggedIn()).toBe(false);
  });
});
