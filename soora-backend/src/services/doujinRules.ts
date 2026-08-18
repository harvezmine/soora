/**
 * Aturan murni untuk sumber doujin.desu.xxx — tanpa jaringan, tanpa Redis.
 *
 * Dipisah supaya bagian yang paling mudah salah bisa diuji tanpa memanggil
 * situs aslinya: pembangkitan kunci, dekripsi, dan pemetaan bentuk data.
 * Situsnya sering berubah; yang tidak boleh ikut berubah diam-diam adalah
 * tiga hal itu.
 *
 * Situs ini SPA yang isinya diambil dari /api/* dengan response terenkripsi
 * (XOR berantai + kunci turunan waktu). Nilai untuk mendekripsinya ada di
 * dalam bundle JS situs itu sendiri — memang harus, sebab peramban pengunjung
 * butuh nilai yang sama. Jadi ini bukan rahasia server.
 */

/** Hash string jadi 32 karakter printable. Port persis dari bundle situs. */
export function generateKey(s: string): string {
  let hash = 0;
  for (let n = 0; n < s.length; n++) {
    hash = (hash << 5) - hash + s.charCodeAt(n);
    hash |= 0;
  }
  let out = '';
  let x = Math.abs(hash) || 123456789;
  for (let n = 0; n < 32; n++) {
    x = (x * 1664525 + 1013904223) % 4294967296;
    out += String.fromCharCode(33 + (x % 93));
  }
  return out;
}

/** Dekripsi XOR berantai: tiap byte ikut menggeser kunci byte berikutnya. */
export function decryptHex(hex: string, key: string): string {
  const bytes: number[] = [];
  for (let d = 0; d < hex.length; d += 2) {
    const w = hex.substring(d, d + 2);
    if (!w) break;
    bytes.push(parseInt(w, 16));
  }
  const out: string[] = [];
  const keyLen = key.length;
  let n = 42;
  for (let d = 0; d < bytes.length; d++) {
    const w = bytes[d];
    const p = key.charCodeAt(d % keyLen);
    const ch = w ^ p ^ (d * 13) ^ n;
    out.push(String.fromCharCode(ch & 255));
    n = (n + w) % 256;
  }
  return out.join('');
}

/**
 * Kunci berganti tiap jam. Yang dicoba jam sekarang beserta satu jam sebelum
 * dan sesudahnya — jam server kita dan jam mereka tidak dijamin sama persis,
 * dan pergantian tepat di ujung jam tidak boleh membuat halaman gagal dimuat.
 */
export function candidateKeys(salt: string, now = Date.now()): string[] {
  const bucket = Math.floor(now / 3_600_000);
  return [bucket, bucket - 1, bucket + 1].map((b) => generateKey(`${salt}_${b}`));
}

/** Dekripsi response terenkripsi. Melempar bila tak ada kunci yang cocok. */
export function decryptResponse(enc: string, salt: string, now = Date.now()): any {
  for (const key of candidateKeys(salt, now)) {
    try {
      return JSON.parse(decodeURIComponent(decryptHex(enc, key)));
    } catch {
      // kunci berikutnya
    }
  }
  throw new Error('Gagal mendekripsi response doujin');
}

/**
 * Cari app-secret dan salt di dalam bundle JS situs.
 *
 * Dipisah dari pengambilannya supaya bisa diuji dengan potongan bundle palsu:
 * inilah bagian yang patah lebih dulu kalau situsnya dibangun ulang dengan
 * struktur berbeda.
 */
export function cariRahasia(bundle: string): { appSecret: string; salt: string } | null {
  const secret = bundle.match(/([0-9a-f]{32})[\s\S]{0,500}?X-App-Secret/);
  const salt = bundle.match(/"([^"]*super-secret-salt[^"]*)"/);
  if (!secret || !salt) return null;
  return { appSecret: secret[1], salt: salt[1] };
}

/** Alamat bundle JS utama dari HTML halaman depan. */
export function cariBundle(html: string): string | null {
  const skrip = [...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map((m) => m[1]);
  return skrip.find((s) => s.includes('/assets/index-'))
    || skrip.find((s) => s.includes('/assets/'))
    || null;
}

// ── Pembersihan ──

/** Hanya http/https yang lolos; javascript: dan data: dibuang. */
export function urlAman(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const bersih = raw.trim();
  if (/^\s*(javascript|data|vbscript):/i.test(bersih)) return '';
  try {
    const u = new URL(bersih);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

const ENTITAS: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&nbsp;': ' ',
  '&amp;': '&',
  '&hellip;': '…',
  '&mdash;': '—',
  '&ndash;': '–',
  '&lsquo;': '‘',
  '&rsquo;': '’',
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&apos;': "'",
  '&hearts;': '♥',
  '&bull;': '•',
  '&middot;': '·',
};

function decodeEntitas(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_m, kode: string) => {
      const n = Number(kode);
      return n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, kode: string) => {
      const n = parseInt(kode, 16);
      return n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .replace(
      /&(lt|gt|quot|nbsp|amp|hellip|mdash|ndash|lsquo|rsquo|ldquo|rdquo|apos|hearts|bull|middot);/g,
      (m) => ENTITAS[m] ?? m
    );
}

/**
 * Sinopsis datang sebagai HTML yang ter-encode dua kali, jadi entitasnya
 * didekode dua lewat: lewat pertama menghasilkan "&gt;" sebagai teks biasa,
 * dan teks itu masih perlu didekode lagi agar tidak terbaca oleh pembaca.
 */
export function bersihkanSinopsis(html: unknown): string {
  if (typeof html !== 'string' || !html) return '';
  let hasil = decodeEntitas(html);
  if (/&(lt|gt|quot|amp);/.test(hasil)) hasil = decodeEntitas(hasil);
  return hasil
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/^\s*Sinopsis\s*:?\s*/i, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Ambil teks dari sumber, rapikan, dan batasi panjangnya.
 *
 * Dirapikan karena judul dari API kerap membawa tab dan spasi di ujung
 * (mis. "	Judul Chapter 132") — kalau diteruskan apa adanya, spasi itu ikut
 * terbawa ke judul halaman dan ke tautan.
 */
const potong = (v: unknown, n: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';

const ASAL = 'https://doujin.desu.xxx';

/** Sampul kadang berupa jalur relatif; dijadikan URL penuh sebelum dipakai. */
function urlSampul(raw: unknown): string {
  const langsung = urlAman(raw);
  if (langsung) return langsung;
  return typeof raw === 'string' && raw.startsWith('/') ? `${ASAL}${raw}` : '';
}

export interface ItemDaftar {
  id: string;
  title: string;
  thumb: string;
  rating: number | null;
  type: string;
  status: string | null;
  latestChapter: number | null;
}

/** Satu kartu di daftar. `id` memakai slug — itulah yang dipakai di URL. */
export function mapItem(item: any): ItemDaftar | null {
  if (!item || typeof item !== 'object') return null;
  const slug = potong(item.slug, 200);
  if (!slug) return null;
  const terbaru = Array.isArray(item.chapters) ? item.chapters[0] : null;
  return {
    id: slug,
    title: potong(item.title, 500),
    thumb: urlSampul(item.cover_url),
    rating: typeof item.rating === 'number' ? item.rating : null,
    type: potong(item.type, 50) || 'manga',
    status: potong(item.status, 50) || null,
    latestChapter: typeof terbaru?.chapter_number === 'number' ? terbaru.chapter_number : null,
  };
}

export interface Chapter { id: string; number: number | null; title: string; date: string }

export interface Detail {
  id: string;
  title: string;
  altTitle: string | null;
  thumb: string;
  rating: number | null;
  status: string | null;
  type: string;
  synopsis: string;
  author: string | null;
  artist: string | null;
  genres: Array<{ name: string; slug: string }>;
  chapters: Chapter[];
  views: number;
}

const namaOrang = (v: any): string | null =>
  typeof v === 'string' ? v.slice(0, 200)
    : typeof v?.name === 'string' ? v.name.slice(0, 200)
      : null;

export function mapDetail(detail: any, slug: string): Detail | null {
  if (!detail || typeof detail !== 'object') return null;

  const genres = (Array.isArray(detail.manga_genres) ? detail.manga_genres : [])
    .map((g: any) => ({ name: potong(g?.genres?.name, 100), slug: potong(g?.genres?.slug, 100) }))
    .filter((g: { name: string; slug: string }) => g.name && g.slug);

  const chapters: Chapter[] = (Array.isArray(detail.chapters) ? detail.chapters : [])
    .map((ch: any) => ({
      id: String(ch?.id ?? ''),
      number: typeof ch?.chapter_number === 'number' ? ch.chapter_number : null,
      // Tanggal dinormalkan ke ISO, bukan ke tulisan lokal: yang menentukan
      // bagaimana tanggal dibaca adalah peramban pembacanya, bukan server.
      title: potong(ch?.title, 300),
      date: ch?.created_at ? new Date(ch.created_at).toISOString() : '',
    }))
    .filter((ch: Chapter) => ch.id);

  return {
    id: slug,
    title: potong(detail.title, 500),
    altTitle: potong(detail.alt_titles, 500) || null,
    thumb: urlSampul(detail.cover_url),
    rating: typeof detail.rating === 'number' ? detail.rating : null,
    status: potong(detail.status, 50) || null,
    type: potong(detail.type, 50) || 'manga',
    synopsis: bersihkanSinopsis(detail.description),
    author: namaOrang(detail.author),
    artist: namaOrang(detail.artist),
    genres,
    chapters,
    views: Number.isFinite(detail.views) ? detail.views : 0,
  };
}

export interface Genre { slug: string; name: string; count: number }

export function mapGenre(list: any): Genre[] {
  return (Array.isArray(list) ? list : [])
    .map((g: any) => ({
      slug: potong(g?.slug, 100),
      name: potong(g?.name, 100),
      count: g?.manga_count ?? g?._count?.manga_genres ?? 0,
    }))
    .filter((g: Genre) => g.slug && g.name)
    .sort((a: Genre, b: Genre) => b.count - a.count);
}

export interface IsiChapter {
  images: string[];
  mangaSlug: string;
  mangaTitle: string;
  title: string;
  number: number | null;
}

/**
 * Isi sebuah chapter.
 *
 * Halaman kosong bukan kesalahan yang perlu dilempar: chapter yang baru
 * didaftarkan tapi gambarnya belum diunggah itu wajar, dan pemanggil lebih
 * butuh tahu "kosong" daripada menerima galat.
 */
export function mapChapter(chapter: any): IsiChapter {
  const images = (Array.isArray(chapter?.content_urls) ? chapter.content_urls : [])
    .map((u: unknown) => urlAman(u))
    .filter(Boolean);
  return {
    images,
    mangaSlug: potong(chapter?.manga_slug, 200),
    mangaTitle: potong(chapter?.manga_title, 500),
    title: potong(chapter?.title, 500) || `Chapter ${chapter?.chapter_number ?? ''}`.trim(),
    number: typeof chapter?.chapter_number === 'number' ? chapter.chapter_number : null,
  };
}

/** Pengurutan yang boleh diminta. Nilai lain ditolak, bukan diteruskan. */
export const URUT_SAH = ['latest_chapter', 'views', 'rating', 'created_at'] as const;
export const JENIS_SAH = ['manga', 'manhwa', 'manhua', 'doujinshi'] as const;

export const urutSah = (v: unknown): string =>
  (URUT_SAH as readonly string[]).includes(String(v)) ? String(v) : 'latest_chapter';

export const jenisSah = (v: unknown): string =>
  (JENIS_SAH as readonly string[]).includes(String(v)) ? String(v) : '';

/** Slug dari luar hanya boleh huruf kecil, angka, dan tanda hubung. */
export const slugSah = (v: unknown): string => {
  const s = String(v ?? '').trim().toLowerCase();
  return /^[a-z0-9-]{1,200}$/.test(s) ? s : '';
};

/** Id chapter dari API berupa angka/uuid; dibatasi supaya tidak jadi jalur bebas. */
export const idChapterSah = (v: unknown): string => {
  const s = String(v ?? '').trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : '';
};

/** Halaman selalu bilangan bulat positif yang masuk akal. */
export const halamanSah = (v: unknown): number => {
  const n = parseInt(String(v ?? '1'), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 500) : 1;
};

/** Berapa item per halaman. Dibatasi supaya satu permintaan tidak menyapu API. */
export const batasSah = (v: unknown, bawaan = 24): number => {
  const n = parseInt(String(v ?? bawaan), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 60) : bawaan;
};
