/**
 * Login Google untuk native.
 *
 * Alurnya berbeda dari web. Web memakai Google Identity Services di browser dan
 * langsung menerima `credential` (ID token). Native tidak punya GIS, jadi
 * memakai expo-auth-session: buka browser sistem, user memilih akun, lalu
 * kembali ke app lewat deep link membawa `id_token`.
 *
 * Setelah itu kontraknya sama persis dengan web: POST /auth/google dengan
 * { idToken }, backend memverifikasi lalu mengembalikan JWT Soora.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { getRuntime } from '@soora/core';
import { TOKEN_KEY } from '@soora/core/user';
import { GOOGLE_ANDROID_CLIENT_ID, GOOGLE_WEB_CLIENT_ID, API_BASE } from './config';

// Menutup tab browser otomatis begitu redirect kembali ke app.
WebBrowser.maybeCompleteAuthSession();

/** Key user disimpan di MMKV, sepadan dengan USER_KEY di AuthContext web. */
export const USER_KEY = 'soora_user';

export type SooraUser = { id?: string; email?: string; name?: string; picture?: string };

/**
 * Menukar Google ID token dengan JWT Soora, lalu menyimpannya.
 *
 * Token ditulis lewat KV port core (MMKV), bukan langsung ke storage, supaya
 * `getToken()` di @soora/core/user langsung melihatnya — modul itu yang
 * dipakai seluruh request terautentikasi.
 */
export async function exchangeGoogleIdToken(idToken: string): Promise<SooraUser> {
  const res = await fetch(`${API_BASE}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Backend menolak login Google (HTTP ${res.status}). ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { token?: string; user?: SooraUser };
  if (!data?.token) throw new Error('Backend tidak mengembalikan token.');

  const kv = getRuntime().kv;
  kv.set(TOKEN_KEY, data.token);
  if (data.user) kv.set(USER_KEY, JSON.stringify(data.user));

  return data.user ?? {};
}

export function signOut() {
  const kv = getRuntime().kv;
  kv.remove(TOKEN_KEY);
  kv.remove(USER_KEY);
}

export function getStoredUser(): SooraUser | null {
  const raw = getRuntime().kv.get(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SooraUser;
  } catch {
    return null;
  }
}

/**
 * Hook login Google.
 *
 * `useIdTokenAuthRequest` harus dipanggil di dalam komponen — itu sebabnya ini
 * hook, bukan fungsi async biasa. Hasil redirect datang lewat `response` di
 * render berikutnya, jadi penukaran token dijalankan di effect.
 */
export function useGoogleSignIn() {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || undefined,
    clientId: GOOGLE_WEB_CLIENT_ID,
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState<SooraUser | null>(() => getStoredUser());
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!response) return;

    if (response.type === 'error') {
      setError(response.error?.message ?? 'Login Google gagal.');
      setBusy(false);
      return;
    }
    if (response.type !== 'success') {
      // dismiss / cancel — bukan error, user sekadar membatalkan.
      setBusy(false);
      return;
    }

    const idToken = response.params?.id_token;
    if (!idToken) {
      setError('Google tidak mengembalikan id_token.');
      setBusy(false);
      return;
    }
    // Response yang sama bisa terbaca dua kali saat re-render; jangan tukar ulang.
    if (handled.current === idToken) return;
    handled.current = idToken;

    exchangeGoogleIdToken(idToken)
      .then(setUser)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  }, [response]);

  const signIn = useCallback(async () => {
    setError('');
    setBusy(true);
    try {
      await promptAsync();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }, [promptAsync]);

  return { signIn, busy, error, user, ready: Boolean(request) };
}
