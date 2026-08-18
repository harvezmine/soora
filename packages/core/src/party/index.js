// Klien nonton bareng.
//
// Menyambung ke wss://api.soora.fun/ws, mengukur selisih jam terhadap server,
// lalu menjaga pemutar tamu tetap sejajar dengan tuan rumah.
//
// Penulisan ulang /api/* di Vercel hanya meneruskan HTTP biasa, bukan
// WebSocket, jadi alamat soket dihitung sendiri dari apiBase.
import { getRuntime } from '../runtime.js';
import { getToken } from '../user/index.js';

/* ── Ambang koreksi. Sama persis dengan yang diuji di backend
      (services/roomRules.ts) — keduanya harus sepakat. ── */
export const DRIFT_IGNORE_SEC = 0.5;
export const DRIFT_SEEK_SEC = 2;

export function driftAction(drift) {
  const besar = Math.abs(drift);
  if (!Number.isFinite(drift) || besar < DRIFT_IGNORE_SEC) return 'ignore';
  if (besar > DRIFT_SEEK_SEC) return 'seek';
  return drift > 0 ? 'nudge-ahead' : 'nudge-behind';
}

export function playbackRateFor(action) {
  if (action === 'nudge-ahead') return 1.05;
  if (action === 'nudge-behind') return 0.95;
  return 1;
}

export function clockOffset(t0, tS, t2) {
  return tS - (t0 + t2) / 2;
}

export function projectPosition(state, serverNow) {
  if (!state?.playing) return Math.max(0, state?.position || 0);
  const lewat = Math.max(0, serverNow - state.at) / 1000;
  return Math.max(0, state.position + lewat);
}

/**
 * Asal situs web. Modul ini dipakai bersama apps/mobile, dan React Native
 * tidak punya `window.location` — jadi globalnya diperiksa, tidak diandaikan.
 */
const ORIGIN_BAWAAN = 'https://soora.fun';
const asalWeb = () =>
  (typeof window !== 'undefined' && window.location?.origin) || ORIGIN_BAWAAN;

/** Alamat WebSocket dari apiBase. */
export function wsUrl() {
  const base = getRuntime().apiBase;
  if (/^https?:\/\//i.test(base)) {
    return `${base.replace(/^http/i, 'ws').replace(/\/$/, '')}/ws`;
  }
  // apiBase relatif ("/api") berarti web lewat penulisan ulang Vercel, yang
  // tidak meneruskan WebSocket — jadi soket menuju backend secara langsung.
  const loc = typeof window !== 'undefined' ? window.location : null;
  if (!loc) return 'wss://api.soora.fun/ws';
  const proto = loc.protocol === 'https:' ? 'wss' : 'ws';
  const host = loc.hostname === 'localhost' ? `${loc.hostname}:4000` : 'api.soora.fun';
  return `${proto}://${host}/ws`;
}

async function call(path, { method = 'GET', body } = {}) {
  const token = getToken();
  if (!token) throw new Error('Masuk dulu untuk nonton bareng');
  let res;
  try {
    res = await fetch(`${getRuntime().apiBase}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Tanpa status: jaringan, bukan penolakan server. Pemanggil akan
    // mencoba lagi.
    throw new Error('Jaringan bermasalah. Mencoba lagi…');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || 'Gagal memproses ruang');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const createRoom = ({ contentKey, watchPath, title }) =>
  call('/rooms', { method: 'POST', body: { contentKey, watchPath, title } }).then((d) => d.room);

export const getRoom = (id) => call(`/rooms/${encodeURIComponent(id)}`);

const getTicket = (id) =>
  call(`/rooms/${encodeURIComponent(id)}/ticket`, { method: 'POST' }).then((d) => d.ticket);

/** Tautan undangan. Tamu mendarat di halaman tonton yang sama. */
export const inviteLink = (room, origin = asalWeb()) =>
  `${origin}${room.watchPath}${room.watchPath.includes('?') ? '&' : '?'}room=${encodeURIComponent(room.id)}`;

const SAMPEL_AWAL = 5;
const PING_TIAP_MS = 30_000;
const SAMBUNG_ULANG_MAKS_MS = 30_000;

/**
 * Buka sambungan ke sebuah ruang.
 *
 * Mengembalikan objek dengan `sendState` (diabaikan server bila bukan tuan
 * rumah), `close`, dan `serverNow`. Semua peristiwa dilaporkan lewat callback
 * `on`, bukan dengan mengembalikan promise — sambungan bisa hidup berjam-jam
 * dan menyambung ulang sendiri.
 */
export function connectRoom(roomId, on = {}) {
  let socket = null;
  let ditutup = false;
  let offset = 0;
  let sampel = [];
  let pingTimer = null;
  let jedaSambungUlang = 1000;

  const serverNow = () => Date.now() + offset;

  const kirim = (type, data = {}) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, ...data }));
    }
  };

  const ping = () => {
    const t0 = Date.now();
    kirim('ping', { t0 });
  };

  const sambung = async () => {
    if (ditutup) return;
    let ticket;
    try {
      ticket = await getTicket(roomId);
    } catch (err) {
      // Ruang hilang atau sesi berakhir memang tidak bisa ditolong dengan
      // mencoba lagi. Tapi jaringan yang sedang putus bisa — dan menutup
      // ruang karena satu permintaan gagal berarti kehilangan ruang tiap
      // kali sinyal berkedip.
      const permanen = err.status === 404 || err.status === 401 || err.status === 403;
      on.error?.(err.message);
      if (permanen) { on.ended?.(err.message); return; }
      on.reconnecting?.(jedaSambungUlang);
      setTimeout(sambung, jedaSambungUlang);
      jedaSambungUlang = Math.min(jedaSambungUlang * 2, SAMBUNG_ULANG_MAKS_MS);
      return;
    }
    if (ditutup) return;

    socket = new WebSocket(wsUrl());

    socket.onopen = () => {
      jedaSambungUlang = 1000;
      sampel = [];
      kirim('hello', { ticket });
      for (let i = 0; i < SAMPEL_AWAL; i++) setTimeout(ping, i * 120);
      clearInterval(pingTimer);
      pingTimer = setInterval(ping, PING_TIAP_MS);
    };

    socket.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }

      if (msg.type === 'pong') {
        const t2 = Date.now();
        const rtt = t2 - msg.t0;
        sampel.push({ offset: clockOffset(msg.t0, msg.tS, t2), rtt });
        // Sampel dengan perjalanan tersingkat paling sedikit terganggu antrean.
        offset = sampel.reduce((a, b) => (b.rtt < a.rtt ? b : a)).offset;
        if (sampel.length > 8) sampel = sampel.slice(-8);
        return;
      }

      if (msg.type === 'welcome') {
        offset = msg.serverTime - Date.now();
        on.welcome?.(msg);
        return;
      }
      if (msg.type === 'state') { on.state?.(msg); return; }
      if (msg.type === 'peers') { on.peers?.(msg); return; }
      if (msg.type === 'chat') { on.chat?.(msg.message); return; }
      if (msg.type === 'speaking') { on.speaking?.(msg.id, !!msg.on); return; }
      if (msg.type === 'rtc') { on.rtc?.(msg); return; }
      if (msg.type === 'peer-left') { on.peerLeft?.(msg.id); return; }
      if (msg.type === 'host-away') { on.hostAway?.(msg); return; }
      if (msg.type === 'ended') { ditutup = true; on.ended?.(msg.reason); return; }
      if (msg.type === 'error') { on.error?.(msg.message); return; }
    };

    socket.onclose = () => {
      clearInterval(pingTimer);
      if (ditutup) return;
      // Backend dimulai ulang tiap pukul 04:00, jadi putus sambungan adalah
      // hal yang wajar — bukan kegagalan. Coba lagi dengan jeda bertambah.
      on.reconnecting?.(jedaSambungUlang);
      setTimeout(sambung, jedaSambungUlang);
      jedaSambungUlang = Math.min(jedaSambungUlang * 2, SAMBUNG_ULANG_MAKS_MS);
    };

    socket.onerror = () => { /* onclose menyusul; tidak perlu ditangani dua kali */ };
  };

  sambung();

  return {
    serverNow,
    getOffset: () => offset,
    sendState: (playing, position) => kirim('state', { playing, position }),
    sendChat: (text) => kirim('chat', { text }),
    sendVoice: (on_) => kirim('voice', { on: on_ }),
    /** Hanya tuan rumah. Menutup ruang untuk semua orang, tidak bisa dibatalkan. */
    sendEnd: () => kirim('end', {}),
    sendMic: (on_) => kirim('mic', { on: on_ }),
    /** Mikrofon terbuka tapi ditahan — beda arti dari mikrofon yang mati. */
    sendMute: (on_) => kirim('mute', { on: on_ }),
    sendDeafen: (on_) => kirim('deafen', { on: on_ }),
    /** Penanda bicara untuk peserta lain. Dikirim hanya saat berubah. */
    sendSpeaking: (on_) => kirim('speaking', { on: on_ }),
    /** Amplop sinyal WebRTC; isinya tidak dibaca server. */
    sendRtc: (to, kind, data) => kirim('rtc', { to, kind, data }),
    close: () => {
      ditutup = true;
      clearInterval(pingTimer);
      try { kirim('bye'); socket?.close(1000, 'bye'); } catch { /* sudah tertutup */ }
    },
  };
}
