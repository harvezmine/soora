import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  daftarDoujin, cariDoujin, genreDoujin, detailDoujin, chapterDoujin,
  gambarDoujin, URUTAN, JENIS,
} from '@soora/core/doujin';
import {
  daftarVideo, kategoriVideo, videoPerKategori, cariVideo, detailVideo,
} from '@soora/core/video';
import { addToMyList, removeFromMyList, isInMyList, getMyList } from '../utils/mylist';
import Loading from '../components/Loading';
import SkeletonSection from '../components/SkeletonSection';
import CustomSelect from '../components/CustomSelect';
import MangaReaderView from '../components/MangaReaderView';
import Landing from './Landing';
import { IconStar, IconBook, IconHash, IconPages, IconHeart } from '../components/icons';

/**
 * Pustaka tambahan (sooramics+): komik dan video.
 *
 * Susunannya sengaja meniru sooramics — spanduk sorotan, panel filter yang
 * sama, baris kartu bergeser — dan memakai kelas yang sama pula (hero-*,
 * af-*, kp-*, mangareader-*). Bukan demi hemat menulis: kalau tampilannya
 * ditulis terpisah, keduanya pelan-pelan menyimpang dan tiap perbaikan harus
 * dikerjakan dua kali.
 *
 * Pembacanya benar-benar komponen yang sama dengan sooramics
 * (MangaReaderView), jadi mode gulir, mode halaman, gulir otomatis, dan
 * sambung chapter berperilaku persis sama.
 */

/** Baris beranda. Bedanya cuma pengurutan. */
const BARIS = [
  { kunci: 'latest_chapter', label: 'Update Terbaru' },
  { kunci: 'views', label: 'Paling Banyak Dibaca' },
  { kunci: 'rating', label: 'Rating Tertinggi' },
  { kunci: 'created_at', label: 'Baru Ditambahkan' },
];

const JENIS_LIST = 'doujin';
const PER_HALAMAN = 24;

const angkaRingkas = (n) => {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `${Math.round(n / 1000)}rb`;
  return String(n);
};

const tanggalRingkas = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

/* ══════════════ Kartu ══════════════ */

function Kartu({ item, onKlik, onHapus, video = false }) {
  // Gambar video datang dari host yang tidak menuntut Referer, jadi dipakai
  // langsung; sampul komik harus lewat proxy.
  const src = video ? item.thumb : gambarDoujin(item.thumb);
  return (
    <button className={`kp-card ${video ? 'kp-card-video' : ''}`} onClick={() => onKlik(item)} title={item.title}>
      <div className="kp-card-img-wrap">
        {src
          ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
          : <div className="kp-card-kosong" aria-hidden="true"><IconBook size={22} /></div>}
        {!video && item.latestChapter != null && (
          <span className="kp-card-badge">Ch {item.latestChapter}</span>
        )}
        {video && (
          <span className="kp-card-play" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <polygon points="6 3 20 12 6 21 6 3" />
            </svg>
          </span>
        )}
        {onHapus && (
          <span
            className="kp-card-remove-btn"
            role="button"
            title="Hapus dari My List"
            onClick={(e) => { e.stopPropagation(); onHapus(item); }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </span>
        )}
      </div>
      <div className="kp-card-body">
        <span className="kp-card-title">{item.title}</span>
        <span className="kp-card-meta">
          {video ? item.date : (
            <>
              {item.rating != null && <><IconStar size={11} /> {item.rating}</>}
              {item.rating != null && item.type && <span className="kp-sep">·</span>}
              {item.type}
            </>
          )}
        </span>
      </div>
    </button>
  );
}

function Baris({ judul, items, memuat, onKlik, video }) {
  const ref = useRef(null);
  const geser = (arah) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: arah * el.clientWidth * 0.85, behavior: 'smooth' });
  };
  if (memuat) return <SkeletonSection />;
  if (!items.length) return null;
  return (
    <section className="srow">
      <div className="srow-head"><h2 className="srow-title">{judul}</h2></div>
      <div className="srail">
        <button className="srail-arrow srail-arrow-left" onClick={() => geser(-1)} aria-label="Geser kiri">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="22" height="22"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <button className="srail-arrow srail-arrow-right" onClick={() => geser(1)} aria-label="Geser kanan">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="22" height="22"><path d="m9 18 6-6-6-6" /></svg>
        </button>
        <div className="card-row" ref={ref}>
          {items.map((it) => (
            <div className="kp-card-row-item" key={it.id}>
              <Kartu item={it} onKlik={onKlik} video={video} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ══════════════ Halaman ══════════════ */

export default function SooramicsPlus() {
  const [view, setView] = useState('landing');
  const [sebelumnya, setSebelumnya] = useState('home');
  const pindah = useCallback((next) => {
    setView((cur) => { setSebelumnya(cur); return next; });
    window.scrollTo({ top: 0 });
  }, []);

  // ── Komik: beranda ──
  const [baris, setBaris] = useState({});
  const [muatBeranda, setMuatBeranda] = useState(true);
  const [hero, setHero] = useState([]);
  const [heroIdx, setHeroIdx] = useState(0);
  const [genres, setGenres] = useState([]);

  // ── Komik: jelajah ──
  const [urut, setUrut] = useState('latest_chapter');
  const [jenis, setJenis] = useState('');
  const [genre, setGenre] = useState('');
  const [cariGenre, setCariGenre] = useState('');
  const [filterBuka, setFilterBuka] = useState(false);
  const [hasil, setHasil] = useState([]);
  const [halaman, setHalaman] = useState(1);
  const [muatHasil, setMuatHasil] = useState(false);
  const [adaLagi, setAdaLagi] = useState(true);
  const [kotakCari, setKotakCari] = useState('');
  const [kataCari, setKataCari] = useState('');

  // ── Komik: detail & baca ──
  const [detail, setDetail] = useState(null);
  const [muatDetail, setMuatDetail] = useState(false);
  const [galatDetail, setGalatDetail] = useState('');
  const [chapterAwal, setChapterAwal] = useState(null);
  const [halamanAwal, setHalamanAwal] = useState([]);
  const [muatBaca, setMuatBaca] = useState(false);

  // ── Video ──
  const [videoList, setVideoList] = useState([]);
  const [videoKategori, setVideoKategori] = useState([]);
  const [katAktif, setKatAktif] = useState('');
  const [videoHal, setVideoHal] = useState(1);
  const [videoLagi, setVideoLagi] = useState(false);
  const [muatVideo, setMuatVideo] = useState(false);
  const [videoCari, setVideoCari] = useState('');
  const [videoDetailData, setVideoDetailData] = useState(null);
  const [muatVideoDetail, setMuatVideoDetail] = useState(false);
  const [pemutarIdx, setPemutarIdx] = useState(0);

  // ── My List ──
  const [myList, setMyList] = useState(
    () => getMyList().filter((i) => i.listType === JENIS_LIST)
  );
  const muatMyList = useCallback(() => {
    setMyList(getMyList().filter((i) => i.listType === JENIS_LIST));
  }, []);

  const diLanding = view === 'landing';

  /* ── Beranda komik ── */
  useEffect(() => {
    if (diLanding) return;
    let batal = false;
    (async () => {
      setMuatBeranda(true);
      const hasilBaris = await Promise.all(
        BARIS.map((b) => daftarDoujin({ sort: b.kunci, limit: 20 }).catch(() => []))
      );
      if (batal) return;
      const peta = {};
      BARIS.forEach((b, i) => { peta[b.kunci] = hasilBaris[i]; });
      setBaris(peta);
      // Sorotan hanya dari yang bersampul: kartu kosong di panggung utama
      // terbaca sebagai halaman yang gagal dimuat.
      setHero((peta.rating || []).filter((x) => x.thumb).slice(0, 6));
      setMuatBeranda(false);
    })();
    return () => { batal = true; };
  }, [diLanding]);

  useEffect(() => {
    if (diLanding) return;
    genreDoujin().then(setGenres).catch(() => setGenres([]));
    kategoriVideo().then(setVideoKategori).catch(() => setVideoKategori([]));
  }, [diLanding]);

  useEffect(() => {
    if (view !== 'home' || hero.length < 2) return;
    const t = setInterval(() => setHeroIdx((i) => (i + 1) % hero.length), 6000);
    return () => clearInterval(t);
  }, [view, hero.length]);

  /* ── Jelajah komik ── */
  const muatJelajah = useCallback(async (hal, gabung) => {
    setHalaman(hal);
    setMuatHasil(true);
    try {
      const data = kataCari
        ? await cariDoujin(kataCari, { page: hal, limit: PER_HALAMAN })
        : await daftarDoujin({ page: hal, sort: urut, type: jenis, genre, limit: PER_HALAMAN });
      setAdaLagi(data.length >= PER_HALAMAN);
      setHasil((lama) => (gabung ? [...lama, ...data] : data));
    } catch {
      if (!gabung) setHasil([]);
      setAdaLagi(false);
    } finally {
      setMuatHasil(false);
    }
  }, [kataCari, urut, jenis, genre]);

  useEffect(() => {
    if (view !== 'jelajah') return;
    // Dipicu dari sini, bukan dari tiap penangan filter: urutan, jenis, genre,
    // dan kata cari mengubah hasil yang sama, dan menyebar pemanggilannya ke
    // tiap tombol membuat satu tombol baru suatu saat lupa memuat ulang.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    muatJelajah(1, false);
  }, [view, muatJelajah]);

  /* ── Video ── */
  const muatDaftarVideo = useCallback(async (hal, gabung, kat, q) => {
    setVideoHal(hal);
    setMuatVideo(true);
    try {
      const d = q ? await cariVideo(q, hal)
        : kat ? await videoPerKategori(kat, hal)
          : await daftarVideo(hal);
      setVideoLagi(!!d.hasNext);
      setVideoList((lama) => (gabung ? [...lama, ...(d.videos || [])] : (d.videos || [])));
    } catch {
      if (!gabung) setVideoList([]);
      setVideoLagi(false);
    } finally {
      setMuatVideo(false);
    }
  }, []);

  useEffect(() => {
    if (view !== 'video') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    muatDaftarVideo(1, false, katAktif, videoCari);
  }, [view, katAktif, videoCari, muatDaftarVideo]);

  const bukaVideo = useCallback(async (item) => {
    pindah('videoDetail');
    setVideoDetailData(null);
    setPemutarIdx(0);
    setMuatVideoDetail(true);
    try {
      setVideoDetailData(await detailVideo(item.id));
    } catch {
      setVideoDetailData({ id: item.id, title: item.title, players: [], thumb: item.thumb, synopsis: '' });
    } finally {
      setMuatVideoDetail(false);
    }
  }, [pindah]);

  /* ── Detail komik ── */
  const bukaDetail = useCallback(async (item) => {
    pindah('detail');
    setDetail(null);
    setGalatDetail('');
    setMuatDetail(true);
    try {
      setDetail(await detailDoujin(item.id));
    } catch (err) {
      setGalatDetail(err.message || 'Judul ini tidak bisa dibuka');
    } finally {
      setMuatDetail(false);
    }
  }, [pindah]);

  /** Sumber mengurutkan chapter menurun; pembaca menganggap urutan menaik. */
  const chapterUrut = useMemo(() => {
    const list = detail?.chapters || [];
    return [...list]
      .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
      .map((c) => ({ id: c.id, chapter: c.number, title: c.title }));
  }, [detail]);

  const ambilHalaman = useCallback(async (chId) => {
    const isi = await chapterDoujin(chId);
    return (isi.images || []).map((url, i) => ({ img: url, page: i + 1 }));
  }, []);

  const srcHalaman = useCallback((page) => gambarDoujin(page?.img), []);

  const bukaChapter = useCallback(async (ch) => {
    setMuatBaca(true);
    pindah('reader');
    try {
      const pg = await ambilHalaman(ch.id);
      setChapterAwal(ch.id);
      setHalamanAwal(pg);
    } catch {
      setChapterAwal(ch.id);
      setHalamanAwal([]);
    } finally {
      setMuatBaca(false);
    }
  }, [ambilHalaman, pindah]);

  /* ── My List ── */
  const tersimpan = detail ? isInMyList(detail.id, JENIS_LIST) : false;
  const toggleSimpan = () => {
    if (!detail) return;
    if (tersimpan) removeFromMyList(detail.id, JENIS_LIST);
    else {
      addToMyList({
        id: detail.id, title: detail.title, image: detail.thumb,
        type: detail.type, listType: JENIS_LIST, rating: detail.rating,
      });
    }
    muatMyList();
  };

  const genreTersaring = useMemo(() => {
    const q = cariGenre.trim().toLowerCase();
    return q ? genres.filter((g) => g.name.toLowerCase().includes(q)) : genres;
  }, [genres, cariGenre]);

  const adaFilter = !!(genre || jenis || kataCari);
  const diVideo = view === 'video' || view === 'videoDetail';

  /* ══════ Gerbang masuk ══════ */
  if (diLanding) {
    return <Landing showSooramicsPlus onSooramicsPlusClick={() => pindah('home')} />;
  }

  const kirimCari = (e) => {
    e.preventDefault();
    const q = kotakCari.trim();
    if (diVideo) { setVideoCari(q); setKatAktif(''); pindah('video'); return; }
    setKataCari(q);
    pindah('jelajah');
  };

  /* ══════ Bilah atas ══════ */
  const Nav = (
    <div className="kp-nav">
      <div className="kp-nav-left">
        <button className="btn-glass kp-nav-back" onClick={() => pindah('landing')} title="Kembali ke Soora">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="kp-brand">soora<span className="kp-accent">mics+</span></span>
      </div>

      <div className="kp-nav-tabs">
        <button className={`kp-nav-tab ${view === 'home' ? 'aktif' : ''}`} onClick={() => pindah('home')}>Beranda</button>
        <button className={`kp-nav-tab ${view === 'jelajah' || view === 'detail' || view === 'reader' ? 'aktif' : ''}`} onClick={() => pindah('jelajah')}>Komik</button>
        <button className={`kp-nav-tab ${diVideo ? 'aktif' : ''}`} onClick={() => pindah('video')}>Video</button>
        <button className={`kp-nav-tab ${view === 'mylist' ? 'aktif' : ''}`} onClick={() => { muatMyList(); pindah('mylist'); }}>
          My List{myList.length > 0 && <span className="kp-nav-badge">{myList.length}</span>}
        </button>
      </div>

      <form className="kp-nav-search" onSubmit={kirimCari}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={kotakCari}
          onChange={(e) => setKotakCari(e.target.value)}
          placeholder={diVideo ? 'Cari video…' : 'Cari judul…'}
          aria-label="Cari"
        />
        {kotakCari && (
          <button
            type="button"
            className="kp-nav-search-clear"
            onClick={() => { setKotakCari(''); setKataCari(''); setVideoCari(''); }}
            aria-label="Bersihkan"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" width="13" height="13"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        )}
      </form>
    </div>
  );

  /** Panel filter — susunan af-card > af-header > af-body sama persis dengan
   *  sooramics. Kelas `open` yang menggerakkan akordeonnya. */
  const PanelFilter = (
    <div className="af-panel">
      <div className={`af-card ${filterBuka ? 'open' : ''}`}>
        <button className="af-header" onClick={() => setFilterBuka((v) => !v)}>
          <div className="af-header-left">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
            </svg>
            <span>Filter</span>
            {adaFilter && !filterBuka && (
              <span className="af-header-count">{[genre, jenis, kataCari].filter(Boolean).length}</span>
            )}
          </div>
          <svg className={`af-chevron ${filterBuka ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        <div className="af-body">
          <div className="af-body-inner">
            <div className="af-group">
              <span className="af-label">Jenis</span>
              <div className="af-pills">
                {JENIS.map((j) => (
                  <button
                    key={j.nilai || 'semua'}
                    className={`af-chip ${jenis === j.nilai ? 'aktif' : ''}`}
                    onClick={() => setJenis(j.nilai)}
                  >
                    {j.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="af-divider" />

            <div className="af-genre-section">
              <div className="af-header-left">
                <span className="af-label">Genre</span>
                <div className="af-tag-search-wrap">
                  <input
                    className="af-tag-search"
                    value={cariGenre}
                    onChange={(e) => setCariGenre(e.target.value)}
                    placeholder="Cari genre…"
                    aria-label="Cari genre"
                  />
                  {cariGenre && (
                    <button className="af-tag-search-clear" onClick={() => setCariGenre('')} aria-label="Bersihkan">×</button>
                  )}
                </div>
              </div>
              <div className="af-pills af-pills-scroll">
                <button className={`af-chip ${!genre ? 'aktif' : ''}`} onClick={() => setGenre('')}>Semua</button>
                {genreTersaring.map((g) => (
                  <button
                    key={g.slug}
                    className={`af-chip ${genre === g.slug ? 'aktif' : ''}`}
                    onClick={() => setGenre(g.slug === genre ? '' : g.slug)}
                  >
                    {g.name}<span className="af-tag-count">{angkaRingkas(g.count)}</span>
                  </button>
                ))}
              </div>
            </div>

            {adaFilter && (
              <button
                className="af-reset"
                onClick={() => { setGenre(''); setJenis(''); setKataCari(''); setKotakCari(''); }}
              >
                Atur ulang filter
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  /* ══════ Beranda ══════ */
  if (view === 'home') {
    const sorot = hero[heroIdx];
    return (
      <div className="home-page sooramicsplus-page">
        <div className="kp-page-nav">{Nav}</div>

        {sorot && (
          <div className="hero-banner sooramicsplus-hero" key={sorot.id}>
            <div className="hero-bg">
              <img src={gambarDoujin(sorot.thumb)} alt="" referrerPolicy="no-referrer" />
            </div>
            <div className="hero-content">
              <div className="hero-top-row">
                <div className="hero-badge sooramicsplus-badge">{sorot.type || 'manga'}</div>
                {sorot.rating != null && (
                  <span className="hero-quality"><IconStar size={12} /> {sorot.rating}</span>
                )}
              </div>
              <h1 className="hero-title">{sorot.title}</h1>
              <p className="hero-desc">
                {sorot.latestChapter != null
                  ? `Sudah sampai chapter ${sorot.latestChapter}.`
                  : 'Salah satu yang paling tinggi ratingnya.'}
              </p>
              <div className="hero-actions">
                <button className="btn-play sooramicsplus-btn-play" onClick={() => bukaDetail(sorot)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                  </svg>
                  Baca Sekarang
                </button>
                <button className="btn-glass" onClick={() => bukaDetail(sorot)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
                  </svg>
                  Detail
                </button>
              </div>
              {hero.length > 1 && (
                <div className="hero-dots">
                  {hero.map((h, i) => (
                    <button
                      key={h.id}
                      className={`hero-dot ${i === heroIdx ? 'active' : ''}`}
                      onClick={() => setHeroIdx(i)}
                      aria-label={`Sorotan ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {BARIS.map((b) => (
          <Baris key={b.kunci} judul={b.label} items={baris[b.kunci] || []} memuat={muatBeranda} onKlik={bukaDetail} />
        ))}

        <Baris judul="Video Terbaru" items={videoList.slice(0, 20)} memuat={false} onKlik={bukaVideo} video />

        {genres.length > 0 && (
          <section className="srow">
            <div className="srow-head"><h2 className="srow-title">Jelajahi Genre</h2></div>
            <div className="af-chips">
              {genres.slice(0, 24).map((g) => (
                <button
                  key={g.slug}
                  className="af-chip"
                  onClick={() => { setGenre(g.slug); setKataCari(''); setKotakCari(''); pindah('jelajah'); }}
                >
                  {g.name}<span className="af-tag-count">{angkaRingkas(g.count)}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  /* ══════ Jelajah komik ══════ */
  if (view === 'jelajah') {
    return (
      <div className="kp-page sooramicsplus-page">
        {Nav}
        <div className="af-top">
          <div className="af-header-left">
            <h2 className="kp-ml-title">
              {kataCari ? `Hasil untuk "${kataCari}"`
                : genre ? genres.find((g) => g.slug === genre)?.name || 'Komik'
                  : 'Semua Komik'}
            </h2>
            {hasil.length > 0 && <span className="af-header-count">{hasil.length}</span>}
          </div>
          {!kataCari && (
            <CustomSelect
              value={urut}
              onChange={setUrut}
              options={URUTAN.map((u) => ({ value: u.nilai, label: u.label }))}
            />
          )}
        </div>

        {PanelFilter}

        {muatHasil && hasil.length === 0 ? <Loading /> : hasil.length === 0 ? (
          <div className="kp-empty">
            <p className="kp-empty-title">Tidak ada yang cocok</p>
            <p className="kp-empty-desc">Coba kata kunci lain, atau longgarkan filternya.</p>
          </div>
        ) : (
          <>
            <div className="kp-grid">
              {hasil.map((it) => <Kartu key={it.id} item={it} onKlik={bukaDetail} />)}
            </div>
            {adaLagi && (
              <div className="kp-pagination">
                <button className="btn-glass" onClick={() => muatJelajah(halaman + 1, true)} disabled={muatHasil}>
                  {muatHasil ? 'Memuat…' : 'Muat lebih banyak'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  /* ══════ Daftar video ══════ */
  if (view === 'video') {
    return (
      <div className="kp-page sooramicsplus-page">
        {Nav}
        <div className="af-top">
          <div className="af-header-left">
            <h2 className="kp-ml-title">
              {videoCari ? `Video untuk "${videoCari}"`
                : katAktif ? videoKategori.find((k) => k.slug === katAktif)?.name || 'Video'
                  : 'Video Terbaru'}
            </h2>
            {videoList.length > 0 && <span className="af-header-count">{videoList.length}</span>}
          </div>
        </div>

        {videoKategori.length > 0 && (
          <div className="af-chips kp-kat">
            <button
              className={`af-chip ${!katAktif && !videoCari ? 'aktif' : ''}`}
              onClick={() => { setKatAktif(''); setVideoCari(''); setKotakCari(''); }}
            >
              Terbaru
            </button>
            {videoKategori.map((k) => (
              <button
                key={k.slug}
                className={`af-chip ${katAktif === k.slug ? 'aktif' : ''}`}
                onClick={() => { setKatAktif(k.slug === katAktif ? '' : k.slug); setVideoCari(''); setKotakCari(''); }}
              >
                {k.name}
              </button>
            ))}
          </div>
        )}

        {muatVideo && videoList.length === 0 ? <Loading /> : videoList.length === 0 ? (
          <div className="kp-empty">
            <p className="kp-empty-title">Tidak ada video</p>
            <p className="kp-empty-desc">Coba kategori atau kata kunci lain.</p>
          </div>
        ) : (
          <>
            <div className="kp-grid kp-grid-video">
              {videoList.map((v) => <Kartu key={v.id} item={v} onKlik={bukaVideo} video />)}
            </div>
            {videoLagi && (
              <div className="kp-pagination">
                <button
                  className="btn-glass"
                  disabled={muatVideo}
                  onClick={() => muatDaftarVideo(videoHal + 1, true, katAktif, videoCari)}
                >
                  {muatVideo ? 'Memuat…' : 'Muat lebih banyak'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  /* ══════ Detail video ══════ */
  if (view === 'videoDetail') {
    const v = videoDetailData;
    const pemutar = v?.players?.[pemutarIdx];
    return (
      <div className="kp-page sooramicsplus-page">
        {Nav}
        {muatVideoDetail ? <Loading /> : !v ? (
          <div className="kp-empty">
            <p className="kp-empty-title">Video tidak bisa dibuka</p>
            <button className="btn-glass" onClick={() => pindah('video')}>Kembali</button>
          </div>
        ) : (
          <>
            <h1 className="kp-video-judul">{v.title}</h1>

            {pemutar ? (
              <div className="kp-player">
                {/* Pemutarnya milik pihak ketiga, jadi bingkainya dikurung.
                    allow-same-origin sengaja TIDAK diberikan — digabung dengan
                    allow-scripts, kurungannya jadi tidak berarti apa-apa. Tanpa
                    allow-top-navigation, iklan di dalamnya tidak bisa menyeret
                    halaman kita pindah. */}
                <iframe
                  key={pemutar}
                  src={pemutar}
                  title={v.title}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  sandbox="allow-scripts allow-forms allow-popups allow-presentation"
                />
              </div>
            ) : (
              <div className="kp-empty">
                <p className="kp-empty-title">Pemutar tidak tersedia</p>
                <p className="kp-empty-desc">Sumbernya tidak menyediakan pemutar yang dikenali untuk judul ini.</p>
              </div>
            )}

            {v.players?.length > 1 && (
              <div className="af-chips kp-server">
                <span className="af-label">Server</span>
                {v.players.map((p, i) => (
                  <button
                    key={p}
                    className={`af-chip ${i === pemutarIdx ? 'aktif' : ''}`}
                    onClick={() => setPemutarIdx(i)}
                  >
                    Server {i + 1}
                  </button>
                ))}
              </div>
            )}

            {v.synopsis && (
              <section className="kp-detail-sinopsis">
                <h2 className="kp-h2">Sinopsis</h2>
                <p>{v.synopsis}</p>
              </section>
            )}

            <div className="kp-pagination">
              <button className="btn-glass" onClick={() => pindah('video')}>Kembali ke daftar</button>
            </div>
          </>
        )}
      </div>
    );
  }

  /* ══════ My List ══════ */
  if (view === 'mylist') {
    return (
      <div className="kp-page sooramicsplus-page">
        {Nav}
        <div className="kp-ml-header">
          <h2 className="kp-ml-title">My List</h2>
          <span className="kp-ml-count">{myList.length} judul</span>
        </div>
        {myList.length === 0 ? (
          <div className="kp-empty">
            <p className="kp-empty-title">Belum ada yang disimpan</p>
            <p className="kp-empty-desc">Simpan judul dari halaman detailnya, lalu muncul di sini.</p>
          </div>
        ) : (
          <div className="kp-grid">
            {myList.map((it) => (
              <Kartu
                key={it.id}
                item={{ id: it.id, title: it.title, thumb: it.image, rating: it.rating, type: it.type }}
                onKlik={bukaDetail}
                onHapus={(x) => { removeFromMyList(x.id, JENIS_LIST); muatMyList(); }}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ══════ Detail komik ══════ */
  if (view === 'detail') {
    return (
      <div className="kp-page sooramicsplus-page">
        {Nav}
        {muatDetail ? <Loading /> : galatDetail || !detail ? (
          <div className="kp-empty">
            <p className="kp-empty-title">Gagal memuat judul</p>
            <p className="kp-empty-desc">{galatDetail || 'Judul ini tidak ditemukan.'}</p>
            <button className="btn-glass" onClick={() => pindah(sebelumnya === 'detail' ? 'home' : sebelumnya)}>Kembali</button>
          </div>
        ) : (
          <>
            <div className="kp-detail-top">
              <img className="kp-detail-cover" src={gambarDoujin(detail.thumb)} alt="" referrerPolicy="no-referrer" />
              <div className="kp-detail-info">
                <h1 className="kp-detail-title">{detail.title}</h1>
                {detail.altTitle && <p className="kp-detail-subtitle">{detail.altTitle}</p>}

                <div className="kp-detail-meta">
                  {detail.rating != null && <span><IconStar size={13} /> {detail.rating}</span>}
                  {detail.type && <span className="kp-tag">{detail.type}</span>}
                  {detail.status && <span className="kp-tag">{detail.status}</span>}
                  {detail.views > 0 && <span><IconPages size={13} /> {angkaRingkas(detail.views)} dibaca</span>}
                  <span><IconHash size={13} /> {detail.chapters.length} chapter</span>
                </div>

                {(detail.author || detail.artist) && (
                  <p className="kp-detail-orang">
                    {detail.author && <>Penulis: <b>{detail.author}</b></>}
                    {detail.author && detail.artist && <span className="kp-sep">·</span>}
                    {detail.artist && <>Ilustrator: <b>{detail.artist}</b></>}
                  </p>
                )}

                <div className="kp-detail-actions">
                  {chapterUrut.length > 0 && (
                    <button className="btn-play sooramicsplus-btn-play" onClick={() => bukaChapter(chapterUrut[0])}>
                      <IconBook size={16} /> Mulai dari awal
                    </button>
                  )}
                  <button className={`btn-glass ${tersimpan ? 'aktif' : ''}`} onClick={toggleSimpan}>
                    <IconHeart size={15} /> {tersimpan ? 'Tersimpan' : 'Simpan'}
                  </button>
                </div>

                {detail.genres.length > 0 && (
                  <div className="kp-detail-tags">
                    {detail.genres.map((g) => (
                      <button
                        key={g.slug}
                        className="kp-tag kp-tag-link"
                        onClick={() => { setGenre(g.slug); setKataCari(''); setKotakCari(''); pindah('jelajah'); }}
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {detail.synopsis && (
              <section className="kp-detail-sinopsis">
                <h2 className="kp-h2">Sinopsis</h2>
                <p>{detail.synopsis}</p>
              </section>
            )}

            <section className="kp-pages-section">
              <h2 className="kp-h2">Chapter <span className="kp-ml-count">{detail.chapters.length}</span></h2>
              {detail.chapters.length === 0 ? (
                <p className="kp-empty-desc">Belum ada chapter yang bisa dibaca.</p>
              ) : (
                <ul className="kp-ch-list">
                  {detail.chapters.map((c) => (
                    <li key={c.id}>
                      <button className="kp-ch-row" onClick={() => bukaChapter(c)}>
                        <span className="kp-ch-num">{c.number != null ? `Ch ${c.number}` : 'Ch'}</span>
                        <span className="kp-ch-title">{c.title || `Chapter ${c.number ?? ''}`}</span>
                        {c.date && <span className="kp-ch-date">{tanggalRingkas(c.date)}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    );
  }

  /* ══════ Pembaca — komponen yang sama persis dengan sooramics ══════ */
  if (muatBaca) return <Loading text="Memuat chapter..." theme="sooramics" />;

  return (
    <div className="sooramicsplus-page">
      <MangaReaderView
        mangaTitle={detail?.title || ''}
        chapters={chapterUrut}
        initialChapterId={chapterAwal}
        initialPages={halamanAwal}
        fetchPages={ambilHalaman}
        getPageSrc={srcHalaman}
        onBack={() => pindah('detail')}
      />
    </div>
  );
}
