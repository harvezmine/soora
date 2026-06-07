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
const USERS_SET = 'users:all'; // index of every user id

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
  await redis.sadd(USERS_SET, u.id);
}

export async function listAllUsers(): Promise<UserRecord[]> {
  const ids = await redis.smembers(USERS_SET);
  if (!ids.length) return [];
  const raws = await redis.mget(ids.map(uKey));
  return raws.map((r) => { try { return r ? JSON.parse(r) : null; } catch { return null; } }).filter(Boolean) as UserRecord[];
}

export async function countUsers(): Promise<number> {
  return redis.scard(USERS_SET);
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
export async function countProgress(userId: string) {
  return redis.hlen(progKey(userId));
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
export async function countHistory(userId: string) {
  return redis.llen(histKey(userId));
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
export async function countMyList(userId: string) {
  return redis.hlen(listKey(userId));
}

// ── Usage stats (active time on Soora) ──
// stats:{id} hash: totalSeconds, lastSeen, firstSeen, sessions, lastPath
const statsKey = (id: string) => `stats:${id}`;
const GAP_MS = 90 * 1000; // >90s since last heartbeat = new session, don't add the gap

export interface UserStats {
  totalSeconds: number;
  lastSeen: number;
  firstSeen: number;
  sessions: number;
  lastPath?: string;
}

/**
 * Accumulate active time. Client sends a heartbeat every ~30s while the tab is
 * visible. We add the elapsed time since the last beat, but only if it's within
 * GAP_MS (otherwise the user was away → new session, add nothing for the gap).
 */
export async function recordHeartbeat(userId: string, now: number, path?: string): Promise<void> {
  const key = statsKey(userId);
  const cur = await redis.hgetall(key);
  const lastSeen = parseInt(cur.lastSeen || '0', 10);
  const elapsed = lastSeen ? now - lastSeen : 0;
  const pipe = redis.pipeline();
  if (!cur.firstSeen) pipe.hset(key, 'firstSeen', now);
  if (elapsed > 0 && elapsed <= GAP_MS) {
    pipe.hincrby(key, 'totalSeconds', Math.round(elapsed / 1000));
  } else {
    pipe.hincrby(key, 'sessions', 1); // first beat or returned after a gap
  }
  pipe.hset(key, 'lastSeen', now);
  if (path) pipe.hset(key, 'lastPath', path.slice(0, 120));
  await pipe.exec();
}

export async function getStats(userId: string): Promise<UserStats> {
  const s = await redis.hgetall(statsKey(userId));
  return {
    totalSeconds: parseInt(s.totalSeconds || '0', 10),
    lastSeen: parseInt(s.lastSeen || '0', 10),
    firstSeen: parseInt(s.firstSeen || '0', 10),
    sessions: parseInt(s.sessions || '0', 10),
    lastPath: s.lastPath || undefined,
  };
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
