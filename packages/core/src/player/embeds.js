/**
 * Pembuat URL embed anime.
 *
 * Diport dari `apps/web/src/components/AnimeEmbedPlayer.jsx`, daftar server
 * yang sudah terverifikasi di web pada 2026-05-30. Dipindah ke core supaya web
 * dan mobile memakai daftar yang sama — server embed mati cukup sering, dan
 * memperbaikinya di dua tempat adalah cara paling mudah untuk lupa satu.
 *
 * BELUM DIVERIFIKASI DI MOBILE. Per 2026-08-03 seluruh penyedia anime
 * mengembalikan bundle kosong, jadi jalur ini belum bisa diuji terhadap data
 * nyata. Struktur URL-nya identik dengan web yang sudah terbukti.
 */

/**
 * @typedef {object} EmbedServer
 * @property {string} name
 * @property {(malId: string|number|null, alId: string|number|null, ep: number) => string|null} buildUrl
 */

/** @type {EmbedServer[]} */
export const ANIME_EMBED_SERVERS = [
  {
    name: 'VidLink',
    buildUrl: (malId, _alId, ep) =>
      malId
        ? `https://vidlink.pro/anime/${malId}/${ep}/sub?fallback=true&autoplay=true`
        : null,
  },
  {
    name: 'VidSrc',
    buildUrl: (malId, _alId, ep) =>
      malId ? `https://vidsrc.cc/v2/embed/anime/ani${malId}/${ep}/sub?autoPlay=true` : null,
  },
  {
    name: 'VidLink Dub',
    buildUrl: (malId, _alId, ep) =>
      malId ? `https://vidlink.pro/anime/${malId}/${ep}/dub?fallback=true&autoplay=true` : null,
  },
];

/**
 * Menyusun daftar embed yang bisa dicoba untuk satu episode.
 *
 * Server yang tidak bisa membangun URL (mis. butuh MAL id yang tidak diketahui)
 * dibuang, bukan disertakan dengan url null — pemanggil tidak perlu tahu
 * kenapa sebuah server tidak tersedia, hanya perlu daftar yang bisa dipakai.
 *
 * @param {object} opts
 * @param {string|number|null} [opts.malId]
 * @param {string|number|null} [opts.alId]
 * @param {number} [opts.episode]
 * @returns {Array<{ url: string, label: string }>}
 */
export function buildAnimeEmbeds({ malId, alId, episode = 1 } = {}) {
  const ep = Number.isFinite(Number(episode)) && Number(episode) > 0 ? Number(episode) : 1;
  const out = [];
  for (const server of ANIME_EMBED_SERVERS) {
    let url = null;
    try {
      url = server.buildUrl(malId ?? null, alId ?? null, ep);
    } catch {
      url = null;
    }
    if (url) out.push({ url, label: server.name });
  }
  return out;
}
