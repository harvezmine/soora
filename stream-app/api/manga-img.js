/**
 * Vercel Serverless Function — Manga image proxy
 * Replicates the Vite dev middleware /manga-img for production.
 * Proxies manga images with required Referer header for CDNs.
 */
// Per-host Referer — komiku's CDN 403s hotlinks unless Referer is its own origin.
function refererFor(target) {
  try {
    const host = new URL(target).hostname.toLowerCase();
    if (host.endsWith('komiku.org') || host.endsWith('komiku.id')) return 'https://komiku.org/';
    if (host.endsWith('mangadex.org')) return 'https://mangadex.org/';
    if (host.endsWith('mangapill.com')) return 'https://mangapill.com/';
  } catch { /* fall through */ }
  return 'https://mangapill.com/';
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
    const response = await fetch(url, {
      headers: {
        'Referer': refererFor(url),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    if (!response.ok) throw new Error(`CDN ${response.status}`);

    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch {
    res.status(502).send('Image proxy error');
  }
}
