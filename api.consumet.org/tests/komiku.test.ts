import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import Fastify from 'fastify';
import routes, { parseChapterPages } from '../src/routes/manga/komiku';

const chapter = readFileSync(join(__dirname, 'fixtures/komiku-novels-extra-ch01.html'), 'utf8');

test('Novel’s Extra chapter 1 keeps all 94 slices across CDN hosts in source order', () => {
  const pages = parseChapterPages(chapter);
  assert.equal(pages.length, 94);
  assert.deepEqual(pages.map(p => p.page), Array.from({ length: 94 }, (_, i) => i + 1));
  const sourceURLs = Array.from(chapter.matchAll(/<img src="([^"]+)"[^>]*id="\d+"/g), m => m[1]);
  assert.deepEqual(pages.map(p => p.img), sourceURLs);
  assert.equal(pages[0].img, 'https://image2.komiku.to/uploads2/2537393-1.png');
  assert.equal(pages[93].img, 'https://img.komiku.org/uploads2/2537393-48.jpg');
});

test('reader parsing supports legacy hosts and lazy sources without including ads or recommendations', () => {
  const pages = parseChapterPages(`
    <img class="ww" src="https://img.komiku.org/cover.jpg">
    <div id="Baca_Komik">
      <img src="https://image2.komiku.to/komiku-promosi.webp">
      <div class="iklan"><img src="https://img.komiku.org/promo.jpg"></div>
      <img id="1" src="https://img.komiku.id/uploads/1_part1.jpg">
      <img class="klazy ww" src="data:image/gif;base64,placeholder"
        data-src="//image15.komiku.to/uploads/1_part2.jpg?a=1&amp;b=2">
      <img class="klazy" data-original="https://img.komiku.org/uploads/2.jpg" src="/placeholder.gif">
      <img id="4" data-src="data:image/gif;base64,placeholder" src="https://img.komiku.org/uploads/3.jpg">
      <img id="5" src="javascript:alert(1)">
      <img id="6" src="https://komiku.org.invalid/image.jpg">
      <img id="7" src="https://fakekomiku.org/image.jpg">
    </div>
    <img id="8" src="https://img.komiku.org/recommendation.jpg">
  `);
  assert.deepEqual(pages, [
    { img: 'https://img.komiku.id/uploads/1_part1.jpg', page: 1 },
    { img: 'https://image15.komiku.to/uploads/1_part2.jpg?a=1&b=2', page: 2 },
    { img: 'https://img.komiku.org/uploads/2.jpg', page: 3 },
    { img: 'https://img.komiku.org/uploads/3.jpg', page: 4 },
  ]);
  assert.deepEqual(parseChapterPages('<html>Provider unavailable</html>'), []);
});

test('/read returns the complete chapter and rejects empty or missing chapters', async () => {
  const app = Fastify();
  const originalFetch = globalThis.fetch;
  let html = chapter;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    assert.equal(url, 'https://komiku.org/the-novels-extra-remake-chapter-01/');
    return new Response(html, { status: 200 });
  };
  try {
    await app.register(routes, { prefix: '/manga/komiku' });
    const url = '/manga/komiku/read?chapterId=the-novels-extra-remake-chapter-01';
    const response = await app.inject(url);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), parseChapterPages(chapter));
    html = '<div id="Baca_Komik"></div>';
    assert.equal((await app.inject(url)).statusCode, 404);
    assert.equal((await app.inject('/manga/komiku/read')).statusCode, 400);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});
