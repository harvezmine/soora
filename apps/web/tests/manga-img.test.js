import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler, { mirrorsFor, refererFor } from '../api/manga-img.js';

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

test('Komiku shards fall back to img.komiku.org, like the Komiku reader does', () => {
  assert.deepEqual(mirrorsFor('https://image5.komiku.to/upload5/x/174/4_part4.webp?v=1'), [
    'https://image5.komiku.to/upload5/x/174/4_part4.webp?v=1',
    'https://img.komiku.org/upload5/x/174/4_part4.webp?v=1',
  ]);
  for (const url of [
    'https://img.komiku.org/upload5/a.webp',
    'https://image5.komiku.to.invalid/a.webp',
    'https://cdn.readdetectiveconan.com/a.jpg',
    'not a url',
  ]) {
    assert.deepEqual(mirrorsFor(url), [url]);
  }
});

function captureResponse() {
  const out = { headers: {}, statusCode: 200, body: undefined };
  out.res = {
    setHeader(key, value) { out.headers[key] = value; },
    status(code) { out.statusCode = code; return out.res; },
    send(value) { out.body = value; },
  };
  return out;
}

test('image proxy serves the page from img.komiku.org when its shard is down', async () => {
  const originalFetch = globalThis.fetch;
  const bytes = Buffer.from([82, 73, 70, 70, 1, 2, 3]);
  const calls = [];
  globalThis.fetch = async (target, options) => {
    calls.push([target, options.headers.Referer]);
    if (target.includes('image7.komiku.to')) throw new TypeError('fetch failed');
    return new Response(bytes, { headers: { 'content-type': 'image/webp' } });
  };
  const out = captureResponse();
  try {
    await handler({ method: 'GET', query: { url: 'https://image7.komiku.to/upload5/p/2_part1.webp' } }, out.res);
    assert.deepEqual(calls, [
      ['https://image7.komiku.to/upload5/p/2_part1.webp', 'https://komiku.org/'],
      ['https://img.komiku.org/upload5/p/2_part1.webp', 'https://komiku.org/'],
    ]);
    assert.equal(out.statusCode, 200);
    assert.equal(out.headers['Content-Type'], 'image/webp');
    assert.deepEqual(out.body, bytes);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('image proxy reports 502 only after every mirror failed', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (target) => {
    calls.push(target);
    return new Response('down', { status: 522 });
  };
  const out = captureResponse();
  try {
    await handler({ method: 'GET', query: { url: 'https://image3.komiku.to/upload5/p/1.webp' } }, out.res);
    assert.equal(calls.length, 2);
    assert.equal(out.statusCode, 502);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
