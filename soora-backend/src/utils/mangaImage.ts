import axios from 'axios';
import { contentTypeOf } from './normalize';

/**
 * Referer per host — CDN komiku menolak hotlink (403) kecuali Referer-nya
 * origin komiku sendiri. Selain yang dikenal, pakai mangapill.
 */
export function refererFor(targetUrl: string): string {
  try {
    const host = new URL(targetUrl).hostname.toLowerCase();
    if (/(^|\.)komiku\.(org|id|to)$/.test(host)) return 'https://komiku.org/';
    if (host.endsWith('mangapill.com')) return 'https://mangapill.com/';
    if (host.endsWith('mangadex.org')) return 'https://mangadex.org/';
  } catch { /* jatuh ke bawaan */ }
  return 'https://mangapill.com/';
}

/**
 * Alamat yang dicoba berurutan untuk satu gambar.
 *
 * Komiku membagi halaman chapter ke imageN.komiku.to, yang semuanya cermin
 * dari penyimpanan yang sama. Pembaca komiku sendiri pindah ke img.komiku.org
 * saat satu shard gagal (onerror="this.src=this.src.replace('image5.komiku.to',
 * 'img.komiku.org')"). Tanpa cadangan yang sama di sini, satu shard mati
 * membuat setiap halaman yang dilayaninya gagal dimuat.
 */
export function mirrorsFor(targetUrl: string): string[] {
  try {
    const url = new URL(targetUrl);
    if (/^image\d+\.komiku\.to$/i.test(url.hostname)) {
      const cadangan = new URL(url.href);
      cadangan.hostname = 'img.komiku.org';
      return [url.href, cadangan.href];
    }
  } catch { /* bukan URL — biarkan apa adanya */ }
  return [targetUrl];
}

/** Shard yang belum selesai mengirim dalam batas ini dianggap mati. */
const MIRROR_TIMEOUT_MS = 6000;
const TIMEOUT_MS = 15000;

/** Ambil gambar komik, berpindah ke cermin berikutnya bila satu gagal. */
export async function fetchMangaImage(targetUrl: string): Promise<{ contentType: string; body: Buffer }> {
  const kandidat = mirrorsFor(targetUrl);
  let galatTerakhir: unknown;
  for (const [i, url] of kandidat.entries()) {
    try {
      const response = await axios.get(url, {
        headers: { 'Referer': refererFor(url), 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        responseType: 'arraybuffer',
        timeout: i < kandidat.length - 1 ? MIRROR_TIMEOUT_MS : TIMEOUT_MS,
      });
      return {
        contentType: contentTypeOf(response.headers['content-type'], 'image/jpeg'),
        body: Buffer.from(response.data),
      };
    } catch (err) {
      galatTerakhir = err;
    }
  }
  throw galatTerakhir;
}
