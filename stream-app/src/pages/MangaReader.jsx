import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getMangaChapterPages, getMangaInfo, getMangaDexChapterPages, getMangaDexInfo, getKomikuChapterPages, getKomikuInfo, normalizeMangaTitle, mangaImgProxy } from '../api';
import { buildMangaUrl } from '../utils/seo';
import { getOfflinePages, getChapterMeta } from '../utils/mangaDB';
import { saveProgress } from '../utils/progress';
import Loading from '../components/Loading';

export default function MangaReader() {
  const [searchParams] = useSearchParams();
  const mangaId = searchParams.get('id');
  const chapterId = searchParams.get('chapterId');
  const provider = searchParams.get('provider') || 'mangapill';
  const isOffline = searchParams.get('offline') === '1';
  const navigate = useNavigate();

  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mangaInfo, setMangaInfo] = useState(null);
  const [readMode, setReadMode] = useState('vertical'); // vertical | page
  const [currentPage, setCurrentPage] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [imgErrors, setImgErrors] = useState({});
  const [autoScroll, setAutoScroll] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(0); // 0=off, 1=slow, 2=medium, 3=fast
  // ── Infinite chapter scroll (vertical mode) ──
  // segments: [{ chId, num, title, pages }] appended as the user reaches the end
  const [segments, setSegments] = useState([]);
  const [activeChId, setActiveChId] = useState(chapterId); // chapter currently in view
  const [appending, setAppending] = useState(false);
  const readerRef = useRef(null);
  const pageRefs = useRef([]);
  const autoScrollRef = useRef(null);
  const scrollSpeedRef = useRef(0);
  const appendingRef = useRef(false);
  const loadedChIds = useRef(new Set());

  // Find current chapter and neighbors
  const chapters = mangaInfo?.chapters || [];
  const sortedChapters = [...chapters].sort((a, b) => {
    const numA = parseFloat(a.chapter || a.id?.match(/chapter[_-]?([\d.]+)/)?.[1] || '0');
    const numB = parseFloat(b.chapter || b.id?.match(/chapter[_-]?([\d.]+)/)?.[1] || '0');
    return numA - numB;
  });
  // Nav is based on the chapter CURRENTLY IN VIEW (activeChId), which advances
  // as the reader infinitely scrolls into appended chapters.
  const currentIdx = sortedChapters.findIndex((ch) => ch.id === activeChId);
  const prevChapter = currentIdx > 0 ? sortedChapters[currentIdx - 1] : null;
  const nextChapter = currentIdx < sortedChapters.length - 1 ? sortedChapters[currentIdx + 1] : null;
  const currentChapter = sortedChapters[currentIdx] || null;

  // Provider-aware page fetch for one chapter id
  const fetchPagesFor = useCallback(async (chId) => {
    if (isOffline) {
      const blobUrls = await getOfflinePages(chId);
      return (blobUrls || []).map((url, i) => ({ img: url, page: i + 1, _blob: true }));
    }
    if (provider === 'komiku') return (await getKomikuChapterPages(chId)).data || [];
    if (provider === 'mangadex') return (await getMangaDexChapterPages(chId)).data || [];
    return (await getMangaChapterPages(chId, provider)).data || [];
  }, [provider, isOffline]);

  // Fetch chapter pages + manga info (or load offline)
  useEffect(() => {
    if (!chapterId) return;
    const isMangaDex = provider === 'mangadex';
    const selectedLang = localStorage.getItem('soora_manga_lang') || 'en';

    // Offline: load from IndexedDB
    if (isOffline) {
      (async () => {
        setLoading(true);
        setError(null);
        setCurrentPage(0);
        setImgErrors({});
        try {
          const blobUrls = await getOfflinePages(chapterId);
          if (!blobUrls || blobUrls.length === 0) throw new Error('No offline pages found');
          setPages(blobUrls.map((url, i) => ({ img: url, page: i + 1, _blob: true })));
          // Try to load manga info for chapter nav (non-critical)
          try {
            const chMeta = await getChapterMeta(chapterId);
            if (chMeta && mangaId) {
              const isKomiku = provider === 'komiku';
              const infoFn = isKomiku ? getKomikuInfo : isMangaDex ? (id) => getMangaDexInfo(id, selectedLang) : (id) => getMangaInfo(id, provider);
              const infoRes = await infoFn(mangaId);
              if (infoRes?.data) setMangaInfo(infoRes.data);
            }
          } catch (_) { /* ignore */ }
        } catch (err) {
          setError(err.message || 'Failed to load offline chapter');
        } finally {
          setLoading(false);
        }
      })();
      return () => {
        // Revoke blob URLs on cleanup
        pages.forEach(p => { if (p._blob && p.img) try { URL.revokeObjectURL(p.img); } catch (_) {} });
      };
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setCurrentPage(0);
      setImgErrors({});
      setActiveChId(chapterId);
      loadedChIds.current = new Set([chapterId]);
      try {
        const isKomiku = provider === 'komiku';
        const pagesPromise = fetchPagesFor(chapterId);
        const infoPromise = mangaId
          ? (isKomiku ? getKomikuInfo(mangaId) : isMangaDex ? getMangaDexInfo(mangaId, selectedLang) : getMangaInfo(mangaId, provider))
          : Promise.reject('no id');

        const [pagesRes, infoRes] = await Promise.allSettled([pagesPromise, infoPromise]);

        if (pagesRes.status !== 'fulfilled') throw new Error('Failed to load chapter pages');
        const pg = pagesRes.value || [];
        setPages(pg);

        let info = null;
        if (infoRes.status === 'fulfilled') { info = infoRes.value.data; setMangaInfo(info); }

        // seed the first segment for infinite scroll
        const chMeta = (info?.chapters || []).find((c) => c.id === chapterId);
        setSegments([{ chId: chapterId, num: chMeta?.chapter, title: chMeta?.title, pages: pg }]);
      } catch (err) {
        setError(err.message || 'Failed to load chapter');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [chapterId, mangaId, provider, isOffline, fetchPagesFor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save Continue Reading progress when manga info + active chapter known
  useEffect(() => {
    if (!mangaId || !mangaInfo) return;
    const chNum = currentChapter?.chapter ||
      (currentChapter?.title || activeChId || '').match(/([\d.]+)/)?.[1] || '';
    saveProgress({
      section: 'manga',
      id: mangaId,
      title: typeof mangaInfo.title === 'object'
        ? (mangaInfo.title.english || mangaInfo.title.romaji || mangaInfo.title.userPreferred)
        : (mangaInfo.title || ''),
      image: mangaInfo.image || mangaInfo.cover || '',
      chapter: chNum,
      chapterId: activeChId,
      provider,
    });
  }, [mangaId, mangaInfo, activeChId, currentChapter, provider]);

  // Controls are toggled by click only (no auto-hide timer)
  const toggleControls = useCallback(() => {
    setShowControls((v) => !v);
  }, []);

  // Track current page in vertical mode
  useEffect(() => {
    if (readMode !== 'vertical') return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = parseInt(entry.target.dataset.page, 10);
            if (!isNaN(idx)) setCurrentPage(idx);
          }
        });
      },
      { threshold: 0.5 }
    );

    pageRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [pages, readMode]);

  // Auto-scroll logic
  const SPEEDS = [0, 0.8, 2, 4.5]; // px per frame: off, slow, medium, fast
  const SPEED_LABELS = ['Off', 'Lambat', 'Sedang', 'Cepat'];

  useEffect(() => { scrollSpeedRef.current = scrollSpeed; }, [scrollSpeed]);

  useEffect(() => {
    if (readMode !== 'vertical' || scrollSpeed === 0) {
      if (autoScrollRef.current) { cancelAnimationFrame(autoScrollRef.current); autoScrollRef.current = null; }
      setAutoScroll(false);
      return;
    }
    setAutoScroll(true);
    const step = () => {
      const spd = scrollSpeedRef.current;
      if (spd === 0) { autoScrollRef.current = null; return; }
      window.scrollBy(0, SPEEDS[spd]);
      autoScrollRef.current = requestAnimationFrame(step);
    };
    autoScrollRef.current = requestAnimationFrame(step);
    return () => { if (autoScrollRef.current) cancelAnimationFrame(autoScrollRef.current); };
  }, [scrollSpeed, readMode]);

  const cycleAutoScroll = () => {
    setScrollSpeed((s) => (s + 1) % 4);
  };

  // ── Infinite chapter scroll: append the next chapter when the user nears the
  //    end of the last loaded one (1.2s grace so it feels like the chapter just
  //    extends, not a page jump). ──
  const appendNextChapter = useCallback(async () => {
    if (appendingRef.current) return;
    const last = segments[segments.length - 1];
    if (!last) return;
    const lastIdx = sortedChapters.findIndex((c) => c.id === last.chId);
    const next = lastIdx >= 0 && lastIdx < sortedChapters.length - 1 ? sortedChapters[lastIdx + 1] : null;
    if (!next || loadedChIds.current.has(next.id)) return;
    appendingRef.current = true;
    setAppending(true);
    loadedChIds.current.add(next.id);
    try {
      await new Promise((r) => setTimeout(r, 1200)); // grace delay
      const pg = await fetchPagesFor(next.id);
      if (pg.length) {
        setSegments((prev) => [...prev, { chId: next.id, num: next.chapter, title: next.title, pages: pg }]);
      } else {
        loadedChIds.current.delete(next.id); // allow retry
      }
    } catch {
      loadedChIds.current.delete(next.id);
    } finally {
      appendingRef.current = false;
      setAppending(false);
    }
  }, [segments, sortedChapters, fetchPagesFor]);

  // Watch a sentinel near the bottom; when visible, append next chapter.
  const sentinelRef = useRef(null);
  useEffect(() => {
    if (readMode !== 'vertical' || isOffline) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) appendNextChapter();
    }, { rootMargin: '1200px 0px' }); // start loading well before the end
    obs.observe(el);
    return () => obs.disconnect();
  }, [readMode, isOffline, appendNextChapter]);

  // Track which chapter is in view → update header + URL (no reload)
  useEffect(() => {
    if (readMode !== 'vertical') return;
    const markers = Array.from(document.querySelectorAll('[data-seg-ch]'));
    if (!markers.length) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const chId = e.target.getAttribute('data-seg-ch');
          if (chId && chId !== activeChId) {
            setActiveChId(chId);
            try {
              const url = `/manga/read?id=${encodeURIComponent(mangaId)}&chapterId=${encodeURIComponent(chId)}&provider=${provider}`;
              window.history.replaceState(null, '', url);
            } catch { /* ignore */ }
          }
        }
      });
    }, { threshold: 0, rootMargin: '-45% 0px -45% 0px' }); // whichever segment crosses mid-viewport
    markers.forEach((m) => obs.observe(m));
    return () => obs.disconnect();
  }, [segments, readMode, activeChId, mangaId, provider]);

  // Page mode keyboard navigation
  useEffect(() => {
    if (readMode !== 'page') return;
    const handleKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goNextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goPrevPage();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [readMode, currentPage, pages.length]);

  const goNextPage = () => {
    if (currentPage < pages.length - 1) {
      setCurrentPage((p) => p + 1);
    } else if (nextChapter) {
      navigateChapter(nextChapter.id);
    }
  };

  const goPrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage((p) => p - 1);
    } else if (prevChapter) {
      navigateChapter(prevChapter.id);
    }
  };

  const navigateChapter = (chId) => {
    navigate(`/manga/read?id=${encodeURIComponent(mangaId)}&chapterId=${encodeURIComponent(chId)}&provider=${provider}`, { replace: true });
    window.scrollTo(0, 0);
  };

  const handleImgError = (idx) => {
    setImgErrors((prev) => ({ ...prev, [idx]: true }));
  };

  // Tap zones for page mode (left = prev, right = next, center = controls)
  // Click anywhere to toggle header/footer container
  const handleTap = (e) => {
    // Don't toggle if user clicked a button/link inside bars
    if (e.target.closest('.mangareader-topbar') || e.target.closest('.mangareader-bottombar')) return;
    // If in page mode, keep tap zones for navigation
    if (readMode === 'page') {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const third = rect.width / 3;
      if (x < third) goPrevPage();
      else if (x > third * 2) goNextPage();
      else toggleControls();
      return;
    }
    // In vertical mode, toggle controls on any click
    toggleControls();
  };

  if (!chapterId) return <div className="error-msg">No chapter ID provided</div>;
  if (loading) return <Loading text="Loading chapter..." theme="sooramics" />;
  if (error) return <div className="error-msg manga-error">{error}<br/><button className="manga-retry-btn" onClick={() => window.location.reload()}>Retry</button></div>;

  const chapterTitle = currentChapter?.title || chapterId.replace(/.*chapter[_-]?/i, 'Chapter ') || 'Chapter';
  const chapterNum = currentChapter?.chapter ||
    (currentChapter?.title || chapterId || '').match(/([\d.]+)/)?.[1] ||
    (currentIdx >= 0 ? currentIdx + 1 : '?');
  const mangaTitle = mangaInfo ? normalizeMangaTitle(mangaInfo.title) : '';
  const isMangaDex = provider === 'mangadex';

  // MangaDex images from uploads.mangadex.org don't need proxy
  const getPageSrc = (page) => {
    const url = page.img;
    if (!url) return '';
    // Blob URLs (offline) - return as-is
    if (page._blob || url.startsWith('blob:')) return url;
    if (isMangaDex || url.includes('mangadex.org')) return url;
    if (provider === 'komiku' || url.includes('komiku.org')) return url;
    return mangaImgProxy(url);
  };

  return (
    <div className={`mangareader-page ${readMode === 'page' ? 'mangareader-page-mode' : ''}`} ref={readerRef}>
      {/* Top bar */}
      <div className={`mangareader-topbar ${showControls ? 'visible' : ''}`}>
        <button className="mangareader-back" onClick={() => navigate(buildMangaUrl(mangaId))}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <div className="mangareader-title-area">
          <span className="mangareader-manga-title">{mangaTitle}</span>
          <span className="mangareader-ch-title">{chapterTitle}</span>
        </div>
        {/* Auto-scroll button (vertical mode only) */}
        {readMode === 'vertical' && (
          <button
            className={`mangareader-autoscroll-btn ${scrollSpeed > 0 ? 'active' : ''}`}
            onClick={cycleAutoScroll}
            title={`Auto Scroll: ${SPEED_LABELS[scrollSpeed]}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <path d="M12 5v14M5 12l7 7 7-7"/>
            </svg>
            {scrollSpeed > 0 && (
              <span className="mangareader-speed-badge">{scrollSpeed}x</span>
            )}
          </button>
        )}
        <div className="mangareader-mode-toggle">
          <button
            className={readMode === 'vertical' ? 'active' : ''}
            onClick={() => { setReadMode('vertical'); }}
            title="Vertical Scroll"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <rect x="4" y="2" width="16" height="20" rx="2"/>
              <path d="M8 6h8M8 10h8M8 14h8"/>
            </svg>
          </button>
          <button
            className={readMode === 'page' ? 'active' : ''}
            onClick={() => { setReadMode('page'); setScrollSpeed(0); }}
            title="Page by Page"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <rect x="2" y="3" width="8" height="18" rx="1"/>
              <rect x="14" y="3" width="8" height="18" rx="1"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Reader content */}
      <div className="mangareader-content" onClick={handleTap}>
        {readMode === 'vertical' ? (
          <div className="mangareader-vertical">
            {segments.map((seg, si) => (
              <div key={seg.chId} data-seg-ch={seg.chId} className="mangareader-segment">
                {/* Chapter divider between appended chapters */}
                {si > 0 && (
                  <div className="mangareader-ch-divider">
                    <span>Chapter {seg.num || (seg.title || '').match(/([\d.]+)/)?.[1] || '?'}</span>
                  </div>
                )}
                {(seg.pages || []).map((page, i) => {
                  const key = `${seg.chId}-${page.page || i}`;
                  return (
                    <div key={key} className="mangareader-img-wrap">
                      {imgErrors[key] ? (
                        <div className="mangareader-img-error">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <path d="M9 9l6 6M15 9l-6 6"/>
                          </svg>
                          <span>Failed to load page {i + 1}</span>
                        </div>
                      ) : (
                        <img
                          src={getPageSrc(page)}
                          alt={`Page ${page.page || i + 1}`}
                          loading="lazy"
                          onError={() => handleImgError(key)}
                          referrerPolicy="no-referrer"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {/* Sentinel + appending indicator */}
            {!isOffline && nextChapter && (
              <div ref={sentinelRef} className="mangareader-sentinel">
                {appending && (
                  <div className="mangareader-appending">
                    <div className="subindo-spinner" />
                    <span>Memuat chapter berikutnya…</span>
                  </div>
                )}
              </div>
            )}
            {!isOffline && !nextChapter && segments.length > 0 && (
              <div className="mangareader-end">Tamat — chapter terakhir</div>
            )}
          </div>
        ) : (
          <div className="mangareader-single">
            {pages[currentPage] && (
              imgErrors[currentPage] ? (
                <div className="mangareader-img-error">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <path d="M9 9l6 6M15 9l-6 6"/>
                  </svg>
                  <span>Failed to load page {currentPage + 1}</span>
                </div>
              ) : (
                <img
                  src={getPageSrc(pages[currentPage])}
                  alt={`Page ${currentPage + 1}`}
                  onError={() => handleImgError(currentPage)}
                  referrerPolicy="no-referrer"
                />
              )
            )}
            {/* Tap zone indicators */}
            <div className="mangareader-tap-zones">
              <div className="tap-zone tap-prev" />
              <div className="tap-zone tap-menu" />
              <div className="tap-zone tap-next" />
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className={`mangareader-bottombar ${showControls ? 'visible' : ''}`}>
        <div className="mangareader-nav">
          <button
            className="mangareader-nav-btn"
            disabled={!prevChapter}
            onClick={() => prevChapter && navigateChapter(prevChapter.id)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
            Prev
          </button>
          <span className="mangareader-page-indicator">
            Chap {chapterNum}
          </span>
          <button
            className="mangareader-nav-btn"
            disabled={!nextChapter}
            onClick={() => nextChapter && navigateChapter(nextChapter.id)}
          >
            Next
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
        </div>

        {readMode === 'page' && (
          <input
            type="range"
            className="mangareader-slider"
            min="0"
            max={pages.length - 1}
            value={currentPage}
            onChange={(e) => setCurrentPage(parseInt(e.target.value, 10))}
          />
        )}

        {/* Auto-scroll speed bar (bottom, vertical mode) */}
        {readMode === 'vertical' && scrollSpeed > 0 && (
          <div className="mangareader-autoscroll-bar">
            <span className="mangareader-as-label">Auto Scroll</span>
            <div className="mangareader-as-speeds">
              {[1, 2, 3].map((s) => (
                <button
                  key={s}
                  className={`mangareader-as-speed ${scrollSpeed === s ? 'active' : ''}`}
                  onClick={() => setScrollSpeed(s)}
                >
                  {SPEED_LABELS[s]}
                </button>
              ))}
            </div>
            <button className="mangareader-as-stop" onClick={() => setScrollSpeed(0)}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
