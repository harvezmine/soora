import { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const PASS_KEY = 'soora_admin_pass';

const fmtDuration = (s) => {
  if (!s) return '0m';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 24) { const d = Math.floor(h / 24); return `${d}h ${h % 24}j`; }
  if (h) return `${h}j ${m}m`;
  return `${m}m`;
};

const fmtAgo = (ts) => {
  if (!ts) return 'belum pernah';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m}m lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j lalu`;
  const d = Math.floor(h / 24);
  return `${d}h lalu`;
};

const fmtDate = (ts) => {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return '—'; }
};

const isOnline = (lastSeen) => lastSeen && Date.now() - lastSeen < 2 * 60 * 1000;

export default function Admin() {
  const [pass, setPass] = useState(() => sessionStorage.getItem(PASS_KEY) || '');
  const [authed, setAuthed] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('lastSeen');

  const load = useCallback(async (p) => {
    setLoading(true); setError('');
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

  // auto-refresh every 30s while viewing
  useEffect(() => {
    if (!authed || !pass) return;
    const t = setInterval(() => load(pass), 30000);
    return () => clearInterval(t);
  }, [authed, pass, load]);

  const submit = (e) => { e.preventDefault(); if (input.trim()) load(input.trim()); };

  // ── Password gate ──
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
          <input
            type="password"
            className="admin-gate-input"
            placeholder="Password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
          />
          {error && <div className="admin-gate-error">{error}</div>}
          <button type="submit" className="admin-gate-btn" disabled={loading}>
            {loading ? 'Memeriksa…' : 'Masuk'}
          </button>
        </form>
      </div>
    );
  }

  const s = data?.summary || {};
  const users = (data?.users || [])
    .filter((u) => !query || (u.name || '').toLowerCase().includes(query.toLowerCase()) || (u.email || '').toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sort === 'time') return (b.totalSeconds || 0) - (a.totalSeconds || 0);
      if (sort === 'created') return (b.createdAt || 0) - (a.createdAt || 0);
      return (b.lastSeen || 0) - (a.lastSeen || 0); // lastSeen default
    });

  const STATS = [
    { label: 'Total User', value: s.totalUsers ?? 0, accent: '#7c5cfc' },
    { label: 'Online Sekarang', value: s.online ?? 0, accent: '#22c55e', dot: true },
    { label: 'Aktif Hari Ini', value: s.activeToday ?? 0, accent: '#3b82f6' },
    { label: 'Aktif Minggu Ini', value: s.activeWeek ?? 0, accent: '#06b6d4' },
    { label: 'Total Waktu Tonton', value: fmtDuration(s.totalWatchSeconds), accent: '#f59e0b', isText: true },
    { label: 'User Baru Hari Ini', value: s.newToday ?? 0, accent: '#ec4899' },
    { label: 'Login Google', value: s.googleUsers ?? 0, accent: '#ef4444' },
    { label: 'Login Email', value: s.emailUsers ?? 0, accent: '#8b5cf6' },
  ];

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <h1 className="admin-h1">
            <span className="admin-live-dot" /> Soora Monitoring
          </h1>
          <p className="admin-subtitle">Auto-refresh tiap 30 detik · {users.length} user ditampilkan</p>
        </div>
        <button className="admin-refresh" onClick={() => load(pass)} disabled={loading} aria-label="Refresh">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" className={loading ? 'spin' : ''}>
            <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
          Refresh
        </button>
      </header>

      <div className="admin-stats-grid">
        {STATS.map((st) => (
          <div className="admin-stat-card" key={st.label} style={{ '--stat-accent': st.accent }}>
            <span className="admin-stat-label">{st.label}</span>
            <span className="admin-stat-value">
              {st.dot && st.value > 0 && <span className="admin-online-dot" />}
              {st.value}
            </span>
          </div>
        ))}
      </div>

      <div className="admin-toolbar">
        <div className="admin-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          <input placeholder="Cari nama / email…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="admin-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="lastSeen">Terakhir aktif</option>
          <option value="time">Waktu tonton</option>
          <option value="created">Terbaru daftar</option>
          <option value="name">Nama A–Z</option>
        </select>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Status</th>
              <th>Waktu di Soora</th>
              <th>Sesi</th>
              <th>List / Progress / Riwayat</th>
              <th>Terakhir buka</th>
              <th>Daftar</th>
              <th>Login</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="admin-user-cell">
                    <img src={u.avatar} alt="" referrerPolicy="no-referrer" onError={(e) => { e.target.style.visibility = 'hidden'; }} />
                    <div>
                      <div className="admin-user-name">{u.name}</div>
                      <div className="admin-user-email">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td>
                  {isOnline(u.lastSeen)
                    ? <span className="admin-badge online"><span className="admin-online-dot" /> Online</span>
                    : <span className="admin-badge offline">{fmtAgo(u.lastSeen)}</span>}
                </td>
                <td className="admin-num">{fmtDuration(u.totalSeconds)}</td>
                <td className="admin-num">{u.sessions || 0}</td>
                <td className="admin-num">{u.mylistCount} / {u.progressCount} / {u.historyCount}</td>
                <td className="admin-path" title={u.lastPath}>{u.lastPath || '—'}</td>
                <td>{fmtDate(u.createdAt)}</td>
                <td>
                  <span className={`admin-provider ${u.provider}`}>{u.provider === 'google' ? 'Google' : 'Email'}</span>
                </td>
              </tr>
            ))}
            {!users.length && (
              <tr><td colSpan={8} className="admin-empty">Tidak ada user{query ? ' cocok pencarian' : ''}.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
