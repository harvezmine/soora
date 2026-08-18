/**
 * Sumber video pustaka tambahan, dilayani server sendiri.
 *
 * Situsnya WordPress biasa tanpa API, jadi datanya dibaca dari HTML. Aturan
 * pembacaannya ada di nekoRules.ts supaya bisa diuji tanpa jaringan; berkas
 * ini hanya mengurus permintaan dan cache.
 *
 * Pemutarnya berupa bingkai pihak ketiga, bukan berkas video — jadi yang
 * dikembalikan alamat embed, dan penyaringannya (host mana yang boleh masuk
 * <iframe>) adalah batas keamanan, bukan kerapian.
 */
import { cached, CACHE_TTL } from './cache';
import {
  ASAL_NEKO,
  bacaKartu,
  bacaDetail,
  bacaKategori,
  adaHalamanLagi,
  kategoriSah,
  slugSah,
  Video,
  DetailVideo,
} from './nekoRules';

/**
 * Peramban ponsel. Situsnya menyajikan susunan berbeda per perangkat, dan
 * bentuk kartu yang dibaca nekoRules adalah bentuk versi ponselnya.
 */
const UA =
  'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

const TIMEOUT_MS = 20_000;
const MAKS_COBA = 3;
const jeda = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Ambil satu halaman HTML, dengan pengulangan.
 *
 * Sama alasannya seperti sumber komik: situsnya sesekali menolak atau
 * memutus, dan satu kedipan tidak boleh sampai ke pengguna sebagai halaman
 * gagal total.
 */
async function ambilHtml(path: string): Promise<string> {
  let terakhir: Error | null = null;

  for (let coba = 0; coba < MAKS_COBA; coba++) {
    if (coba > 0) await jeda(400 * 2 ** (coba - 1));
    const ac = new AbortController();
    const jam = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${ASAL_NEKO}${path}`, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
        },
        signal: ac.signal,
      });
      if (res.status >= 500 || res.status === 429) {
        terakhir = new Error(`HTTP ${res.status} untuk ${path}`);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} untuk ${path}`);
      return await res.text();
    } catch (e: any) {
      terakhir = e;
    } finally {
      clearTimeout(jam);
    }
  }
  throw terakhir || new Error('Gagal mengambil halaman video');
}

export interface HasilDaftar { videos: Video[]; hasNext: boolean }

/** Daftar terbaru. Halaman 1 adalah beranda situs. */
export async function daftar(halaman = 1): Promise<HasilDaftar> {
  const h = Math.max(1, halaman);
  return cached(`neko:list:${h}`, async () => {
    const html = await ambilHtml(h <= 1 ? '/' : `/page/${h}/`);
    return { videos: bacaKartu(html), hasNext: adaHalamanLagi(html, h) };
  }, CACHE_TTL.HOME_BUNDLE);
}

export async function kategori(slug: string, halaman = 1): Promise<HasilDaftar> {
  const k = kategoriSah(slug);
  if (!k) return { videos: [], hasNext: false };
  const h = Math.max(1, halaman);
  return cached(`neko:cat:${k}:${h}`, async () => {
    const html = await ambilHtml(h <= 1 ? `/category/${k}/` : `/category/${k}/page/${h}/`);
    return { videos: bacaKartu(html), hasNext: adaHalamanLagi(html, h) };
  }, CACHE_TTL.GENRE);
}

export async function cari(q: string, halaman = 1): Promise<HasilDaftar> {
  const kata = String(q || '').trim().slice(0, 80);
  if (!kata) return { videos: [], hasNext: false };
  const h = Math.max(1, halaman);
  // Kata kunci masuk ke JALUR alamat, bukan query — jadi harus dikodekan,
  // kalau tidak spasi dan garis miring merusak alamatnya.
  const aman = encodeURIComponent(kata);
  return cached(`neko:cari:${kata}:${h}`, async () => {
    const html = await ambilHtml(h <= 1 ? `/search/${aman}/` : `/search/${aman}/page/${h}/`);
    return { videos: bacaKartu(html), hasNext: adaHalamanLagi(html, h) };
  }, CACHE_TTL.SEARCH);
}

export async function kategoriTersedia(): Promise<Array<{ slug: string; name: string }>> {
  return cached('neko:kategori', async () => {
    try {
      return bacaKategori(await ambilHtml('/hentai-list/'));
    } catch {
      // Daftar kategori bukan bagian penting: halaman tetap berguna tanpanya.
      return [];
    }
  }, CACHE_TTL.GENRE * 6, 'long');
}

export async function detail(slug: string): Promise<DetailVideo | null> {
  const s = slugSah(slug);
  if (!s) return null;
  return cached(`neko:detail:${s}`, async () => bacaDetail(await ambilHtml(`/${s}/`), s),
    CACHE_TTL.INFO);
}
