import { Router, Request, Response } from 'express';
import { requireAuth } from './auth';
import { getUserById, publicUser } from '../services/store';
import * as rooms from '../services/rooms';
import { Room, RoomError, MAX_PEERS } from '../services/roomRules';
import { livePeerCount } from '../ws';
import { reportRouteError } from '../services/telegram';

const router = Router();
const uid = (req: Request) => (req as any).userId as string;

function fail(req: Request, res: Response, err: any, where: string) {
  if (err instanceof RoomError) return res.status(err.status).json({ error: err.message });
  reportRouteError(req, err, where);
  return res.status(500).json({ error: 'Gagal memproses ruang' });
}

/**
 * Bentuk ruang yang boleh dilihat siapa pun yang memegang tautan. hostId
 * tidak ikut — peramban cukup tahu perannya sendiri, yang diberitahukan
 * lewat WebSocket setelah karcis diverifikasi.
 */
const publicRoom = (r: Room) => ({
  id: r.id,
  title: r.title,
  watchPath: r.watchPath,
  hostName: r.hostName,
  contentKey: r.contentKey,
  createdAt: r.createdAt,
  peers: livePeerCount(r.id),
  maxPeers: MAX_PEERS,
});

// POST /rooms {contentKey, watchPath, title} — buat ruang, pembuatnya jadi tuan rumah
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await getUserById(uid(req));
    if (!user) return res.status(401).json({ error: 'Sesi tidak valid' });
    const pub = publicUser(user);
    const room = await rooms.createRoom({
      hostId: pub.id,
      hostName: pub.name,
      contentKey: String(req.body?.contentKey || ''),
      watchPath: String(req.body?.watchPath || ''),
      title: String(req.body?.title || ''),
    });
    res.json({ room: publicRoom(room) });
  } catch (err: any) { fail(req, res, err, 'rooms:create'); }
});

// GET /rooms/:id — pratinjau sebelum bergabung (butuh masuk, sama seperti /watch/*)
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const room = await rooms.getRoom(String(req.params.id));
    if (!room) return res.status(404).json({ error: 'Ruang tidak ditemukan atau sudah berakhir' });
    res.json({ room: publicRoom(room), isHost: room.hostId === uid(req) });
  } catch (err: any) { fail(req, res, err, 'rooms:get'); }
});

// POST /rooms/:id/ticket — tukar JWT dengan karcis sekali pakai untuk WebSocket
router.post('/:id/ticket', requireAuth, async (req: Request, res: Response) => {
  try {
    const room = await rooms.getRoom(String(req.params.id));
    if (!room) return res.status(404).json({ error: 'Ruang tidak ditemukan atau sudah berakhir' });
    const user = await getUserById(uid(req));
    if (!user) return res.status(401).json({ error: 'Sesi tidak valid' });
    const pub = publicUser(user);
    const ticket = await rooms.issueTicket(room.id, pub.id, pub.name);
    res.json({ ticket });
  } catch (err: any) { fail(req, res, err, 'rooms:ticket'); }
});

export default router;
