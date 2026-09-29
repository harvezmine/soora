import { describe, it, expect, vi, afterEach } from 'vitest';
import axios from 'axios';
import { fetchMangaImage, mirrorsFor, refererFor } from './mangaImage';

afterEach(() => vi.restoreAllMocks());

describe('mirrorsFor', () => {
  it('shard komiku punya cadangan img.komiku.org, seperti pembaca komiku', () => {
    expect(mirrorsFor('https://image5.komiku.to/upload5/x/174/4_part4.webp?v=1')).toEqual([
      'https://image5.komiku.to/upload5/x/174/4_part4.webp?v=1',
      'https://img.komiku.org/upload5/x/174/4_part4.webp?v=1',
    ]);
  });

  it('host lain tidak diberi cadangan', () => {
    for (const url of [
      'https://img.komiku.org/upload5/a.webp',
      'https://image5.komiku.to.invalid/a.webp',
      'https://cdn.readdetectiveconan.com/a.jpg',
      'bukan url',
    ]) {
      expect(mirrorsFor(url)).toEqual([url]);
    }
  });
});

describe('fetchMangaImage', () => {
  it('pindah ke img.komiku.org saat shard-nya mati', async () => {
    const bytes = Buffer.from([82, 73, 70, 70, 1, 2, 3]);
    const get = vi.spyOn(axios, 'get').mockImplementation(async (url: string) => {
      if (url.includes('image7.komiku.to')) throw new Error('connect ETIMEDOUT');
      return { data: bytes, headers: { 'content-type': 'image/webp' } };
    });

    const image = await fetchMangaImage('https://image7.komiku.to/upload5/p/2_part1.webp');

    expect(get.mock.calls.map(([url, opts]: any[]) => [url, opts.headers.Referer])).toEqual([
      ['https://image7.komiku.to/upload5/p/2_part1.webp', 'https://komiku.org/'],
      ['https://img.komiku.org/upload5/p/2_part1.webp', 'https://komiku.org/'],
    ]);
    expect(image).toEqual({ contentType: 'image/webp', body: bytes });
  });

  it('gagal hanya setelah semua cermin gagal', async () => {
    const get = vi.spyOn(axios, 'get').mockRejectedValue(new Error('Request failed with status code 522'));
    await expect(fetchMangaImage('https://image3.komiku.to/upload5/p/1.webp')).rejects.toThrow('522');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('Referer tetap per host', () => {
    expect(refererFor('https://image14.komiku.to/a.jpg')).toBe('https://komiku.org/');
    expect(refererFor('https://uploads.mangadex.org/a.jpg')).toBe('https://mangadex.org/');
    expect(refererFor('https://fakekomiku.to/a.jpg')).toBe('https://mangapill.com/');
  });
});
