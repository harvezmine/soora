import { describe, it, expect } from 'vitest';
import {
  MAX_TEXT,
  CommentError,
  assertValidKey,
  normalizeText,
  resolveParentId,
} from './commentRules';

describe('assertValidKey', () => {
  it('menerima kunci yang dipakai tiap bagian', () => {
    expect(assertValidKey('movie:1315772')).toBe('movie:1315772');
    expect(assertValidKey('anime:gachiakuta')).toBe('anime:gachiakuta');
    expect(assertValidKey('movie:lk21:the-twits-2026')).toBe('movie:lk21:the-twits-2026');
    expect(assertValidKey('anime:watch-series/one-piece')).toBe('anime:watch-series/one-piece');
  });

  it('memangkas spasi di tepi', () => {
    expect(assertValidKey('  movie:99  ')).toBe('movie:99');
  });

  it('menolak kunci tanpa bagian', () => {
    expect(() => assertValidKey('1315772')).toThrow(CommentError);
  });

  it('menolak karakter yang bisa membocorkan ruang kunci Redis', () => {
    expect(() => assertValidKey('movie:*')).toThrow(CommentError);
    expect(() => assertValidKey('movie:a b')).toThrow(CommentError);
    expect(() => assertValidKey('movie:a\nb')).toThrow(CommentError);
  });

  it('menolak kunci kosong atau kepanjangan', () => {
    expect(() => assertValidKey('')).toThrow(CommentError);
    expect(() => assertValidKey('movie:')).toThrow(CommentError);
    expect(() => assertValidKey(`movie:${'a'.repeat(121)}`)).toThrow(CommentError);
  });
});

describe('normalizeText', () => {
  it('memangkas spasi di tepi', () => {
    expect(normalizeText('  seru banget  ')).toBe('seru banget');
  });

  it('menyamakan CRLF jadi baris baru tunggal', () => {
    expect(normalizeText('baris satu\r\nbaris dua')).toBe('baris satu\nbaris dua');
  });

  it('memadatkan baris kosong beruntun jadi satu', () => {
    expect(normalizeText('atas\n\n\n\n\nbawah')).toBe('atas\n\nbawah');
  });

  it('membuang karakter kendali tapi menyisakan baris baru dan tab', () => {
    expect(normalizeText('halo\u0000\u0007dunia')).toBe('halodunia');
    expect(normalizeText('a\tb\nc')).toBe('a\tb\nc');
  });

  it('menolak teks kosong, spasi saja, atau yang habis setelah dibersihkan', () => {
    expect(() => normalizeText('')).toThrow(CommentError);
    expect(() => normalizeText('    ')).toThrow(CommentError);
    expect(() => normalizeText('\u0000\u0001')).toThrow(CommentError);
    expect(() => normalizeText(null)).toThrow(CommentError);
    expect(() => normalizeText(undefined)).toThrow(CommentError);
  });

  it('menerima teks tepat pada batas dan menolak yang lewat satu karakter', () => {
    expect(normalizeText('a'.repeat(MAX_TEXT))).toHaveLength(MAX_TEXT);
    expect(() => normalizeText('a'.repeat(MAX_TEXT + 1))).toThrow(CommentError);
  });

  it('memberi status 400 supaya rute tidak perlu menebak', () => {
    try {
      normalizeText('');
      throw new Error('seharusnya melempar');
    } catch (e) {
      expect(e).toBeInstanceOf(CommentError);
      expect((e as CommentError).status).toBe(400);
    }
  });
});

describe('resolveParentId', () => {
  const utama = { id: 'c_1', key: 'movie:99', parentId: null };
  const balasan = { id: 'c_2', key: 'movie:99', parentId: 'c_1' };

  it('membalas komentar utama menempel padanya', () => {
    expect(resolveParentId(utama, 'movie:99')).toBe('c_1');
  });

  it('membalas sebuah balasan tetap menempel ke komentar utama — utas tidak pernah tiga tingkat', () => {
    expect(resolveParentId(balasan, 'movie:99')).toBe('c_1');
  });

  it('menolak membalas komentar milik judul lain', () => {
    expect(() => resolveParentId(utama, 'movie:100')).toThrow(CommentError);
  });
});
