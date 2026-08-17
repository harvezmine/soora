import crypto from 'crypto';
import { redis } from './store';
import {
  Room,
  RoomError,
  ROOM_TTL_SEC,
  TICKET_TTL_SEC,
  assertValidContentKey,
  assertValidWatchPath,
} from './roomRules';

/**
 * Penyimpanan ruang nonton bareng.
 *
 * Hanya keterangan ruang yang masuk Redis. Keadaan pemutar (posisi, sedang
 * berjalan) sengaja tidak — ia berubah tiap detik, dan ruang yang ditinggal
 * semua orang memang harus mati, bukan dipulihkan.
 */

const rKey = (id: string) => `room:${id}`;
const tKey = (ticket: string) => `roomticket:${ticket}`;

/**
 * Id ruang adalah kuncinya: siapa pun yang punya tautan boleh masuk. Karena
 * itu harus benar-benar tidak bisa ditebak — 16 byte acak kriptografis,
 * bukan penghitung atau waktu.
 */
const newRoomId = () => crypto.randomBytes(16).toString('base64url');
const newTicket = () => crypto.randomBytes(24).toString('base64url');

export interface CreateArgs {
  hostId: string;
  hostName: string;
  contentKey: string;
  watchPath: string;
  title: string;
}

export async function createRoom(args: CreateArgs): Promise<Room> {
  const contentKey = assertValidContentKey(args.contentKey);
  const watchPath = assertValidWatchPath(args.watchPath);
  const now = Date.now();
  const room: Room = {
    id: newRoomId(),
    hostId: args.hostId,
    hostName: String(args.hostName || '').slice(0, 60),
    contentKey,
    watchPath,
    title: String(args.title || '').slice(0, 200),
    createdAt: now,
    updatedAt: now,
  };
  await redis.set(rKey(room.id), JSON.stringify(room), 'EX', ROOM_TTL_SEC);
  return room;
}

export async function getRoom(id: string): Promise<Room | null> {
  const raw = await redis.get(rKey(String(id || '')));
  if (!raw) return null;
  try { return JSON.parse(raw) as Room; } catch { return null; }
}

/** Perpanjang umur ruang selama masih dipakai. */
export async function touchRoom(id: string): Promise<void> {
  await redis.expire(rKey(id), ROOM_TTL_SEC);
}

export async function endRoom(id: string): Promise<void> {
  await redis.del(rKey(id));
}

// ── Karcis ──
// JWT tidak boleh ditempel di query WebSocket: URL tercatat di log nginx dan
// daftar proses. Jadi klien menukar JWT-nya dengan karcis berumur pendek
// lewat HTTP biasa, lalu mengirim karcis itu di pesan pertama soket.

export async function issueTicket(
  roomId: string,
  userId: string,
  name: string,
  avatar: string
): Promise<string> {
  const ticket = newTicket();
  await redis.set(
    tKey(ticket),
    JSON.stringify({ roomId, userId, name, avatar }),
    'EX',
    TICKET_TTL_SEC
  );
  return ticket;
}

export interface TicketData { roomId: string; userId: string; name: string; avatar: string }

/** Sekali pakai: dihapus saat ditukar, jadi tidak bisa diputar ulang. */
export async function consumeTicket(ticket: string): Promise<TicketData> {
  const key = tKey(String(ticket || ''));
  const raw = await redis.get(key);
  if (!raw) throw new RoomError('Karcis tidak berlaku atau sudah kedaluwarsa', 401);
  await redis.del(key);
  try { return JSON.parse(raw) as TicketData; } catch { throw new RoomError('Karcis rusak', 401); }
}
