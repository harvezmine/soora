/**
 * Sumber pustaka tambahan (sooramics+), diambil langsung dari server kita
 * sendiri — bukan lewat layanan pihak ketiga yang sudah berjalan di tempat
 * lain. Tidak ada proses terpisah dan tidak ada porta baru: ia menumpang
 * backend yang sudah ada, jadi ikut memakai cache, proxy gambar, dan
 * pelaporan galat yang sama.
 *
 * Isi situsnya dilayani API terenkripsi. Aturan murninya (kunci, dekripsi,
 * pemetaan) ada di doujinRules.ts supaya bisa diuji tanpa jaringan; berkas
 * ini hanya mengurus jaringan, rahasia, dan cache.
 *
 * ── Kenapa rahasianya diambil sendiri, bukan ditulis di env ──
 * Nilai X-App-Secret ada di dalam bundle JS situs, dan bundle itu diberi nama
 * berdasarkan isinya (index-<hash>.js). Tiap kali situsnya dibangun ulang,
 * nilainya berganti. Menaruhnya di env berarti seluruh bagian ini mati diam-
 * diam pada hari mereka rilis, dan baru ketahuan dari laporan pengguna. Jadi
 * nilainya diambil sendiri dari bundle, disimpan sebentar, dan diambil ulang
 * begitu dekripsi mulai gagal.
 */
import { cached, CACHE_TTL } from './cache';
import {
  decryptResponse,
  cariRahasia,
  cariBundle,
  mapItem,
  mapDetail,
  mapGenre,
  mapChapter,
  urutSah,
  jenisSah,
  slugSah,
  ItemDaftar,
  Detail,
  Genre,
  IsiChapter,
} from './doujinRules';

const ASAL = 'https://doujin.desu.xxx';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** Batas waktu satu permintaan ke sumber. */
const TIMEOUT_MS = 20_000;

/** Umur rahasia di memori. Situs jarang dibangun ulang lebih sering dari ini. */
const UMUR_RAHASIA_MS = 6 * 60 * 60 * 1000;

interface Rahasia { appSecret: string; salt: string; pada: number }

let rahasia: Rahasia | null = null;
/** Pengambilan yang sedang berjalan, supaya banyak permintaan tidak memicu
 *  banyak pengambilan bundle sekaligus saat cache baru kedaluwarsa. */
let sedangAmbil: Promise<Rahasia> | null = null;

async function ambilTeks(url: string): Promise<string> {
  const ac = new AbortController();
  const jam = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} untuk ${url}`);
    return await res.text();
  } finally {
    clearTimeout(jam);
  }
}

/** Ambil rahasia dari bundle situs. */
async function ambilRahasia(): Promise<Rahasia> {
  const home = await ambilTeks(`${ASAL}/`);
  const jalur = cariBundle(home);
  if (!jalur) throw new Error('Bundle JS tidak ditemukan — struktur situs berubah');
  const bundle = await ambilTeks(new URL(jalur, ASAL).href);
  const nilai = cariRahasia(bundle);
  if (!nilai) throw new Error('Secret/salt tidak ditemukan di bundle — struktur situs berubah');
  return { ...nilai, pada: Date.now() };
}

async function pastikanRahasia(paksa = false): Promise<Rahasia> {
  if (!paksa && rahasia && Date.now() - rahasia.pada < UMUR_RAHASIA_MS) return rahasia;
  if (sedangAmbil) return sedangAmbil;
  sedangAmbil = ambilRahasia()
    .then((r) => { rahasia = r; return r; })
    .finally(() => { sedangAmbil = null; });
  return sedangAmbil;
}

const deviceId = () =>
  `dev_${Math.random().toString(36).slice(2, 15)}_${Date.now().toString(36)}`;

/**
 * Satu panggilan ke API sumber.
 *
 * Dicoba dua kali: kegagalan dekripsi dan penolakan 401/403 hampir selalu
 * berarti rahasianya sudah berganti, dan itu bisa dipulihkan sendiri dengan
 * mengambil bundle terbaru. Percobaan kedua memakai rahasia yang baru diambil.
 */
async function apiGet(path: string): Promise<any> {
  let galatTerakhir: Error | null = null;

  for (let percobaan = 0; percobaan < 2; percobaan++) {
    const r = await pastikanRahasia(percobaan > 0);
    const ac = new AbortController();
    const jam = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${ASAL}/api${path}`, {
        headers: {
          'User-Agent': UA,
          Accept: 'application/json',
          'X-App-Secret': r.appSecret,
          'x-app-secret': r.appSecret,
          'x-device-id': deviceId(),
          'x-device-name': 'Desktop',
        },
        signal: ac.signal,
      });

      if (res.status === 401 || res.status === 403) {
        galatTerakhir = new Error(`HTTP ${res.status}`);
        continue; // rahasia basi — ambil ulang lalu coba lagi
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} untuk ${path}`);

      const teks = await res.text();
      if (!teks.includes('_enc_resp_')) return JSON.parse(teks);

      try {
        return decryptResponse(JSON.parse(teks)._enc_resp_, r.salt);
      } catch (e: any) {
        galatTerakhir = e;
        continue; // salt basi — ambil ulang lalu coba lagi
      }
    } finally {
      clearTimeout(jam);
    }
  }

  throw galatTerakhir || new Error('Gagal mengambil data doujin');
}

const isiDaftar = (data: any): any[] =>
  Array.isArray(data) ? data : data?.data || data?.results || [];

export interface OpsiDaftar {
  page?: number;
  query?: string;
  type?: string;
  genre?: string;
  sort?: string;
  limit?: number;
}

/**
 * Daftar judul.
 *
 * API sumber MENGABAIKAN parameter `page` — halaman 1 dan 2 mengembalikan isi
 * yang sama persis. Satu-satunya pagination yang benar-benar bekerja adalah
 * `offset`, jadi halaman diterjemahkan ke situ.
 */
export async function daftar(opsi: OpsiDaftar = {}): Promise<ItemDaftar[]> {
  const page = Math.max(1, opsi.page || 1);
  const limit = Math.min(Math.max(1, opsi.limit || 24), 60);
  const sort = urutSah(opsi.sort);
  const type = jenisSah(opsi.type);
  const genre = slugSah(opsi.genre);
  const query = String(opsi.query || '').slice(0, 100).trim();

  const params = new URLSearchParams({ limit: String(limit), sort });
  // Namanya `search`, bukan `q`. Ini bukan pilihan gaya: `q` DITERIMA tanpa
  // keluhan lalu diabaikan, jadi tiap pencarian mengembalikan daftar bawaan
  // yang sama — gagal yang terlihat seperti berhasil. Ketahuan waktu mencari
  // "love" mengembalikan judul yang sama persis dengan halaman depan.
  if (query) params.set('search', query);
  if (type) params.set('type', type);
  if (genre) params.set('genre', genre);
  if (page > 1) params.set('offset', String((page - 1) * limit));

  const kunci = `doujin:list:${params.toString()}`;
  return cached(
    kunci,
    async () => isiDaftar(await apiGet(`/manga?${params.toString()}`))
      .map(mapItem)
      .filter(Boolean) as ItemDaftar[],
    query ? CACHE_TTL.SEARCH : CACHE_TTL.GENRE
  );
}

export async function detail(slug: string): Promise<Detail | null> {
  const s = slugSah(slug);
  if (!s) return null;
  return cached(
    `doujin:detail:${s}`,
    async () => mapDetail(await apiGet(`/manga/${encodeURIComponent(s)}`), s),
    CACHE_TTL.INFO
  );
}

export async function genres(): Promise<Genre[]> {
  return cached(
    'doujin:genres',
    async () => mapGenre(isiDaftar(await apiGet('/genres?limit=200'))),
    CACHE_TTL.GENRE * 6,
    'long'
  );
}

/**
 * Halaman sebuah chapter.
 *
 * Cache-nya sengaja pendek walau isinya statis: URL gambarnya ditandatangani
 * dan kedaluwarsa dalam 24 jam, jadi menyimpannya lebih lama justru
 * menyajikan tautan mati.
 */
export async function chapter(id: string): Promise<IsiChapter> {
  return cached(
    `doujin:chapter:${id}`,
    async () => mapChapter(await apiGet(`/chapters/${encodeURIComponent(id)}`)),
    CACHE_TTL.MANGA_READ
  );
}

/** Untuk pemeriksaan kesehatan: apakah rahasia sudah terpegang dan sejak kapan. */
export function statusRahasia(): { punya: boolean; umurDetik: number | null } {
  return {
    punya: !!rahasia,
    umurDetik: rahasia ? Math.round((Date.now() - rahasia.pada) / 1000) : null,
  };
}
