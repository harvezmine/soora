import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  fetchComments,
  fetchReplies,
  postComment,
  deleteComment as apiDeleteComment,
  reportComment as apiReportComment,
} from '@soora/core/comments';
import { isLoggedIn } from '@soora/core/user';
import { useAuth } from '../context/AuthContext';

const MAX_TEXT = 1000;

/* ── Waktu relatif, bahasa Indonesia ── */
const MENIT = 60_000;
const JAM = 60 * MENIT;
const HARI = 24 * JAM;

function waktuRelatif(ts) {
  const selisih = Date.now() - ts;
  if (selisih < MENIT) return 'baru saja';
  if (selisih < JAM) return `${Math.floor(selisih / MENIT)} menit lalu`;
  if (selisih < HARI) return `${Math.floor(selisih / JAM)} jam lalu`;
  if (selisih < 2 * HARI) return 'kemarin';
  if (selisih < 7 * HARI) return `${Math.floor(selisih / HARI)} hari lalu`;
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

const inisial = (nama) => (nama || '?').trim().charAt(0).toUpperCase();

/* ── Satu komentar ── */
function CommentItem({ comment, currentUserId, onReply, onDelete, onReport, children }) {
  const milikSendiri = currentUserId && comment.userId === currentUserId;

  if (comment.deleted) {
    return (
      <div className="cmt-item cmt-item-deleted">
        <div className="cmt-avatar cmt-avatar-ghost" aria-hidden="true" />
        <div className="cmt-body">
          <p className="cmt-text cmt-text-deleted">Komentar dihapus</p>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="cmt-item">
      {comment.avatar
        ? <img className="cmt-avatar" src={comment.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" />
        : <div className="cmt-avatar cmt-avatar-fallback" aria-hidden="true">{inisial(comment.name)}</div>}
      <div className="cmt-body">
        <div className="cmt-head">
          <span className="cmt-name">{comment.name}</span>
          <span className="cmt-time">{waktuRelatif(comment.createdAt)}</span>
        </div>
        <p className="cmt-text">{comment.text}</p>
        <div className="cmt-actions">
          {onReply && (
            <button className="cmt-action" onClick={() => onReply(comment)}>Balas</button>
          )}
          {milikSendiri
            ? <button className="cmt-action cmt-action-danger" onClick={() => onDelete(comment)}>Hapus</button>
            : <button className="cmt-action" onClick={() => onReport(comment)}>Laporkan</button>}
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Kotak tulis ── */
function CommentForm({ placeholder, autoFocus, submitting, onSubmit, onCancel, formRef }) {
  const [text, setText] = useState('');
  const areaRef = useRef(null);

  useEffect(() => {
    if (autoFocus) areaRef.current?.focus();
  }, [autoFocus]);

  const kirim = (e) => {
    e.preventDefault();
    const isi = text.trim();
    if (!isi || submitting) return;
    onSubmit(isi, () => setText(''));
  };

  const sisa = MAX_TEXT - text.length;

  return (
    <form className="cmt-form" onSubmit={kirim} ref={formRef}>
      <textarea
        ref={areaRef}
        className="cmt-input"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
        placeholder={placeholder}
        rows={text ? 3 : 1}
        aria-label={placeholder}
      />
      {(text || onCancel) && (
        <div className="cmt-form-foot">
          <span className={`cmt-counter ${sisa < 100 ? 'cmt-counter-warn' : ''}`}>
            {sisa < 100 ? `${sisa} karakter tersisa` : ''}
          </span>
          <div className="cmt-form-btns">
            {onCancel && (
              <button type="button" className="cmt-btn-text" onClick={onCancel}>Batal</button>
            )}
            <button type="submit" className="btn-primary cmt-submit" disabled={!text.trim() || submitting}>
              {submitting ? 'Mengirim...' : 'Kirim'}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

/* ── Kerangka muat ── */
function CommentSkeleton() {
  return (
    <div className="cmt-skeleton">
      {[0, 1, 2].map((i) => (
        <div className="cmt-item" key={i}>
          <div className="skel-shimmer cmt-avatar" />
          <div className="cmt-body" style={{ flex: 1 }}>
            <div className="skel-shimmer cmt-skel-line" style={{ width: '30%' }} />
            <div className="skel-shimmer cmt-skel-line" style={{ width: `${90 - i * 15}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Kolom komentar untuk satu judul.
 *
 * `contentKey` memakai konvensi yang sama dengan progress: "<bagian>:<id>",
 * mis. "movie:1315772". Komentar menempel di judul, bukan per episode.
 */
export default function CommentSection({ contentKey }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const masuk = isLoggedIn();

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [replies, setReplies] = useState({});   // id induk -> daftar balasan
  const [expanded, setExpanded] = useState({}); // id induk -> balasan terbuka?
  const formRef = useRef(null);

  /* Muat halaman pertama.
     Pemanggil memasang key={contentKey}, jadi pindah judul me-mount ulang
     komponen ini dan seluruh keadaan kembali ke awal dengan sendirinya —
     tidak perlu menyetel ulang state di dalam efek. */
  useEffect(() => {
    if (!contentKey) return;
    let batal = false;
    fetchComments(contentKey)
      .then((d) => {
        if (batal) return;
        setItems(d.items || []);
        setTotal(d.total || 0);
        setCursor(d.nextCursor || null);
      })
      .catch((e) => { if (!batal) setError(e.message); })
      .finally(() => { if (!batal) setLoading(false); });
    return () => { batal = true; };
  }, [contentKey]);

  const muatLagi = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const d = await fetchComments(contentKey, { cursor });
      setItems((prev) => [...prev, ...(d.items || [])]);
      setTotal(d.total || 0);
      setCursor(d.nextCursor || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  }, [contentKey, cursor, loadingMore]);

  const bukaBalasan = useCallback(async (induk) => {
    const sudahTerbuka = expanded[induk.id];
    setExpanded((p) => ({ ...p, [induk.id]: !sudahTerbuka }));
    if (sudahTerbuka || replies[induk.id]) return;
    try {
      const daftar = await fetchReplies(induk.id);
      setReplies((p) => ({ ...p, [induk.id]: daftar }));
    } catch (e) {
      setError(e.message);
    }
  }, [expanded, replies]);

  const kirim = useCallback(async (text, reset) => {
    if (!masuk) return;
    setSubmitting(true);
    setError(null);
    const indukId = replyTo?.parentId || replyTo?.id || null;
    try {
      const dibuat = await postComment({ key: contentKey, text, parentId: indukId });
      reset();
      if (indukId) {
        setReplies((p) => ({ ...p, [indukId]: [...(p[indukId] || []), dibuat] }));
        setExpanded((p) => ({ ...p, [indukId]: true }));
        setItems((p) => p.map((c) => (c.id === indukId ? { ...c, replyCount: (c.replyCount || 0) + 1 } : c)));
        setReplyTo(null);
      } else {
        setItems((p) => [dibuat, ...p]);
        setTotal((t) => t + 1);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }, [contentKey, masuk, replyTo]);

  const hapus = useCallback(async (comment) => {
    if (!window.confirm('Hapus komentar ini?')) return;
    try {
      const res = await apiDeleteComment(comment.id);
      if (comment.parentId) {
        setReplies((p) => ({
          ...p,
          [comment.parentId]: (p[comment.parentId] || []).filter((r) => r.id !== comment.id),
        }));
        setItems((p) => p.map((c) => (
          c.id === comment.parentId ? { ...c, replyCount: Math.max(0, (c.replyCount || 1) - 1) } : c
        )));
      } else if (res?.comment) {
        // Masih punya balasan — simpulnya tetap ada sebagai penanda.
        setItems((p) => p.map((c) => (c.id === comment.id ? { ...c, ...res.comment } : c)));
      } else {
        setItems((p) => p.filter((c) => c.id !== comment.id));
        setTotal((t) => Math.max(0, t - 1));
      }
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const laporkan = useCallback(async (comment) => {
    if (!masuk) {
      navigate('/login', { state: { from: location.pathname + location.search } });
      return;
    }
    const alasan = window.prompt('Kenapa komentar ini dilaporkan? (opsional)') ?? null;
    if (alasan === null) return;
    try {
      await apiReportComment(comment.id, alasan);
      setError('Laporan terkirim. Terima kasih.');
    } catch (e) {
      setError(e.message);
    }
  }, [masuk, navigate, location]);

  const mulaiBalas = useCallback((comment) => {
    if (!masuk) {
      navigate('/login', { state: { from: location.pathname + location.search } });
      return;
    }
    setReplyTo(comment);
  }, [masuk, navigate, location]);

  if (!contentKey) return null;

  return (
    <section className="cmt-section" aria-labelledby="cmt-heading">
      <h2 className="cmt-heading section-title" id="cmt-heading">
        Komentar
        {/* Angka kecil sengaja disembunyikan: "1" terbaca sepi, kosong terbaca netral. */}
        {total >= 5 && <span className="cmt-count">{total.toLocaleString('id-ID')}</span>}
      </h2>

      {masuk ? (
        <div className="cmt-compose">
          {replyTo && (
            <div className="cmt-replying">
              Membalas <strong>{replyTo.name}</strong>
              <button className="cmt-btn-text" onClick={() => setReplyTo(null)}>batal</button>
            </div>
          )}
          <div className="cmt-compose-row">
            {user?.avatar
              ? <img className="cmt-avatar" src={user.avatar} alt="" referrerPolicy="no-referrer" />
              : <div className="cmt-avatar cmt-avatar-fallback" aria-hidden="true">{inisial(user?.name)}</div>}
            <CommentForm
              formRef={formRef}
              placeholder={replyTo ? `Balas ${replyTo.name}...` : 'Tulis komentar...'}
              autoFocus={!!replyTo}
              submitting={submitting}
              onSubmit={kirim}
              onCancel={replyTo ? () => setReplyTo(null) : null}
            />
          </div>
        </div>
      ) : (
        <button
          className="cmt-login-cta"
          onClick={() => navigate('/login', { state: { from: location.pathname + location.search } })}
        >
          Masuk untuk ikut berkomentar
        </button>
      )}

      {error && (
        <p className="cmt-error" role="status" aria-live="polite">{error}</p>
      )}

      <div className="cmt-list" aria-live="polite">
        {loading ? (
          <CommentSkeleton />
        ) : items.length === 0 ? (
          <p className="cmt-empty">Belum ada yang bahas ini. Mulai obrolannya 👋</p>
        ) : (
          items.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              currentUserId={user?.id}
              onReply={mulaiBalas}
              onDelete={hapus}
              onReport={laporkan}
            >
              {c.replyCount > 0 && (
                <button className="cmt-toggle-replies" onClick={() => bukaBalasan(c)}>
                  {expanded[c.id] ? 'Sembunyikan balasan' : `Lihat ${c.replyCount} balasan`}
                </button>
              )}
              {expanded[c.id] && (
                <div className="cmt-replies">
                  {(replies[c.id] || []).map((r) => (
                    <CommentItem
                      key={r.id}
                      comment={r}
                      currentUserId={user?.id}
                      onReply={mulaiBalas}
                      onDelete={hapus}
                      onReport={laporkan}
                    />
                  ))}
                </div>
              )}
            </CommentItem>
          ))
        )}
      </div>

      {cursor && !loading && (
        <button className="cmt-more" onClick={muatLagi} disabled={loadingMore}>
          {loadingMore ? 'Memuat...' : 'Muat lebih banyak'}
        </button>
      )}
    </section>
  );
}
