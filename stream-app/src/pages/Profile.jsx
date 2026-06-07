import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMyList } from '../utils/mylist';
import { getProgressList } from '../utils/progress';

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
  }, []);

  if (!user) return null;

  const handleLogout = () => { logout(); navigate('/anime'); };

  const QUICK = [
    { label: 'My List Anime', value: counts.listAnime, path: '/anime/mylist', accent: '#7c5cfc' },
    { label: 'My List Film', value: counts.listMovie, path: '/movies/mylist', accent: '#ff6b9d' },
    { label: 'My List Manga', value: counts.listManga, path: '/manga/mylist', accent: '#00d4aa' },
    { label: 'Lanjutkan Nonton', value: counts.contAnime + counts.contMovie, path: '/anime', accent: '#f59e0b' },
  ];

  return (
    <div className="profile-page">
      <div className="profile-hero">
        <div className="profile-hero-bg" />
        <div className="profile-hero-inner">
          <img className="profile-avatar" src={user.avatar} alt={user.name} referrerPolicy="no-referrer" />
          <div className="profile-id">
            <h1 className="profile-name">{user.name}</h1>
            <p className="profile-email">{user.email}</p>
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
        <h2 className="profile-section-title">Akun</h2>
        <div className="profile-rows">
          <button className="profile-row" onClick={() => navigate('/anime/mylist')}>
            <span className="profile-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
            </span>
            <span className="profile-row-label">My List ({counts.listTotal})</span>
            <svg className="profile-row-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="m9 18 6-6-6-6" /></svg>
          </button>
          <button className="profile-row danger" onClick={handleLogout}>
            <span className="profile-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            </span>
            <span className="profile-row-label">Keluar</span>
          </button>
        </div>
      </div>
    </div>
  );
}
