import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getTMDBGenres,
  getTrendingTMDB,
  getPopularMovies,
  getPopularTV,
  discoverByGenre,
  discoverTMDB,
  getLK21HomeBundle,
  searchLK21,
} from '../api';
import { buildMovieUrl } from '../utils/seo';
import Card from '../components/Card';
import SearchSuggest from '../components/SearchSuggest';
import ContinueRow from '../components/ContinueRow';
import Top10Section from '../components/Top10Section';
import SkeletonHero from '../components/SkeletonHero';
import SkeletonSection from '../components/SkeletonSection';
import CustomSelect from '../components/CustomSelect';


/* ── filter options ── */
const TYPE_OPTIONS = [
  { value: '', label: 'Semua' },
  { value: 'movie', label: 'Movie' },
  { value: 'tv', label: 'TV Series' },
];

const SORT_OPTIONS = [
  { value: 'popularity.desc', label: 'Populer' },
  { value: 'vote_average.desc', label: 'Rating Tertinggi' },
  { value: 'primary_release_date.desc', label: 'Terbaru' },
  { value: 'revenue.desc', label: 'Revenue' },
];

const currentYear = new Date().getFullYear();
const QUICK_YEARS = Array.from({ length: 8 }, (_, i) => currentYear - i);
const ALL_YEARS = Array.from({ length: 30 }, (_, i) => currentYear - i);

/* genre sections with accent colors */
const GENRE_SECTIONS = [
  { id: 28, label: 'Action', color: '#ef4444' },
  { id: 35, label: 'Comedy', color: '#fbbf24' },
  { id: 18, label: 'Drama', color: '#f97316' },
  { id: 27, label: 'Horror', color: '#f43f5e' },
  { id: 10749, label: 'Romance', color: '#ec4899' },
  { id: 878, label: 'Sci-Fi', color: '#38bdf8' },
  { id: 53, label: 'Thriller', color: '#818cf8' },
  { id: 16, label: 'Animation', color: '#a78bfa' },
  { id: 10751, label: 'Family', color: '#34d399' },
  { id: 99, label: 'Documentary', color: '#22d3ee' },
];

/* ── page-level state cache (persists across mounts for instant back-nav) ── */
const _moviePageCache = {}; // keyed by lang: { en: { ts, data }, id: { ts, data } }
const PAGE_CACHE_TTL = 10 * 60 * 1000; // 10 min

const _saveMoviePageCache = (lang, state) => {
  _moviePageCache[lang] = { data: state, ts: Date.now() };
};

const _loadMoviePageCache = (lang) => {
  const c = _moviePageCache[lang];
  if (c && Date.now() - c.ts < PAGE_CACHE_TTL) return c.data;
  return null;
};

export default function MovieHome() {
  const [selectedLang, setSelectedLang] = useState(() => {
    return localStorage.getItem('soora_movie_lang') || 'en';
  });

  const cached = _loadMoviePageCache(selectedLang);
  const [trendingMovies, setTrendingMovies] = useState(cached?.trendingMovies || []);
  const [trendingTV, setTrendingTV] = useState(cached?.trendingTV || []);
  const [recentMovies, setRecentMovies] = useState(cached?.recentMovies || []);
  const [recentTV, setRecentTV] = useState(cached?.recentTV || []);
  const [genreData, setGenreData] = useState(cached?.genreData || {});
  const [allGenres, setAllGenres] = useState(cached?.allGenres || []);
  const [heroReady, setHeroReady] = useState(!!cached);
  const [sectionsReady, setSectionsReady] = useState(!!cached);
  const [genresReady, setGenresReady] = useState(!!cached);
  const [heroIdx, setHeroIdx] = useState(0);
  const [searchVal, setSearchVal] = useState('');

  /* filters */
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterGenre, setFilterGenre] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterSort, setFilterSort] = useState('popularity.desc');
  const [filteredResults, setFilteredResults] = useState(null);
  const [filterLoading, setFilterLoading] = useState(false);

  const navigate = useNavigate();
  const heroInterval = useRef(null);

  // Persist language choice
  useEffect(() => {
    localStorage.setItem('soora_movie_lang', selectedLang);
  }, [selectedLang]);

  const isFilterActive = filterType || filterGenre || filterYear || filterSort !== 'popularity.desc';

  /* ── Initial load — bundle first, fallback to individual ── */
  useEffect(() => {
    let cancelled = false;

    // Check if we have a warm page cache for this language
    const langCache = _loadMoviePageCache(selectedLang);
    if (langCache) {
      // Restore from cache instantly — no loading states
      setTrendingMovies(langCache.trendingMovies || []);
      setTrendingTV(langCache.trendingTV || []);
      setRecentMovies(langCache.recentMovies || []);
      setRecentTV(langCache.recentTV || []);
      setGenreData(langCache.genreData || {});
      setAllGenres(langCache.allGenres || []);
      setHeroReady(true);
      setSectionsReady(true);
      setGenresReady(true);
      setHeroIdx(0);
    } else {
      // Reset state on language change when no cache
      setTrendingMovies([]);
      setTrendingTV([]);
      setRecentMovies([]);
      setRecentTV([]);
      setGenreData({});
      setHeroReady(false);
      setSectionsReady(false);
      setGenresReady(false);
      setHeroIdx(0);
    }

    // ── LK21 (Indonesia) mode ──
    const fetchLK21 = async () => {
      try {
        const bundleRes = await getLK21HomeBundle();
        const d = bundleRes.data || bundleRes;
        if (cancelled) return;

        const normLK = (arr) => (arr || []).map((item) => ({
          id: item._id || item.id,
          lk21Id: item._id || item.id,
          title: item.title || 'Unknown',
          image: item.posterImg || item.image || '',
          type: item.type === 'series' ? 'TV Series' : 'Movie',
          mediaType: item.type === 'series' ? 'tv' : 'movie',
          rating: item.rating || '',
          qualityResolution: item.qualityResolution || '',
          genres: item.genres || [],
          provider: 'lk21',
        }));

        const popular = normLK(d.popularMovies);
        const rm = normLK(d.recentMovies);
        const ls = normLK(d.latestSeries);
        const ps = normLK(d.popularSeries);
        const topRated = normLK(d.topRatedMovies);
        const gd = topRated.length > 0 ? { topRated } : {};

        setTrendingMovies(popular);
        setHeroReady(true);
        setRecentMovies(rm);
        setTrendingTV(ls);
        setRecentTV(ps);
        setSectionsReady(true);
        setGenreData(gd);
        setGenresReady(true);

        // Save to page cache
        _saveMoviePageCache('id', {
          trendingMovies: popular,
          trendingTV: ls,
          recentMovies: rm,
          recentTV: ps,
          genreData: gd,
          allGenres: [],
        });
      } catch (err) {
        console.warn('LK21 bundle failed:', err);
        setHeroReady(true);
        setSectionsReady(true);
        setGenresReady(true);
      }
    };

    // ── TMDB (English) mode ──
    const fetchTMDBFallback = async () => {
      let _tm = [], _rm = [], _ttv = [], _rtv = [], _gd = {}, _ag = [];
      try {
        // Phase 1: Hero from TMDB trending
        const [trendRes, genresRes] = await Promise.all([
          getTrendingTMDB('movie', 'week'),
          getTMDBGenres().catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        _tm = trendRes.data?.results || [];
        if (_tm.length > 0) setTrendingMovies(_tm);
        setHeroReady(true);
        _ag = genresRes.data || [];
        if (_ag.length) setAllGenres(_ag);

        // Phase 2: Popular movies/TV + trending TV
        const [popMovies, popTV, trendTV] = await Promise.allSettled([
          getPopularMovies(),
          getPopularTV(),
          getTrendingTMDB('tv', 'week'),
        ]);
        if (cancelled) return;
        _rm = popMovies.status === 'fulfilled' ? popMovies.value.data?.results || [] : [];
        _ttv = trendTV.status === 'fulfilled' ? trendTV.value.data?.results || [] : [];
        _rtv = popTV.status === 'fulfilled' ? popTV.value.data?.results || [] : [];
        setRecentMovies(_rm);
        setTrendingTV(_ttv);
        setRecentTV(_rtv);
        setSectionsReady(true);

        // Phase 3: Genre sections
        const genreResults = await Promise.allSettled(
          GENRE_SECTIONS.map((g) => discoverByGenre(g.id, 1, 'movie'))
        );
        if (cancelled) return;
        GENRE_SECTIONS.forEach((g, i) => {
          if (genreResults[i].status === 'fulfilled') {
            _gd[g.id] = genreResults[i].value.data?.results || [];
          }
        });
        setGenreData(_gd);
        setGenresReady(true);

        // Save to page cache
        _saveMoviePageCache('en', {
          trendingMovies: _tm,
          trendingTV: _ttv,
          recentMovies: _rm,
          recentTV: _rtv,
          genreData: _gd,
          allGenres: _ag,
        });
      } catch {
        setHeroReady(true);
        setSectionsReady(true);
        setGenresReady(true);
      }
    };

    if (selectedLang === 'id') {
      fetchLK21();
    } else {
      // Goku removed from the pool (dead 502/empty). TMDB is the EN source.
      fetchTMDBFallback().finally(() => {
        if (!cancelled) {
          setHeroReady(true);
          setSectionsReady(true);
          setGenresReady(true);
        }
      });
    }

    return () => { cancelled = true; };
  }, [selectedLang]);

  /* ── Filter search ── */
  useEffect(() => {
    if (!isFilterActive) {
      setFilteredResults(null);
      return;
    }

    const fetchFiltered = async () => {
      setFilterLoading(true);
      try {
        if (selectedLang === 'id') {
          // LK21 mode: use search for genre/type filtering
          const genreConfig = GENRE_SECTIONS.find((g) => String(g.id) === filterGenre);
          const queries = genreConfig ? [genreConfig.label.toLowerCase()] : ['film', 'terbaru'];
          const results = await Promise.allSettled(queries.map((q) => searchLK21(q)));
          let items = [];
          const seen = new Set();
          results.forEach((r) => {
            if (r.status === 'fulfilled') {
              (r.value.data?.results || []).forEach((item) => {
                if (!seen.has(item.id)) {
                  seen.add(item.id);
                  items.push(item);
                }
              });
            }
          });
          // Client-side type filter
          if (filterType === 'movie') items = items.filter((i) => i.mediaType === 'movie');
          else if (filterType === 'tv') items = items.filter((i) => i.mediaType === 'tv');
          setFilteredResults(items.slice(0, 40));
        } else if (filterType) {
          // Single media type
          const res = await discoverTMDB({
            mediaType: filterType,
            genre: filterGenre || undefined,
            year: filterYear || undefined,
            sort: filterSort,
            page: 1,
          });
          setFilteredResults(res.data?.results || []);
        } else {
          // Both movie + tv
          const [movieRes, tvRes] = await Promise.allSettled([
            discoverTMDB({ mediaType: 'movie', genre: filterGenre || undefined, year: filterYear || undefined, sort: filterSort, page: 1 }),
            discoverTMDB({ mediaType: 'tv', genre: filterGenre || undefined, year: filterYear || undefined, sort: filterSort, page: 1 }),
          ]);
          const movies = movieRes.status === 'fulfilled' ? movieRes.value.data?.results || [] : [];
          const tvs = tvRes.status === 'fulfilled' ? tvRes.value.data?.results || [] : [];
          // Merge and sort by popularity (fallback)
          const merged = [...movies, ...tvs].sort((a, b) => (b.rating || 0) - (a.rating || 0));
          setFilteredResults(merged.slice(0, 40));
        }
      } catch {
        setFilteredResults([]);
      }
      setFilterLoading(false);
    };

    const debounce = setTimeout(fetchFiltered, 300);
    return () => clearTimeout(debounce);
  }, [filterType, filterGenre, filterYear, filterSort, isFilterActive, selectedLang]);

  /* ── Auto-rotate hero ── */
  useEffect(() => {
    if (trendingMovies.length < 2) return;
    heroInterval.current = setInterval(() => {
      setHeroIdx((i) => (i + 1) % Math.min(trendingMovies.length, 8));
    }, 6000);
    return () => clearInterval(heroInterval.current);
  }, [trendingMovies]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchVal.trim()) {
      navigate(`/movies/search?q=${encodeURIComponent(searchVal.trim())}`);
    }
  };

  const clearFilters = () => {
    setFilterType('');
    setFilterGenre('');
    setFilterYear('');
    setFilterSort('popularity.desc');
  };

  if (!heroReady) return (
    <div className="home-page sooraflix-page">
      <SkeletonHero theme="sooraflix" />
      <SkeletonSection />
      <SkeletonSection />
      <SkeletonSection />
    </div>
  );

  const hero = trendingMovies[heroIdx];
  const gokuHeroImg = (url) => url ? url.replace(/\/resize\/\d+x\d+\//, '/resize/1200x800/') : url;

  /* human-readable filter summary */
  const activeFilterCount = [filterType, filterGenre, filterYear, filterSort !== 'popularity.desc' ? filterSort : ''].filter(Boolean).length;
  const filterSummary = [
    filterType && TYPE_OPTIONS.find((o) => o.value === filterType)?.label,
    filterGenre && allGenres.find((g) => g.id === Number(filterGenre))?.name,
    filterYear,
    filterSort !== 'popularity.desc' && SORT_OPTIONS.find((o) => o.value === filterSort)?.label,
  ].filter(Boolean).join(' · ');

  return (
    <div className="home-page sooraflix-page">
      {/* Hero Banner */}
      {hero && (
        <div className="hero-banner sooraflix-hero" key={heroIdx}>
          <div className="hero-bg">
            <img src={hero.cover || gokuHeroImg(hero.image)} alt="" />
          </div>
          <div className="hero-content">
            <div className="hero-top-row">
              <div className="hero-badge sooraflix-badge">Trending</div>
              {hero.duration && <div className="hero-quality">{hero.duration}</div>}
            </div>
            <h1 className="hero-title">{hero.title || 'Unknown'}</h1>
            <div className="hero-meta">
              {hero.type && <span className="hero-tag">{hero.type}</span>}
              {hero.releaseDate && <span className="hero-tag">{hero.releaseDate}</span>}
              {hero.duration && <span className="hero-tag">{hero.duration}</span>}
            </div>
            <div className="hero-actions">
              <button className="btn-play sooraflix-btn-play" onClick={() => { const isLK = hero.provider === 'lk21'; const hid = isLK ? (hero.lk21Id || hero.id) : hero.id; navigate(buildMovieUrl(hid, hero.mediaType || 'movie')); }}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Watch Now
              </button>
              <button className="btn-glass" onClick={() => { const isLK = hero.provider === 'lk21'; const hid = isLK ? (hero.lk21Id || hero.id) : hero.id; navigate(buildMovieUrl(hid, hero.mediaType || 'movie')); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                Details
              </button>
            </div>
            {trendingMovies.length > 1 && (
              <div className="hero-dots">
                {trendingMovies.slice(0, 8).map((_, i) => (
                  <button
                    key={i}
                    className={`hero-dot ${i === heroIdx ? 'active' : ''}`}
                    onClick={() => setHeroIdx(i)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="home-search">
        <SearchSuggest kind="movie" placeholder="Cari film & serial..." className="home-search-suggest" />
      </div>

      {/* ── Filter Panel ── */}
      <div className="af-panel">
        <div className={`af-card ${filterOpen ? 'open' : ''}`}>
          {/* Toggle header */}
          <button className="af-header" onClick={() => setFilterOpen((v) => !v)}>
            <div className="af-header-left">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>
              </svg>
              <span>Filter</span>
              {isFilterActive && !filterOpen && (
                <span className="af-header-count">{activeFilterCount}</span>
              )}
            </div>
            <svg className="af-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </button>

          {/* Collapsible body */}
          <div className="af-body">
            <div className="af-body-inner">
              {/* Language + Type + Sort */}
              <div className="af-top">
                <div className="af-group">
                  <span className="af-label">Bahasa</span>
                  <div className="af-pills">
                    <button
                      className={`af-pill ${selectedLang === 'en' ? 'active' : ''}`}
                      onClick={() => setSelectedLang('en')}
                    >
                      🌐 English
                    </button>
                    <button
                      className={`af-pill ${selectedLang === 'id' ? 'active' : ''}`}
                      onClick={() => setSelectedLang('id')}
                    >
                      🇮🇩 Indonesia
                    </button>
                  </div>
                </div>
                <div className="af-divider" />
                <div className="af-group">
                  <span className="af-label">Tipe</span>
                  <div className="af-pills">
                    {TYPE_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        className={`af-pill ${filterType === o.value ? 'active' : ''}`}
                        onClick={() => setFilterType(o.value)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                {selectedLang !== 'id' && (
                  <>
                    <div className="af-divider" />
                    <div className="af-group">
                      <span className="af-label">Urutan</span>
                      <div className="af-pills">
                        {SORT_OPTIONS.map((o) => (
                          <button
                            key={o.value}
                            className={`af-pill ${filterSort === o.value ? 'active' : ''}`}
                            onClick={() => setFilterSort(o.value)}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Genre picker — only for EN mode (TMDB genres) */}
              {selectedLang !== 'id' && allGenres.length > 0 && (
                <div className="af-year-section">
                  <span className="af-label">Genre</span>
                  <div className="af-genre-track">
                    <button
                      className={`af-pill ${filterGenre === '' ? 'active' : ''}`}
                      onClick={() => setFilterGenre('')}
                    >
                      Semua
                    </button>
                    {allGenres.map((g) => (
                      <button
                        key={g.id}
                        className={`af-pill ${filterGenre === String(g.id) ? 'active' : ''}`}
                        onClick={() => setFilterGenre(String(g.id))}
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Year picker — only for EN mode */}
              {selectedLang !== 'id' && (
              <div className="af-year-section">
                <span className="af-label">Tahun</span>
                <div className="af-year-track">
                  <button
                    className={`af-year-btn ${filterYear === '' ? 'active' : ''}`}
                    onClick={() => setFilterYear('')}
                  >
                    Semua
                  </button>
                  {QUICK_YEARS.map((y) => (
                    <button
                      key={y}
                      className={`af-year-btn ${filterYear === String(y) ? 'active' : ''}`}
                      onClick={() => setFilterYear(String(y))}
                    >
                      {y}
                    </button>
                  ))}
                  <div className="af-year-more">
                    <CustomSelect
                      value={!filterYear || QUICK_YEARS.includes(Number(filterYear)) ? '' : filterYear}
                      onChange={(val) => val && setFilterYear(val)}
                      options={[{ value: '', label: 'Lainnya' }, ...ALL_YEARS.filter((y) => !QUICK_YEARS.includes(y)).map((y) => ({ value: String(y), label: String(y) }))]}
                      className="af-year-cs"
                    />
                  </div>
                </div>
              </div>
              )}

              {/* Active summary bar */}
              {isFilterActive && (
                <div className="af-active-bar">
                  <div className="af-chips">
                    {filterType && (
                      <span className="af-chip">
                        {TYPE_OPTIONS.find((o) => o.value === filterType)?.label}
                        <button onClick={() => setFilterType('')} aria-label="Remove">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11"><path d="M18 6 6 18M6 6l12 12"/></svg>
                        </button>
                      </span>
                    )}
                    {filterGenre && (
                      <span className="af-chip">
                        {allGenres.find((g) => g.id === Number(filterGenre))?.name}
                        <button onClick={() => setFilterGenre('')} aria-label="Remove">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11"><path d="M18 6 6 18M6 6l12 12"/></svg>
                        </button>
                      </span>
                    )}
                    {filterYear && (
                      <span className="af-chip">
                        {filterYear}
                        <button onClick={() => setFilterYear('')} aria-label="Remove">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11"><path d="M18 6 6 18M6 6l12 12"/></svg>
                        </button>
                      </span>
                    )}
                    {filterSort !== 'popularity.desc' && (
                      <span className="af-chip">
                        {SORT_OPTIONS.find((o) => o.value === filterSort)?.label}
                        <button onClick={() => setFilterSort('popularity.desc')} aria-label="Remove">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11"><path d="M18 6 6 18M6 6l12 12"/></svg>
                        </button>
                      </span>
                    )}
                  </div>
                  <button className="af-reset" onClick={clearFilters}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                    </svg>
                    Reset
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Filter Results ── */}
      {isFilterActive && (
        <div className="filter-results-area">
          <div className="filter-results-header">
            <h2>Hasil Pencarian</h2>
            {filterSummary && <span className="filter-summary-tag">{filterSummary}</span>}
          </div>
          {filterLoading ? (
            <div className="filter-loading">
              <div className="filter-spinner" />
              <span>Mencari film...</span>
            </div>
          ) : filteredResults && filteredResults.length > 0 ? (
            <div className="filter-results-grid">
              {filteredResults.slice(0, 40).map((item) => (
                <Card key={`${item.mediaType}-${item.id}`} item={item} type="movie" />
              ))}
            </div>
          ) : filteredResults !== null ? (
            <div className="filter-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M8 11h6" strokeLinecap="round"/>
              </svg>
              <p>Tidak ada film yang cocok dengan filter ini</p>
              <button className="af-reset" onClick={clearFilters}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                </svg>
                Reset Filter
              </button>
            </div>
          ) : null}
        </div>
      )}



      {/* ── Default Sections (when no filter active) ── */}
      {!isFilterActive && (
        <>
          {/* Top 10 section */}
          {sectionsReady && trendingMovies.length > 0 && (
            <Top10Section
              title={selectedLang === 'id' ? 'Film & Series Saat Ini' : 'Movies & Series Right Now'}
              items={trendingMovies}
              type="movie"
            />
          )}

          {/* Continue Watching */}
          <ContinueRow section="movie" title="Lanjutkan Nonton" />

          {/* Base sections — show skeleton while loading */}
          {sectionsReady ? (
            <>
              {trendingMovies.length > 0 && (
                <Section
                  title={selectedLang === 'id' ? 'Film Populer' : 'Trending Movies'}
                  items={trendingMovies}
                  type="movie"
                />
              )}
              {recentMovies.length > 0 && (
                <Section
                  title={selectedLang === 'id' ? 'Rilis Terbaru' : 'Recent Movies'}
                  items={recentMovies}
                  type="movie"
                />
              )}
              {trendingTV.length > 0 && (
                <Section
                  title={selectedLang === 'id' ? 'Series Terbaru' : 'Trending TV Shows'}
                  items={trendingTV}
                  type="movie"
                />
              )}
              {recentTV.length > 0 && (
                <Section
                  title={selectedLang === 'id' ? 'Series Populer' : 'Recent TV Shows'}
                  items={recentTV}
                  type="movie"
                />
              )}
            </>
          ) : (
            <>
              {trendingMovies.length > 0 && (
                <Section
                  title={selectedLang === 'id' ? 'Film Populer' : 'Trending Movies'}
                  items={trendingMovies}
                  type="movie"
                />
              )}
              <SkeletonSection />
              <SkeletonSection />
              <SkeletonSection />
            </>
          )}

          {/* Genre sections (EN) or Top Rated (ID) — show skeletons while loading */}
          {genresReady ? (
            selectedLang === 'id' ? (
              genreData.topRated && genreData.topRated.length > 0 && (
                <div className="section-fade-in">
                  <Section
                    title="Rating Tertinggi"
                    items={genreData.topRated}
                    type="movie"
                    accentColor="#fbbf24"
                  />
                </div>
              )
            ) : (
              GENRE_SECTIONS.map((genre) => {
                const items = genreData[genre.id];
                if (!items || items.length === 0) return null;
                return (
                  <div key={genre.id} className="section-fade-in">
                    <Section
                      title={genre.label}
                      items={items}
                      type="movie"
                      accentColor={genre.color}
                    />
                  </div>
                );
              })
            )
          ) : (
            sectionsReady && selectedLang !== 'id' && GENRE_SECTIONS.slice(0, 3).map((g) => (
              <SkeletonSection key={`skel-${g.id}`} accentColor={g.color} />
            ))
          )}
        </>
      )}

      {!trendingMovies.length && !recentMovies.length && heroReady && sectionsReady && (
        <div className="empty-state">
          {selectedLang === 'id' ? (
            <p>Tidak ada data film. Pastikan server API berjalan.</p>
          ) : (
            <>
              <p>No movie data available. The Goku provider may be unreachable (WARP proxy required).</p>
              <button
                className="btn-play sooraflix-btn-play"
                style={{ marginTop: '1rem', padding: '0.6rem 1.5rem', cursor: 'pointer' }}
                onClick={() => setSelectedLang('id')}
              >
                🇮🇩 Switch to Indonesian Movies
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, items, type, accentColor }) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll, items]);

  const scroll = (dir) => {
    if (!scrollRef.current) return;
    const cardW = scrollRef.current.querySelector('.card')?.offsetWidth || 200;
    scrollRef.current.scrollBy({ left: dir * cardW * 3, behavior: 'smooth' });
  };

  return (
    <section className="home-section">
      <div className="section-header">
        <h2 className="section-title">
          {accentColor && <span className="section-dot" style={{ background: accentColor }} />}
          {title}
        </h2>
        <div className="section-nav">
          <button onClick={() => scroll(-1)} className={`scroll-btn ${!canScrollLeft ? 'disabled' : ''}`} disabled={!canScrollLeft}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <button onClick={() => scroll(1)} className={`scroll-btn ${!canScrollRight ? 'disabled' : ''}`} disabled={!canScrollRight}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </div>
      </div>
      <div className="card-row-wrapper">
        {canScrollLeft && <div className="row-fade row-fade-left" />}
        {canScrollRight && <div className="row-fade row-fade-right" />}
        <div className="card-row" ref={scrollRef}>
          {items.slice(0, 20).map((item) => (
            <Card key={item.id} item={item} type={type} />
          ))}
        </div>
      </div>
    </section>
  );
}
