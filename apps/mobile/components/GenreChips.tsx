import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '../theme/tokens';

/**
 * Deret genre.
 *
 * Digulir mendatar, bukan dibungkus ke baris berikutnya: judul dengan delapan
 * genre akan mendorong sinopsis dan tombol baca jauh ke bawah lipatan.
 */
export function GenreChips({ genres }: { genres: string[] }) {
  const bersih = genres
    .map((g) => String(g || '').trim())
    // Sebagian penyedia menyisipkan kepala tabel "Genres" sebagai entri.
    .filter((g) => g && g.toLowerCase() !== 'genres');

  if (bersih.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.baris}
      accessibilityLabel={`Genre: ${bersih.join(', ')}`}
    >
      {bersih.map((g) => (
        <View key={g} style={s.chip}>
          <Text style={s.teks}>{g}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  baris: { gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  teks: { color: colors.textMuted, fontSize: font.size.sm },
});
