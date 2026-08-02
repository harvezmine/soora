import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const PASS_KEY = 'soora_admin_pass';

/* ── formatters ── */
const fmtDuration = (s) => {
  if (!s) return '0m';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 24) { const d = Math.floor(h / 24); return `${d}h ${h % 24}j`; }
  if (h) return `${h}j ${m}m`;
  if (m) return `${m}m`;
  return `${s}d`;
};
const fmtAgo = (ts) => {
  if (!ts) return 'belum pernah';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m}m lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j lalu`;
  return `${Math.floor(h / 24)}h lalu`;
};
const fmtDate = (ts) => {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return '—'; }
};
const dayLabel = (iso) => {
  try { return new Date(iso + 'T00:00').toLocaleDateString('id-ID', { weekday: 'short' }); } catch { return ''; }
};

/* ════ tiny inline SVG charts (no chart lib — keeps bundle lean) ════ */
function AreaChart({ data, accent = '#7c5cfc' }) {
  const W = 320, H = 90, P = 6;
  const max = Math.max(1, ...data.map((d) => d.count));
  const step = data.length > 1 ? (W - P * 2) / (data.length - 1) : 0;
  const pts = data.map((d, i) => [P + i * step, H - P - (d.count / max) * (H - P * 2)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${H - P} L${pts[0][0].toFixed(1)},${H - P} Z`;
  const id = `ag-${accent.replace('#', '')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="admin-area" preserveAspectRatio="none" role="img" aria-label="Pendaftaran 7 hari">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill={accent} />)}
    </svg>
  );
}

function Donut({ segments, size = 132 }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = size / 2 - 12, c = 2 * Math.PI * r, cx = size / 2;
  let off = 0;
  return (
    <div className="admin-donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="admin-donut">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" />
        {total > 0 && segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = <circle key={i} cx={cx} cy={cx} r={r} fill="none" stroke={s.color} strokeWidth="12"
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cx})`} />;
          off += len;
          return el;
        })}
        <text x="50%" y="46%" textAnchor="middle" className="admin-donut-num">{total}</text>
        <text x="50%" y="62%" textAnchor="middle" className="admin-donut-cap">total</text>
      </svg>
      <div className="admin-donut-legend">
        {segments.map((s) => (
          <div className="admin-legend-item" key={s.label}>
            <span className="admin-legend-dot" style={{ background: s.color }} />
            <span className="admin-legend-label">{s.label}</span>
            <span className="admin-legend-val">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarList({ items, accent = '#7c5cfc' }) {
  const max = Math.max(1, ...items.map((i) => i.totalSeconds));
  if (!items.length || max <= 1) return <div className="admin-bars-empty">Belum ada data waktu tonton.</div>;
  return (
    <div className="admin-bars">
      {items.map((u, i) => (
        <div className="admin-bar-row" key={i}>
          <img className="admin-bar-avatar" src={u.avatar} alt="" referrerPolicy="no-referrer" onError={(e) => { e.target.style.visibility = 'hidden'; }} />
          <span className="admin-bar-name">{u.name}</span>
          <div className="admin-bar-track"><div className="admin-bar-fill" style={{ width: `${(u.totalSeconds / max) * 100}%`, background: accent }} /></div>
          <span className="admin-bar-val">{fmtDuration(u.totalSeconds)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Admin() {
  const [pass, setPass] = useState(() => sessionStorage.getItem(PASS_KEY) || '');
  const [authed, setAuthed] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('lastSeen');
  const [filter, setFilter] = useState('all'); // all | online | banned
  const [menuFor, setMenuFor] = useState(null); // user id with open action menu
  const [confirm, setConfirm] = useState(null); // { action, user }
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef(null);

  const load = useCallback(async (p, silent) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/admin/users`, { headers: { 'x-admin-pass': p } });
      if (res.status === 401) { setError('Password salah'); setAuthed(false); sessionStorage.removeItem(PASS_KEY); return; }
      if (!res.ok) throw new Error('Gagal memuat');
      const d = await res.json();
      setData(d); setAuthed(true); setPass(p); sessionStorage.setItem(PASS_KEY, p);
    } catch (e) { setError(e.message || 'Gagal memuat data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (pass) load(pass); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!authed || !pass) return;
    const t = setInterval(() => load(pass, true), 30000);
    return () => clearInterval(t);
  }, [authed, pass, load]);
  useEffect(() => {
    if (!menuFor) return;
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuFor(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menuFor]);

  const showToast = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3500); };

  const runAction = async () => {
    if (!confirm) return;
    const { action, user } = confirm;
    setBusy(true);
    const map = {
      terminate: { method: 'POST', path: `/admin/terminate/${user.id}`, ok: 'Sesi diakhiri' },
      ban: { method: 'POST', path: `/admin/ban/${user.id}`, ok: 'Akun diblokir' },
      unban: { method: 'POST', path: `/admin/unban/${user.id}`, ok: 'Blokir dicabut' },
      delete: { method: 'DELETE', path: `/admin/user/${user.id}`, ok: 'Akun dihapus' },
    };
    const cfg = map[action];
    try {
      const res = await fetch(`${API_BASE}${cfg.path}`, { method: cfg.method, headers: { 'x-admin-pass': pass } });
      if (!res.ok) throw new Error('Aksi gagal');
      showToast(`${cfg.ok}: ${user.name}`);
      setConfirm(null);
      await load(pass, true);
    } catch (e) { showToast(e.message || 'Aksi gagal', 'err'); }
    finally { setBusy(false); }
  };

  const submit = (e) => { e.preventDefault(); if (input.trim()) load(input.trim()); };

  /* ── password gate ── */
  if (!authed) {
    return (
      <div className="admin-gate">
        <form className="admin-gate-card" onSubmit={submit}>
          <div className="admin-gate-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="32" height="32">
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="admin-gate-title">Soora Monitoring</h1>
          <p className="admin-gate-sub">Masukkan password admin</p>
          <input type="password" className="admin-gate-input" placeholder="Password" value={input} onChange={(e) => setInput(e.target.value)} autoFocus />
          {error && <div className="admin-gate-error">{error}</div>}
          <button type="submit" className="admin-gate-btn" disabled={loading}>{loading ? 'Memeriksa…' : 'Masuk'}</button>
        </form>
      </div>
    );
  }

  const s = data?.summary || {};
  const allUsers = data?.users || [];
  const users = allUsers
    .filter((u) => filter === 'all' || (filter === 'online' && u.online) || (filter === 'banned' && u.banned))
    .filter((u) => !query || (u.name || '').toLowerCase().includes(query.toLowerCase()) || (u.email || '').toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sort === 'time') return (b.totalSeconds || 0) - (a.totalSeconds || 0);
      if (sort === 'created') return (b.createdAt || 0) - (a.createdAt || 0);
      return (b.lastSeen || 0) - (a.lastSeen || 0);
    });

  const HERO = [
    { label: 'Total User', value: s.totalUsers ?? 0, sub: `+${s.newWeek ?? 0} minggu ini`, accent: '#7c5cfc',
      icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></> },
    { label: 'Online Sekarang', value: s.online ?? 0, sub: 'aktif < 2 menit', accent: '#22c55e', live: true,
      icon: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></> },
    { label: 'Total Waktu Tonton', value: fmtDuration(s.totalWatchSeconds), sub: `${s.totalSessions ?? 0} sesi`, accent: '#f59e0b', text: true,
      icon: <><polygon points="5 3 19 12 5 21 5 3" /></> },
    { label: 'Rata-rata / User', value: fmtDuration(s.avgTimePerUser), sub: `sesi ~${fmtDuration(s.avgSessionSeconds)}`, accent: '#06b6d4', text: true,
      icon: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></> },
  ];

  const MINI = [
    { label: 'Aktif Hari Ini', value: s.activeToday ?? 0, accent: '#3b82f6' },
    { label: 'Aktif Minggu Ini', value: s.activeWeek ?? 0, accent: '#06b6d4' },
    { label: 'Baru Hari Ini', value: s.newToday ?? 0, accent: '#ec4899' },
    { label: 'Total Disimpan', value: s.totalSaved ?? 0, accent: '#8b5cf6' },
    { label: 'Sedang Ditonton', value: s.totalProgress ?? 0, accent: '#14b8a6' },
    { label: 'Diblokir', value: s.bannedCount ?? 0, accent: '#ef4444' },
  ];

  const sec = s.sectionTotals || { anime: 0, movie: 0, manga: 0 };

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <h1 className="admin-h1"><span className="admin-live-dot" /> Soora Monitoring</h1>
          <p className="admin-subtitle">Auto-refresh 30 detik · {allUsers.length} total user</p>
        </div>
        <button className="admin-refresh" onClick={() => load(pass)} disabled={loading} aria-label="Refresh data">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" className={loading ? 'spin' : ''}>
            <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
          Refresh
        </button>
      </header>

      {/* hero stats */}
      <div className="admin-hero-grid">
        {HERO.map((h) => (
          <div className="admin-hero-card" key={h.label} style={{ '--accent': h.accent }}>
            <div className="admin-hero-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">{h.icon}</svg></div>
            <div className="admin-hero-body">
              <span className="admin-hero-label">{h.label}</span>
              <span className="admin-hero-value">{h.live && h.value > 0 && <span className="admin-online-dot" />}{h.value}</span>
              <span className="admin-hero-sub">{h.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* mini stat chips */}
      <div className="admin-mini-grid">
        {MINI.map((m) => (
          <div className="admin-mini" key={m.label} style={{ '--accent': m.accent }}>
            <span className="admin-mini-value">{m.value}</span>
            <span className="admin-mini-label">{m.label}</span>
          </div>
        ))}
      </div>

      {/* charts */}
      <div className="admin-charts">
        <div className="admin-panel admin-panel-wide">
          <div className="admin-panel-head"><h3>Pendaftaran 7 Hari</h3><span className="admin-panel-meta">+{s.newWeek ?? 0} user</span></div>
          {s.signups7d?.length ? <AreaChart data={s.signups7d} /> : <div className="admin-bars-empty">Belum ada data.</div>}
          <div className="admin-area-labels">{(s.signups7d || []).map((d) => <span key={d.date}>{dayLabel(d.date)}</span>)}</div>
        </div>
        <div className="admin-panel">
          <div className="admin-panel-head"><h3>Metode Login</h3></div>
          <Donut segments={[
            { label: 'Google', value: s.googleUsers ?? 0, color: '#ef4444' },
            { label: 'Email', value: s.emailUsers ?? 0, color: '#8b5cf6' },
          ]} />
        </div>
        <div className="admin-panel">
          <div className="admin-panel-head"><h3>Aktivitas Section</h3></div>
          <Donut segments={[
            { label: 'Anime', value: sec.anime, color: '#7c5cfc' },
            { label: 'Film', value: sec.movie, color: '#ff6b9d' },
            { label: 'Manga', value: sec.manga, color: '#00d4aa' },
          ]} />
        </div>
        <div className="admin-panel admin-panel-wide">
          <div className="admin-panel-head"><h3>Top User · Waktu Tonton</h3></div>
          <BarList items={s.topUsers || []} accent="#f59e0b" />
        </div>
      </div>

      {/* toolbar */}
      <div className="admin-toolbar">
        <div className="admin-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          <input placeholder="Cari nama / email…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="admin-segmented" role="tablist">
          {[['all', 'Semua'], ['online', 'Online'], ['banned', 'Diblokir']].map(([k, lbl]) => (
            <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)} role="tab" aria-selected={filter === k}>{lbl}</button>
          ))}
        </div>
        <select className="admin-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Urutkan">
          <option value="lastSeen">Terakhir aktif</option>
          <option value="time">Waktu tonton</option>
          <option value="created">Terbaru daftar</option>
          <option value="name">Nama A–Z</option>
        </select>
      </div>

      {/* user table */}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th><th>Status</th><th>Waktu di Soora</th><th>Sesi</th>
              <th>List / Progress / Riwayat</th><th>Terakhir buka</th><th>Daftar</th><th>Login</th><th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.banned ? 'banned' : ''}>
                <td>
                  <div className="admin-user-cell">
                    <div className="admin-avatar-wrap">
                      <img src={u.avatar} alt="" referrerPolicy="no-referrer" onError={(e) => { e.target.style.visibility = 'hidden'; }} />
                      {u.online && <span className="admin-avatar-online" />}
                    </div>
                    <div>
                      <div className="admin-user-name">{u.name}{u.banned && <span className="admin-ban-tag">BANNED</span>}</div>
                      <div className="admin-user-email">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td>{u.online
                  ? <span className="admin-badge online"><span className="admin-online-dot" /> Online</span>
                  : <span className="admin-badge offline">{fmtAgo(u.lastSeen)}</span>}</td>
                <td className="admin-num">{fmtDuration(u.totalSeconds)}</td>
                <td className="admin-num">{u.sessions || 0}</td>
                <td className="admin-num">{u.mylistCount} / {u.progressCount} / {u.historyCount}</td>
                <td className="admin-path" title={u.lastPath}>{u.lastPath || '—'}</td>
                <td className="admin-num">{fmtDate(u.createdAt)}</td>
                <td><span className={`admin-provider ${u.provider}`}>{u.provider === 'google' ? 'Google' : 'Email'}</span></td>
                <td className="admin-actions-cell">
                  <div className="admin-row-menu" ref={menuFor === u.id ? menuRef : null}>
                    <button className="admin-kebab" onClick={() => setMenuFor(menuFor === u.id ? null : u.id)} aria-label="Aksi">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
                    </button>
                    {menuFor === u.id && (
                      <div className="admin-action-menu">
                        <button onClick={() => { setMenuFor(null); setConfirm({ action: 'terminate', user: u }); }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" /></svg>
                          Terminate Session
                        </button>
                        {u.banned ? (
                          <button onClick={() => { setMenuFor(null); setConfirm({ action: 'unban', user: u }); }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></svg>
                            Cabut Blokir
                          </button>
                        ) : (
                          <button className="warn" onClick={() => { setMenuFor(null); setConfirm({ action: 'ban', user: u }); }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></svg>
                            Ban Account
                          </button>
                        )}
                        <button className="danger" onClick={() => { setMenuFor(null); setConfirm({ action: 'delete', user: u }); }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                          Hapus Akun
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!users.length && <tr><td colSpan={9} className="admin-empty">Tidak ada user{query || filter !== 'all' ? ' cocok filter' : ''}.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* confirm modal */}
      {confirm && (
        <div className="admin-modal-overlay" onClick={() => !busy && setConfirm(null)}>
          <div className={`admin-modal ${confirm.action === 'delete' || confirm.action === 'ban' ? 'danger' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="26" height="26"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            </div>
            <h3 className="admin-modal-title">
              {confirm.action === 'terminate' && 'Akhiri sesi user?'}
              {confirm.action === 'ban' && 'Blokir akun ini?'}
              {confirm.action === 'unban' && 'Cabut blokir?'}
              {confirm.action === 'delete' && 'Hapus akun permanen?'}
            </h3>
            <p className="admin-modal-text">
              {confirm.action === 'terminate' && <>User <b>{confirm.user.name}</b> akan logout dari semua perangkat. Bisa login lagi setelahnya.</>}
              {confirm.action === 'ban' && <><b>{confirm.user.name}</b> tidak bisa login / nonton sampai blokir dicabut. Sesi aktif langsung diputus.</>}
              {confirm.action === 'unban' && <><b>{confirm.user.name}</b> bisa login & nonton lagi.</>}
              {confirm.action === 'delete' && <><b>{confirm.user.name}</b> beserta semua data (list, riwayat, progress) dihapus permanen. Tidak bisa dibatalkan.</>}
            </p>
            <div className="admin-modal-actions">
              <button className="admin-btn-ghost" onClick={() => setConfirm(null)} disabled={busy}>Batal</button>
              <button className={`admin-btn-confirm ${confirm.action === 'delete' || confirm.action === 'ban' ? 'danger' : ''}`} onClick={runAction} disabled={busy}>
                {busy ? 'Memproses…' : confirm.action === 'delete' ? 'Hapus' : confirm.action === 'ban' ? 'Blokir' : confirm.action === 'unban' ? 'Cabut' : 'Akhiri Sesi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && <div className={`admin-toast ${toast.kind}`} role="status" aria-live="polite">{toast.msg}</div>}
    </div>
  );
}
