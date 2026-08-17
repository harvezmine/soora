/**
 * Aturan nonton bareng yang murni — tanpa Redis, tanpa soket.
 *
 * Dipisahkan supaya bisa diuji sendiri: perhitungan posisi dan ambang koreksi
 * adalah bagian yang paling mudah salah, dan tak satu pun butuh jaringan.
 */

/** Umur ruang sejak aktivitas terakhir. */
export const ROOM_TTL_SEC = 6 * 60 * 60;

/** Tenggang setelah tuan rumah terputus sebelum ruang ditutup. */
export const HOST_GRACE_MS = 90_000;

/** Karcis WebSocket berumur pendek dan sekali pakai. */
export const TICKET_TTL_SEC = 30;

export const MAX_PEERS = 20;

/** Denyut keadaan dari tuan rumah, supaya yang baru masuk tidak menunggu. */
export const STATE_HEARTBEAT_MS = 5_000;

export class RoomError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = 'RoomError';
  }
}

export interface Room {
  id: string;
  hostId: string;
  hostName: string;
  /** kunci konten, mis. "movie:1315772" — sama seperti progress dan komentar */
  contentKey: string;
  /** alamat halaman tonton, supaya tamu mendarat di judul & episode yang sama */
  watchPath: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

/** Keadaan pemutar. Hidup di memori proses, tidak ditulis ke Redis. */
export interface PlayerState {
  playing: boolean;
  /** detik ke berapa, pada saat `at` */
  position: number;
  /** waktu server saat keadaan ini benar */
  at: number;
}

/**
 * Kunci konten dipakai apa adanya sebagai bagian kunci Redis, jadi bentuknya
 * dibatasi — sama seperti pada komentar.
 */
export function assertValidContentKey(key: string): string {
  const k = String(key || '').trim();
  if (!/^[a-z]+:[A-Za-z0-9._~:/-]{1,120}$/.test(k)) {
    throw new RoomError('Kunci konten tidak valid');
  }
  return k;
}

/**
 * Alamat halaman tonton harus berupa path internal. Menerima URL penuh akan
 * mengubah tautan undangan jadi alat pengalihan ke situs mana pun.
 */
export function assertValidWatchPath(path: string): string {
  const p = String(path || '').trim();
  if (!p.startsWith('/watch/') || p.includes('//') || p.length > 400) {
    throw new RoomError('Alamat tonton tidak valid');
  }
  return p;
}

/** Hanya pemilik ruang yang boleh mengubah keadaan. Dijaga di server. */
export function canControl(room: Pick<Room, 'hostId'>, userId: string): boolean {
  return !!userId && room.hostId === userId;
}

/**
 * Posisi yang seharusnya sekarang, dihitung dari keadaan terakhir yang
 * disiarkan. Saat berjalan, waktu yang lewat sejak `at` ikut ditambahkan;
 * saat dijeda, posisinya diam.
 */
export function projectPosition(state: PlayerState, serverNow: number): number {
  if (!state.playing) return Math.max(0, state.position);
  const lewat = Math.max(0, serverNow - state.at) / 1000;
  return Math.max(0, state.position + lewat);
}

export type DriftAction = 'ignore' | 'nudge-ahead' | 'nudge-behind' | 'seek';

/** Ambang koreksi. Di bawah setengah detik tidak terasa; di atas dua detik
 *  terlalu jauh untuk dikejar diam-diam. */
export const DRIFT_IGNORE_SEC = 0.5;
export const DRIFT_SEEK_SEC = 2;

/**
 * Tindakan untuk selisih tertentu.
 * `drift` positif berarti tamu tertinggal dan perlu mengejar.
 */
export function driftAction(drift: number): DriftAction {
  const besar = Math.abs(drift);
  if (!Number.isFinite(drift) || besar < DRIFT_IGNORE_SEC) return 'ignore';
  if (besar > DRIFT_SEEK_SEC) return 'seek';
  return drift > 0 ? 'nudge-ahead' : 'nudge-behind';
}

/** Kecepatan putar untuk mengejar tanpa lompatan yang terlihat. */
export function playbackRateFor(action: DriftAction): number {
  if (action === 'nudge-ahead') return 1.05;
  if (action === 'nudge-behind') return 0.95;
  return 1;
}

/**
 * Selisih jam klien terhadap server, cara NTP.
 * t0 = klien mengirim, tS = waktu server, t2 = balasan tiba di klien.
 */
export function clockOffset(t0: number, tS: number, t2: number): number {
  return tS - (t0 + t2) / 2;
}

/**
 * Dari beberapa sampel, pakai yang perjalanan pulang-perginya paling singkat —
 * sampel itu yang paling sedikit terganggu antrean jaringan.
 */
export function bestOffset(samples: Array<{ offset: number; rtt: number }>): number {
  if (!samples.length) return 0;
  return samples.reduce((a, b) => (b.rtt < a.rtt ? b : a)).offset;
}

/** Keadaan dari tuan rumah dibersihkan sebelum disiarkan. */
export function sanitizeState(raw: any, serverNow: number): PlayerState {
  const position = Number(raw?.position);
  return {
    playing: !!raw?.playing,
    position: Number.isFinite(position) && position >= 0 ? position : 0,
    at: serverNow,
  };
}
