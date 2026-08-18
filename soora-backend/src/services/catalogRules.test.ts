import { describe, it, expect } from 'vitest';
import {
  MIN_VOTE_COUNT,
  MIN_POPULARITY,
  layakDiputar,
  saringLayakDiputar,
  vidlinkBerisi,
  VIDLINK_MIN_BYTES,
} from './catalogRules';

/** Pembantu ringkas: judul dengan angka yang diatur per kasus. */
const judul = (voteCount: number, popularity: number, originalLanguage = 'en') =>
  ({ voteCount, popularity, originalLanguage });

describe('layakDiputar', () => {
  it('meloloskan film arus utama', () => {
    // Inception: 37 ribu suara. Terukur bisa diputar.
    expect(layakDiputar(judul(37000, 85.4))).toBe(true);
  });

  it('membuang album soundtrack yang dicatat TMDB sebagai film', () => {
    // "Inception: Music from the Motion Picture" — nyata ada di hasil
    // pencarian "inception", dan tentu saja tidak bisa diputar.
    expect(layakDiputar(judul(2, 0.6))).toBe(false);
  });

  it('membuang film obscure tanpa suara', () => {
    expect(layakDiputar(judul(0, 0))).toBe(false);
    expect(layakDiputar(judul(4, 1.2))).toBe(false);
  });

  it('membuang judul berbahasa Indonesia — itu jatah kolam LK21', () => {
    // Angkanya sengaja dibuat besar: bahasa yang memutuskan, bukan populer
    // atau tidaknya.
    expect(layakDiputar(judul(5000, 99, 'id'))).toBe(false);
  });

  it('butuh KEDUA syarat, bukan salah satu', () => {
    // Banyak suara tapi sudah lama tenggelam.
    expect(layakDiputar(judul(500, 0.4))).toBe(false);
    // Sedang ramai tapi belum ada yang menilai.
    expect(layakDiputar(judul(3, 40))).toBe(false);
  });

  it('menerima tepat di ambang, menolak tepat di bawahnya', () => {
    expect(layakDiputar(judul(MIN_VOTE_COUNT, MIN_POPULARITY))).toBe(true);
    expect(layakDiputar(judul(MIN_VOTE_COUNT - 1, MIN_POPULARITY))).toBe(false);
    expect(layakDiputar(judul(MIN_VOTE_COUNT, MIN_POPULARITY - 0.1))).toBe(false);
  });

  it('memperlakukan angka yang hilang sebagai nol, bukan lolos', () => {
    // Penyedia lain memakai normalizer yang sama dan tidak selalu mengisi
    // kedua bidang ini. Yang kosong tidak boleh diam-diam diloloskan.
    expect(layakDiputar({} as any)).toBe(false);
    expect(layakDiputar({ originalLanguage: 'en' })).toBe(false);
    expect(layakDiputar(null)).toBe(false);
    expect(layakDiputar(undefined)).toBe(false);
  });
});

describe('saringLayakDiputar', () => {
  it('menjaga urutan asli', () => {
    const masuk = [
      { id: 1, ...judul(37000, 85) },
      { id: 2, ...judul(1, 0.1) },
      { id: 3, ...judul(900, 12) },
    ];
    expect(saringLayakDiputar(masuk).map((x) => x.id)).toEqual([1, 3]);
  });

  it('mengembalikan larik kosong untuk masukan yang bukan larik', () => {
    expect(saringLayakDiputar(null)).toEqual([]);
    expect(saringLayakDiputar(undefined)).toEqual([]);
  });

  it('menyusut drastis pada hasil pencarian sungguhan', () => {
    // Cuplikan nyata dari pencarian "inception" pada 2026-08-18. Hanya
    // Inception sendiri yang bisa diputar; sisanya terukur gagal.
    const inception = [
      { id: 27205, ...judul(37113, 85.4) },      // Inception — bisa diputar
      { id: 973484, ...judul(2, 0.6) },          // album soundtrack
      { id: 542438, ...judul(1, 0.3, 'xx') },    // Bikini Inception
      { id: 1359046, ...judul(0, 0.1, 'mn') },   // judul senama, Mongolia
      { id: 250845, ...judul(0, 0.2) },          // rekaman acara gulat
      { id: 350632, ...judul(1, 0.1) },          // film pendek
    ];
    expect(saringLayakDiputar(inception).map((x) => x.id)).toEqual([27205]);
  });
});

describe('vidlinkBerisi', () => {
  it('mengenali halaman film yang berisi', () => {
    // Inception: 92 KB terukur.
    expect(vidlinkBerisi('movie', 92_662)).toBe(true);
  });

  it('mengenali halaman film yang kosong', () => {
    // Album soundtrack "Inception": 13,7 KB terukur.
    expect(vidlinkBerisi('movie', 13_742)).toBe(false);
  });

  it('menolak menyimpulkan apa pun untuk serial', () => {
    // Halaman serial selalu ~10,5 KB, berisi atau tidak. Angka sebesar apa
    // pun tetap "tidak tahu" - bukan "tidak ada".
    expect(vidlinkBerisi('tv', 10_543)).toBe(null);
    expect(vidlinkBerisi('tv', 500_000)).toBe(null);
  });

  it('mengembalikan null saat halamannya gagal diambil', () => {
    expect(vidlinkBerisi('movie', null)).toBe(null);
    expect(vidlinkBerisi('movie', 0)).toBe(null);
    expect(vidlinkBerisi('movie', NaN)).toBe(null);
  });

  it('menerima tepat di ambang', () => {
    expect(vidlinkBerisi('movie', VIDLINK_MIN_BYTES)).toBe(true);
    expect(vidlinkBerisi('movie', VIDLINK_MIN_BYTES - 1)).toBe(false);
  });
});
