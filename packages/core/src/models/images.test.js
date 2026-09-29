import { describe, it, expect } from 'vitest';
import { mirrorFallback } from './images.js';

describe('mirrorFallback', () => {
  it('shard komiku pindah ke img.komiku.org dengan path yang sama', () => {
    expect(mirrorFallback('https://image5.komiku.to/upload5/x/174/4_part4.webp?v=1'))
      .toBe('https://img.komiku.org/upload5/x/174/4_part4.webp?v=1');
  });

  it('tidak ada cadangan untuk host lain, termasuk cadangannya sendiri', () => {
    for (const url of [
      'https://img.komiku.org/upload5/a.webp',
      'https://image5.komiku.to.invalid/a.webp',
      'https://cdn.readdetectiveconan.com/a.jpg',
      '',
      undefined,
    ]) {
      expect(mirrorFallback(url)).toBeNull();
    }
  });
});
