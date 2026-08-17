import { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMyList } from '../utils/mylist';
import { getProgressList, removeProgress } from '../utils/progress';
import ContinueRow from '../components/ContinueRow';
import { apiGetAvatars, apiSetAvatar } from '@soora/core/user';

/* Tujuan My List. Ikonnya membedakan barisnya tanpa perlu warna. */
const PUSTAKA = [
  {
    key: 'anime',
    label: 'Anime',
    path: '/anime/mylist',
    icon: <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />,
  },
  {
    key: 'movie',
    label: 'Film & Series',
    path: '/movies/mylist',
    icon: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="m10 8 5 3-5 3z" /></>,
  },
  {
    key: 'manga',
    label: 'Manga',
    path: '/manga/mylist',
    icon: <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />,
  },
];

export default function Profile() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [pilihAvatar, setPilihAvatar] = useState(false);
  const [avatarTersedia, setAvatarTersedia] = useState([]);
  const [gantiAvatar, setGantiAvatar] = useState(null); // url yang sedang dikirim

  // Daftar avatar diambil saat pemilihnya dibuka, bukan saat halaman dimuat —
  // sebagian besar kunjungan ke profil tidak menyentuhnya sama sekali.
  useEffect(() => {
    if (!pilihAvatar || avatarTersedia.length) return;
    apiGetAvatars().then(setAvatarTersedia).catch(() => setAvatarTersedia([]));
  }, [pilihAvatar, avatarTersedia.length]);

  const pakaiAvatar = useCallback(async (url) => {
    setGantiAvatar(url);
    try {
      const baru = await apiSetAvatar(url);
      if (baru) { updateUser(baru); setPilihAvatar(false); }
    } finally {
      setGantiAvatar(null);
    }
  }, [updateUser]);

  const counts = useMemo(() => {
    const list = getMyList();
    const prog = getProgressList();
    const by = (arr, key, val) => arr.filter((i) => i[key] === val).length;
    return {
      anime: by(list, 'listType', 'anime'),
      movie: by(list, 'listType', 'movie'),
      manga: by(list, 'listType', 'manga'),
      listTotal: list.length,
      progTotal: prog.length,
    };
    // refreshKey sengaja jadi pemicu: penyimpanannya di luar React, jadi
    // tidak ada nilai lain yang berubah saat riwayat dihapus.
  }, [refreshKey]);

  if (!user) return null;

  const initials = (user.name || '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const hapusRiwayat = () => {
    getProgressList().forEach((p) => removeProgress(p.section, p.id));
    setConfirm(false);
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="profile-page">
      <header className="prof-head">
        <button
          className="prof-avatar-btn"
          onClick={() => setPilihAvatar((v) => !v)}
          aria-label="Ganti foto profil"
          aria-expanded={pilihAvatar}
        >
          {user.avatar
            ? <img className="prof-avatar" src={user.avatar} alt="" referrerPolicy="no-referrer" />
            : <div className="prof-avatar prof-avatar-fallback" aria-hidden="true">{initials}</div>}
          <span className="prof-avatar-edit" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
            </svg>
          </span>
        </button>
        <div className="prof-id">
          <h1 className="prof-name">{user.name}</h1>
          <p className="prof-email">{user.email}</p>
          {/* Angka nol tidak ditulis — memamerkan "0 di My List" hanya
              menegaskan kekosongan tanpa memberi informasi apa pun. */}
          {(counts.listTotal > 0 || counts.progTotal > 0) && (
            <p className="prof-meta">
              {counts.listTotal > 0 && <span><b>{counts.listTotal}</b> di My List</span>}
              {counts.listTotal > 0 && counts.progTotal > 0 && <span className="prof-meta-sep" aria-hidden="true" />}
              {counts.progTotal > 0 && <span><b>{counts.progTotal}</b> sedang ditonton</span>}
            </p>
          )}
        </div>
      </header>

      {pilihAvatar && (
        <div className="prof-avatars">
          {avatarTersedia.length === 0 ? (
            <p className="prof-avatars-kosong">Belum ada foto profil bawaan.</p>
          ) : (
            <>
              <h2 className="prof-block-title">Pilih foto profil</h2>
              <div className="prof-avatars-grid">
                {avatarTersedia.map((url) => (
                  <button
                    key={url}
                    className={`prof-avatar-opsi ${user.avatar === url ? 'terpilih' : ''}`}
                    onClick={() => pakaiAvatar(url)}
                    disabled={!!gantiAvatar}
                    aria-pressed={user.avatar === url}
                  >
                    <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Isi utama halaman ini: apa yang sedang ditonton. Tiap ContinueRow
          mengembalikan null saat bagiannya kosong. */}
      <div className="prof-history">
        <ContinueRow section="movie" title="Lanjutkan Nonton" />
        <ContinueRow section="anime" title="Lanjutkan Anime" />
        <ContinueRow section="manga" title="Lanjutkan Baca" />
      </div>

      <nav className="prof-block" aria-label="My List">
        <h2 className="prof-block-title">My List</h2>
        {PUSTAKA.map((p) => (
          <button className="prof-row" key={p.key} onClick={() => navigate(p.path)}>
            <svg className="prof-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="19" height="19">
              {p.icon}
            </svg>
            <span className="prof-row-label">{p.label}</span>
            <span className="prof-row-count">{counts[p.key] || ''}</span>
            <svg className="prof-row-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        ))}
      </nav>

      <section className="prof-block" aria-label="Akun">
        <h2 className="prof-block-title">Akun</h2>
        <button className="prof-row" onClick={() => { logout(); navigate('/anime'); }}>
          <svg className="prof-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="19" height="19">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          <span className="prof-row-label">Keluar</span>
        </button>

        {counts.progTotal > 0 && (
          confirm ? (
            <div className="prof-confirm">
              <p className="prof-confirm-text">
                Hapus {counts.progTotal} riwayat tontonan? Tidak bisa dibatalkan.
              </p>
              <div className="prof-confirm-actions">
                <button className="prof-confirm-cancel" onClick={() => setConfirm(false)}>Batal</button>
                <button className="prof-confirm-ok" onClick={hapusRiwayat}>Hapus</button>
              </div>
            </div>
          ) : (
            <button className="prof-row prof-row-danger" onClick={() => setConfirm(true)}>
              <svg className="prof-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="19" height="19">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              </svg>
              <span className="prof-row-label">Hapus riwayat tontonan</span>
              <span className="prof-row-count">{counts.progTotal}</span>
            </button>
          )
        )}
      </section>

      <p className="prof-footer">soora · v1</p>
    </div>
  );
}
