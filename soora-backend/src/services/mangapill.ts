import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Scraper mangapill langsung, tanpa consumet.
 *
 * Kenapa ada: per 2026-08-03 `consumet /manga/mangapill/info` menggantung
 * sampai timeout (diuji 60 detik, HTTP 000), begitu pula jalur komiku dan
 * pencarian mangadex. Sementara `mangapill.com/manga/2/one-piece` sendiri
 * bisa diambil dari VPS dalam 0,7 detik dan mengandung seluruh daftar chapter.
 * Jadi situsnya sehat, parser consumet-nya yang rusak.
 *
 * Halaman chapter (`/manga/read`) TIDAK terpengaruh dan tetap lewat consumet —
 * jalur itu masih berfungsi, jadi tidak ada alasan menggantinya.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

export type MangapillChapter = { id: string; title: string; chapterNumber: string };

export type MangapillInfo = {
  id: string;
  title: string;
  image: string;
  description: string;
  status: string;
  genres: string[];
  chapters: MangapillChapter[];
  _source: 'mangapill-direct';
};

/**
 * Mengambil detail manga beserta daftar chapter.
 *
 * @param id Bentuknya "2/one-piece" — sama dengan id yang dikembalikan search.
 */
export async function mangapillInfo(id: string): Promise<MangapillInfo> {
  const slug = String(id).replace(/^\/+/, '');
  const url = `https://mangapill.com/manga/${slug}`;

  const res = await axios.get<string>(url, {
    headers: { 'User-Agent': UA, Referer: 'https://mangapill.com/' },
    // Jauh lebih pendek dari consumet yang menggantung. Halaman ini terukur
    // 0,7 detik; kalau 15 detik pun belum datang, memang ada yang salah.
    timeout: 15000,
    responseType: 'text',
    maxRedirects: 3,
  });

  const $ = cheerio.load(res.data);

  const title = $('h1').first().text().trim();

  // Poster dimuat malas, jadi URL-nya ada di data-src bukan src.
  const image =
    $('img[data-src*="cdn."]').first().attr('data-src') ||
    $('img[src*="cdn."]').first().attr('src') ||
    '';

  // Paragraf sinopsis. Halaman juga memuat pengumuman situs di <p> lain, jadi
  // dipilih lewat kelasnya, bukan "paragraf pertama".
  const description = $('p.text--secondary').first().text().trim();

  const status =
    $('div')
      .filter((_, el) => $(el).text().trim() === 'Status')
      .next()
      .text()
      .trim() || '';

  const genres: string[] = [];
  $('a[href^="/search?genre="]').each((_, el) => {
    const g = $(el).text().trim();
    if (g && !genres.includes(g)) genres.push(g);
  });

  const chapters: MangapillChapter[] = [];
  const seen = new Set<string>();
  $('a[href^="/chapters/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    // id chapter = bagian setelah /chapters/, mis. "2-11189000/one-piece-chapter-1189".
    // Bentuk itu yang diterima /manga/read, jadi jangan diubah.
    const chapterId = href.replace(/^\/chapters\//, '');
    if (!chapterId || seen.has(chapterId)) return;
    seen.add(chapterId);

    const label = $(el).text().trim();
    const num = /chapter[-\s]*([\d.]+)/i.exec(label) || /chapter[-\s]*([\d.]+)/i.exec(chapterId);
    chapters.push({
      id: chapterId,
      title: label,
      chapterNumber: num ? num[1] : '',
    });
  });

  if (!title && chapters.length === 0) {
    // Halaman terambil tapi tidak ada yang bisa dikenali — kemungkinan besar
    // markup berubah. Lempar supaya pemanggil bisa jatuh ke consumet.
    throw new Error('mangapill: struktur halaman tidak dikenali');
  }

  return {
    id: slug,
    title,
    image,
    description,
    status,
    genres,
    chapters,
    _source: 'mangapill-direct',
  };
}
