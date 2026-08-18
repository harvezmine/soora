/**
 * Aturan murni untuk sumber video pustaka tambahan — tanpa jaringan.
 *
 * Situsnya WordPress biasa, jadi datanya diambil dengan membaca HTML. Bagian
 * yang paling mudah patah (bentuk kartu, penyaringan pemutar, pembersihan
 * teks) dipisah ke sini supaya bisa diuji dengan potongan HTML tetap, bukan
 * dengan memanggil situsnya dan berharap isinya tidak berubah hari itu.
 */

export const ASAL_NEKO = 'https://nekopoi.care';

/**
 * Host pemutar yang boleh masuk ke <iframe>.
 *
 * Ini batas keamanan, bukan sekadar penyaring kerapian: halaman sumber juga
 * memuat iframe pelacak dan iklan, dan meneruskannya bulat-bulat berarti
 * menjalankan bingkai pihak ketiga sembarangan di dalam halaman kita.
 */
export const HOST_PEMUTAR = ['playmogo.com', 'yandex.ru'];

export function pemutarSah(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return HOST_PEMUTAR.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/** Hanya http/https; skema lain dibuang. */
export function urlAman(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  if (/^\s*(javascript|data|vbscript):/i.test(s)) return '';
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

const ENTITAS: Record<string, string> = {
  '&#8211;': '–', '&#8212;': '—', '&#8217;': '’', '&#8216;': '‘',
  '&#8220;': '“', '&#8221;': '”', '&#8230;': '…', '&nbsp;': ' ',
  '&quot;': '"', '&#39;': "'", '&#039;': "'", '&amp;': '&',
  '&lt;': '<', '&gt;': '>',
};

export function decodeEntitas(s: string): string {
  return String(s ?? '')
    .replace(/&#8211;|&#8212;|&#8217;|&#8216;|&#8220;|&#8221;|&#8230;|&nbsp;|&quot;|&#0?39;|&amp;|&lt;|&gt;/g,
      (m) => ENTITAS[m] ?? ENTITAS[m.replace('&#039;', '&#39;')] ?? m)
    .replace(/&#(\d+);/g, (_m, k: string) => {
      const n = Number(k);
      return n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .trim();
}

/** Buang tag beserta isi skrip/gaya, lalu rapikan spasi. */
export function buangTag(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const bersih = (raw: unknown): string => decodeEntitas(buangTag(raw));

export interface Video {
  id: string;
  title: string;
  thumb: string;
  date: string;
  synopsis: string;
}

/**
 * Slug dari URL post. Dipakai sebagai id, jadi bentuknya dibatasi: nilainya
 * nanti masuk ke jalur permintaan berikutnya.
 */
export function slugDariUrl(url: string): string {
  try {
    const bagian = new URL(url).pathname.split('/').filter(Boolean);
    return bagian[bagian.length - 1] || '';
  } catch {
    return '';
  }
}

export const slugSah = (v: unknown): string => {
  const s = String(v ?? '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,200}$/.test(s) ? s : '';
};

export const kategoriSah = (v: unknown): string => {
  const s = String(v ?? '').trim().toLowerCase();
  return /^[a-z0-9-]{1,60}$/.test(s) ? s : '';
};

export const halamanSah = (v: unknown): number => {
  const n = parseInt(String(v ?? '1'), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 1;
};

/** Gambar mini kadang ditulis tanpa skema ("//host/x.jpg"). */
function lengkapiUrl(raw: string): string {
  if (!raw) return '';
  const s = raw.trim();
  if (s.startsWith('//')) return urlAman(`https:${s}`);
  if (s.startsWith('/')) return urlAman(`${ASAL_NEKO}${s}`);
  return urlAman(s);
}

/**
 * Baca kartu-kartu video dari HTML daftar.
 *
 * Situsnya memakai dua bentuk kartu — satu di beranda, satu di halaman
 * kategori dan pencarian — jadi keduanya dibaca lalu hasilnya disatukan.
 * Penyatuannya menyaring slug kembar: satu halaman bisa memuat kedua bentuk
 * sekaligus, dan tanpa penyaringan judul yang sama muncul dua kali.
 */
export function bacaKartu(html: string): Video[] {
  if (typeof html !== 'string' || !html) return [];
  const keluar: Video[] = [];
  const sudah = new Set<string>();

  const tambah = (rawUrl: string, rawJudul: string, rawThumb: string, rawDesc: string, tanggal: string) => {
    const url = urlAman(rawUrl);
    // Hanya tautan ke dalam situs sumber yang jadi kartu; tautan keluar di
    // halaman yang sama adalah iklan.
    if (!url || !url.startsWith(ASAL_NEKO)) return;
    const id = slugDariUrl(url);
    const title = bersih(rawJudul);
    if (!id || !title || sudah.has(id)) return;
    sudah.add(id);
    keluar.push({
      id,
      title: title.slice(0, 300),
      thumb: lengkapiUrl(rawThumb),
      date: bersih(tanggal).slice(0, 40),
      synopsis: bersih(rawDesc).slice(0, 500),
    });
  };

  // Bentuk 1 — kartu beranda.
  const blokBeranda = html.split('class="nk-post-card"');
  for (let i = 1; i < blokBeranda.length; i++) {
    const b = blokBeranda[i];
    const tautan = b.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!tautan) continue;
    const gambar = b.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/);
    const tanggal = b.match(/(Minggu|Senin|Selasa|Rabu|Kamis|Jumat|Sabtu)[^<]*/);
    tambah(tautan[1], tautan[2], gambar ? gambar[1] : '', '', tanggal ? tanggal[0] : '');
  }

  // Bentuk 2 — kartu kategori & pencarian.
  const blokDaftar = html.split('class="nk-search-item"');
  for (let i = 1; i < blokDaftar.length; i++) {
    const b = blokDaftar[i];
    const tautan = b.match(/href="([^"]+)"/);
    const gambar = b.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/);
    const judul = b.match(/<h2>([\s\S]*?)<\/h2>/);
    const desc = b.match(/<p[^>]*class="nk-search-desc"[^>]*>([\s\S]*?)<\/p>/);
    tambah(
      tautan ? tautan[1] : '',
      judul ? judul[1] : '',
      gambar ? gambar[1] : '',
      desc ? desc[1] : '',
      ''
    );
  }

  return keluar;
}

/** Apakah masih ada halaman sesudah `halaman`. */
export const adaHalamanLagi = (html: string, halaman: number): boolean =>
  typeof html === 'string' && html.includes(`/page/${halaman + 1}/`);

export interface DetailVideo {
  id: string;
  title: string;
  thumb: string;
  players: string[];
  synopsis: string;
}

/** Baca satu halaman post: judul, gambar, dan bingkai pemutar yang sah. */
export function bacaDetail(html: string, slug: string): DetailVideo {
  const judul = html.match(/<title>([^<]*)<\/title>/);
  const og = html.match(/property="og:image"\s+content="([^"]+)"/);

  const players: string[] = [];
  const re = /<iframe[^>]+src="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const mentah = m[1].startsWith('//') ? `https:${m[1]}` : m[1];
    const url = urlAman(mentah);
    if (url && pemutarSah(url) && !players.includes(url)) players.push(url);
  }

  const sinopsis = html.match(/<p>([\s\S]{40,600}?)<\/p>/);

  return {
    id: slug,
    // Judul halaman membawa embel-embel nama situs setelah tanda pisah.
    // Dibuang SESUDAH entitasnya didekode: di HTML mentah tanda pisahnya masih
    // berupa "&#8211;", jadi mencocokkan "–" lebih dulu tidak akan kena dan
    // embel-embelnya ikut terbawa ke judul.
    title: (judul ? bersih(judul[1]).replace(/\s*[–—|-]\s*Nekopoi.*$/i, '').trim() : slug)
      .slice(0, 300),
    thumb: lengkapiUrl(og ? og[1] : ''),
    players,
    synopsis: sinopsis ? bersih(sinopsis[1]).slice(0, 600) : '',
  };
}

/** Baca daftar kategori dari halaman indeks. */
export function bacaKategori(html: string): Array<{ slug: string; name: string }> {
  const keluar: Array<{ slug: string; name: string }> = [];
  const re = /href="https?:\/\/nekopoi\.care\/category\/([^"/]+)\/"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = kategoriSah(m[1]);
    if (!slug || keluar.some((c) => c.slug === slug)) continue;
    keluar.push({
      slug,
      // "jav-cosplay" -> "Jav Cosplay": nama slug tidak layak tampil apa adanya.
      name: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    });
  }
  return keluar;
}
