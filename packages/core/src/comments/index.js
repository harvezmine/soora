// Klien komentar.
//
// Sengaja tidak memakai helper di ../user: helper itu menelan galat dan
// mengembalikan null saat belum masuk. Komentar butuh sebaliknya — membaca
// harus jalan untuk tamu, dan saat menulis gagal pesan dari server (batas
// laju, komentar kembar, akun diblokir) harus sampai ke pengguna.
import { getRuntime } from '../runtime.js';
import { getToken } from '../user/index.js';

/** Galat yang membawa pesan dari server apa adanya. */
export class CommentRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'CommentRequestError';
    this.status = status;
  }
}

async function call(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (!token) throw new CommentRequestError('Masuk dulu untuk ikut berkomentar', 401);
    headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${getRuntime().apiBase}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new CommentRequestError('Jaringan bermasalah. Coba lagi.', 0);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new CommentRequestError(data?.error || 'Gagal memproses komentar', res.status);
  }
  return data;
}

/**
 * Kunci konten memakai konvensi yang sama dengan progress: "<bagian>:<id>".
 * Komentar menempel di judul, jadi musim/episode tidak ikut.
 */
export const commentKey = (section, id) => `${section}:${id}`;

export const fetchComments = (key, { cursor, limit } = {}) => {
  const q = new URLSearchParams({ key });
  if (cursor) q.set('cursor', String(cursor));
  if (limit) q.set('limit', String(limit));
  return call(`/comments?${q.toString()}`);
};

export const fetchReplies = (id) =>
  call(`/comments/${encodeURIComponent(id)}/replies`).then((d) => d?.items || []);

export const postComment = ({ key, text, parentId }) =>
  call('/comments', { method: 'POST', auth: true, body: { key, text, parentId: parentId || null } })
    .then((d) => d?.comment);

export const deleteComment = (id) =>
  call(`/comments/${encodeURIComponent(id)}/delete`, { method: 'POST', auth: true });

export const reportComment = (id, reason) =>
  call(`/comments/${encodeURIComponent(id)}/report`, { method: 'POST', auth: true, body: { reason } });
