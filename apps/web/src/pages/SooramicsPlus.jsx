import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  daftarDoujin, cariDoujin, genreDoujin, detailDoujin, chapterDoujin,
  gambarDoujin, URUTAN, JENIS,
} from '@soora/core/doujin';
import { addToMyList, removeFromMyList, isInMyList, getMyList } from '../utils/mylist';
import Loading from '../components/Loading';
import CustomSelect from '../components/CustomSelect';
import Landing from './Landing';
import { IconStar, IconBook, IconHash, IconPages, IconHeart } from '../components/icons';

/**
 * Pustaka tambahan (sooramics+).
 *
 * Satu sumber saja, dilayani backend kita sendiri di /doujin. Sebelumnya
 * halaman ini menggabungkan dua sumber berbeda lewat sebuah sakelar mode,
 * dan keduanya punya bentuk data, penomoran halaman, serta aturan gambar
 * yang berbeda — hampir semua kerumitan halaman ini lahir dari situ.
 *
 * Tampilannya sengaja memakai kelas yang sama dengan sooramics (kp-*, af-*,
 * mangareader-*) supaya keduanya tidak pelan-pelan menyimpang: satu perbaikan
 * tampilan berlaku untuk dua-duanya.
 */

/** Baris di beranda. Tiap baris hanya berbeda pada pengurutannya. */
const BARIS_BERANDA = [
  { kunci: 'latest_chapter', label: 'Update Terbaru' },
  { kunci: 'views', label: 'Paling Banyak Dibaca' },
  { kunci: 'rating', label: 'Rating Tertinggi' },
  { kunci: 'created_at', label: 'Baru Ditambahkan' },
];

/** Simpanan My List memakai jenis sendiri, terpisah dari sooramics biasa. */
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

/* ════════════════════════════════════════════
   Kartu & baris
   ════════════════════════════════════════════ */

function Kartu({ item, onKlik, onHapus }) {
  return (
    <button className="kp-card" onClick={() => onKlik(item)} title={item.title}>
      <div className="kp-card-img-wrap">
        {item.thumb
          ? <img src={gambarDoujin(item.thumb)} alt="" loading="lazy" />
          : <div className="kp-card-kosong" aria-hidden="true"><IconBook size={22} /></div>}
        {item.latestChapter != null && (
          <span className="kp-card-badge">Ch {item.latestChapter}</span>
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
          {item.rating != null && <><IconStar size={11} /> {item.rating}</>}
          {item.rating != null && item.type && <span className="kp-sep">·</span>}
          {item.type}
        </span>
      </div>
    </button>
  );
}

function BarisGeser({ judul, items, memuat, onKlik }) {
  const ref = useRef(null);
  const geser = (arah) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: arah * el.clientWidth * 0.85, behavior: 'smooth' });
  };
  if (!memuat && !items.length) return null;
  return (
    <section className="srow">
      <div className="srow-head">
        <h2 className="srow-title">{judul}</h2>
      </div>
      <div className="srail">
        <button className="srail-arrow srail-arrow-left" onClick={() => geser(-1)} aria-label="Geser kiri">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="22" height="22"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <button className="srail-arrow srail-arrow-right" onClick={() => geser(1)} aria-label="Geser kanan">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="22" height="22"><path d="m9 18 6-6-6-6" /></svg>
        </button>
        <div className="card-row" ref={ref}>
          {memuat
            ? Array.from({ length: 8 }).map((_, i) => <div className="kp-card-skel" key={i} />)
            : items.map((it) => (
              <div className="kp-card-row-item" key={it.id}>
                <Kartu item={it} onKlik={onKlik} />
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════
   Halaman
   ════════════════════════════════════════════ */

export default function SooramicsPlus() {
  const [view, setView] = useState('landing'); // landing | home | jelajah | mylist | detail | reader
  const [sebelumnya, setSebelumnya] = useState('home');
  const pindah = useCallback((next) => {
    setView((cur) => { setSebelumnya(cur); return next; });
    window.scrollTo({ top: 0 });
  }, []);

  // ── Beranda ──
  const [baris, setBaris] = useState({});
  const [muatBeranda, setMuatBeranda] = useState(true);
  const [hero, setHero] = useState([]);
  const [heroIdx, setHeroIdx] = useState(0);

  // ── Genre ──
  const [genres, setGenres] = useState([]);

  // ── Jelajah ──
  const [urut, setUrut] = useState('latest_chapter');
  const [jenis, setJenis] = useState('');
  const [genre, setGenre] = useState('');
  const [cariGenre, setCariGenre] = useState('');
  const [filterBuka, setFilterBuka] = useState(false);
  const [hasil, setHasil] = useState([]);
  const [halaman, setHalaman] = useState(1);
  const [muatHasil, setMuatHasil] = useState(false);
  const [adaLagi, setAdaLagi] = useState(true);

  // ── Pencarian ──
  const [kotakCari, setKotakCari] = useState('');
  const [kataCari, setKataCari] = useState('');

  // ── Detail & pembaca ──
  const [detail, setDetail] = useState(null);
  const [muatDetail, setMuatDetail] = useState(false);
  const [galatDetail, setGalatDetail] = useState('');
  const [chapterAktif, setChapterAktif] = useState(null);
  const [isiChapter, setIsiChapter] = useState(null);
  const [muatChapter, setMuatChapter] = useState(false);
  const [galatGambar, setGalatGambar] = useState({});

  // ── My List ──
  const [myList, setMyList] = useState(
    () => getMyList().filter((i) => i.listType === JENIS_LIST)
  );
  const muatMyList = useCallback(() => {
    setMyList(getMyList().filter((i) => i.listType === JENIS_LIST));
  }, []);

  /* ── Beranda: empat baris + genre, sekali jalan ── */
  useEffect(() => {
    if (view === 'landing') return;
    let batal = false;
    (async () => {
      setMuatBeranda(true);
      const hasilBaris = await Promise.all(
        BARIS_BERANDA.map((b) =>
          daftarDoujin({ sort: b.kunci, limit: 20 }).catch(() => [])
        )
      );
      if (batal) return;
      const peta = {};
      BARIS_BERANDA.forEach((b, i) => { peta[b.kunci] = hasilBaris[i]; });
      setBaris(peta);
      // Sorotan diambil dari rating tertinggi yang punya sampul — kartu tanpa
      // gambar di panggung utama terlihat seperti halaman gagal dimuat.
      setHero((peta.rating || []).filter((x) => x.thumb).slice(0, 6));
      setMuatBeranda(false);
    })();
    return () => { batal = true; };
  }, [view === 'landing']); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (view === 'landing') return;
    genreDoujin().then(setGenres).catch(() => setGenres([]));
  }, [view === 'landing']); // eslint-disable-line react-hooks/exhaustive-deps

  /* Sorotan berganti sendiri. Dihentikan saat bukan di beranda supaya tidak
     ada timer yang jalan di latar sambil membaca. */
  useEffect(() => {
    if (view !== 'home' || hero.length < 2) return;
    const t = setInterval(() => setHeroIdx((i) => (i + 1) % hero.length), 6000);
    return () => clearInterval(t);
  }, [view, hero.length]);

  /* ── Jelajah: muat saat filter berubah ── */
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
    // Pemuatan memang dipicu dari sini, bukan dari tiap penangan filter.
    // Urutan, jenis, genre, dan kata cari semuanya mengubah hasil yang sama;
    // menaruh pemanggilan di masing-masing tombol berarti satu tombol baru
    // suatu saat akan lupa memuat ulang — jenis bug yang sudah pernah terjadi
    // di fitur lain. Aturan lint di bawah menyoroti penyetelan penanda muat
    // yang berjalan serentak, dan itu memang disengaja di sini.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    muatJelajah(1, false);
  }, [view, muatJelajah]);

  const muatLagi = () => muatJelajah(halaman + 1, true);

  const kirimCari = (e) => {
    e.preventDefault();
    setKataCari(kotakCari.trim());
    pindah('jelajah');
  };

  /* ── Detail ── */
  const bukaDetail = useCallback(async (item) => {
    pindah('detail');
    setDetail(null);
    setGalatDetail('');
    setMuatDetail(true);
    try {
      const d = await detailDoujin(item.id);
      setDetail(d);
    } catch (err) {
      setGalatDetail(err.message || 'Judul ini tidak bisa dibuka');
    } finally {
      setMuatDetail(false);
    }
  }, [pindah]);

  /* ── Pembaca ── */
  const bukaChapter = useCallback(async (ch) => {
    pindah('reader');
    setChapterAktif(ch);
    setIsiChapter(null);
    setGalatGambar({});
    setMuatChapter(true);
    try {
      setIsiChapter(await chapterDoujin(ch.id));
    } catch {
      setIsiChapter({ images: [] });
    } finally {
      setMuatChapter(false);
    }
  }, [pindah]);

  /** Chapter diurutkan menurun dari sumber, jadi "berikutnya" ada di indeks
   *  yang lebih kecil. Diurus di satu tempat supaya tombolnya tidak terbalik. */
  const tetangga = useMemo(() => {
    const list = detail?.chapters || [];
    const i = list.findIndex((c) => c.id === chapterAktif?.id);
    if (i < 0) return { sebelum: null, sesudah: null };
    return { sebelum: list[i + 1] || null, sesudah: list[i - 1] || null };
  }, [detail, chapterAktif]);

  /* ── My List ── */
  const tersimpan = detail ? isInMyList(detail.id, JENIS_LIST) : false;
  const toggleSimpan = () => {
    if (!detail) return;
    if (tersimpan) {
      removeFromMyList(detail.id, JENIS_LIST);
    } else {
      addToMyList({
        id: detail.id,
        title: detail.title,
        image: detail.thumb,
        type: detail.type,
        listType: JENIS_LIST,
        rating: detail.rating,
      });
    }
    muatMyList();
  };


  const genreTersaring = useMemo(() => {
    const q = cariGenre.trim().toLowerCase();
    return q ? genres.filter((g) => g.name.toLowerCase().includes(q)) : genres;
  }, [genres, cariGenre]);

  /* ════════ Gerbang masuk ════════ */
  if (view === 'landing') {
    return <Landing showSooramicsPlus onSooramicsPlusClick={() => pindah('home')} />;
  }

  /* ════════ Bilah atas ════════ */
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
        <button className={`kp-nav-tab ${view === 'jelajah' ? 'aktif' : ''}`} onClick={() => pindah('jelajah')}>Jelajah</button>
        <button className={`kp-nav-tab ${view === 'mylist' ? 'aktif' : ''}`} onClick={() => { muatMyList(); pindah('mylist'); }}>
          My List
          {myList.length > 0 && <span className="kp-nav-badge">{myList.length}</span>}
        </button>
      </div>

      <form className="kp-nav-search" onSubmit={kirimCari}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={kotakCari}
          onChange={(e) => setKotakCari(e.target.value)}
          placeholder="Cari judul…"
          aria-label="Cari judul"
        />
        {kotakCari && (
          <button type="button" className="kp-nav-search-clear" onClick={() => { setKotakCari(''); setKataCari(''); }} aria-label="Bersihkan">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" width="13" height="13"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        )}
      </form>
    </div>
  );

  /* ════════ Beranda ════════ */
  if (view === 'home') {
    const sorot = hero[heroIdx];
    return (
      <div className="kp-page sooramicsplus-page">
        {Nav}

        {sorot && (
          <section className="kp-hero">
            <div className="kp-hero-bg" style={{ backgroundImage: `url(${gambarDoujin(sorot.thumb)})` }} aria-hidden="true" />
            <div className="kp-hero-shade" aria-hidden="true" />
            <div className="kp-hero-inner">
              <img className="kp-hero-cover" src={gambarDoujin(sorot.thumb)} alt="" />
              <div className="kp-hero-text">
                <span className="kp-hero-eyebrow">Rating tertinggi</span>
                <h1 className="kp-hero-title">{sorot.title}</h1>
                <div className="kp-hero-meta">
                  {sorot.rating != null && <span><IconStar size={13} /> {sorot.rating}</span>}
                  {sorot.type && <span className="kp-tag">{sorot.type}</span>}
                  {sorot.latestChapter != null && <span>Ch {sorot.latestChapter}</span>}
                </div>
                <div className="hero-actions">
                  <button className="btn-play sooramicsplus-btn-play" onClick={() => bukaDetail(sorot)}>
                    <IconBook size={16} /> Baca sekarang
                  </button>
                </div>
                <div className="kp-hero-dots">
                  {hero.map((h, i) => (
                    <button
                      key={h.id}
                      className={`kp-hero-dot ${i === heroIdx ? 'aktif' : ''}`}
                      onClick={() => setHeroIdx(i)}
                      aria-label={`Sorotan ${i + 1}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {BARIS_BERANDA.map((b) => (
          <BarisGeser
            key={b.kunci}
            judul={b.label}
            items={baris[b.kunci] || []}
            memuat={muatBeranda}
            onKlik={bukaDetail}
          />
        ))}

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

  /* ════════ Jelajah ════════ */
  if (view === 'jelajah') {
    const adaFilter = !!(genre || jenis || kataCari);
    return (
      <div className="kp-page sooramicsplus-page">
        {Nav}

        <div className="af-top">
          <div className="af-header-left">
            <h2 className="kp-ml-title">
              {kataCari ? `Hasil untuk "${kataCari}"` : genre ? genres.find((g) => g.slug === genre)?.name || 'Jelajah' : 'Jelajah'}
            </h2>
            {hasil.length > 0 && <span className="af-header-count">{hasil.length} judul</span>}
          </div>
          <div className="af-group">
            {!kataCari && (
              <CustomSelect
                value={urut}
                onChange={setUrut}
                options={URUTAN.map((u) => ({ value: u.nilai, label: u.label }))}
              />
            )}
            <button className={`btn-glass ${filterBuka ? 'aktif' : ''}`} onClick={() => setFilterBuka((v) => !v)}>
              Filter{adaFilter ? ' •' : ''}
            </button>
          </div>
        </div>

        {filterBuka && (
          /* Susunan af-panel > af-card.open > af-body > af-body-inner harus
             utuh. Akordeonnya diatur CSS lewat kelas `open`; tanpa itu isinya
             tetap terkatup (grid-template-rows: 0fr, max-height: 0) — panelnya
             terlihat terbuka tapi kosong, dan chip-nya yang terpotong justru
             menutupi grid di bawahnya sehingga tidak bisa diklik. */
          <div className="af-panel">
            <div className="af-card open">
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
                  <div className="af-header">
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
        )}

        {muatHasil && hasil.length === 0 ? (
          <Loading />
        ) : hasil.length === 0 ? (
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
                <button className="btn-glass" onClick={muatLagi} disabled={muatHasil}>
                  {muatHasil ? 'Memuat…' : 'Muat lebih banyak'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  /* ════════ My List ════════ */
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

  /* ════════ Detail ════════ */
  if (view === 'detail') {
    return (
      <div className="kp-page sooramicsplus-page">
        {Nav}
        {muatDetail ? (
          <Loading />
        ) : galatDetail || !detail ? (
          <div className="kp-empty">
            <p className="kp-empty-title">Gagal memuat judul</p>
            <p className="kp-empty-desc">{galatDetail || 'Judul ini tidak ditemukan.'}</p>
            <button className="btn-glass" onClick={() => pindah(sebelumnya === 'detail' ? 'home' : sebelumnya)}>Kembali</button>
          </div>
        ) : (
          <>
            <div className="kp-detail-top">
              <img className="kp-detail-cover" src={gambarDoujin(detail.thumb)} alt="" />
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
                  {detail.chapters.length > 0 && (
                    <button
                      className="btn-play sooramicsplus-btn-play"
                      onClick={() => bukaChapter(detail.chapters[detail.chapters.length - 1])}
                    >
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

  /* ════════ Pembaca ════════ */
  return (
    <div className="mangareader-content sooramicsplus-page">
      <div className="mangareader-bar">
        <button className="mangareader-back" onClick={() => pindah('detail')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Kembali
        </button>
        <span className="mangareader-ch-title">
          {isiChapter?.title || chapterAktif?.title || 'Chapter'}
        </span>
      </div>

      {muatChapter ? (
        <Loading />
      ) : !isiChapter?.images?.length ? (
        <div className="kp-empty">
          <p className="kp-empty-title">Chapter ini belum ada gambarnya</p>
          <p className="kp-empty-desc">Biasanya berarti chapternya baru didaftarkan tapi belum diunggah.</p>
          <button className="btn-glass" onClick={() => pindah('detail')}>Kembali ke daftar chapter</button>
        </div>
      ) : (
        <>
          {isiChapter.images.map((src, i) => (
            <div className="mangareader-img-wrap" key={`${src}-${i}`}>
              {galatGambar[i] ? (
                <div className="mangareader-img-error">Halaman {i + 1} gagal dimuat</div>
              ) : (
                <img
                  src={gambarDoujin(src)}
                  alt={`Halaman ${i + 1}`}
                  loading="lazy"
                  onError={() => setGalatGambar((g) => ({ ...g, [i]: true }))}
                />
              )}
            </div>
          ))}

          <div className="mangareader-chapter-nav">
            <button
              className="btn-glass"
              disabled={!tetangga.sebelum}
              onClick={() => tetangga.sebelum && bukaChapter(tetangga.sebelum)}
            >
              Chapter sebelumnya
            </button>
            <button className="btn-glass" onClick={() => pindah('detail')}>Daftar chapter</button>
            <button
              className="btn-glass"
              disabled={!tetangga.sesudah}
              onClick={() => tetangga.sesudah && bukaChapter(tetangga.sesudah)}
            >
              Chapter berikutnya
            </button>
          </div>
        </>
      )}
    </div>
  );
}
