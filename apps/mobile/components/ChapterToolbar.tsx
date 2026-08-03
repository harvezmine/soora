import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Search } from 'lucide-react-native';
import { colors, font, iconSize, iconStroke, radius, space, MIN_TOUCH } from '../theme/tokens';

export type Urutan = 'terbaru' | 'terlama';

type Props = {
  jumlah: number;
  cari: string;
  onCari: (v: string) => void;
  urutan: Urutan;
  onUrutan: (v: Urutan) => void;
};

/**
 * Bilah alat daftar chapter — sama seperti di web: kolom cari + urutan.
 *
 * Judul panjang punya lebih dari seribu chapter. Tanpa kedua kontrol ini,
 * mencapai chapter tertentu berarti menggulir ratusan layar.
 */
export function ChapterToolbar({ jumlah, cari, onCari, urutan, onUrutan }: Props) {
  return (
    <View style={s.wadah}>
      <View style={s.kolom}>
        <Search size={iconSize.sm} color={colors.textDim} strokeWidth={iconStroke} />
        <TextInput
          value={cari}
          onChangeText={onCari}
          placeholder={`Cari di ${jumlah} chapter…`}
          placeholderTextColor={colors.textDim}
          style={s.input}
          returnKeyType="search"
          autoCorrect={false}
          // Nomor chapter diketik sebagai angka; papan ketik default memaksa
          // user berpindah ke tata letak angka tiap kali.
          keyboardType="default"
          accessibilityLabel="Cari chapter"
        />
      </View>

      <Pressable
        onPress={() => onUrutan(urutan === 'terbaru' ? 'terlama' : 'terbaru')}
        style={({ pressed }) => [s.tombol, pressed && s.ditekan]}
        accessibilityRole="button"
        accessibilityLabel={
          urutan === 'terbaru' ? 'Urutkan dari chapter terlama' : 'Urutkan dari chapter terbaru'
        }
      >
        {urutan === 'terbaru' ? (
          <ArrowDownWideNarrow size={iconSize.sm} color={colors.text} strokeWidth={iconStroke} />
        ) : (
          <ArrowUpNarrowWide size={iconSize.sm} color={colors.text} strokeWidth={iconStroke} />
        )}
        <Text style={s.tombolTeks}>{urutan === 'terbaru' ? 'Terbaru' : 'Terlama'}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wadah: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  kolom: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: MIN_TOUCH,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    color: colors.text,
    // 16px: di bawah itu Safari dan sebagian peluncur Android memperbesar
    // halaman saat kolom difokus.
    fontSize: font.size.base,
    paddingVertical: 0,
  },
  tombol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: MIN_TOUCH,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ditekan: { opacity: 0.75 },
  tombolTeks: { color: colors.text, fontSize: font.size.sm, fontWeight: font.weight.medium },
});
