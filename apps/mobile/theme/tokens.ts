import { BRAND_BG } from './brand';

/**
 * Design token Soora — sumber kebenaran tunggal untuk warna, spasi, tipografi.
 *
 * Nilai diambil dari web yang sudah ada supaya app dan situs terasa satu
 * produk. Jangan menulis warna atau angka spasi mentah di file layar; ambil
 * dari sini. Kalau ada nilai yang belum ada, tambahkan di sini dulu.
 */

/**
 * Palet gelap. App ini dark-only — sama seperti web.
 * Kontras sudah dicek terhadap `bg`: `text` 15.8:1, `textMuted` 5.9:1,
 * keduanya lolos WCAG AA untuk teks normal (4.5:1).
 */
export const colors = {
  // Didefinisikan di theme/brand.js supaya app.config.ts bisa memakai nilai
  // yang sama; lihat komentar di file itu.
  bg: BRAND_BG,
  surface: '#0e0e1a', // kartu, sheet
  surfaceRaised: '#16162a', // elemen di atas surface
  border: '#23233a',

  text: '#f3f4f8', // teks primer
  textMuted: '#9a9ab0', // teks sekunder, minimal 3:1
  textDim: '#6b6b85', // label, timestamp

  accent: '#e11d48', // CTA, indikator tab aktif
  accentPressed: '#be123c',

  success: '#22c55e',
  danger: '#ef4444',
  warning: '#f59e0b',

  /** Scrim modal — cukup pekat supaya konten depan terbaca. */
  scrim: 'rgba(0, 0, 0, 0.6)',

  /** Latar hitam murni untuk area video. Bukan `bg` — player harus benar hitam. */
  videoBg: '#000000',
} as const;

/**
 * Warna teks/ikon di atas `colors.accent`.
 *
 * Dipisah sebagai token tersendiri supaya saat aksen diganti, kontras label
 * tombol bisa diperbaiki di satu tempat. Sebelumnya '#fff' ditulis langsung di
 * empat berkas, dan mengganti aksen ke warna terang akan menjatuhkan kontras
 * di bawah 3:1 tanpa satu titik perbaikan.
 */
export const onAccent = '#ffffff';

/**
 * Skala spasi kelipatan 4. Pakai nama, bukan angka mentah,
 * supaya ritme vertikal tetap konsisten antar layar.
 */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

/**
 * Ukuran ikon sebagai token, bukan angka acak per pemakaian.
 * Campur-campur 20/24/28 tanpa aturan adalah penyebab paling umum UI
 * terasa tidak rapi.
 */
export const iconSize = {
  sm: 16,
  md: 24,
  lg: 32,
} as const;

/** Ketebalan garis ikon — satu nilai untuk seluruh app. */
export const iconStroke = 2;

/**
 * Ukuran sentuh minimum. Apple HIG 44pt, Material 48dp — ambil yang lebih
 * besar supaya aman di dua platform.
 */
export const MIN_TOUCH = 48;

export const font = {
  size: {
    xs: 11,
    sm: 13,
    md: 15,
    base: 16, // minimum untuk teks isi
    lg: 20,
    xl: 26,
    xxl: 34,
  },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  /** 1.5 untuk teks isi sesuai pedoman keterbacaan. */
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

/**
 * Durasi animasi. Mikro-interaksi 150–300ms; keluar lebih cepat dari masuk
 * (~65%) supaya UI terasa responsif.
 */
export const motion = {
  fast: 150,
  normal: 220,
  slow: 300,
  exitRatio: 0.65,
} as const;

/** Skala z-index eksplisit — mencegah perang `zIndex: 9999`. */
export const layer = {
  base: 0,
  card: 10,
  header: 20,
  miniPlayer: 30,
  tabBar: 40,
  modal: 100,
  toast: 1000,
} as const;

export const theme = {
  colors,
  onAccent,
  space,
  radius,
  iconSize,
  iconStroke,
  font,
  motion,
  layer,
  MIN_TOUCH,
} as const;

export type Theme = typeof theme;
