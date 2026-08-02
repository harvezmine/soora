import { Image, type ImageStyle } from 'expo-image';
import { StyleSheet, View, type StyleProp } from 'react-native';
import { colors, radius } from '../theme/tokens';

/**
 * Sumber gambar hasil `resolveImage()` di @soora/core/models.
 * `headers` diisi untuk CDN yang membalas 403 tanpa Referer.
 */
export type ImageSource = { uri: string; headers?: Record<string, string> };

/**
 * Placeholder blurhash abu-abu gelap.
 *
 * Ruang gambar dipesan lewat aspectRatio dan placeholder ini, jadi tidak ada
 * pergeseran layout saat poster selesai diunduh.
 */
const PLACEHOLDER = { blurhash: 'L03[?bofoffQofofofofofofofof' };

type Props = {
  source?: ImageSource;
  style?: StyleProp<ImageStyle>;
  /** Kunci daur ulang FlashList — mencegah gambar lama muncul di sel yang dipakai ulang. */
  recyclingKey?: string;
  contentFit?: 'cover' | 'contain';
};

export function Poster({ source, style, recyclingKey, contentFit = 'cover' }: Props) {
  if (!source?.uri) {
    return <View style={[s.base, s.empty, style]} />;
  }

  return (
    <Image
      style={[s.base, style]}
      source={source}
      recyclingKey={recyclingKey}
      contentFit={contentFit}
      placeholder={PLACEHOLDER}
      placeholderContentFit="cover"
      // Transisi singkat: cukup untuk menghaluskan kemunculan, tidak sampai
      // terasa lambat saat menggulir cepat.
      transition={150}
      // Disk cache bertahan antar sesi. Inilah yang membuat kunjungan kedua
      // menampilkan poster seketika — hal yang tidak bisa dijamin di web.
      cachePolicy="memory-disk"
    />
  );
}

const s = StyleSheet.create({
  base: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
  },
  empty: { borderWidth: 1, borderColor: colors.border },
});
