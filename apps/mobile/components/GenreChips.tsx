import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, font, radius, space } from '../theme/tokens';

/**
 * Deret genre.
 *
 * Digulir mendatar, bukan dibungkus ke baris berikutnya: judul dengan delapan
 * genre akan mendorong sinopsis dan tombol baca jauh ke bawah lipatan.
 */
export function GenreChips({
  genres,
  kind,
}: {
  genres: (string | { id?: number | string; name?: string })[];
  /** Menentukan penyedia yang dipakai layar genre. */
  kind?: 'anime' | 'movie' | 'tv' | 'manga';
}) {
  const router = useRouter();
  // Manga tidak punya endpoint jelajah genre di backend, jadi chipnya hanya
  // penanda. Membuatnya bisa diketuk lalu membuka layar kosong lebih buruk
  // daripada tidak bisa diketuk sama sekali.
  const bisaJelajah = kind !== 'manga';

  // Bentuk genre berbeda antar penyedia: TMDB mengembalikan objek dengan id
  // numerik (yang WAJIB dipakai untuk discover), Samehadaku dan consumet
  // mengembalikan nama.
  const bersih = genres
    .map((g) =>
      typeof g === 'string'
        ? { nama: g.trim(), slug: g.trim().toLowerCase().replace(/\s+/g, '-') }
        : { nama: String(g?.name ?? '').trim(), slug: String(g?.id ?? g?.name ?? '') }
    )
    // Sebagian penyedia menyisipkan kepala tabel "Genres" sebagai entri.
    .filter((g) => g.nama && g.nama.toLowerCase() !== 'genres' && g.slug);

  if (bersih.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.baris}
      accessibilityLabel={`Genre: ${bersih.map((g) => g.nama).join(', ')}`}
    >
      {bersih.map((g) => (
        <Pressable
          key={g.slug}
          disabled={!bisaJelajah}
          onPress={() =>
            router.push({
              pathname: '/genre/[slug]',
              params: { slug: g.slug, label: g.nama, kind: kind ?? 'anime' },
            } as never)
          }
          style={({ pressed }) => [s.chip, pressed && bisaJelajah && s.ditekan]}
          accessibilityRole={bisaJelajah ? 'button' : 'text'}
          accessibilityLabel={bisaJelajah ? `Jelajahi genre ${g.nama}` : g.nama}
        >
          <Text style={s.teks}>{g.nama}</Text>
        </Pressable>
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
  ditekan: { opacity: 0.7, borderColor: colors.accent },
  teks: { color: colors.textMuted, fontSize: font.size.sm },
});
