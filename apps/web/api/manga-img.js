/**
 * Vercel Serverless Function — Manga image proxy
 * Replicates the Vite dev middleware /manga-img for production.
 * Proxies manga images with required Referer header for CDNs.
 */
// Per-host Referer — komiku's CDN 403s hotlinks unless Referer is its own origin.
export function refererFor(target) {
  try {
    const host = new URL(target).hostname.toLowerCase();
    if (/(^|\.)komiku\.(org|id|to)$/.test(host)) return 'https://komiku.org/';
    if (host.endsWith('mangadex.org')) return 'https://mangadex.org/';
    if (host.endsWith('mangapill.com')) return 'https://mangapill.com/';
  } catch { /* fall through */ }
  return 'https://mangapill.com/';
}

// Komiku spreads chapter pages over imageN.komiku.to, all mirrors of the same
// storage. Its own reader falls back to img.komiku.org when a shard fails
// (onerror="this.src=this.src.replace('image5.komiku.to','img.komiku.org')");
// without the same fallback here, one dead shard broke every page it served.
export function mirrorsFor(target) {
  try {
    const url = new URL(target);
    if (/^image\d+\.komiku\.to$/i.test(url.hostname)) {
      const fallback = new URL(url);
      fallback.hostname = 'img.komiku.org';
      return [url.href, fallback.href];
    }
  } catch { /* fall through */ }
  return [target];
}

// A shard that has not delivered by then is treated as down, leaving the
// fallback enough of the 15s function budget.
const MIRROR_TIMEOUT_MS = 6000;

export async function fetchImage(target) {
  const candidates = mirrorsFor(target);
  let lastError;
  for (const [i, url] of candidates.entries()) {
    const hasFallback = i < candidates.length - 1;
    try {
      const response = await fetch(url, {
        headers: {
          'Referer': refererFor(url),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: hasFallback ? AbortSignal.timeout(MIRROR_TIMEOUT_MS) : undefined,
      });
      if (!response.ok) throw new Error(`CDN ${response.status}`);
      return {
        contentType: response.headers.get('content-type') || 'image/jpeg',
        body: Buffer.from(await response.arrayBuffer()),
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { url } = req.query;
  if (!url) { res.status(400).send('Missing url'); return; }
  // Only allow public http(s) — block localhost/private/metadata (open-proxy SSRF).
  let parsed;
  try { parsed = new URL(url); } catch { res.status(400).send('Bad url'); return; }
  if (!/^https?:$/.test(parsed.protocol) || /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|0\.|::1$)/i.test(parsed.hostname)) {
    res.status(403).send('Forbidden target'); return;
  }

  try {
    const image = await fetchImage(url);
    res.setHeader('Content-Type', image.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(image.body);
  } catch {
    res.status(502).send('Image proxy error');
  }
}
