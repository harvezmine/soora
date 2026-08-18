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
import { layakDiputar } from './catalogRules';

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
    const r = await ambilUlang(path);
    if (!r) return null;
    const ada = r.status === 200 && !!r.data?.src;
    markAvailability('movie', id, ada);
    return ada;
  } catch {
    return null;
  }
}

/**
 * Ambil sekali, dan bila gagal karena jaringan, coba sekali lagi.
 *
 * Percobaan tunggal terbukti tidak cukup: kegagalan sesaat dibaca sebagai
 * "tidak diketahui", dan yang tidak diketahui sengaja dipertahankan supaya
 * tontonan sehat tidak ikut hilang — jadi tiap kedipan jaringan meloloskan
 * satu judul mati ke permukaan. Terukur tiga dari lima puluh empat judul
 * beranda lolos begitu.
 *
 * Yang diulang hanya kegagalan jaringan. Balasan 404 bukan kegagalan; itu
 * jawaban, dan diteruskan apa adanya.
 */
async function ambilUlang(path: string) {
  for (let percobaan = 0; percobaan < 2; percobaan++) {
    try {
      return await axios.get(path, {
        headers: { 'User-Agent': UA, Referer: 'https://vixsrc.to/' },
        timeout: 10_000,
        validateStatus: (s) => s === 200 || s === 404,
      });
    } catch {
      if (percobaan === 0) await new Promise((r) => setTimeout(r, 400));
    }
  }
  return null;
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

/**
 * Bentuk mentah TMDB — beda nama bidang dari hasil normalisasi kita.
 */
interface MentahTmdb {
  id?: number;
  media_type?: string;
  vote_count?: number;
  popularity?: number;
  original_language?: string;
}

/**
 * Jalur passthrough TMDB yang mengembalikan DAFTAR judul.
 *
 * Halaman film tidak memakai /movies/home untuk kolam internasional; ia
 * memanggil TMDB langsung lewat passthrough ini — trending, populer, dan
 * sembilan bagian genre. Jadi verifikasi di /movies/home saja tidak pernah
 * menyentuh apa yang sebenarnya dilihat orang di beranda.
 *
 * Hanya jalur berisi daftar yang dicegat. Jalur detail (`/movie/123`) dan
 * daftar genre (`/genre/movie/list`) mengembalikan objek, bukan tontonan, dan
 * harus lewat apa adanya.
 */
const JALUR_DAFTAR = /^\/(trending\/(movie|tv|all)\/|(movie|tv)\/popular|(movie|tv)\/top_rated|(movie|tv)\/now_playing|(movie|tv)\/upcoming|(movie|tv)\/on_the_air|(movie|tv)\/airing_today|discover\/(movie|tv)|search\/(movie|tv|multi))/;

export function jalurTmdbBerdaftar(path: string): boolean {
  return JALUR_DAFTAR.test(path);
}

/**
 * Saring balasan passthrough TMDB supaya hanya menyisakan judul yang benar-
 * benar bisa diputar.
 *
 * Jenis media diambil dari isinya bila ada, dan dari jalurnya bila tidak —
 * `/movie/popular` tidak pernah menuliskan media_type pada tiap barisnya.
 */
export async function saringHasilTmdbMentah(path: string, data: any): Promise<any> {
  if (!data || !Array.isArray(data.results) || !data.results.length) return data;
  const bawaan: 'movie' | 'tv' = /\/tv\/|\/tv$|discover\/tv|trending\/tv|search\/tv/.test(path) ? 'tv' : 'movie';

  // Saringan murah lebih dulu: yang jelas mustahil tidak perlu ditanyakan ke
  // penyedia sama sekali.
  const layak = (data.results as MentahTmdb[]).filter((r) =>
    layakDiputar({
      originalLanguage: r.original_language,
      voteCount: r.vote_count,
      popularity: r.popularity,
    })
  );

  const cek = await berbondong(
    layak.map((r) => () => adaDiVixsrc(
      (r.media_type === 'tv' || (!r.media_type && bawaan === 'tv')) ? 'tv' : 'movie',
      r.id ?? ''
    ))
  );
  return { ...data, results: layak.filter((_, i) => cek[i] !== false) };
}
