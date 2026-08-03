import { FlashList } from '@shopify/flash-list';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { MediaCard, type MediaItem } from './MediaCard';
import { colors, font, space } from '../theme/tokens';

/**
 * Baris horizontal berisi kartu.
 *
 * FlashList, bukan ScrollView atau FlatList: satu layar Beranda punya beberapa
 * baris berisi puluhan item, dan hanya FlashList yang mendaur ulang sel dengan
 * baik pada perangkat kelas bawah.
 */
// Lihat catatan di MediaGrid: identitas prop menentukan memoisasi sel.
const renderCard = ({ item }: { item: MediaItem }) => <MediaCard item={item} />;
const keyOf = (item: MediaItem) => `${item.kind}:${item.id}`;
const Separator = () => <View style={sep} />;
const sep = { width: 12 };

export function SectionRow({
  title,
  items,
  onLihatSemua,
}: {
  title: string;
  items: MediaItem[];
  /** Kalau diisi, judul baris dapat tombol "Lihat semua". */
  onLihatSemua?: () => void;
}) {
  if (!items.length) return null;

  return (
    <View style={s.wrap}>
      {/* Baris mendatar itu buntu: judul ke-21 tidak bisa dijangkau sama
          sekali tanpa jalan keluar ke daftar penuh. */}
      <View style={s.kepala}>
        <Text style={s.title}>{title}</Text>
        {onLihatSemua ? (
          <Pressable
            onPress={onLihatSemua}
            style={({ pressed }) => [s.semua, pressed && { opacity: 0.7 }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Lihat semua ${title}`}
          >
            <Text style={s.semuaTeks}>Lihat semua</Text>
            <ChevronRight size={14} color={colors.accent} strokeWidth={2.5} />
          </Pressable>
        ) : null}
      </View>
      <FlashList
        data={items}
        horizontal
        renderItem={renderCard}
        keyExtractor={keyOf}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.list}
        // Jarak antar kartu lewat ItemSeparator, bukan margin di kartu:
        // margin merusak perhitungan lebar milik FlashList.
        ItemSeparatorComponent={Separator}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingTop: space.xl, gap: space.md },
  title: {
    color: colors.text,
    fontSize: font.size.lg,
    fontWeight: '600',
    paddingHorizontal: space.lg,
  },
  list: { paddingHorizontal: space.lg },
  kepala: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: space.lg,
  },
  semua: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: space.xs },
  semuaTeks: { color: colors.accent, fontSize: font.size.sm, fontWeight: '600' },
});
