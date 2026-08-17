import { redis } from './store';
import {
  MAX_TEXT,
  CommentError,
  assertValidKey,
  normalizeText,
  resolveParentId,
} from './commentRules';

/**
 * Komentar per judul, disimpan di Redis yang sama dengan data pengguna.
 *
 * Kunci konten memakai konvensi yang sudah dipakai fitur progress:
 * "<section>:<id>" — mis. "movie:1315772", "anime:gachiakuta".
 * Komentar menempel di judul, bukan per episode, supaya percakapan
 * terkumpul di satu tempat.
 *
 * Bentuk data:
 *   comment:{id}        JSON satu komentar
 *   comments:{key}      ZSET  skor=createdAt, anggota=id komentar utama
 *   replies:{parentId}  ZSET  skor=createdAt, anggota=id balasan
 *
 * Jumlah komentar dibaca dari ZCARD — tidak ada penghitung terpisah yang
 * bisa melenceng dari isinya.
 */

export const PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// Aturan murni (panjang teks, bentuk kunci, kedalaman balasan) hidup di
// commentRules.ts supaya bisa diuji tanpa Redis. Diekspor ulang di sini
// agar pemanggil cukup mengimpor satu modul.
export { MAX_TEXT, CommentError, assertValidKey, normalizeText };

export interface Comment {
  id: string;
  /** kunci konten, mis. "movie:1315772" */
  key: string;
  userId: string;
  /** nama & avatar disalin saat menulis supaya membaca tidak perlu lookup user */
  name: string;
  avatar: string;
  text: string;
  parentId: string | null;
  createdAt: number;
  deleted?: boolean;
  replyCount?: number;
}

const cKey = (id: string) => `comment:${id}`;
const listKey = (key: string) => `comments:${key}`;
const replyKey = (parentId: string) => `replies:${parentId}`;

const newId = () =>
  `c_${Date.now().toString(36)}${Math.floor(Math.random() * 1e8).toString(36)}`;

// ── Batas laju ──
// Redis INCR + EXPIRE. Tidak perlu dependensi tambahan, dan batasnya ikut
// berlaku walau backend dijalankan lebih dari satu proses.

interface RateRule { suffix: string; limit: number; windowSec: number; message: string }

const RATE_RULES: RateRule[] = [
  { suffix: 'm', limit: 5, windowSec: 60, message: 'Terlalu cepat. Tunggu sebentar sebelum menulis lagi.' },
  { suffix: 'h', limit: 30, windowSec: 3600, message: 'Batas komentar per jam tercapai. Coba lagi nanti.' },
];

export async function assertWithinRateLimit(userId: string): Promise<void> {
  for (const rule of RATE_RULES) {
    const key = `rl:cmt:${rule.suffix}:${userId}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, rule.windowSec);
    if (n > rule.limit) throw new CommentError(rule.message, 429);
  }
}

/** Tolak pengiriman ulang teks yang sama persis dalam waktu dekat. */
export async function assertNotDuplicate(userId: string, text: string): Promise<void> {
  const key = `cmt:last:${userId}`;
  const prev = await redis.get(key);
  if (prev === text) throw new CommentError('Komentar itu baru saja kamu kirim', 409);
  await redis.set(key, text, 'EX', 300);
}

// ── Baca ──

async function loadMany(ids: string[]): Promise<Comment[]> {
  if (!ids.length) return [];
  const raws = await redis.mget(ids.map(cKey));
  return raws
    .map((r) => { try { return r ? (JSON.parse(r) as Comment) : null; } catch { return null; } })
    .filter(Boolean) as Comment[];
}

export async function getComment(id: string): Promise<Comment | null> {
  const raw = await redis.get(cKey(id));
  return raw ? (JSON.parse(raw) as Comment) : null;
}

export async function countComments(key: string): Promise<number> {
  return redis.zcard(listKey(key));
}

/**
 * Komentar utama, terbaru dulu. `cursor` adalah createdAt komentar terakhir
 * pada halaman sebelumnya; halaman berikutnya mengambil yang lebih lama.
 */
export async function listComments(
  key: string,
  cursor?: number,
  limit = PAGE_SIZE
): Promise<{ items: Comment[]; nextCursor: number | null; total: number }> {
  const n = Math.min(Math.max(1, limit || PAGE_SIZE), MAX_PAGE_SIZE);
  const max = cursor && cursor > 0 ? `(${cursor}` : '+inf';
  const ids = await redis.zrevrangebyscore(listKey(key), max, '-inf', 'LIMIT', 0, n);
  const items = await loadMany(ids);

  // Jumlah balasan per komentar — satu perjalanan pipeline, bukan N query.
  if (items.length) {
    const pipe = redis.pipeline();
    items.forEach((c) => pipe.zcard(replyKey(c.id)));
    const res = await pipe.exec();
    items.forEach((c, i) => { c.replyCount = (res?.[i]?.[1] as number) || 0; });
  }

  const total = await countComments(key);
  const nextCursor = ids.length === n && items.length ? items[items.length - 1].createdAt : null;
  return { items, nextCursor, total };
}

/** Balasan sebuah komentar, terlama dulu supaya percakapan terbaca urut. */
export async function listReplies(parentId: string, limit = MAX_PAGE_SIZE): Promise<Comment[]> {
  const n = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const ids = await redis.zrange(replyKey(parentId), 0, n - 1);
  return loadMany(ids);
}

// ── Tulis ──

export interface AddArgs {
  key: string;
  userId: string;
  name: string;
  avatar: string;
  text: string;
  parentId?: string | null;
}

export async function addComment(args: AddArgs): Promise<Comment> {
  const key = assertValidKey(args.key);
  const text = normalizeText(args.text);

  let parentId: string | null = null;
  if (args.parentId) {
    const parent = await getComment(String(args.parentId));
    if (!parent) throw new CommentError('Komentar yang dibalas tidak ditemukan', 404);
    parentId = resolveParentId(parent, key);
  }

  const comment: Comment = {
    id: newId(),
    key,
    userId: args.userId,
    name: args.name,
    avatar: args.avatar,
    text,
    parentId,
    createdAt: Date.now(),
  };

  const pipe = redis.pipeline();
  pipe.set(cKey(comment.id), JSON.stringify(comment));
  if (parentId) pipe.zadd(replyKey(parentId), comment.createdAt, comment.id);
  else pipe.zadd(listKey(key), comment.createdAt, comment.id);
  await pipe.exec();

  return comment;
}

/**
 * Hapus komentar. Kalau masih punya balasan, isinya dikosongkan tapi
 * simpulnya tetap ada supaya balasan tidak jadi yatim; kalau tidak, dibuang
 * seluruhnya.
 */
export async function deleteComment(id: string, actorId: string, isAdmin = false): Promise<Comment | null> {
  const c = await getComment(id);
  if (!c) throw new CommentError('Komentar tidak ditemukan', 404);
  if (!isAdmin && c.userId !== actorId) throw new CommentError('Bukan komentarmu', 403);

  const replyCount = c.parentId ? 0 : await redis.zcard(replyKey(id));
  if (replyCount > 0) {
    const tombstone: Comment = { ...c, text: '', deleted: true };
    await redis.set(cKey(id), JSON.stringify(tombstone));
    return tombstone;
  }

  const pipe = redis.pipeline();
  pipe.del(cKey(id));
  if (c.parentId) pipe.zrem(replyKey(c.parentId), id);
  else { pipe.zrem(listKey(c.key), id); pipe.del(replyKey(id)); }
  await pipe.exec();
  return null;
}

// ── Laporan ──

const REPORTS_KEY = 'comments:reports';

export interface Report { commentId: string; key: string; reporterId: string; reason: string; at: number }

export async function reportComment(commentId: string, reporterId: string, reason: string): Promise<Report> {
  const c = await getComment(commentId);
  if (!c) throw new CommentError('Komentar tidak ditemukan', 404);
  const report: Report = {
    commentId,
    key: c.key,
    reporterId,
    reason: String(reason || '').slice(0, 200),
    at: Date.now(),
  };
  // Satu laporan per pelapor per komentar — anggota ZSET-nya sengaja unik.
  await redis.zadd(REPORTS_KEY, report.at, `${commentId}|${reporterId}|${report.reason}`);
  return report;
}

export async function listReports(limit = 100): Promise<Array<Report & { comment: Comment | null }>> {
  const rows = await redis.zrevrange(REPORTS_KEY, 0, Math.min(limit, 500) - 1, 'WITHSCORES');
  const out: Array<Report & { comment: Comment | null }> = [];
  for (let i = 0; i < rows.length; i += 2) {
    const [commentId, reporterId, ...rest] = rows[i].split('|');
    const comment = await getComment(commentId);
    out.push({
      commentId,
      key: comment?.key || '',
      reporterId,
      reason: rest.join('|'),
      at: parseInt(rows[i + 1], 10),
      comment,
    });
  }
  return out;
}

export async function dismissReport(member: string): Promise<void> {
  await redis.zrem(REPORTS_KEY, member);
}
