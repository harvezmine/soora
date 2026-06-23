import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMyList } from '../utils/mylist';
import { getProgressList, removeProgress } from '../utils/progress';

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirm, setConfirm] = useState(null); // 'clear-progress' | null

  const counts = useMemo(() => {
    const list = getMyList();
    const prog = getProgressList();
    const by = (arr, key, val) => arr.filter((i) => i[key] === val).length;
    return {
      listAnime: by(list, 'listType', 'anime'),
      listMovie: by(list, 'listType', 'movie'),
      listManga: by(list, 'listType', 'manga'),
      listTotal: list.length,
      contAnime: by(prog, 'section', 'anime'),
      contMovie: by(prog, 'section', 'movie'),
      contManga: by(prog, 'section', 'manga'),
      contTotal: prog.length,
    };
  }, [refreshKey]);

  if (!user) return null;

  const initials = (user.name || '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const handleLogout = () => { logout(); navigate('/anime'); };

  const clearProgress = () => {
    getProgressList().forEach((p) => removeProgress(p.section, p.id));
    setConfirm(null);
    setRefreshKey((k) => k + 1);
  };

  const QUICK = [
    { label: 'My List Anime', value: counts.listAnime, path: '/anime/mylist', accent: '#7c5cfc' },
    { label: 'My List Film', value: counts.listMovie, path: '/movies/mylist', accent: '#ff6b9d' },
    { label: 'My List Manga', value: counts.listManga, path: '/manga/mylist', accent: '#00d4aa' },
    { label: 'Lanjutkan Nonton', value: counts.contAnime + counts.contMovie + counts.contManga, path: '/anime', accent: '#f59e0b' },
  ];

  return (
    <div className="profile-page">
      <div className="profile-hero">
        <div className="profile-hero-bg" />
        <div className="profile-hero-inner">
          {user.avatar ? (
            <img className="profile-avatar" src={user.avatar} alt={user.name} referrerPolicy="no-referrer" />
          ) : (
            <div className="profile-avatar profile-avatar-fallback">{initials}</div>
          )}
          <div className="profile-id">
            <h1 className="profile-name">{user.name}</h1>
            <p className="profile-email">{user.email}</p>
            <div className="profile-hero-stats">
              <span><b>{counts.listTotal}</b> di My List</span>
              <span className="profile-stat-dot" aria-hidden="true">•</span>
              <span><b>{counts.contTotal}</b> sedang ditonton</span>
            </div>
          </div>
        </div>
      </div>

      <div className="profile-section">
        <h2 className="profile-section-title">Aktivitas</h2>
        <div className="profile-quick-grid">
          {QUICK.map((q) => (
            <button className="profile-quick" key={q.label} onClick={() => navigate(q.path)} style={{ '--q-accent': q.accent }}>
              <span className="profile-quick-value">{q.value}</span>
              <span className="profile-quick-label">{q.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="profile-section">
        <h2 className="profile-section-title">Pustaka</h2>
        <div className="profile-rows">
          <button className="profile-row" onClick={() => navigate('/anime/mylist')}>
            <span className="profile-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
            </span>
            <span className="profile-row-label">My List Anime</span>
            <span className="profile-row-count">{counts.listAnime}</span>
            <svg className="profile-row-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="m9 18 6-6-6-6" /></svg>
          </button>
          <button className="profile-row" onClick={() => navigate('/movies/mylist')}>
            <span className="profile-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="m10 8 5 3-5 3z" /></svg>
            </span>
            <span className="profile-row-label">My List Film</span>
            <span className="profile-row-count">{counts.listMovie}</span>
            <svg className="profile-row-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="m9 18 6-6-6-6" /></svg>
          </button>
          <button className="profile-row" onClick={() => navigate('/manga/mylist')}>
            <span className="profile-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
            </span>
            <span className="profile-row-label">My List Manga</span>
            <span className="profile-row-count">{counts.listManga}</span>
            <svg className="profile-row-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
      </div>

      <div className="profile-section">
        <h2 className="profile-section-title">Pengaturan</h2>
        <div className="profile-rows">
          {confirm === 'clear-progress' ? (
            <div className="profile-confirm">
              <div className="profile-confirm-text">
                Hapus semua riwayat &ldquo;Lanjutkan Nonton&rdquo; ({counts.contTotal})? Tindakan ini tidak bisa dibatalkan.
              </div>
              <div className="profile-confirm-actions">
                <button className="profile-confirm-cancel" onClick={() => setConfirm(null)}>Batal</button>
                <button className="profile-confirm-ok" onClick={clearProgress}>Hapus</button>
              </div>
            </div>
          ) : (
            <button
              className="profile-row danger"
              onClick={() => setConfirm('clear-progress')}
              disabled={counts.contTotal === 0}
            >
              <span className="profile-row-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
              </span>
              <span className="profile-row-label">Hapus Lanjutkan Nonton</span>
              <span className="profile-row-count">{counts.contTotal}</span>
            </button>
          )}
        </div>
      </div>

      <div className="profile-section">
        <h2 className="profile-section-title">Akun</h2>
        <div className="profile-rows">
          <button className="profile-row danger" onClick={handleLogout}>
            <span className="profile-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            </span>
            <span className="profile-row-label">Keluar</span>
          </button>
        </div>
      </div>

      <p className="profile-footer">soora · v1</p>
    </div>
  );
}
