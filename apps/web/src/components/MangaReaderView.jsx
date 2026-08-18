import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Pembaca komik — tampilan dan perilakunya, tanpa tahu sumber datanya.
 *
 * Dipakai sooramics dan sooramics+. Dulu keduanya punya pembaca sendiri, dan
 * yang di sooramics+ jauh lebih sederhana: tanpa mode halaman, tanpa gulir
 * otomatis, tanpa sambung chapter. Dijadikan satu supaya keduanya tidak bisa
 * lagi berbeda — satu perbaikan berlaku untuk dua-duanya.
 *
 * Yang tetap jadi urusan pemanggil hanyalah cara mengambil data: dari mana
 * halaman diambil (`fetchPages`) dan bagaimana alamat gambarnya dibentuk
 * (`getPageSrc`). Sisanya — mode baca, gulir otomatis, sambung chapter,
 * papan tik, zona ketuk — hidup di sini.
 */

/** Ditulis di luar komponen: mendefinisikannya di dalam badan render membuat
 *  React menganggapnya komponen baru tiap render, lalu melepas dan memasang
 *  ulang simpulnya — halaman yang sedang dibaca ikut berkedip. */
function Galat({ n }) {
  return (
    <div className="mangareader-img-error">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 9l6 6M15 9l-6 6" />
      </svg>
      <span>Halaman {n} gagal dimuat</span>
    </div>
  );
}

/** Piksel per bingkai: mati, lambat, sedang, cepat. */
const SPEEDS = [0, 0.8, 2, 4.5];
const SPEED_LABELS = ['Off', 'Lambat', 'Sedang', 'Cepat'];

export default function MangaReaderView({
  mangaTitle = '',
  chapters = [],
  initialChapterId,
  initialPages = [],
  fetchPages,
  getPageSrc,
  onBack,
  onChapterChange,
  allowInfinite = true,
}) {
  const [readMode, setReadMode] = useState('vertical'); // vertical | page
  const [currentPage, setCurrentPage] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [imgErrors, setImgErrors] = useState({});
  const [scrollSpeed, setScrollSpeed] = useState(0);
  const [segments, setSegments] = useState([]);
  const [activeChId, setActiveChId] = useState(initialChapterId);
  const [appending, setAppending] = useState(false);

  const readerRef = useRef(null);
  const pageRefs = useRef([]);
  const autoScrollRef = useRef(null);
  const scrollSpeedRef = useRef(0);
  const appendingRef = useRef(false);
  const loadedChIds = useRef(new Set());
  const sentinelRef = useRef(null);

  /* Daftar chapter dibaca lewat ref di dalam efek.
     Pemanggil lazim menyusunnya ulang tiap render ([...chapters].sort()), jadi
     memasukkannya ke daftar dependensi membuat efek di bawah berjalan terus
     dan pembacanya melompat kembali ke halaman satu tanpa henti. */
  const chaptersRef = useRef(chapters);
  useEffect(() => { chaptersRef.current = chapters; }, [chapters]);

  /* Chapter pertama jadi segmen awal tiap kali pembaca dibuka untuk chapter
     lain. Riwayat segmen lama dibuang — kalau tidak, chapter yang dipilih
     manual akan menempel di bawah chapter sebelumnya. */
  useEffect(() => {
    const meta = chaptersRef.current.find((c) => c.id === initialChapterId);
    setSegments(initialPages.length
      ? [{ chId: initialChapterId, num: meta?.chapter, title: meta?.title, pages: initialPages }]
      : []);
    setActiveChId(initialChapterId);
    setCurrentPage(0);
    setImgErrors({});
    loadedChIds.current = new Set([initialChapterId]);
  }, [initialChapterId, initialPages]);

  const idx = chapters.findIndex((c) => c.id === activeChId);
  const prevChapter = idx > 0 ? chapters[idx - 1] : null;
  const nextChapter = idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : null;
  const currentChapter = chapters[idx] || null;

  /** Halaman datar untuk mode halaman-per-halaman. */
  const pages = segments.flatMap((s) => s.pages || []);

  /* Nomor urut halaman lintas-segmen, dihitung di muka.
     Sebelumnya dipakai penghitung yang dinaikkan selagi JSX disusun; React
     melarangnya karena render boleh diulang atau dibuang di tengah jalan, dan
     nomornya jadi meleset. */
  const awalSegmen = [];
  segments.reduce((acc, seg) => {
    awalSegmen.push(acc);
    return acc + (seg.pages || []).length;
  }, 0);

  const toggleControls = useCallback(() => setShowControls((v) => !v), []);

  // Lacak halaman yang sedang terlihat (mode gulir).
  useEffect(() => {
    if (readMode !== 'vertical') return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const n = parseInt(e.target.dataset.page, 10);
          if (!Number.isNaN(n)) setCurrentPage(n);
        }
      });
    }, { threshold: 0.5 });
    pageRefs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [segments, readMode]);

  useEffect(() => { scrollSpeedRef.current = scrollSpeed; }, [scrollSpeed]);

  // Gulir otomatis.
  useEffect(() => {
    if (readMode !== 'vertical' || scrollSpeed === 0) {
      if (autoScrollRef.current) { cancelAnimationFrame(autoScrollRef.current); autoScrollRef.current = null; }
      return;
    }
    const step = () => {
      const s = scrollSpeedRef.current;
      if (s === 0) { autoScrollRef.current = null; return; }
      window.scrollBy(0, SPEEDS[s]);
      autoScrollRef.current = requestAnimationFrame(step);
    };
    autoScrollRef.current = requestAnimationFrame(step);
    return () => { if (autoScrollRef.current) cancelAnimationFrame(autoScrollRef.current); };
  }, [scrollSpeed, readMode]);

  const cycleAutoScroll = () => setScrollSpeed((s) => (s + 1) % 4);

  /* Sambung chapter berikutnya saat pembaca mendekati ujung. Jeda 1,2 detik
     supaya terasa seperti chapternya memanjang, bukan halaman melompat. */
  const appendNextChapter = useCallback(async () => {
    if (appendingRef.current || !fetchPages) return;
    const last = segments[segments.length - 1];
    if (!last) return;
    const li = chapters.findIndex((c) => c.id === last.chId);
    const next = li >= 0 && li < chapters.length - 1 ? chapters[li + 1] : null;
    if (!next || loadedChIds.current.has(next.id)) return;

    appendingRef.current = true;
    setAppending(true);
    loadedChIds.current.add(next.id);
    try {
      await new Promise((r) => setTimeout(r, 1200));
      const pg = await fetchPages(next.id);
      if (pg?.length) {
        setSegments((prev) => [...prev, { chId: next.id, num: next.chapter, title: next.title, pages: pg }]);
      } else {
        loadedChIds.current.delete(next.id); // biarkan dicoba lagi
      }
    } catch {
      loadedChIds.current.delete(next.id);
    } finally {
      appendingRef.current = false;
      setAppending(false);
    }
  }, [segments, chapters, fetchPages]);

  useEffect(() => {
    if (readMode !== 'vertical' || !allowInfinite) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) appendNextChapter();
    }, { rootMargin: '1200px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [readMode, allowInfinite, appendNextChapter]);

  // Chapter mana yang sedang di tengah layar → judul dan alamat ikut menyesuaikan.
  useEffect(() => {
    if (readMode !== 'vertical') return;
    const markers = Array.from(document.querySelectorAll('[data-seg-ch]'));
    if (!markers.length) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const chId = e.target.getAttribute('data-seg-ch');
        if (chId && chId !== activeChId) {
          setActiveChId(chId);
          onChapterChange?.(chId);
        }
      });
    }, { threshold: 0, rootMargin: '-45% 0px -45% 0px' });
    markers.forEach((m) => obs.observe(m));
    return () => obs.disconnect();
  }, [segments, readMode, activeChId, onChapterChange]);

  const pindahChapter = useCallback(async (chId) => {
    if (!fetchPages) return;
    setScrollSpeed(0);
    setCurrentPage(0);
    setImgErrors({});
    window.scrollTo(0, 0);
    const meta = chapters.find((c) => c.id === chId);
    try {
      const pg = await fetchPages(chId);
      loadedChIds.current = new Set([chId]);
      setSegments([{ chId, num: meta?.chapter, title: meta?.title, pages: pg || [] }]);
      setActiveChId(chId);
      onChapterChange?.(chId);
    } catch { /* pemanggil yang menampilkan galatnya */ }
  }, [fetchPages, chapters, onChapterChange]);

  const goNextPage = useCallback(() => {
    if (currentPage < pages.length - 1) setCurrentPage((p) => p + 1);
    else if (nextChapter) pindahChapter(nextChapter.id);
  }, [currentPage, pages.length, nextChapter, pindahChapter]);

  const goPrevPage = useCallback(() => {
    if (currentPage > 0) setCurrentPage((p) => p - 1);
    else if (prevChapter) pindahChapter(prevChapter.id);
  }, [currentPage, prevChapter, pindahChapter]);

  // Papan tik untuk mode halaman.
  useEffect(() => {
    if (readMode !== 'page') return;
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goNextPage(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goPrevPage(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [readMode, goNextPage, goPrevPage]);

  const handleImgError = (key) => setImgErrors((p) => ({ ...p, [key]: true }));

  /* Zona ketuk: di mode halaman kiri/kanan berpindah dan tengah membuka
     kendali; di mode gulir, ketukan di mana pun membuka kendali. */
  const handleTap = (e) => {
    if (e.target.closest('.mangareader-topbar') || e.target.closest('.mangareader-bottombar')) return;
    if (readMode === 'page') {
      const r = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - r.left;
      const third = r.width / 3;
      if (x < third) goPrevPage();
      else if (x > third * 2) goNextPage();
      else toggleControls();
      return;
    }
    toggleControls();
  };

  const chapterTitle = currentChapter?.title || 'Chapter';
  const chapterNum = currentChapter?.chapter
    ?? (currentChapter?.title || '').match(/([\d.]+)/)?.[1]
    ?? (idx >= 0 ? idx + 1 : '?');

  return (
    <div className={`mangareader-page ${readMode === 'page' ? 'mangareader-page-mode' : ''}`} ref={readerRef}>
      <div className={`mangareader-topbar ${showControls ? 'visible' : ''}`}>
        <button className="mangareader-back" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="mangareader-title-area">
          <span className="mangareader-manga-title">{mangaTitle}</span>
          <span className="mangareader-ch-title">{chapterTitle}</span>
        </div>

        {readMode === 'vertical' && (
          <button
            className={`mangareader-autoscroll-btn ${scrollSpeed > 0 ? 'active' : ''}`}
            onClick={cycleAutoScroll}
            title={`Auto Scroll: ${SPEED_LABELS[scrollSpeed]}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
            {scrollSpeed > 0 && <span className="mangareader-speed-badge">{scrollSpeed}x</span>}
          </button>
        )}

        <div className="mangareader-mode-toggle">
          <button
            className={readMode === 'vertical' ? 'active' : ''}
            onClick={() => setReadMode('vertical')}
            title="Gulir vertikal"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <rect x="4" y="2" width="16" height="20" rx="2" />
              <path d="M8 6h8M8 10h8M8 14h8" />
            </svg>
          </button>
          <button
            className={readMode === 'page' ? 'active' : ''}
            onClick={() => { setReadMode('page'); setScrollSpeed(0); }}
            title="Halaman per halaman"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <rect x="2" y="3" width="8" height="18" rx="1" />
              <rect x="14" y="3" width="8" height="18" rx="1" />
            </svg>
          </button>
        </div>
      </div>

      <div className="mangareader-content" onClick={handleTap}>
        {readMode === 'vertical' ? (
          <div className="mangareader-vertical">
            {segments.map((seg, si) => (
              <div key={seg.chId} data-seg-ch={seg.chId} className="mangareader-segment">
                {si > 0 && (
                  <div className="mangareader-ch-divider">
                    <span>Chapter {seg.num || (seg.title || '').match(/([\d.]+)/)?.[1] || '?'}</span>
                  </div>
                )}
                {(seg.pages || []).map((page, i) => {
                  const key = `${seg.chId}-${page.page || i}`;
                  const pos = awalSegmen[si] + i;
                  return (
                    <div
                      key={key}
                      className="mangareader-img-wrap"
                      data-page={pos}
                      ref={(el) => { pageRefs.current[pos] = el; }}
                    >
                      {imgErrors[key] ? <Galat n={i + 1} /> : (
                        <img
                          src={getPageSrc(page)}
                          alt={`Halaman ${page.page || i + 1}`}
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

            {allowInfinite && nextChapter && (
              <div ref={sentinelRef} className="mangareader-sentinel">
                {appending && (
                  <div className="mangareader-appending">
                    <div className="subindo-spinner" />
                    <span>Memuat chapter berikutnya…</span>
                  </div>
                )}
              </div>
            )}
            {allowInfinite && !nextChapter && segments.length > 0 && (
              <div className="mangareader-end">Tamat — chapter terakhir</div>
            )}
          </div>
        ) : (
          <div className="mangareader-single">
            {pages[currentPage] && (
              imgErrors[`single-${currentPage}`] ? <Galat n={currentPage + 1} /> : (
                <img
                  src={getPageSrc(pages[currentPage])}
                  alt={`Halaman ${currentPage + 1}`}
                  onError={() => handleImgError(`single-${currentPage}`)}
                  referrerPolicy="no-referrer"
                />
              )
            )}
            <div className="mangareader-tap-zones">
              <div className="tap-zone tap-prev" />
              <div className="tap-zone tap-menu" />
              <div className="tap-zone tap-next" />
            </div>
          </div>
        )}
      </div>

      <div className={`mangareader-bottombar ${showControls ? 'visible' : ''}`}>
        <div className="mangareader-nav">
          <button
            className="mangareader-nav-btn"
            disabled={!prevChapter}
            onClick={() => prevChapter && pindahChapter(prevChapter.id)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Prev
          </button>
          <span className="mangareader-page-indicator">Chap {chapterNum}</span>
          <button
            className="mangareader-nav-btn"
            disabled={!nextChapter}
            onClick={() => nextChapter && pindahChapter(nextChapter.id)}
          >
            Next
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>

        {readMode === 'page' && pages.length > 1 && (
          <input
            type="range"
            className="mangareader-slider"
            min="0"
            max={pages.length - 1}
            value={currentPage}
            onChange={(e) => setCurrentPage(parseInt(e.target.value, 10))}
          />
        )}

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
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
