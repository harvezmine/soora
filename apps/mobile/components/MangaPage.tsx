import { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View, Text } from 'react-native';
import { colors, font, space } from '../theme/tokens';

export type PageSource = { uri: string; headers?: Record<string, string> };

type Props = {
  source: PageSource;
  /** Lebar tersedia. Tinggi dihitung dari rasio asli gambar. */
  width: number;
  index: number;
};

/**
 * Satu halaman manga.
 *
 * Tingginya tidak bisa ditentukan di muka: halaman manga biasa mendekati A4
 * (rasio ~0,7) sementara webtoon bisa sangat panjang (rasio 0,1 ke bawah), dan
 * satu chapter kerap mencampur keduanya. Memakai tinggi tetap akan memotong
 * sebagian dan menyisakan pita hitam pada sisanya.
 *
 * Karena itu tiap halaman mulai dengan rasio dugaan, lalu menggantinya dengan
 * rasio asli begitu `onLoad` melaporkan ukuran. Pergeserannya hanya terjadi
 * pada gambar yang belum terlihat, sebab reader memuat dari atas ke bawah.
 */
export function MangaPage({ source, width, index }: Props) {
  const [ratio, setRatio] = useState(DUGAAN_RASIO);
  const [gagal, setGagal] = useState(false);

  const height = Math.round(width / ratio);

  if (gagal) {
    return (
      <View style={[s.gagal, { width, height: Math.round(width / DUGAAN_RASIO) }]}>
        <Text style={s.gagalJudul}>Halaman {index + 1} gagal dimuat</Text>
        <Text style={s.gagalBody}>Gulir lewat, atau muat ulang chapter.</Text>
      </View>
    );
  }

  return (
    <Image
      source={source}
      style={{ width, height }}
      // `contain` bukan `cover`: memotong panel manga berarti memotong dialog.
      contentFit="contain"
      // Halaman jauh lebih besar dari poster dan hampir tak pernah dibaca ulang
      // dalam sesi yang sama; menyimpannya di memori mendorong gambar lain keluar.
      cachePolicy="disk"
      transition={120}
      recyclingKey={source.uri}
      onLoad={(e) => {
        const { width: w, height: h } = e.source ?? {};
        if (w && h) setRatio(w / h);
      }}
      onError={() => setGagal(true)}
    />
  );
}

/** Rasio halaman manga cetak pada umumnya, dipakai sebelum ukuran asli diketahui. */
const DUGAAN_RASIO = 0.7;

const s = StyleSheet.create({
  gagal: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
  },
  gagalJudul: {
    color: colors.textMuted,
    fontSize: font.size.md,
    fontWeight: font.weight.semibold,
  },
  gagalBody: {
    color: colors.textDim,
    fontSize: font.size.sm,
    marginTop: space.xs,
  },
});
