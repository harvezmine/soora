/**
 * Verifikasi "benar-benar bisa diputar" sebelum sebuah judul ditampilkan.
 *
 * Saringan di catalogRules.ts bekerja dengan kemungkinan: ia membuang yang
 * jelas mustahil, tapi yang lolos belum tentu ada sumbernya. Sisanya kira-kira
 * satu dari lima — dan satu dari lima itu tetap berarti orang mengklik judul
 * lalu disambut layar "tidak tersedia". Buat yang memakainya, ditipu daftar
 * lebih menyakitkan daripada daftarnya pendek.
 *
 * Jadi daftar yang tampil di beranda dan pencarian diverifikasi lebih dulu ke
 * penyedianya sendiri. Ongkosnya terukur, bukan ditebak: satu permintaan ke
 * vixsrc.to/api rata-rata 0,46 detik dari VPS, dan dua puluh judul dengan
 * delapan sambungan bersamaan selesai dalam 2,8 detik. Hasilnya menumpuk di
 * catatan ketersediaan, jadi pemeriksaan berikutnya untuk judul yang sama
 * tidak memakan jaringan sama sekali.
 */
import axios from 'axios';
import * as consumet from './consumet';
import { isAvailable, markAvailability } from './availability';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/**
 * Berapa pemeriksaan berjalan bersamaan.
 *
 * Delapan sudah membuat dua puluh judul selesai dalam 2,8 detik, dan VPS-nya
 * hanya satu inti — dinaikkan lagi yang bertambah cuma antrean, bukan
 * kecepatan.
 */
const BARENGAN = 8;

/** Batas waktu seluruh sapuan. Melewati ini, sisanya dibiarkan apa adanya. */
const ANGGARAN_MS = 20_000;

/** Jalankan tugas dengan jumlah bersamaan terbatas dan tenggat menyeluruh. */
async function berbondong<T>(
  tugas: Array<() => Promise<T>>,
  batas = BARENGAN,
  anggaranMs = ANGGARAN_MS
): Promise<Array<T | null>> {
  const hasil: Array<T | null> = new Array(tugas.length).fill(null);
  const tenggat = Date.now() + anggaranMs;
  let berikut = 0;
  const pekerja = async () => {
    while (berikut < tugas.length) {
      const i = berikut++;
      if (Date.now() > tenggat) return;
      try { hasil[i] = await tugas[i](); } catch { hasil[i] = null; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(batas, tugas.length) }, pekerja));
  return hasil;
}

/**
 * Apakah judul ini ada di katalog VixSrc.
 *
 * Cukup langkah pertama resolver: endpoint api-nya menjawab 200 bila ada dan
 * 404 bila tidak. Halaman embed-nya tidak perlu diambil — itu baru dibutuhkan
 * saat orang benar-benar menekan putar, dan mengambilnya di sini menggandakan
 * ongkos sapuan tanpa menambah kepastian apa pun.
 *
 * Kegagalan jaringan mengembalikan null, bukan false: judul yang tidak bisa
 * diperiksa tidak boleh dihukum seolah-olah tidak ada.
 */
export async function adaDiVixsrc(
  type: 'movie' | 'tv', tmdbId: string | number
): Promise<boolean | null> {
  const id = String(tmdbId);
  const tersimpan = isAvailable('movie', id);
  if (tersimpan !== null) return tersimpan;

  // Untuk serial, keberadaan episode pertama dipakai mewakili serialnya.
  const path = type === 'tv'
    ? `https://vixsrc.to/api/tv/${id}/1/1`
    : `https://vixsrc.to/api/movie/${id}`;
  try {
    const r = await axios.get(path, {
      headers: { 'User-Agent': UA, Referer: 'https://vixsrc.to/' },
      timeout: 10_000,
      validateStatus: (s) => s === 200 || s === 404,
    });
    const ada = r.status === 200 && !!r.data?.src;
    markAvailability('movie', id, ada);
    return ada;
  } catch {
    return null;
  }
}

/** Apakah judul LK21 ini punya aliran langsung yang bisa diputar. */
export async function punyaAliranLk21(
  id: string, serial: boolean
): Promise<boolean | null> {
  const tersimpan = isAvailable('movie', id);
  if (tersimpan !== null) return tersimpan;
  try {
    const d: any = serial
      ? await consumet.lk21SeriesStreams(id, 1, 1)
      : await consumet.lk21MovieStreams(id);
    /**
     * Yang dihitung hanya sumber HLS langsung. Sumber embed sengaja diabaikan:
     * keduanya menunjuk videonode.de, yang menolak dirender dari domain kita
     * lewat frame-ancestors, jadi judul yang hanya punya itu sama saja dengan
     * tidak punya apa-apa.
     */
    const ada = (d?.sources || []).some((s: any) => s?.type === 'hls' && s?.directUrl);
    markAvailability('movie', id, ada);
    return ada;
  } catch {
    return null;
  }
}

interface ItemTmdb { id?: string | number; mediaType?: string }

/**
 * Saring daftar TMDB, sisakan yang terbukti ada sumbernya.
 *
 * Yang tidak bisa diperiksa (jaringan gagal, atau anggaran waktu habis)
 * dipertahankan. Menyembunyikan judul yang mungkin baik-baik saja karena satu
 * permintaan gagal itu lebih merugikan daripada sesekali meloloskan satu yang
 * tidak ada.
 */
export async function saringBisaDiputarTmdb<T extends ItemTmdb>(items: T[]): Promise<T[]> {
  if (!Array.isArray(items) || !items.length) return [];
  const cek = await berbondong(
    items.map((it) => () => adaDiVixsrc(it.mediaType === 'tv' ? 'tv' : 'movie', it.id ?? ''))
  );
  return items.filter((_, i) => cek[i] !== false);
}

interface ItemLk21 { id?: string; lk21Id?: string; mediaType?: string; type?: string }

/** Saring daftar LK21 dengan aturan yang sama. */
export async function saringBisaDiputarLk21<T extends ItemLk21>(
  items: T[], serial = false
): Promise<T[]> {
  if (!Array.isArray(items) || !items.length) return [];
  const cek = await berbondong(
    items.map((it) => () => punyaAliranLk21(String(it.lk21Id || it.id || ''), serial)),
    6 // LK21 lebih lambat per permintaan; jangan bebani inti tunggal VPS
  );
  return items.filter((_, i) => cek[i] !== false);
}
