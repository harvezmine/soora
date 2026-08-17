/**
 * Aturan komentar yang murni — tanpa Redis, tanpa jaringan.
 *
 * Dipisahkan dari services/comments.ts supaya bisa diuji sendiri: mengimpor
 * comments.ts ikut membuka koneksi Redis, dan aturan seperti panjang teks
 * atau kedalaman balasan tidak butuh itu sama sekali.
 */

export const MAX_TEXT = 1000;

/** Balasan hanya satu tingkat: balasan tidak bisa dibalas lagi. */
export const REPLY_DEPTH = 1;

export class CommentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = 'CommentError';
  }
}

/**
 * Kunci konten dipakai langsung sebagai bagian kunci Redis, jadi bentuknya
 * dibatasi ketat: "<section>:<id>" dengan id hanya berisi karakter aman.
 */
export function assertValidKey(key: string): string {
  const k = String(key || '').trim();
  if (!/^[a-z]+:[A-Za-z0-9._~:/-]{1,120}$/.test(k)) {
    throw new CommentError('Kunci konten tidak valid');
  }
  return k;
}

/**
 * Rapikan teks komentar: samakan akhir baris, buang karakter kendali
 * (baris baru dan tab tetap), padatkan baris kosong beruntun, lalu periksa
 * panjangnya.
 */
export function normalizeText(raw: unknown): string {
  const text = String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) throw new CommentError('Komentar tidak boleh kosong');
  if (text.length > MAX_TEXT) {
    throw new CommentError(`Komentar maksimal ${MAX_TEXT} karakter`);
  }
  return text;
}

/** Bentuk minimal komentar induk yang dibutuhkan untuk menentukan kedalaman. */
export interface ParentLike {
  id: string;
  key: string;
  parentId: string | null;
}

/**
 * Tentukan induk sebuah balasan.
 *
 * Membalas komentar utama → menempel padanya. Membalas sebuah balasan →
 * tetap menempel ke komentar utama yang sama, bukan membentuk tingkat
 * ketiga. Dengan begitu utas tidak pernah lebih dalam dari satu tingkat
 * walau antarmuka mengirim id balasan.
 */
export function resolveParentId(parent: ParentLike, contentKey: string): string {
  if (parent.key !== contentKey) {
    throw new CommentError('Komentar yang dibalas milik judul lain');
  }
  if (!parent.parentId) return parent.id;
  if (REPLY_DEPTH < 2) return parent.parentId;
  throw new CommentError('Balasan tidak bisa dibalas lagi');
}
