/**
 * Resolusi sumber pemutaran — bagian murni, tanpa React maupun modul native.
 *
 * Dipisah dari komponen supaya bisa diuji tanpa perangkat, sama seperti
 * normalisasi katalog di fase 2. Keputusan "native atau embed" menentukan
 * seluruh pengalaman menonton, jadi tidak boleh terkubur di dalam layar.
 */

import { getRuntime } from '../runtime.js';

/**
 * @typedef {object} Track
 * @property {string} id
 * @property {string} label
 * @property {string} [lang]
 *
 * @typedef {object} PlaybackSource
 * @property {'native'|'embed'} mode
 * @property {string} uri
 * @property {string} [label]      nama server, untuk UI ganti server
 * @property {boolean} [viaProxy]
 */

/**
 * Menyusun URL proxy untuk sebuah m3u8.
 *
 * SELALU lewat proxy — ini bukan pilihan.
 *
 * Diverifikasi 2026-08-03: token pada URL m3u8 terikat ke IP yang memintanya,
 * dan yang meminta adalah VPS saat backend mengekstrak sumber. URL yang sama
 * mengembalikan 200 dari VPS tanpa header apa pun, dan 403 dari mesin lain
 * meskipun dengan Referer yang benar. Perangkat mana pun akan 403.
 *
 * `base` disertakan supaya proxy tahu awalan absolut saat menulis ulang
 * playlist anak; tanpa itu URL segmen jadi relatif dan hanya bekerja kalau
 * kebetulan origin-nya sama.
 *
 * @param {string} m3u8
 * @param {string} [ref] Referer yang diminta penyedia.
 * @param {string} [proxyBase] Default dari runtime.
 * @returns {string}
 */
export function buildProxyUrl(m3u8, ref, proxyBase) {
  if (!m3u8) return '';
  const base = proxyBase || getRuntime().streamProxy;
  const params = [`url=${encodeURIComponent(m3u8)}`];
  if (ref) params.push(`ref=${encodeURIComponent(ref)}`);
  // Proxy memakai `base` untuk menulis ulang playlist anak jadi URL absolut.
  params.push(`base=${encodeURIComponent(base)}`);
  return `${base}?${params.join('&')}`;
}

/**
 * Memilih mode pemutaran dari kumpulan kandidat sumber.
 *
 * Aturannya sederhana dan sengaja tidak pintar: m3u8 apa pun mengalahkan embed,
 * karena hanya jalur native yang memberi putar-di-latar-belakang, PiP, dan
 * kendali kualitas. Embed adalah jaring pengaman, bukan alternatif setara.
 *
 * @param {object} input
 * @param {string} [input.m3u8]
 * @param {string} [input.ref]
 * @param {Array<{ url: string, label?: string }>} [input.embeds]
 * @returns {PlaybackSource | null}
 */
export function resolvePlayback({ m3u8, ref, embeds } = {}) {
  if (m3u8) {
    return {
      mode: 'native',
      uri: buildProxyUrl(m3u8, ref),
      viaProxy: true,
      label: 'Pemutar bawaan',
    };
  }

  const first = Array.isArray(embeds) ? embeds.find((e) => e && e.url) : null;
  if (first) {
    return {
      mode: 'embed',
      uri: first.url,
      label: first.label || 'Server embed',
      viaProxy: false,
    };
  }

  return null;
}

/**
 * Apakah kegagalan pemutaran ini pantas dicoba ulang dengan sumber baru?
 *
 * Token m3u8 punya `expires`. Pada tontonan panjang, token bisa mati di tengah
 * dan segmen berikutnya dibalas 403 — gejalanya video berhenti tanpa penjelasan.
 * Kasus itu harus memicu pengambilan sumber baru lalu melanjutkan dari posisi
 * terakhir, bukan menampilkan layar error.
 *
 * @param {{ status?: number, message?: string }} err
 * @returns {boolean}
 */
export function shouldRefetchSource(err) {
  const status = err?.status;
  if (status === 403 || status === 401 || status === 410) return true;

  const msg = String(err?.message || '').toLowerCase();

  // Pencocokan harus ketat. Pesan error pemutar biasanya memuat URI, dan URI
  // proxy memuat id judul serta token — sehingga `msg.includes('403')` akan
  // cocok untuk TMDB id seperti 4030 atau token apa pun yang kebetulan memuat
  // "403". Akibatnya kegagalan jaringan biasa menghabiskan jatah pengambilan
  // ulang sumber yang tidak akan menolong.
  if (/(?:^|[^0-9])(401|403|410)(?:[^0-9]|$)/.test(msg)) return true;
  return msg.includes('forbidden') || msg.includes('expired');
}

/**
 * Mengurai daftar kualitas dari master playlist HLS.
 *
 * Dipakai UI pemilih kualitas saat pemain tidak mengekspos daftar varian
 * sendiri. Sengaja toleran: baris yang tidak dikenali dilewati, bukan membuat
 * seluruh parsing gagal.
 *
 * @param {string} text isi master playlist
 * @returns {Array<{ height: number, bandwidth: number, label: string }>}
 */
export function parseVariants(text) {
  if (typeof text !== 'string') return [];
  const out = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
    const res = /RESOLUTION=(\d+)x(\d+)/.exec(line);
    // Jangkar di awal atau setelah pemisah supaya tidak cocok dengan
    // substring di dalam AVERAGE-BANDWIDTH — yang nilainya lebih rendah dan
    // akan menghasilkan label kualitas yang salah.
    const bw = /(?:^|[,:])BANDWIDTH=(\d+)/.exec(line);
    const height = res ? Number(res[2]) : 0;
    const bandwidth = bw ? Number(bw[1]) : 0;
    if (!height && !bandwidth) continue;
    out.push({
      height,
      bandwidth,
      label: height ? `${height}p` : `${Math.round(bandwidth / 1000)} kbps`,
    });
  }
  // Tertinggi dulu — itu yang paling sering dipilih user.
  return out.sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth);
}
