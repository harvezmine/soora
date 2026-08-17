/**
 * Warna merek per-vertikal.
 *
 * Nilai yang sama juga hidup sebagai token CSS di App.css (--accent, --flix,
 * ...). Modul ini khusus untuk tempat yang butuh nilainya dari JavaScript:
 * gaya inline, gambar canvas, dan gradien yang dirakit saat berjalan.
 *
 * Ganti warna sebuah vertikal = ubah di sini DAN di blok :root App.css.
 */

export const VERTICALS = {
  /** soora — anime (ungu) */
  anime: {
    accent: '#7c5cfc',
    accentHover: '#9b7dff',
    /** dipakai untuk teks di latar gelap */
    text: '#9b7dff',
    rgb: '124, 92, 252',
    gradient: 'linear-gradient(135deg, #7c5cfc 0%, #b44dff 100%)',
  },
  /** sooraflix — film & series (merah sinema) */
  flix: {
    accent: '#e50914',
    accentHover: '#ff2a34',
    // #e50914 sebagai teks di latar gelap hanya ~4,2:1 — di bawah AA.
    // Peran teks memakai nada lebih terang.
    text: '#ff4d57',
    rgb: '229, 9, 20',
    gradient: 'linear-gradient(135deg, #e50914 0%, #8e0610 100%)',
  },
  /** sooramics — manga (teal) */
  mics: {
    accent: '#00d4aa',
    accentHover: '#2eecc4',
    text: '#2eecc4',
    rgb: '0, 212, 170',
    gradient: 'linear-gradient(135deg, #00d4aa 0%, #00b894 100%)',
  },
  /** sooramics+ (rose) */
  micsplus: {
    accent: '#f43f5e',
    accentHover: '#fb7185',
    text: '#fb7185',
    rgb: '244, 63, 94',
    gradient: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
  },
};

/** Warna aksen sebuah vertikal dengan alfa, mis. alpha('flix', 0.25). */
export const alpha = (vertical, a) => `rgba(${VERTICALS[vertical].rgb}, ${a})`;

/** Jalan pintas — dipakai di banyak daftar statistik & avatar. */
export const ACCENTS = {
  anime: VERTICALS.anime.accent,
  flix: VERTICALS.flix.accent,
  mics: VERTICALS.mics.accent,
  micsplus: VERTICALS.micsplus.accent,
  gold: '#fbbf24',
};
