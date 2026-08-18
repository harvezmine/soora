import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getMangaChapterPages, getMangaInfo, getMangaDexChapterPages, getMangaDexInfo, getKomikuChapterPages, getKomikuInfo, normalizeMangaTitle, mangaImgProxy } from '@soora/core/api';
import { buildMangaUrl } from '../utils/seo';
import { getOfflinePages, getChapterMeta } from '../utils/mangaDB';
import { saveProgress } from '../utils/progress';
import Loading from '../components/Loading';
import MangaReaderView from '../components/MangaReaderView';

/**
 * Pembaca sooramics.
 *
 * Halaman ini mengurus SUMBER datanya saja — provider mana, mode luring, dan
 * pencatatan progres. Cara membacanya (mode gulir/halaman, gulir otomatis,
 * sambung chapter) ada di MangaReaderView, yang dipakai bersama sooramics+
 * supaya keduanya tidak bisa berbeda.
 */
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
  const [activeChId, setActiveChId] = useState(chapterId);
  const pagesRef = useRef([]);

  // Urutan chapter dipakai untuk navigasi. Dibekukan dengan useMemo: pembaca
  // memakainya sebagai penanda identitas, dan menyusunnya ulang tiap render
  // membuatnya mengira daftarnya berganti terus.
  const sortedChapters = useMemo(() => {
    const list = mangaInfo?.chapters || [];
    return [...list].sort((a, b) => {
      const na = parseFloat(a.chapter || a.id?.match(/chapter[_-]?([\d.]+)/)?.[1] || '0');
      const nb = parseFloat(b.chapter || b.id?.match(/chapter[_-]?([\d.]+)/)?.[1] || '0');
      return na - nb;
    });
  }, [mangaInfo]);

  const currentChapter = sortedChapters.find((c) => c.id === activeChId) || null;

  // Pengambilan halaman satu chapter, sadar provider.
  const fetchPagesFor = useCallback(async (chId) => {
    if (isOffline) {
      const blobUrls = await getOfflinePages(chId);
      return (blobUrls || []).map((url, i) => ({ img: url, page: i + 1, _blob: true }));
    }
    if (provider === 'komiku') return (await getKomikuChapterPages(chId)).data || [];
    if (provider === 'mangadex') return (await getMangaDexChapterPages(chId)).data || [];
    return (await getMangaChapterPages(chId, provider)).data || [];
  }, [provider, isOffline]);

  useEffect(() => { pagesRef.current = pages; }, [pages]);

  // Ambil halaman + info manga (atau muat dari simpanan luring).
  useEffect(() => {
    if (!chapterId) return;
    const isMangaDex = provider === 'mangadex';
    const selectedLang = localStorage.getItem('soora_manga_lang') || 'en';

    if (isOffline) {
      (async () => {
        setLoading(true);
        setError(null);
        try {
          const blobUrls = await getOfflinePages(chapterId);
          if (!blobUrls || blobUrls.length === 0) throw new Error('No offline pages found');
          setPages(blobUrls.map((url, i) => ({ img: url, page: i + 1, _blob: true })));
          try {
            const chMeta = await getChapterMeta(chapterId);
            if (chMeta && mangaId) {
              const isKomiku = provider === 'komiku';
              const infoFn = isKomiku ? getKomikuInfo : isMangaDex ? (id) => getMangaDexInfo(id, selectedLang) : (id) => getMangaInfo(id, provider);
              const infoRes = await infoFn(mangaId);
              if (infoRes?.data) setMangaInfo(infoRes.data);
            }
          } catch { /* info bukan bagian penting */ }
        } catch (err) {
          setError(err.message || 'Failed to load offline chapter');
        } finally {
          setLoading(false);
        }
      })();
      return () => {
        // Alamat blob dilepas saat keluar supaya tidak menahan memori.
        pagesRef.current.forEach((p) => {
          if (p._blob && p.img) { try { URL.revokeObjectURL(p.img); } catch { /* sudah dilepas */ } }
        });
      };
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setActiveChId(chapterId);
      try {
        const isKomiku = provider === 'komiku';
        const pagesPromise = fetchPagesFor(chapterId);
        const infoPromise = mangaId
          ? (isKomiku ? getKomikuInfo(mangaId) : isMangaDex ? getMangaDexInfo(mangaId, selectedLang) : getMangaInfo(mangaId, provider))
          : Promise.reject(new Error('no id'));

        const [pagesRes, infoRes] = await Promise.allSettled([pagesPromise, infoPromise]);
        if (pagesRes.status !== 'fulfilled') throw new Error('Failed to load chapter pages');
        setPages(pagesRes.value || []);
        if (infoRes.status === 'fulfilled') setMangaInfo(infoRes.value.data);
      } catch (err) {
        setError(err.message || 'Failed to load chapter');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [chapterId, mangaId, provider, isOffline, fetchPagesFor]);

  // Catat "lanjutkan baca" begitu info manga dan chapter aktif diketahui.
  useEffect(() => {
    if (!mangaId || !mangaInfo) return;
    const chNum = currentChapter?.chapter
      || (currentChapter?.title || activeChId || '').match(/([\d.]+)/)?.[1] || '';
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

  const isMangaDex = provider === 'mangadex';

  /** Gambar mangadex boleh langsung; komiku menolak hotlink jadi harus lewat proxy. */
  const getPageSrc = useCallback((page) => {
    const url = page?.img;
    if (!url) return '';
    if (page._blob || url.startsWith('blob:')) return url;
    if (isMangaDex || url.includes('mangadex.org')) return url;
    return mangaImgProxy(url);
  }, [isMangaDex]);

  // Alamat ikut chapter yang sedang dibaca, tanpa memuat ulang halaman.
  const onChapterChange = useCallback((chId) => {
    setActiveChId(chId);
    try {
      window.history.replaceState(null, '',
        `/manga/read?id=${encodeURIComponent(mangaId)}&chapterId=${encodeURIComponent(chId)}&provider=${provider}`);
    } catch { /* alamat gagal ditulis bukan alasan berhenti membaca */ }
  }, [mangaId, provider]);

  if (!chapterId) return <div className="error-msg">No chapter ID provided</div>;
  if (loading) return <Loading text="Loading chapter..." theme="sooramics" />;
  if (error) {
    return (
      <div className="error-msg manga-error">
        {error}<br />
        <button className="manga-retry-btn" onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <MangaReaderView
      mangaTitle={mangaInfo ? normalizeMangaTitle(mangaInfo.title) : ''}
      chapters={sortedChapters}
      initialChapterId={chapterId}
      initialPages={pages}
      fetchPages={fetchPagesFor}
      getPageSrc={getPageSrc}
      onBack={() => navigate(buildMangaUrl(mangaId))}
      onChapterChange={onChapterChange}
      allowInfinite={!isOffline}
    />
  );
}
