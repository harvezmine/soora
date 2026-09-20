import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler, { refererFor } from '../api/manga-img.js';

test('Komiku CDN shards use the provider Referer in dev and production', () => {
  for (const host of ['img.komiku.org', 'img.komiku.id', 'image2.komiku.to', 'image14.komiku.to']) {
    assert.equal(refererFor(`https://${host}/uploads2/page.jpg`), 'https://komiku.org/');
  }
  assert.equal(refererFor('https://komiku.to.invalid/a.jpg'), 'https://mangapill.com/');
  assert.equal(refererFor('https://fakekomiku.to/a.jpg'), 'https://mangapill.com/');
  assert.equal(refererFor('https://uploads.mangadex.org/a.jpg'), 'https://mangadex.org/');
  assert.equal(refererFor('https://cdn.readdetectiveconan.com/a.jpg'), 'https://mangapill.com/');
});

test('image proxy forwards the shard URL with Komiku Referer and returns all bytes', async () => {
  const originalFetch = globalThis.fetch;
  const url = 'https://image2.komiku.to/uploads2/page_part1.jpg';
  const bytes = Buffer.from([137, 80, 78, 71, 1, 2, 3, 4]);
  globalThis.fetch = async (target, options) => {
    assert.equal(target, url);
    assert.equal(options.headers.Referer, 'https://komiku.org/');
    return new Response(bytes, { headers: { 'content-type': 'image/png' } });
  };
  const headers = {};
  let body;
  const res = {
    setHeader(key, value) { headers[key] = value; },
    status(code) { assert.fail(`Unexpected status ${code}`); },
    send(value) { body = value; },
  };
  try {
    await handler({ method: 'GET', query: { url } }, res);
    assert.equal(headers['Content-Type'], 'image/png');
    assert.deepEqual(body, bytes);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
