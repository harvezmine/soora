import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMyList } from '../utils/mylist';
import { getProgressList, removeProgress } from '../utils/progress';
import ContinueRow from '../components/ContinueRow';
import AvatarPicker from '../components/AvatarPicker';
import { jalurProfil } from '../verticals';

/**
 * Tiap vertikal punya profilnya sendiri.
 *
 * Isinya dibatasi pada bagian itu saja: membuka profil dari sooraflix lalu
 * disuguhi daftar manga membuat ketiganya terasa satu tumpukan, bukan tiga
 * tempat yang berbeda.
 */
const BAGIAN = {
  anime: {
    kunci: 'anime',
    nama: 'sooranime',
    kelas: '',
    listLabel: 'My List Anime',
    listPath: '/anime/mylist',
    lanjutLabel: 'Lanjutkan Anime',
    progLabel: 'anime belum selesai',
    beranda: '/anime',
    ikon: <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />,
  },
  movie: {
    kunci: 'movie',
    nama: 'sooraflix',
    kelas: 'sooraflix-page',
    listLabel: 'My List Film',
    listPath: '/movies/mylist',
    lanjutLabel: 'Lanjutkan Nonton',
    progLabel: 'film belum selesai',
    beranda: '/movies',
    ikon: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="m10 8 5 3-5 3z" /></>,
  },
  manga: {
    kunci: 'manga',
    nama: 'sooramics',
    kelas: 'sooramics-page',
    listLabel: 'My List Manga',
    listPath: '/manga/mylist',
    lanjutLabel: 'Lanjutkan Baca',
    progLabel: 'komik belum selesai',
    beranda: '/manga',
    ikon: <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />,
  },
};

/**
 * Wajah tiap vertikal saat muncul sebagai tujuan pindah.
 *
 * Ikonnya menggambarkan isinya — layar untuk film, buku terbuka untuk komik —
 * bukan sekadar titik berwarna. Titik berwarna memaksa orang menghafal warna
 * mana milik siapa; gambar langsung terbaca, dan warnanya jadi penegas, bukan
 * satu-satunya petunjuk.
 */
const VERTIKAL = {
  sooranime: {
    sub: 'Anime sub & dub',
    ikon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M10 8.5v7l6-3.5z" fill="currentColor" stroke="none" />
      </>
    ),
  },
  sooraflix: {
    sub: 'Film & serial TV',
    ikon: (
      <>
        <rect x="2.5" y="4" width="19" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
  },
  sooramics: {
    sub: 'Manga & komik',
    ikon: (
      <>
        <path d="M12 6.5C10.5 5 8.5 4.5 6 4.5A2 2 0 0 0 4 6.5v10A2 2 0 0 0 6 18.5c2.5 0 4.5.5 6 2" />
        <path d="M12 6.5C13.5 5 15.5 4.5 18 4.5A2 2 0 0 1 20 6.5v10a2 2 0 0 1-2 2c-2.5 0-4.5.5-6 2z" />
      </>
    ),
  },
};

/** Vertikal lain, untuk berpindah tanpa lewat beranda. */
const LAIN = {
  anime: ['sooraflix', 'sooramics'],
  movie: ['sooranime', 'sooramics'],
  manga: ['sooranime', 'sooraflix'],
};

export default function Profile({ section = 'anime' }) {
  const bagian = BAGIAN[section] || BAGIAN.anime;
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [pilihAvatar, setPilihAvatar] = useState(false);

  const counts = useMemo(() => {
    const list = getMyList().filter((i) =>
      bagian.kunci === 'manga'
        ? i.listType === 'manga' || i.listType === 'komikplus'
        : i.listType === bagian.kunci
    );
    return { list: list.length, prog: getProgressList(bagian.kunci).length };
    // refreshKey sengaja jadi pemicu: penyimpanannya di luar React, jadi
    // tidak ada nilai lain yang berubah saat riwayat dihapus.
  }, [refreshKey, bagian.kunci]);

  if (!user) return null;

  const initials = (user.name || '?')
    .split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  const hapusRiwayat = () => {
    // Hanya riwayat bagian ini. Menghapus semuanya dari satu profil vertikal
    // akan mengejutkan — orang menghapus apa yang sedang ia lihat.
    getProgressList(bagian.kunci).forEach((p) => removeProgress(p.section, p.id));
    setConfirm(false);
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className={`profile-page ${bagian.kelas}`}>
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
          <span className="prof-vertikal">{bagian.nama}</span>
          <h1 className="prof-name">{user.name}</h1>
          <p className="prof-email">{user.email}</p>
          {/* Angka nol tidak ditulis — memamerkan "0 di My List" hanya
              menegaskan kekosongan tanpa memberi informasi apa pun. */}
          {(counts.list > 0 || counts.prog > 0) && (
            <p className="prof-meta">
              {counts.list > 0 && <span><b>{counts.list}</b> di My List</span>}
              {counts.list > 0 && counts.prog > 0 && <span className="prof-meta-sep" aria-hidden="true" />}
              {counts.prog > 0 && <span><b>{counts.prog}</b> {bagian.progLabel}</span>}
            </p>
          )}
        </div>
      </header>

      {pilihAvatar && (
        <AvatarPicker
          avatarSaatIni={user.avatar}
          onGanti={(baru) => { updateUser(baru); setPilihAvatar(false); }}
          onTutup={() => setPilihAvatar(false)}
        />
      )}

      {/* Hanya bagian ini. ContinueRow mengembalikan null saat kosong. */}
      <div className="prof-history">
        <ContinueRow section={bagian.kunci} title={bagian.lanjutLabel} />
      </div>

      <nav className="prof-block" aria-label="Pustaka">
        <h2 className="prof-block-title">Pustaka</h2>
        <button className="prof-row" onClick={() => navigate(bagian.listPath)}>
          <svg className="prof-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="19" height="19">
            {bagian.ikon}
          </svg>
          <span className="prof-row-label">{bagian.listLabel}</span>
          <span className="prof-row-count">{counts.list || ''}</span>
          <svg className="prof-row-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </nav>

      {/* Pindah vertikal langsung dari sini; tanpa ini orang harus kembali ke
          beranda dulu hanya untuk melihat profil sebelahnya. */}
      <nav className="prof-block" aria-label="Profil lain">
        <h2 className="prof-block-title">Profil lain</h2>
        <div className="prof-lain">
          {(LAIN[bagian.kunci] || []).map((vertikal) => (
            <button
              key={vertikal}
              className={`prof-lain-kartu v-${vertikal}`}
              onClick={() => navigate(jalurProfil(vertikal))}
            >
              <span className="prof-lain-ikon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
                  width="22" height="22">
                  {VERTIKAL[vertikal]?.ikon}
                </svg>
              </span>
              <span className="prof-lain-teks">
                <span className="prof-lain-nama">{vertikal}</span>
                <span className="prof-lain-sub">{VERTIKAL[vertikal]?.sub}</span>
              </span>
              <svg className="prof-lain-chev" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" width="15" height="15" aria-hidden="true">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          ))}
        </div>
      </nav>

      <section className="prof-block" aria-label="Akun">
        <h2 className="prof-block-title">Akun</h2>
        <button className="prof-row" onClick={() => { logout(); navigate(bagian.beranda); }}>
          <svg className="prof-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="19" height="19">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          <span className="prof-row-label">Keluar</span>
        </button>

        {counts.prog > 0 && (
          confirm ? (
            <div className="prof-confirm">
              <p className="prof-confirm-text">
                Hapus {counts.prog} riwayat {bagian.nama}? Tidak bisa dibatalkan.
                Bagian lain tidak ikut terhapus.
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
              <span className="prof-row-label">Hapus riwayat {bagian.nama}</span>
              <span className="prof-row-count">{counts.prog}</span>
            </button>
          )
        )}
      </section>

      <p className="prof-footer">soora · v1</p>
    </div>
  );
}
