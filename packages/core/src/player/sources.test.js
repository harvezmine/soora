import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildProxyUrl,
  resolvePlayback,
  shouldRefetchSource,
  parseVariants,
} from './sources.js';
import { configureCore, resetCoreRuntime } from '../runtime.js';

const PROXY = 'https://stream.soora.fun/proxy';
const M3U8 = 'https://vixsrc.to/playlist/170060?b=1&token=abc&expires=123';
const REF = 'https://vixsrc.to/embed/170060?token=xyz';

beforeEach(() => {
  resetCoreRuntime();
  configureCore({ streamProxy: PROXY });
});

describe('buildProxyUrl', () => {
  it('membungkus m3u8 dengan proxy', () => {
    expect(buildProxyUrl(M3U8)).toContain(`${PROXY}?url=`);
  });

  it('meng-encode URL supaya query di dalamnya tidak bocor jadi parameter proxy', () => {
    // m3u8 punya `?b=1&token=...`. Tanpa encoding, `&token` akan terbaca proxy
    // sebagai parameternya sendiri dan URL target jadi terpotong.
    const u = buildProxyUrl(M3U8);
    expect(u).toContain(encodeURIComponent(M3U8));
    expect(u.split('url=')[1].split('&')[0]).toBe(encodeURIComponent(M3U8));
  });

  it('menyertakan ref kalau ada', () => {
    expect(buildProxyUrl(M3U8, REF)).toContain(`ref=${encodeURIComponent(REF)}`);
  });

  it('menghilangkan ref kalau tidak ada, bukan mengirim undefined', () => {
    const u = buildProxyUrl(M3U8);
    expect(u).not.toContain('ref=');
    expect(u).not.toContain('undefined');
  });

  it('selalu menyertakan base supaya playlist anak ditulis absolut', () => {
    expect(buildProxyUrl(M3U8, REF)).toContain(`base=${encodeURIComponent(PROXY)}`);
  });

  it('memakai streamProxy dari runtime, bukan nilai hardcoded', () => {
    // Penting karena proxy direncanakan pindah ke home server.
    configureCore({ streamProxy: 'https://rumah.example/proxy' });
    expect(buildProxyUrl(M3U8)).toContain('https://rumah.example/proxy?url=');
  });

  it('bisa ditimpa per-panggilan', () => {
    expect(buildProxyUrl(M3U8, undefined, 'https://lain.test/p')).toContain('https://lain.test/p?');
  });

  it('m3u8 kosong menghasilkan string kosong, bukan URL cacat', () => {
    expect(buildProxyUrl('')).toBe('');
    expect(buildProxyUrl(undefined)).toBe('');
  });
});

describe('resolvePlayback', () => {
  it('m3u8 ada -> mode native lewat proxy', () => {
    const s = resolvePlayback({ m3u8: M3U8, ref: REF });
    expect(s.mode).toBe('native');
    expect(s.viaProxy).toBe(true);
    expect(s.uri.startsWith(PROXY)).toBe(true);
  });

  it('m3u8 TIDAK pernah dipakai langsung tanpa proxy', () => {
    // Token m3u8 terikat IP VPS; memakai URL asli di perangkat selalu 403.
    const s = resolvePlayback({ m3u8: M3U8, ref: REF });
    expect(s.uri).not.toBe(M3U8);
    expect(s.uri).toContain('proxy');
  });

  it('tanpa m3u8 -> embed pertama yang punya url', () => {
    const s = resolvePlayback({
      embeds: [{ url: '' }, { url: 'https://vidlink.pro/x', label: 'VidLink' }],
    });
    expect(s.mode).toBe('embed');
    expect(s.uri).toBe('https://vidlink.pro/x');
    expect(s.label).toBe('VidLink');
  });

  it('m3u8 mengalahkan embed walau embed juga tersedia', () => {
    // Hanya jalur native yang memberi background play, PiP, dan kendali kualitas.
    const s = resolvePlayback({ m3u8: M3U8, embeds: [{ url: 'https://vidlink.pro/x' }] });
    expect(s.mode).toBe('native');
  });

  it('tidak ada sumber apa pun -> null, bukan objek kosong', () => {
    expect(resolvePlayback({})).toBeNull();
    expect(resolvePlayback()).toBeNull();
    expect(resolvePlayback({ embeds: [] })).toBeNull();
    expect(resolvePlayback({ embeds: [{ url: '' }] })).toBeNull();
  });
});

describe('shouldRefetchSource', () => {
  it('403 memicu pengambilan sumber baru', () => {
    // Token m3u8 punya `expires`; pada film panjang bisa mati di tengah.
    expect(shouldRefetchSource({ status: 403 })).toBe(true);
  });

  it('401 dan 410 juga', () => {
    expect(shouldRefetchSource({ status: 401 })).toBe(true);
    expect(shouldRefetchSource({ status: 410 })).toBe(true);
  });

  it('mengenali dari pesan kalau status tidak tersedia', () => {
    // ExoPlayer sering hanya memberi string.
    expect(shouldRefetchSource({ message: 'Response code: 403' })).toBe(true);
    expect(shouldRefetchSource({ message: 'Source expired' })).toBe(true);
  });

  it('kegagalan jaringan biasa TIDAK memicu pengambilan ulang sumber', () => {
    // Mengambil sumber baru tidak menolong kalau masalahnya koneksi.
    expect(shouldRefetchSource({ status: 500 })).toBe(false);
    expect(shouldRefetchSource({ message: 'Network unreachable' })).toBe(false);
    expect(shouldRefetchSource({})).toBe(false);
    expect(shouldRefetchSource(null)).toBe(false);
  });
});

describe('regresi audit fase 3', () => {
  it('id judul yang memuat "403" tidak memicu pengambilan ulang sumber', () => {
    // URI proxy memuat id judul; pencocokan substring polos akan cocok untuk
    // TMDB id 4030 dan menghabiskan jatah refetch pada error yang tidak sembuh.
    expect(
      shouldRefetchSource({
        message:
          'Unable to connect to https://stream.soora.fun/proxy?url=%2Fplaylist%2F4030%3Ftoken%3Dx',
      })
    ).toBe(false);
  });

  it('403 sebagai kode error tetap terdeteksi', () => {
    expect(shouldRefetchSource({ message: 'Response code: 403' })).toBe(true);
    expect(shouldRefetchSource({ message: 'HTTP 403 Forbidden' })).toBe(true);
  });

  it('query expires bawaan m3u8 tidak dianggap kedaluwarsa', () => {
    expect(
      shouldRefetchSource({ message: 'Failed to open https://cdn.test/a.m3u8?expires=123' })
    ).toBe(false);
  });

  it('AVERAGE-BANDWIDTH tidak dipakai sebagai bitrate varian', () => {
    const v = parseVariants(
      '#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=500000,BANDWIDTH=1200000,CODECS="avc1"\na.m3u8'
    );
    expect(v[0].bandwidth).toBe(1200000);
    expect(v[0].label).toBe('1200 kbps');
  });
});

describe('parseVariants', () => {
  const MASTER = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
720.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
1080.m3u8`;

  it('mengambil semua varian', () => {
    expect(parseVariants(MASTER)).toHaveLength(3);
  });

  it('mengurutkan dari kualitas tertinggi', () => {
    expect(parseVariants(MASTER).map((v) => v.label)).toEqual(['1080p', '720p', '360p']);
  });

  it('jatuh ke bitrate kalau resolusi tidak dicantumkan', () => {
    const v = parseVariants('#EXT-X-STREAM-INF:BANDWIDTH=1500000\na.m3u8');
    expect(v[0].label).toBe('1500 kbps');
  });

  it('melewati baris yang tidak bisa diurai, bukan gagal seluruhnya', () => {
    const v = parseVariants(`#EXT-X-STREAM-INF:CODECS="avc1"\na.m3u8\n${MASTER}`);
    expect(v).toHaveLength(3);
  });

  it('input bukan string menghasilkan array kosong', () => {
    for (const x of [null, undefined, 42, {}]) expect(parseVariants(x)).toEqual([]);
  });
});
