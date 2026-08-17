/**
 * Ikon SVG untuk menggantikan emoji.
 *
 * Emoji digambar oleh fontnya masing-masing: bentuknya berbeda di tiap
 * sistem, warnanya tidak bisa diatur, dan ukurannya tidak ikut skala teks
 * dengan rapi. Ikon di sini mewarisi `currentColor` sehingga mengikuti warna
 * vertikal yang berlaku, dan ukurannya satu tempat.
 *
 * Bendera adalah pengecualian: ia memang berwarna tetap, jadi warnanya
 * ditulis langsung.
 */

const Svg = ({ size = 16, children, ...rest }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    aria-hidden="true"
    focusable="false"
    {...rest}
  >
    {children}
  </svg>
);

const Garis = ({ size = 16, children, strokeWidth = 1.8 }) => (
  <Svg size={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth}
    strokeLinecap="round" strokeLinejoin="round">
    {children}
  </Svg>
);

/* ── Umum ── */

export const IconGlobe = (p) => (
  <Garis {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
  </Garis>
);

export const IconHeart = ({ size = 16 }) => (
  <Svg size={size} fill="currentColor">
    <path d="M12 20.7 3.9 12.6a5 5 0 0 1 7.1-7l1 1 1-1a5 5 0 1 1 7.1 7z" />
  </Svg>
);

export const IconStar = ({ size = 16 }) => (
  <Svg size={size} fill="currentColor">
    <path d="m12 17.3-6.2 3.7 1.7-7-5.5-4.7 7.2-.6L12 2l2.8 6.7 7.2.6-5.5 4.7 1.7 7z" />
  </Svg>
);

export const IconBook = (p) => (
  <Garis {...p}>
    <path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z" />
    <path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z" />
  </Garis>
);

export const IconFolder = (p) => (
  <Garis {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Garis>
);

export const IconPen = (p) => (
  <Garis {...p}>
    <path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    <path d="m15 5 4 4" />
  </Garis>
);

export const IconPages = (p) => (
  <Garis {...p}>
    <path d="M8 3h9a2 2 0 0 1 2 2v12" />
    <path d="M6 7h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
  </Garis>
);

export const IconHash = (p) => (
  <Garis {...p}>
    <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
  </Garis>
);

export const IconCalendar = (p) => (
  <Garis {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Garis>
);

export const IconGear = (p) => (
  <Garis {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Garis>
);

/* ── Bendera ──
   Warnanya tetap menurut definisi, jadi tidak mewarisi currentColor. */

const Bendera = ({ size = 16, children }) => (
  <svg viewBox="0 0 24 16" width={size * 1.35} height={size} aria-hidden="true" focusable="false">
    {children}
    <rect x="0.5" y="0.5" width="23" height="15" rx="2.5"
      fill="none" stroke="rgba(255,255,255,0.22)" />
  </svg>
);

export const FlagID = ({ size = 16 }) => (
  <Bendera size={size}>
    <g>
      <rect width="24" height="16" rx="3" fill="#f5f5f5" />
      <path d="M3 0h18a3 3 0 0 1 3 3v5H0V3a3 3 0 0 1 3-3z" fill="#ce1126" />
    </g>
  </Bendera>
);

export const FlagJP = ({ size = 16 }) => (
  <Bendera size={size}>
    <g>
      <rect width="24" height="16" rx="3" fill="#f5f5f5" />
      <circle cx="12" cy="8" r="4.2" fill="#bc002d" />
    </g>
  </Bendera>
);

export const FlagCN = ({ size = 16 }) => (
  <Bendera size={size}>
    <g>
      <rect width="24" height="16" rx="3" fill="#de2910" />
      <path d="m5 3 .8 2.4H8.3l-2 1.5.7 2.4L5 7.9 3 9.3l.7-2.4-2-1.5h2.5z" fill="#ffde00" />
      <circle cx="9.6" cy="2.6" r="0.8" fill="#ffde00" />
      <circle cx="11.4" cy="4.4" r="0.8" fill="#ffde00" />
      <circle cx="11.4" cy="7" r="0.8" fill="#ffde00" />
      <circle cx="9.6" cy="8.8" r="0.8" fill="#ffde00" />
    </g>
  </Bendera>
);

/* ── Pendamping ──
   Wajah sederhana, bukan gambar rinci: ukurannya kecil di pemilih, jadi
   siluetnya yang harus terbaca, bukan detailnya. */

export const IconPaw = ({ size = 16 }) => (
  <Svg size={size} fill="currentColor">
    <ellipse cx="7" cy="8" rx="1.9" ry="2.4" />
    <ellipse cx="12" cy="6.4" rx="1.9" ry="2.6" />
    <ellipse cx="17" cy="8" rx="1.9" ry="2.4" />
    <path d="M12 12c3 0 5.5 2.2 5.5 4.6S15.2 21 12 21s-5.5-1.9-5.5-4.4S9 12 12 12z" />
  </Svg>
);

export const IconCat = (p) => (
  <Garis {...p}>
    <path d="M5 10 4.2 4.6 8.4 7.2" />
    <path d="M19 10l.8-5.4-4.2 2.6" />
    <path d="M12 20c-4 0-7-2.9-7-6.6S8 7 12 7s7 2.7 7 6.4S16 20 12 20z" />
    <path d="M10 13h.01M14 13h.01" />
    <path d="M12 15.5v1M9.5 17.5 12 16.5l2.5 1" />
  </Garis>
);

export const IconFox = (p) => (
  <Garis {...p}>
    <path d="M4 5.5 6.5 11" />
    <path d="M20 5.5 17.5 11" />
    <path d="M4 5.5c3.6.4 5.9 2.5 8 5.5 2.1-3 4.4-5.1 8-5.5" />
    <path d="M6.5 11c0 4.2 2.5 8 5.5 8s5.5-3.8 5.5-8" />
    <path d="M10 13h.01M14 13h.01" />
    <path d="M12 16h.01" />
  </Garis>
);

export const IconRaccoon = (p) => (
  <Garis {...p}>
    <path d="M5.5 8 4.5 4l3.6 2" />
    <path d="M18.5 8 19.5 4l-3.6 2" />
    <path d="M12 20c-3.9 0-6.8-2.9-6.8-6.6S8.1 6.8 12 6.8s6.8 2.9 6.8 6.6S15.9 20 12 20z" />
    <path d="M7.5 12.2c.9-1 2-1 2.8 0M13.7 12.2c.9-1 2-1 2.8 0" />
    <path d="M12 15.4v1.1" />
  </Garis>
);

export const IconBird = (p) => (
  <Garis {...p}>
    <path d="M20 6.5c0 5.5-4.2 10-9.4 10H4c2.6-1.4 3.6-3.4 3.9-5.2" />
    <path d="M7.9 11.3A5 5 0 0 1 12.9 6a4 4 0 0 1 4 2.4L20 6.5" />
    <path d="M14.4 8.4h.01" />
    <path d="M6.5 16.5 4.5 20" />
  </Garis>
);

/**
 * Ikon hewan pendamping berdasarkan namanya.
 *
 * Berupa komponen, bukan peta konstanta: berkas ini hanya boleh mengekspor
 * komponen agar pemuatan-ulang cepat tetap bekerja saat pengembangan.
 */
export const IconHewan = ({ nama, size = 22 }) => {
  const daftar = { cat: IconCat, fox: IconFox, raccoon: IconRaccoon, bird: IconBird };
  const Ikon = daftar[nama] || IconCat;
  return <Ikon size={size} />;
};

/* ── Suara nonton bareng ──
   Dua bentuk mikrofon (nyala/mati) dan dua bentuk headset (mendengar/
   dibisukan) — pembeda keadaan lewat bentuk, bukan cuma warna, supaya tetap
   terbaca oleh yang sulit membedakan warna. */

export const IconMicOn = (p) => (
  <Garis {...p}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10.5a7 7 0 0 0 14 0" />
    <path d="M12 17.5V22M8.5 22h7" />
  </Garis>
);

export const IconMicOff = (p) => (
  <Garis {...p}>
    <path d="M9 9v3.5a3 3 0 0 0 4.5 2.6M15 6.5V5a3 3 0 0 0-5.9-.7" />
    <path d="M5 10.5a7 7 0 0 0 9.9 6.4" />
    <path d="M19 10.5a7 7 0 0 1-1.2 3.9" />
    <path d="M12 17.5V22M8.5 22h7" />
    <path d="M3 3l18 18" />
  </Garis>
);

export const IconHeadsetOn = (p) => (
  <Garis {...p}>
    <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
    <rect x="2.5" y="13" width="4" height="6" rx="1.5" />
    <rect x="17.5" y="13" width="4" height="6" rx="1.5" />
    <path d="M20 19v.5a3 3 0 0 1-3 3h-3" />
  </Garis>
);

export const IconHeadsetOff = (p) => (
  <Garis {...p}>
    <path d="M4 13v-1a8 8 0 0 1 13.6-5.7M20 12v-1a8 8 0 0 0-.4-2.5" />
    <rect x="2.5" y="13" width="4" height="6" rx="1.5" />
    <rect x="17.5" y="13" width="4" height="6" rx="1.5" />
    <path d="M2 2l20 20" />
  </Garis>
);

export const IconPhoneOff = (p) => (
  <Garis {...p}>
    <path d="M11 5.5C15 5 18 7.5 19 11" />
    <path d="M11 9.3c1.7-.3 3 .8 3.4 2.4" />
    <path d="m3 3 18 18" />
    <path d="M9.2 9.2C7.5 10.6 6.8 12.3 8 14c.9 1.3 2.7 2.9 4.4 4 1.3.8 2.6-.4 3.4-1.5.3-.4.9-.5 1.3-.2l3 2.1c.4.3.5.9.1 1.3-1 1.1-2.6 2.2-4.4 1.9C11.6 21 6 16.6 3 12.4c-1-1.5-.6-3.3.6-4.6" />
  </Garis>
);

export const IconVolume = (p) => (
  <Garis {...p}>
    <path d="M4 9v6h4l5 4V5L8 9z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7" />
  </Garis>
);

export const IconSignalLow = (p) => (
  <Garis {...p}>
    <path d="M2 20h2M22 20V4" />
    <path d="M17 20V9M12 20v-5" strokeOpacity="0.35" />
    <path d="M7 20v-2" strokeOpacity="0.35" />
  </Garis>
);

/* Kepala robot Android — dipakai badge unduh APK, bukan lambang perusahaan. */
export const IconAndroid = ({ size = 16 }) => (
  <Svg size={size} fill="currentColor">
    <path d="M17.6 9.48 19.44 6.3a.63.63 0 0 0-1.09-.63l-1.87 3.24a10.4 10.4 0 0 0-8.94 0L5.67 5.67A.63.63 0 1 0 4.58 6.3l1.83 3.18C3.3 11.25 1.28 14.44 1 18h22c-.28-3.56-2.3-6.75-5.4-8.52ZM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z" />
  </Svg>
);

export const IconChevronRight = (p) => (
  <Garis {...p}>
    <path d="M9 5l7 7-7 7" />
  </Garis>
);
