import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProgressList, removeProgress } from '../utils/progress';

/**
 * Continue Watching / Reading row. Shows the user's in-progress titles for one
 * section ('anime' | 'movie' | 'manga'), each resuming where they left off.
 * Reads from the local progress store (synced with the backend on login).
 */
export default function ContinueRow({ section, title = 'Lanjutkan' }) {
  const navigate = useNavigate();
  const [items, setItems] = useState(() => getProgressList(section));
  const scrollRef = useRef(null);

  useEffect(() => {
    const refresh = () => setItems(getProgressList(section));
    refresh();
    window.addEventListener('progress-changed', refresh);
    return () => window.removeEventListener('progress-changed', refresh);
  }, [section]);

  const resume = useCallback((e) => {
    if (section === 'anime') {
      if (e.samehadakuId || e.sub) {
        navigate(`/watch/anime?title=${encodeURIComponent(e.title || '')}&sub=1&aid=${encodeURIComponent(e.samehadakuId || e.id)}&ep=${e.ep || 1}`);
      } else {
        navigate(`/anime/${encodeURIComponent(e.id)}`);
      }
    } else if (section === 'movie') {
      const mt = e.mediaType || 'movie';
      if (e.tmdbId) navigate(`/watch/movie?tmdbId=${e.tmdbId}&type=${mt}&season=${e.season || 1}&episode=${e.episode || 1}&title=${encodeURIComponent(e.title || '')}`);
      else navigate(`/${mt === 'tv' ? 'series' : 'movie'}/${e.id}`);
    } else {
      navigate(`/manga/read?id=${encodeURIComponent(e.id)}&chapterId=${encodeURIComponent(e.chapterId || '')}&provider=${e.provider || 'mangapill'}`);
    }
  }, [section, navigate]);

  const del = (e, ev) => { ev.stopPropagation(); removeProgress(section, e.id); };

  const scroll = (dir) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir * scrollRef.current.clientWidth * 0.8, behavior: 'smooth' });
  };

  if (!items.length) return null;

  return (
    <section className="srow srow-continue">
      <div className="srow-head">
        <span className="srow-eyebrow">Lanjut dari terakhir</span>
        <h2 className="srow-title">{title}</h2>
      </div>
      <div className="srail">
        <button className="srail-arrow srail-arrow-left" onClick={() => scroll(-1)} aria-label="Geser kiri">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="22" height="22"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <button className="srail-arrow srail-arrow-right" onClick={() => scroll(1)} aria-label="Geser kanan">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="22" height="22"><path d="m9 18 6-6-6-6"/></svg>
        </button>
        <div className="cont-scroll" ref={scrollRef}>
          {items.map((e) => (
            <button className="cont-card" key={`${e.section}:${e.id}`} onClick={() => resume(e)}>
              <div className="cont-art">
                <img src={e.image} alt={e.title} loading="lazy" referrerPolicy="no-referrer" onError={(ev) => { ev.target.style.opacity = 0; }} />
                <div className="cont-grad" />
                <div className="cont-play"><svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
                <span className="cont-remove" onClick={(ev) => del(e, ev)} title="Hapus" role="button">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </span>
                <span className="cont-badge">
                  {section === 'manga'
                    ? (e.chapter ? `Ch ${e.chapter}` : 'Lanjut')
                    : section === 'movie' && e.mediaType === 'tv'
                      ? `S${e.season || 1} E${e.episode || 1}`
                      : section === 'anime'
                        ? `EP ${e.ep || 1}`
                        : 'Lanjut'}
                </span>
              </div>
              <span className="cont-title">{e.title}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
