import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { getMangaChapterPages, getKomikuChapterPages } from '@soora/core/api';
import {
  normalizeChapterPages,
  flattenChapterSegments,
  nextChapterAfter,
} from '@soora/core/models';

export type Chapter = { id?: string; title?: string; chapterNumber?: string | number };

export type Segmen = {
  chId: string;
  label: string;
  halaman: { uri: string; headers?: Record<string, string> }[];
};

/** Satu baris di daftar reader: halaman gambar, atau pemisah antar chapter. */
export type BarisReader =
  | {
      jenis: 'halaman';
      kunci: string;
      chId: string;
      uri: string;
      headers?: Record<string, string>;
      ke: number;
      dari: number;
    }
  | { jenis: 'pemisah'; kunci: string; chId: string; label: string };

async function ambilHalaman(chId: string, provider: string): Promise<Segmen['halaman']> {
  const res =
    provider === 'komiku'
      ? await getKomikuChapterPages(chId)
      : await getMangaChapterPages(chId, provider);
  // cachedGet mengembalikan respons axios; datanya ada di .data.
  const isi = (res as { data?: unknown })?.data ?? res;
  return normalizeChapterPages(isi) as Segmen['halaman'];
}

/** Jeda sebelum chapter berikutnya disambung. */
const JEDA_SAMBUNG_MS = 1200;

/**
 * Umpan chapter menerus untuk pembaca manga.
 *
 * Menyimpan daftar segmen — satu per chapter — dan menyambung chapter
 * berikutnya saat pembaca mendekati ujung. Ini yang membuat membaca terasa
 * seperti satu gulungan panjang alih-alih berhenti tiap chapter, sama seperti
 * pembaca di web.
 */
export function useChapterFeed({
  chapterAwal,
  provider,
  chapters,
  judulManga,
}: {
  chapterAwal: string;
  provider: string;
  chapters: Chapter[];
  judulManga: string;
}) {
  const [segmen, setSegmen] = useState<Segmen[]>([]);
  const [status, setStatus] = useState<'memuat' | 'siap' | 'galat'>('memuat');
  const [galat, setGalat] = useState('');
  const [menyambung, setMenyambung] = useState(false);
  const [habis, setHabis] = useState(false);

  // Ref, bukan state: dibaca di dalam callback yang tidak boleh ikut berubah
  // identitasnya tiap kali daftar bertambah.
  const sedangMenyambung = useRef(false);
  const sudahDimuat = useRef<Set<string>>(new Set());
  const hidup = useRef(true);

  useEffect(() => {
    hidup.current = true;
    return () => {
      hidup.current = false;
    };
  }, []);

  const urut = useMemo(() => chapters.filter((c) => c?.id), [chapters]);

  const labelChapter = useCallback(
    (ch: Chapter, i: number) => ch.title || `Chapter ${ch.chapterNumber ?? i + 1}`,
    []
  );

  // Muat chapter pembuka. Reset penuh saat judul atau chapter awal berganti,
  // kalau tidak segmen judul sebelumnya ikut terbawa.
  useEffect(() => {
    let batal = false;
    setStatus('memuat');
    setGalat('');
    setSegmen([]);
    setHabis(false);
    sudahDimuat.current = new Set();
    sedangMenyambung.current = false;

    (async () => {
      try {
        const halaman = await ambilHalaman(chapterAwal, provider);
        if (batal) return;
        const i = urut.findIndex((c) => c.id === chapterAwal);
        sudahDimuat.current.add(chapterAwal);
        setSegmen([
          {
            chId: chapterAwal,
            label: i >= 0 ? labelChapter(urut[i], i) : judulManga,
            halaman,
          },
        ]);
        setStatus('siap');
      } catch (e) {
        if (batal) return;
        setGalat(e instanceof Error ? e.message : String(e));
        setStatus('galat');
      }
    })();

    return () => {
      batal = true;
    };
  }, [chapterAwal, provider, urut, judulManga, labelChapter]);

  /**
   * Sambung chapter berikutnya.
   *
   * Id yang gagal DIHAPUS lagi dari `sudahDimuat`, supaya satu kegagalan
   * jaringan tidak mengunci chapter itu sampai app ditutup.
   */
  const sambung = useCallback(async () => {
    if (sedangMenyambung.current || habis) return;

    const terakhir = segmen[segmen.length - 1];
    if (!terakhir) return;

    const berikut = nextChapterAfter(urut, terakhir.chId) as Chapter | null;
    const i = urut.findIndex((c) => c.id === terakhir.chId);
    if (!berikut?.id) {
      setHabis(true);
      return;
    }
    if (sudahDimuat.current.has(berikut.id)) return;

    sedangMenyambung.current = true;
    sudahDimuat.current.add(berikut.id);
    setMenyambung(true);

    try {
      // Jeda disengaja. Tanpa ini chapter berikutnya menempel begitu cepat
      // sampai terasa seperti melompat halaman, bukan gulungan yang memanjang.
      await new Promise((r) => setTimeout(r, JEDA_SAMBUNG_MS));
      const halaman = await ambilHalaman(berikut.id, provider);
      if (!hidup.current) return;
      if (halaman.length) {
        setSegmen((prev) => [
          ...prev,
          { chId: berikut.id as string, label: labelChapter(berikut, i + 1), halaman },
        ]);
      } else {
        sudahDimuat.current.delete(berikut.id);
      }
    } catch {
      sudahDimuat.current.delete(berikut.id);
    } finally {
      sedangMenyambung.current = false;
      if (hidup.current) setMenyambung(false);
    }
  }, [segmen, urut, provider, habis, labelChapter]);

  /** Segmen diratakan jadi satu daftar untuk FlashList. */
  const baris: BarisReader[] = useMemo(
    () =>
      flattenChapterSegments(
        segmen.map((s) => ({ chId: s.chId, label: s.label, pages: s.halaman }))
      ).map((r) =>
        r.kind === 'divider'
          ? { jenis: 'pemisah' as const, kunci: r.key, chId: r.chId, label: r.label }
          : {
              jenis: 'halaman' as const,
              kunci: r.key,
              chId: r.chId,
              uri: r.uri,
              headers: r.headers,
              ke: r.index,
              dari: r.total,
            }
      ),
    [segmen]
  );

  /**
   * Unduh awal beberapa halaman chapter berikutnya di latar belakang.
   *
   * Dijalankan begitu chapter sekarang siap, jauh sebelum pembaca sampai
   * ujung. Saat sambungan terjadi, gambar pertamanya sudah ada di cache
   * disk sehingga peralihannya tidak menampilkan kotak kosong.
   *
   * Hanya 3 halaman: itu cukup menutupi jeda sambungan, sementara mengunduh
   * seluruh chapter di latar belakang akan menghabiskan kuota untuk chapter
   * yang mungkin tidak jadi dibaca.
   */
  useEffect(() => {
    const terakhir = segmen[segmen.length - 1];
    if (!terakhir || menyambung) return;
    const berikut = nextChapterAfter(urut, terakhir.chId) as Chapter | null;
    if (!berikut?.id || sudahDimuat.current.has(berikut.id)) return;

    let batal = false;
    (async () => {
      try {
        const halaman = await ambilHalaman(berikut.id as string, provider);
        if (batal || !hidup.current) return;
        const awal = halaman.slice(0, 3);
        if (!awal.length) return;
        // Header WAJIB dibawa. CDN manga menolak permintaan tanpa Referer,
        // jadi prefetch tanpa header hanya menghasilkan 403 dan tidak
        // menyimpan apa pun — optimasi yang diam-diam tidak bekerja.
        await Image.prefetch(
          awal.map((h) => h.uri),
          { cachePolicy: 'disk', headers: awal[0].headers }
        );
      } catch {
        // Prefetch hanya optimasi; kegagalannya tidak boleh terlihat user.
      }
    })();
    return () => {
      batal = true;
    };
  }, [segmen, urut, provider, menyambung]);

  const indeksChapter = useCallback(
    (chId: string) => urut.findIndex((c) => c.id === chId),
    [urut]
  );

  return {
    segmen,
    baris,
    status,
    galat,
    menyambung,
    habis,
    sambung,
    urut,
    indeksChapter,
    labelChapter,
  };
}
