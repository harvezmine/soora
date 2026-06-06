import Redis from 'ioredis';

/**
 * Redis-backed store for users + per-user data (progress, history, mylist, prefs).
 * Reuses the same Redis the Consumet API runs on (localhost:6379).
 */
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: false,
  maxRetriesPerRequest: 2,
});
redis.on('error', (e) => console.error('[store] redis error:', e.message));

const HISTORY_CAP = 200;

// ── Users ──
export interface UserRecord {
  id: string;
  email: string;
  name: string;
  avatar: string;
  passHash?: string;
  googleSub?: string;
  createdAt: number;
}

const uKey = (id: string) => `user:${id}`;
const emailKey = (email: string) => `useremail:${email.toLowerCase()}`;

export async function getUserById(id: string): Promise<UserRecord | null> {
  const raw = await redis.get(uKey(id));
  return raw ? JSON.parse(raw) : null;
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const id = await redis.get(emailKey(email));
  return id ? getUserById(id) : null;
}

export async function saveUser(u: UserRecord): Promise<void> {
  await redis.set(uKey(u.id), JSON.stringify(u));
  await redis.set(emailKey(u.email), u.id);
}

// publicly-safe user view (no passHash)
export function publicUser(u: UserRecord) {
  return { id: u.id, email: u.email, name: u.name, avatar: u.avatar };
}

// ── Progress (continue watching/reading) ──
// field = content key (e.g. "anime:gachiakuta" / "movie:687163"), value = JSON
const progKey = (id: string) => `progress:${id}`;

export async function setProgress(userId: string, key: string, data: any) {
  await redis.hset(progKey(userId), key, JSON.stringify({ ...data, updatedAt: Date.now() }));
}
export async function getProgress(userId: string) {
  const all = await redis.hgetall(progKey(userId));
  return Object.entries(all)
    .map(([key, v]) => { try { return { key, ...JSON.parse(v) }; } catch { return null; } })
    .filter(Boolean)
    .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
export async function deleteProgress(userId: string, key: string) {
  await redis.hdel(progKey(userId), key);
}

// ── History ──
const histKey = (id: string) => `history:${id}`;
export async function addHistory(userId: string, entry: any) {
  await redis.lpush(histKey(userId), JSON.stringify({ ...entry, at: Date.now() }));
  await redis.ltrim(histKey(userId), 0, HISTORY_CAP - 1);
}
export async function getHistory(userId: string) {
  const items = await redis.lrange(histKey(userId), 0, HISTORY_CAP - 1);
  return items.map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
}

// ── My List ──
const listKey = (id: string) => `mylist:${id}`;
export async function getMyList(userId: string) {
  const all = await redis.hgetall(listKey(userId));
  return Object.values(all).map((v) => { try { return JSON.parse(v); } catch { return null; } }).filter(Boolean);
}
export async function addMyList(userId: string, item: any) {
  const itemKey = `${item.listType || 'anime'}:${item.id}`;
  await redis.hset(listKey(userId), itemKey, JSON.stringify(item));
}
export async function removeMyList(userId: string, listType: string, id: string) {
  await redis.hdel(listKey(userId), `${listType}:${id}`);
}

// ── Prefs ──
const prefsKey = (id: string) => `prefs:${id}`;
export async function getPrefs(userId: string) {
  const raw = await redis.get(prefsKey(userId));
  return raw ? JSON.parse(raw) : {};
}
export async function setPrefs(userId: string, prefs: any) {
  await redis.set(prefsKey(userId), JSON.stringify(prefs));
}

export { redis };
