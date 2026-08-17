import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from './config';
import * as rooms from './services/rooms';
import {
  PlayerState,
  MAX_PEERS,
  HOST_GRACE_MS,
  canControl,
  sanitizeState,
} from './services/roomRules';
import { notifyError } from './services/telegram';

/**
 * Nonton bareng.
 *
 * Keadaan pemutar hidup di memori proses ini — PM2 menjalankan satu instans,
 * jadi tidak perlu pub/sub antar-pekerja. Yang perlu bertahan (keterangan
 * ruang) ada di Redis.
 *
 * Kendali dijaga di sini, bukan di peramban: pesan `state` dari siapa pun
 * yang bukan tuan rumah dibuang.
 */

interface Peer {
  socket: WebSocket;
  userId: string;
  name: string;
  alive: boolean;
}

interface LiveRoom {
  id: string;
  hostId: string;
  state: PlayerState;
  peers: Set<Peer>;
  /** berjalan saat tuan rumah terputus; ruang ditutup bila ia tak kembali */
  graceTimer?: NodeJS.Timeout;
}

const live = new Map<string, LiveRoom>();

/** Batas pesan per soket, supaya satu klien tidak bisa membanjiri ruang. */
const MSG_PER_SEC = 25;
const HELLO_TIMEOUT_MS = 10_000;
const PING_INTERVAL_MS = 30_000;

const send = (socket: WebSocket, type: string, data: Record<string, unknown> = {}) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, ...data }));
  }
};

const broadcast = (room: LiveRoom, type: string, data: Record<string, unknown> = {}, kecuali?: Peer) => {
  for (const p of room.peers) {
    if (p !== kecuali) send(p.socket, type, data);
  }
};

const peerList = (room: LiveRoom) => {
  const nama: string[] = [];
  const terlihat = new Set<string>();
  for (const p of room.peers) {
    if (terlihat.has(p.userId)) continue;
    terlihat.add(p.userId);
    nama.push(p.name);
  }
  return { count: terlihat.size, names: nama.slice(0, MAX_PEERS) };
};

const tutupRuang = (room: LiveRoom, reason: string) => {
  broadcast(room, 'ended', { reason });
  for (const p of room.peers) {
    try { p.socket.close(1000, 'room ended'); } catch { /* sudah tertutup */ }
  }
  if (room.graceTimer) clearTimeout(room.graceTimer);
  live.delete(room.id);
  rooms.endRoom(room.id).catch(() => {});
};

export function attachWatchParty(server: HttpServer): WebSocketServer {
  // noServer: upgrade ditangani sendiri supaya Origin bisa diperiksa sebelum
  // soket terbentuk, dan supaya path lain tidak ikut ter-upgrade.
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const path = (req.url || '').split('?')[0];
    if (path !== '/ws') {
      socket.destroy();
      return;
    }
    const origin = req.headers.origin || '';
    const izin = config.corsOrigin === '*' ? [] : config.corsOrigin.split(',').map((o) => o.trim());
    if (izin.length && origin && !izin.includes(origin)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (socket: WebSocket) => {
    let peer: Peer | null = null;
    let room: LiveRoom | null = null;
    let jendela = Date.now();
    let jumlahPesan = 0;

    // Pesan pertama harus `hello` berisi karcis. Soket yang menganggur tanpa
    // memperkenalkan diri ditutup, supaya tidak jadi lubang sumber daya.
    const helloTimer = setTimeout(() => {
      if (!peer) { try { socket.close(4001, 'hello timeout'); } catch { /* noop */ } }
    }, HELLO_TIMEOUT_MS);

    (socket as any).isAlive = true;
    socket.on('pong', () => { (socket as any).isAlive = true; });

    socket.on('message', async (raw) => {
      // Batas laju sederhana per soket.
      const now = Date.now();
      if (now - jendela > 1000) { jendela = now; jumlahPesan = 0; }
      if (++jumlahPesan > MSG_PER_SEC) return;

      let msg: any;
      try { msg = JSON.parse(String(raw)); } catch { return; }

      // ── Perkenalan ──
      if (msg.type === 'hello') {
        if (peer) return; // sudah diperkenalkan
        try {
          const data = await rooms.consumeTicket(msg.ticket);
          const rec = await rooms.getRoom(data.roomId);
          if (!rec) { send(socket, 'ended', { reason: 'Ruang sudah berakhir' }); socket.close(); return; }

          room = live.get(rec.id) || {
            id: rec.id,
            hostId: rec.hostId,
            // Ruang baru dianggap dijeda di awal sampai tuan rumah berkata lain.
            state: { playing: false, position: 0, at: Date.now() },
            peers: new Set<Peer>(),
          };
          live.set(rec.id, room);

          if (peerList(room).count >= MAX_PEERS) {
            send(socket, 'error', { message: `Ruang penuh (maksimal ${MAX_PEERS} orang)` });
            socket.close();
            return;
          }

          // Satu orang, satu sambungan: tab lama diputus saat yang baru masuk.
          for (const p of room.peers) {
            if (p.userId === data.userId) {
              try { p.socket.close(4002, 'replaced'); } catch { /* noop */ }
              room.peers.delete(p);
            }
          }

          peer = { socket, userId: data.userId, name: data.name, alive: true };
          room.peers.add(peer);
          clearTimeout(helloTimer);

          // Tuan rumah kembali sebelum tenggang habis — batalkan penutupan.
          if (data.userId === room.hostId && room.graceTimer) {
            clearTimeout(room.graceTimer);
            room.graceTimer = undefined;
          }

          const isHost = canControl(rec, data.userId);
          send(socket, 'welcome', {
            role: isHost ? 'host' : 'guest',
            room: { id: rec.id, title: rec.title, watchPath: rec.watchPath, hostName: rec.hostName },
            state: room.state,
            serverTime: Date.now(),
            peers: peerList(room),
          });
          broadcast(room, 'peers', peerList(room), peer);
          rooms.touchRoom(rec.id).catch(() => {});
        } catch (err: any) {
          send(socket, 'error', { message: err?.message || 'Gagal masuk ruang' });
          socket.close();
        }
        return;
      }

      if (!peer || !room) return; // belum diperkenalkan

      // ── Selisih jam ──
      if (msg.type === 'ping') {
        send(socket, 'pong', { t0: msg.t0, tS: Date.now() });
        return;
      }

      // ── Keadaan pemutar ──
      if (msg.type === 'state') {
        // Inti janji fitur ini. Klien tidak dipercaya: siapa pun bisa membuka
        // konsol dan mengirim pesan ini.
        if (peer.userId !== room.hostId) return;
        room.state = sanitizeState(msg, Date.now());
        broadcast(room, 'state', { ...room.state }, peer);
        rooms.touchRoom(room.id).catch(() => {});
        return;
      }

      if (msg.type === 'bye') {
        try { socket.close(1000, 'bye'); } catch { /* noop */ }
      }
    });

    socket.on('close', () => {
      clearTimeout(helloTimer);
      if (!peer || !room) return;
      const r = room;
      r.peers.delete(peer);

      if (peer.userId === r.hostId) {
        // Tuan rumah pergi: semua dijeda, lalu ditunggu. Kalau ia tidak
        // kembali, ruang ditutup — kendali memang miliknya sendiri.
        r.state = { ...r.state, playing: false, at: Date.now() };
        broadcast(r, 'state', { ...r.state });
        broadcast(r, 'host-away', { graceMs: HOST_GRACE_MS });
        if (r.graceTimer) clearTimeout(r.graceTimer);
        r.graceTimer = setTimeout(() => tutupRuang(r, 'Tuan rumah meninggalkan ruang'), HOST_GRACE_MS);
      } else {
        broadcast(r, 'peers', peerList(r));
      }

      if (r.peers.size === 0 && !r.graceTimer) {
        live.delete(r.id);
      }
    });

    socket.on('error', () => { try { socket.close(); } catch { /* noop */ } });
  });

  // Sambungan yang mati diam-diam (perangkat tidur, jaringan hilang) tidak
  // selalu memicu 'close'. Ping berkala yang membersihkannya.
  const pinger = setInterval(() => {
    for (const client of wss.clients) {
      if ((client as any).isAlive === false) { client.terminate(); continue; }
      (client as any).isAlive = false;
      try { client.ping(); } catch { /* noop */ }
    }
  }, PING_INTERVAL_MS);

  wss.on('close', () => clearInterval(pinger));
  wss.on('error', (err) => {
    notifyError({
      status: 500,
      method: 'WS',
      url: '/ws',
      source: 'backend',
      trigger: 'watch-party',
      timestamp: new Date().toISOString(),
      details: { stack: err?.stack },
    });
  });

  return wss;
}

/** Dipakai rute HTTP untuk menampilkan jumlah orang tanpa membuka soket. */
export function livePeerCount(roomId: string): number {
  const r = live.get(roomId);
  return r ? peerList(r).count : 0;
}
