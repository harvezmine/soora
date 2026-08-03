import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getMyList } from '../utils/mylist';
import { useAuth } from '../context/AuthContext';

export default function Navbar({ section = 'sooranime' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [listCount, setListCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);
  const { user, logout } = useAuth();

  const isSooraflix = section === 'sooraflix';
  const isSooramics = section === 'sooramics';

  // Section-specific mylist path and type filter
  const mylistPath = isSooramics ? '/manga/mylist' : isSooraflix ? '/movies/mylist' : '/anime/mylist';
  const mylistType = isSooramics ? 'manga' : isSooraflix ? 'movie' : 'anime';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const updateCount = () => {
      const list = getMyList();
      setListCount(list.filter((i) => i.listType === mylistType).length);
    };
    updateCount();
    window.addEventListener('mylist-changed', updateCount);
    return () => window.removeEventListener('mylist-changed', updateCount);
  }, [mylistType]);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return;
    const onClick = (e) => { if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [profileOpen]);

  // Lock body scroll when menu open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const isActive = (path) => {
    if (path === '/anime' && !isSooraflix && !isSooramics) return location.pathname === '/anime';
    if (path === '/movies' && isSooraflix) return location.pathname === '/movies';
    if (path === '/manga' && isSooramics) return location.pathname === '/manga';
    return location.pathname.startsWith(path);
  };

  const handleNav = (path) => {
    navigate(path);
    setMenuOpen(false);
  };

  return (
    <div className={`navbar ${scrolled ? 'navbar-scrolled' : ''} ${isSooraflix ? 'navbar-sooraflix' : ''} ${isSooramics ? 'navbar-sooramics' : ''}`}>
      <div
        className="logo-area"
        onClick={() => {
          if (isSooramics) handleNav('/manga');
          else if (isSooraflix) handleNav('/movies');
          else handleNav('/anime');
        }}
        style={{ cursor: 'pointer' }}
      >
        <span className="logo">
          {/* Satu mark untuk ketiga bagian. Sebelumnya SVG lingkaran-plus-S
              buatan tangan yang mewarnai dirinya dari currentColor bagian,
              jadi logonya berubah rupa tiap pindah bagian. Nama bagian di
              sebelahnya yang membedakan, bukan marknya. */}
          <span className="logo-mark" aria-hidden="true">
            <img src="/icons/icon-192x192.png" alt="" width="26" height="26" />
          </span>
          <span className="logo-text">
            <span className="logo-name">
              {isSooramics ? (
                <>soor<span className="logo-accent-mics">amics</span></>
              ) : isSooraflix ? (
                <>soor<span className="logo-accent-flix">aflix</span></>
              ) : (
                <>soor<span className="logo-accent-anime">anime</span></>
              )}
            </span>
          </span>
        </span>
      </div>

      {/* Hamburger button — mobile only */}
      <button
        className={`nav-hamburger ${menuOpen ? 'open' : ''}`}
        onClick={() => setMenuOpen((v) => !v)}
        aria-label="Toggle menu"
      >
        <span />
        <span />
        <span />
      </button>

      {/* Overlay */}
      {menuOpen && <div className="nav-overlay" onClick={() => setMenuOpen(false)} />}

      <nav className={menuOpen ? 'nav-open' : ''}>
        {isSooramics ? (
          <>
            <a onClick={() => handleNav('/manga')} className={isActive('/manga') && !isActive('/manga/search') && !isActive('/manga/info') && !isActive('/manga/downloads') ? 'active' : ''}>Home</a>
            <a onClick={() => handleNav('/manga/search')} className={isActive('/manga/search') ? 'active' : ''}>Browse</a>
            <a onClick={() => handleNav('/manga/downloads')} className={`nav-downloads ${isActive('/manga/downloads') ? 'active' : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Offline
            </a>
            <a onClick={() => handleNav('/')} className="nav-exit">Keluar</a>
          </>
        ) : isSooraflix ? (
          <>
            <a onClick={() => handleNav('/movies')} className={isActive('/movies') && !isActive('/movies/search') && !isActive('/movies/info') ? 'active' : ''}>Home</a>
            <a onClick={() => handleNav('/movies/search')} className={isActive('/movies/search') ? 'active' : ''}>Browse</a>
            <a onClick={() => handleNav('/')} className="nav-exit">Keluar</a>
          </>
        ) : (
          <>
            <a onClick={() => handleNav('/anime')} className={isActive('/anime') && !isActive('/anime/search') && !isActive('/anime/info') ? 'active' : ''}>Home</a>
            <a onClick={() => handleNav('/anime/search')} className={isActive('/anime/search') ? 'active' : ''}>Browse</a>
            <a onClick={() => handleNav('/')} className="nav-exit">Keluar</a>
          </>
        )}
        <a onClick={() => handleNav(mylistPath)} className={`nav-mylist ${location.pathname.includes('/mylist') ? 'active' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          My List
          {listCount > 0 && <span className="nav-badge">{listCount}</span>}
        </a>

        {/* Profile / login — shown inside nav so it collapses into the mobile menu too */}
        {user ? (
          <div className="nav-profile" ref={profileRef}>
            <button className="nav-profile-btn" onClick={() => setProfileOpen((v) => !v)} aria-label="Profil" aria-expanded={profileOpen}>
              <img src={user.avatar} alt="" referrerPolicy="no-referrer" onError={(e) => { e.target.style.visibility = 'hidden'; }} />
              <span className="nav-profile-name">{(user.name || '').split(' ')[0]}</span>
              <svg className={`nav-profile-chev ${profileOpen ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="14" height="14"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {profileOpen && (
              <div className="nav-profile-menu">
                <div className="nav-profile-head">
                  <img src={user.avatar} alt="" referrerPolicy="no-referrer" />
                  <div>
                    <div className="nav-profile-head-name">{user.name}</div>
                    <div className="nav-profile-head-email">{user.email}</div>
                  </div>
                </div>
                <button onClick={() => handleNav('/profile')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                  Profil
                </button>
                <button onClick={() => handleNav(mylistPath)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
                  My List
                </button>
                <button className="danger" onClick={() => { logout(); setProfileOpen(false); navigate('/'); }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                  Keluar
                </button>
              </div>
            )}
          </div>
        ) : (
          <a className="nav-login-btn" onClick={() => handleNav(`/login?next=${encodeURIComponent(location.pathname)}`)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg>
            Masuk
          </a>
        )}
      </nav>
    </div>
  );
}
