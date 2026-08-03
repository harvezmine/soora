import { describe, it, expect } from 'vitest';
import { detectMangaProvider } from './index.js';

/**
 * Provider salah tidak menghasilkan error — endpoint membalas 200 dengan daftar
 * kosong. Jadi tebakannya harus benar, karena kegagalannya menyamar sebagai
 * "judul ini memang tidak punya chapter".
 */
describe('detectMangaProvider', () => {
  it('id berawalan angka adalah mangapill', () => {
    expect(detectMangaProvider('3004-10052000/mushoku-tensei-roxy-is-serious-chapter-52')).toBe(
      'mangapill'
    );
    expect(detectMangaProvider('2-9520/one-piece')).toBe('mangapill');
  });

  it('slug murni adalah komiku', () => {
    expect(detectMangaProvider('one-piece')).toBe('komiku');
    expect(detectMangaProvider('kimetsu-no-yaiba')).toBe('komiku');
  });

  it('id kosong jatuh ke mangapill, bukan melempar', () => {
    // Layar info memanggil ini sebelum param rute pasti terisi.
    expect(detectMangaProvider('')).toBe('mangapill');
    expect(detectMangaProvider(undefined)).toBe('mangapill');
    expect(detectMangaProvider(null)).toBe('mangapill');
  });

  it('menerima angka, bukan hanya string', () => {
    // Beberapa penyedia mengembalikan id numerik; String(id) menanganinya, dan
    // tanpa itu /^\d/.test() pada number akan melempar.
    expect(detectMangaProvider(3004)).toBe('mangapill');
  });
});
