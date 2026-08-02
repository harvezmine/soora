// Thin client for the authed user-data endpoints (mylist, progress, history).
// Plain module (not React) — reads the JWT straight from the KV port so the
// non-React utils (mylist.js, progress.js) can sync without context.
import { getRuntime } from '../runtime.js';

export const TOKEN_KEY = 'soora_token';

export const getToken = () => getRuntime().kv.get(TOKEN_KEY) || '';
export const isLoggedIn = () => !!getToken();

async function call(path, { method = 'GET', body } = {}) {
  const token = getToken();
  if (!token) return null; // not logged in — caller falls back to local only
  try {
    const res = await fetch(`${getRuntime().apiBase}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch { return null; }
}

// ── My List ──
export const apiGetMyList = () => call('/user/mylist').then((d) => d?.items || []);
export const apiAddMyList = (item) => call('/user/mylist', { method: 'POST', body: item });
export const apiRemoveMyList = (listType, id) =>
  call(`/user/mylist/${encodeURIComponent(listType)}/${encodeURIComponent(id)}`, { method: 'DELETE' });

// ── Progress (continue watching/reading) ──
export const apiGetProgress = () => call('/user/progress').then((d) => d?.items || []);
export const apiSetProgress = (entry) => call('/user/progress', { method: 'POST', body: entry });
export const apiDeleteProgress = (key) =>
  call(`/user/progress/${encodeURIComponent(key)}`, { method: 'DELETE' });

// ── History ──
export const apiAddHistory = (entry) => call('/user/history', { method: 'POST', body: entry });
