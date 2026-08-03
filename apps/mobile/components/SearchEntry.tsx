import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Search } from 'lucide-react-native';
import { colors, font, iconSize, iconStroke, radius, space, MIN_TOUCH } from '../theme/tokens';

type Props = {
  /** Bagian yang akan dicari. Menentukan penyedia dan teks petunjuknya. */
  bagian: 'anime' | 'movie' | 'manga';
};

const TEKS = {
  anime: 'Cari anime…',
  movie: 'Cari film dan serial…',
  manga: 'Cari manga dan manhwa…',
} as const;

/**
 * Bar pencarian di kepala tiap bagian.
 *
 * Bukan TextInput sungguhan melainkan tombol yang membuka tab Cari dengan
 * bagian yang tepat. Alasannya: mengetik di sini akan menggeser seluruh
 * beranda saat papan ketik naik, dan hasilnya tetap harus ditampilkan di layar
 * lain. Tombol yang terlihat seperti kolom sudah cukup untuk menunjukkan bahwa
 * pencarian ada, tanpa efek samping itu.
 */
export function SearchEntry({ bagian }: Props) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/(tabs)/search', params: { type: bagian } } as never)}
      style={({ pressed }) => [s.kotak, pressed && s.ditekan]}
      accessibilityRole="search"
      accessibilityLabel={TEKS[bagian]}
    >
      <Search size={iconSize.sm} color={colors.textDim} strokeWidth={iconStroke} />
      <Text style={s.teks} numberOfLines={1}>
        {TEKS[bagian]}
      </Text>
      <View style={s.pintasan}>
        <Text style={s.pintasanTeks}>Cari</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  kotak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: MIN_TOUCH,
    marginHorizontal: space.lg,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ditekan: { opacity: 0.75 },
  teks: { flex: 1, color: colors.textDim, fontSize: font.size.md },
  pintasan: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
  pintasanTeks: { color: colors.textMuted, fontSize: font.size.xs, fontWeight: font.weight.medium },
});
