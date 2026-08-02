import { Router, Request, Response } from 'express';
import axios from 'axios';
import { isUrlAllowed } from '../utils/ssrfGuard';

const router = Router();

/**
 * GET /proxy?url=...
 * Stream proxy — replicates the Vercel serverless function.
 * Proxies HLS m3u8, VTT, and video segments with required headers.
 */
router.get('/', async (req: Request, res: Response) => {
  const targetUrl = String(req.query.url || '');
  if (!targetUrl) return res.status(400).send('Missing url parameter');
  if (!isUrlAllowed(targetUrl)) return res.status(403).send('Forbidden target');

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };

    // Add Referer/Origin based on target domain
    const host = new URL(targetUrl).hostname;
    if (host.includes('megacloud') || host.includes('rapid-cloud')) {
      headers['Referer'] = 'https://megacloud.tv/';
      headers['Origin'] = 'https://megacloud.tv';
    } else if (host.includes('uwucdn') || host.includes('uwu.ai')) {
      headers['Referer'] = 'https://uwucdn.com/';
      headers['Origin'] = 'https://uwucdn.com';
    } else if (host.includes('vizcloud') || host.includes('vidstream')) {
      headers['Referer'] = 'https://vizcloud.co/';
      headers['Origin'] = 'https://vizcloud.co';
    } else if (host.includes('biananset') || host.includes('kerapoxy')) {
      headers['Referer'] = 'https://megacloud.tv/';
      headers['Origin'] = 'https://megacloud.tv';
    } else if (host.includes('vixsrc') || host.includes('vix-content') || host.includes('vixcloud')) {
      // VixSrc HLS playlists/segments require the embed page as Referer
      headers['Referer'] = String(req.query.ref || req.query.referer || 'https://vixsrc.to/');
    }

    // Teruskan Range dari klien.
    //
    // ExoPlayer memakai Range untuk buffering dan seek. Sebelumnya header ini
    // diabaikan sepenuhnya: `Range: bytes=0-1023` dibalas HTTP 200 berisi
    // seluruh 210.000 byte segmen. Selain memboroskan bandwidth dua kali
    // (CDN→VPS dan VPS→klien), itu membuat sumber progresif non-HLS tidak bisa
    // di-seek sama sekali.
    if (req.headers.range) headers['Range'] = String(req.headers.range);

    // Selalu minta sebagai stream, lalu putuskan setelah header tiba.
    //
    // Keputusan playlist-atau-bukan TIDAK boleh diambil dari bentuk URL saja:
    // VixSrc menyajikan playlist dari `/playlist/170060?...` tanpa akhiran
    // .m3u8, dan penyedia lain bisa berbeda lagi. Kode lama mendeteksinya dari
    // Content-Type, dan deteksi itu harus dipertahankan — playlist yang lolos
    // ke jalur streaming tidak akan ditulis ulang, sehingga URL segmennya
    // menunjuk langsung ke CDN dan klien menerima 403.
    const streamRes = await axios.get(targetUrl, {
      headers,
      responseType: 'stream',
      timeout: 25000,
      maxRedirects: 5,
      // Jangan lempar untuk 206/416 — keduanya jawaban sah untuk Range.
      validateStatus: (s) => s >= 200 && s < 400,
    });

    const upstreamCt = String(streamRes.headers['content-type'] || '');
    const isPlaylist =
      targetUrl.includes('.m3u8') ||
      upstreamCt.includes('mpegurl') ||
      upstreamCt.includes('application/vnd.apple');

    // Segmen video, kunci, dan subtitle dialirkan apa adanya.
    //
    // Diukur sebelum perubahan ini: TTFB 1,006s vs total 1,008s, artinya proxy
    // menunggu seluruh segmen terunduh sebelum mengirim byte pertama. CDN
    // aslinya progresif (TTFB 0,81s, total 1,44s). Jeda itu langsung terasa
    // sebagai lambatnya mulai putar dan tersendat saat seek.
    if (!isPlaylist) {
      res.status(streamRes.status);
      for (const h of [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'last-modified',
        'etag',
      ]) {
        const v = streamRes.headers[h];
        if (v) res.setHeader(h, String(v));
      }
      if (!streamRes.headers['accept-ranges']) res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Allow-Origin', '*');
      // Segmen tidak berubah isinya, jadi aman di-cache lama.
      res.setHeader('Cache-Control', 'public, max-age=3600');

      streamRes.data.on('error', () => res.destroy());
      // Kalau klien memutus (user seek atau menutup layar), hentikan unduhan
      // dari CDN juga — kalau tidak, VPS terus menarik data yang tidak dipakai.
      res.on('close', () => streamRes.data.destroy());
      streamRes.data.pipe(res);
      return;
    }

    // Playlist: kumpulkan stream jadi teks utuh karena isinya ditulis ulang.
    const chunks: Buffer[] = [];
    let collected = 0;
    // Batas kewarasan. Playlist varian terpanjang yang terukur 818 KB (2087
    // segmen); 8 MB memberi ruang lebih dari cukup sekaligus mencegah satu
    // respons raksasa menghabiskan memori proses (max_memory_restart 500 MB).
    const MAX_PLAYLIST_BYTES = 8 * 1024 * 1024;

    await new Promise<void>((resolve, reject) => {
      streamRes.data.on('data', (c: Buffer) => {
        collected += c.length;
        if (collected > MAX_PLAYLIST_BYTES) {
          streamRes.data.destroy();
          reject(new Error('Playlist melebihi batas ukuran'));
          return;
        }
        chunks.push(c);
      });
      streamRes.data.on('end', () => resolve());
      streamRes.data.on('error', reject);
    });

    const ct = upstreamCt;
    let body = Buffer.concat(chunks);

    {
      let text = body.toString('utf-8');
      const base = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

      // Use the `base` query param for proxy prefix (sent by VideoPlayer).
      // This ensures m3u8 internal URLs resolve correctly:
      //   - Via Vercel: base=/api/proxy → /api/proxy?url=...
      //   - Via stream.soora.fun: base=https://stream.soora.fun/proxy → full URL
      const proxyBase = String(req.query.base || '/proxy');
      // Carry Referer down to nested segment/sub-playlist fetches (vixsrc needs it)
      const refQ = req.query.ref || req.query.referer;
      const refSuffix = refQ ? `&ref=${encodeURIComponent(String(refQ))}` : '';

      // `base` juga harus ikut turun.
      //
      // Tanpa ini, playlist varian (anak) tidak menerima `base` dan URL
      // segmennya jatuh ke default relatif `/proxy?url=...`. Di web itu
      // kebetulan tetap bekerja karena origin-nya sama, tapi bergantung pada
      // kebetulan: begitu playlist disajikan dari host yang berbeda dari proxy,
      // seluruh segmen menunjuk ke tempat yang salah.
      const baseSuffix = req.query.base
        ? `&base=${encodeURIComponent(String(req.query.base))}`
        : '';

      // `base` hanya berguna untuk entri yang nanti diambil sebagai playlist
      // dan ditulis ulang lagi. Segmen adalah daun — menambahkan `base` ke
      // 2087 baris segmen membengkakkan playlist 818 KB → 952 KB tanpa guna,
      // dan bandwidth VPS adalah sumber daya yang paling terbatas di sini.
      //
      // Master playlist dikenali dari #EXT-X-STREAM-INF (anaknya = playlist
      // varian); playlist media dikenali dari #EXTINF (anaknya = segmen).
      const isMaster = text.includes('#EXT-X-STREAM-INF');
      const childSuffix = isMaster ? `${refSuffix}${baseSuffix}` : refSuffix;

      // URI= pada #EXT-X-MEDIA menunjuk playlist audio/subtitle, jadi selalu
      // butuh `base` berapa pun jenis playlist induknya.
      const uriSuffix = `${refSuffix}${baseSuffix}`;

      // Rewrite KEY/MAP URIs
      text = text.replace(/URI="([^"]+)"/g, (_match: string, uri: string) => {
        const abs = uri.startsWith('http') ? uri : new URL(uri, base).href;
        return `URI="${proxyBase}?url=${encodeURIComponent(abs)}${uriSuffix}"`;
      });

      // Rewrite segment/playlist lines
      text = text
        .split('\n')
        .map((line: string) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return line;
          const abs = trimmed.startsWith('http') ? trimmed : new URL(trimmed, base).href;
          return `${proxyBase}?url=${encodeURIComponent(abs)}${childSuffix}`;
        })
        .join('\n');

      body = Buffer.from(text, 'utf-8');
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      // Playlist TIDAK boleh di-cache: URL di dalamnya membawa token dengan
      // `expires`. Sebelumnya dikirim `public, max-age=3600`, sehingga klien
      // atau perantara bisa menyajikan playlist yang tokennya sudah mati —
      // gejalanya video berhenti di tengah tanpa pesan yang menjelaskan.
      res.setHeader('Cache-Control', 'no-store');
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(body);
  } catch (err: any) {
    // Retry once with additional headers on 403
    if (err.response?.status === 403) {
      try {
        const retryHeaders: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://megacloud.tv/',
          'Origin': 'https://megacloud.tv',
        };
        const retryRes = await axios.get(targetUrl, {
          headers: retryHeaders,
          responseType: 'arraybuffer',
          timeout: 15000,
        });
        res.setHeader('Content-Type', retryRes.headers['content-type'] || 'application/octet-stream');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(Buffer.from(retryRes.data));
        return;
      } catch { /* fall through to error */ }
    }
    console.error('[proxy]', err.message);
    res.status(err.response?.status || 502).send('Proxy error');
  }
});

/**
 * GET /manga-img?url=...
 * Manga image proxy with Referer header.
 */
// Per-host Referer — some CDNs (komiku) 403 hotlinks unless the Referer matches
// their own origin. Default to mangapill for everything else.
function refererFor(targetUrl: string): string {
  try {
    const host = new URL(targetUrl).hostname.toLowerCase();
    if (host.endsWith('komiku.org') || host.endsWith('komiku.id')) return 'https://komiku.org/';
    if (host.endsWith('mangapill.com')) return 'https://mangapill.com/';
    if (host.endsWith('mangadex.org')) return 'https://mangadex.org/';
  } catch { /* fall through */ }
  return 'https://mangapill.com/';
}

router.get('/manga-img', async (req: Request, res: Response) => {
  const targetUrl = String(req.query.url || '');
  if (!targetUrl) return res.status(400).send('Missing url');
  if (!isUrlAllowed(targetUrl)) return res.status(403).send('Forbidden target');

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        'Referer': refererFor(targetUrl),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      responseType: 'arraybuffer',
      timeout: 15000,
    });

    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(Buffer.from(response.data));
  } catch {
    res.status(502).send('Image proxy error');
  }
});

export default router;
