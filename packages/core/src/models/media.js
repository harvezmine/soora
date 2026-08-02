/**
 * Normalisasi item katalog jadi satu bentuk.
 *
 * `packages/core/src/api/index.js` mengembalikan tiga bentuk berbeda (respons
 * axios mentah, objek `{ data }`, dan array polos), dan tiap provider memberi
 * nama field yang berbeda untuk hal yang sama. Web menanganinya tersebar di
 * komponen — `Card.jsx` mencoba `id`, `animeId`, `lk21Id`, `image`, `cover`,
 * `type`, `mediaType`, … satu per satu.
 *
 * Modul ini memusatkan aturan itu. Alasannya bukan kerapian: provider Soora
 * sering mati dan berganti bentuk, dan aturan "provider X memakai field Y"
 * harus hidup di satu tempat supaya perbaikannya sekali.
 *
 * Bentuk data di sini diambil dari respons produksi 2026-08-03, bukan dari
 * dokumentasi.
 */

import { resolveImage, tmdbSize } from './images.js';

/**
 * @typedef {object} MediaItem
 * @property {string} id        id kanonik untuk navigasi
 * @property {string} title
 * @property {{ uri: string, headers?: Record<string,string> }} poster
 * @property {{ uri: string, headers?: Record<string,string> }} [backdrop]
 * @property {'anime'|'movie'|'tv'|'manga'} kind
 * @property {string} source    provider asal
 * @property {string} [badge]   teks sudut kartu
 * @property {number} [rating]  0–100
 * @property {string} [subtitle] baris kedua
 */

/**
 * Mengupas bentuk kembalian API jadi payload polos.
 *
 * Menangani ketiganya: respons axios (`{ data }`), pembungkus `{ data }` buatan
 * sendiri, dan nilai polos. Pembungkus ganda (`{ data: { data } }`) juga
 * terjadi di beberapa fungsi, jadi dikupas sampai dua lapis.
 *
 * @param {unknown} res
 * @returns {any}
 */
export function unwrap(res) {
  let v = res;
  for (let i = 0; i < 2; i++) {
    if (v && typeof v === 'object' && !Array.isArray(v) && 'data' in v) {
      v = /** @type {any} */ (v).data;
    } else break;
  }
  return v;
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * Id bisa datang sebagai angka maupun string.
 *
 * TMDB memakai id numerik (`969681`), sementara provider anime dan manga
 * memakai slug (`one-piece-100`, `2/one-piece`). Memperlakukan keduanya sebagai
 * string membuat rute seragam; tanpa ini seluruh item TMDB terbuang diam-diam
 * karena id-nya dianggap kosong.
 */
const idOf = (v) => {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
};

/** Judul bisa berupa string atau objek multi-bahasa (AniList). */
function pickTitle(raw) {
  const t = raw?.title;
  if (typeof t === 'string' && t.trim()) return t.trim();
  if (t && typeof t === 'object') {
    return (
      str(t.english) || str(t.romaji) || str(t.userPreferred) || str(t.native) || str(raw?.name)
    );
  }
  return str(raw?.name);
}

/** Tahun dari tanggal rilis penuh, kalau ada. */
function yearOf(raw) {
  const d = str(raw?.releaseDate) || str(raw?.first_air_date) || str(raw?.release_date);
  const m = d.match(/^(\d{4})/);
  return m ? m[1] : '';
}

/**
 * Anime dari HiAnime / AnimeKai / Samehadaku.
 *
 * `id` bisa datang sebagai `id` atau `animeId` tergantung provider; keduanya
 * dipakai untuk rute yang sama.
 */
export function normalizeAnime(raw, source = 'anime') {
  const id = idOf(raw?.id) || idOf(raw?.animeId);
  const title = pickTitle(raw);
  if (!id || !title) return null;

  const img = str(raw?.image) || str(raw?.poster) || str(raw?.img);
  const ep = raw?.episodes ?? raw?.latestEpisode ?? raw?.episode;
  const sub = raw?.sub ?? raw?.episodes?.sub;
  const dub = raw?.dub ?? raw?.episodes?.dub;

  let badge = '';
  if (typeof ep === 'number' && ep > 0) badge = `EP ${ep}`;
  else if (typeof sub === 'number' && sub > 0) badge = `SUB ${sub}`;

  const subtitle = [str(raw?.type), dub ? 'DUB' : ''].filter(Boolean).join(' · ');

  return {
    id,
    title,
    poster: resolveImage(img),
    backdrop: raw?.cover ? resolveImage(str(raw.cover)) : undefined,
    kind: 'anime',
    source,
    badge: badge || undefined,
    rating: typeof raw?.rating === 'number' ? raw.rating : undefined,
    subtitle: subtitle || undefined,
  };
}

/**
 * Film / serial.
 *
 * Dua jalur: TMDB (id numerik, `rating` sudah 0–100, gambar image.tmdb.org)
 * dan LK21 (`_id`, `posterImg`, `qualityResolution`). Goku memakai bentuk
 * mirip TMDB tapi dengan id string.
 */
export function normalizeMovie(raw, source = 'tmdb') {
  const id = idOf(raw?.id) || idOf(raw?.tmdbId) || idOf(raw?._id) || idOf(raw?.lk21Id);
  const title = pickTitle(raw);
  if (!id || !title) return null;

  const img = str(raw?.image) || str(raw?.posterImg) || str(raw?.poster);
  const kind = raw?.mediaType === 'tv' || raw?.type === 'TV Series' ? 'tv' : 'movie';
  const year = yearOf(raw);

  const badge = str(raw?.qualityResolution) || undefined;
  const subtitle = [kind === 'tv' ? 'Serial' : 'Film', year].filter(Boolean).join(' · ');

  return {
    id,
    title,
    // w342 cukup untuk kartu. `original` di grid berarti mengunduh beberapa
    // megabyte per layar tanpa perbedaan yang terlihat.
    poster: resolveImage(tmdbSize(img, 'w342')),
    backdrop: raw?.cover ? resolveImage(str(raw.cover)) : undefined,
    kind,
    source,
    badge,
    rating: typeof raw?.rating === 'number' ? raw.rating : undefined,
    subtitle,
  };
}

/**
 * Manga / manhwa.
 *
 * Bentuknya paling sederhana — mangapill hanya mengembalikan
 * `{ id, title, image }` — tapi justru inilah yang gambarnya butuh Referer.
 */
export function normalizeManga(raw, source = 'mangapill') {
  const id = str(raw?.id);
  const title = pickTitle(raw);
  if (!id || !title) return null;

  const chapter = raw?.latestChapter ?? raw?.chapter;

  return {
    id,
    title,
    poster: resolveImage(str(raw?.image) || str(raw?.cover)),
    kind: 'manga',
    source,
    badge: chapter ? `Ch. ${chapter}` : undefined,
    rating: typeof raw?.rating === 'number' ? raw.rating : undefined,
    subtitle: str(raw?.type) || undefined,
  };
}

const NORMALIZERS = {
  anime: normalizeAnime,
  movie: normalizeMovie,
  tv: normalizeMovie,
  manga: normalizeManga,
};

/**
 * Menormalkan daftar, membuang entri yang tidak bisa dirender.
 *
 * Entri cacat dibuang, bukan diloloskan sebagai kartu kosong. Provider yang
 * setengah mati sering mengembalikan objek tanpa id atau judul, dan kartu
 * kosong terlihat seperti bug aplikasi padahal masalahnya di hulu.
 *
 * @param {unknown} list
 * @param {'anime'|'movie'|'tv'|'manga'} kind
 * @param {string} [source]
 * @returns {MediaItem[]}
 */
export function normalizeList(list, kind, source) {
  if (!Array.isArray(list)) return [];
  const fn = NORMALIZERS[kind];
  if (!fn) return [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const item = fn(raw, source);
    if (!item) continue;
    // Provider kadang mengembalikan judul yang sama dari dua sumber dalam satu
    // bundle; render ganda terlihat seperti bug.
    const dedupeKey = `${item.kind}:${item.id}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(item);
  }
  return out;
}

/**
 * Menyusun bundle beranda jadi daftar section siap render.
 *
 * Section kosong dibuang. Kalau semuanya kosong, pemanggil menerima array
 * kosong dan menampilkan keadaan "provider sedang tidak tersedia" — bukan
 * layar berisi judul-judul section tanpa isi.
 *
 * @param {Array<{ title: string, items: unknown, kind: string, source?: string }>} defs
 * @returns {Array<{ title: string, items: MediaItem[] }>}
 */
export function buildSections(defs) {
  const out = [];
  for (const def of defs) {
    const items = normalizeList(def.items, def.kind, def.source);
    if (items.length) out.push({ title: def.title, items });
  }
  return out;
}
