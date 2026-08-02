import { FlashList } from '@shopify/flash-list';
import { StyleSheet, Text, View } from 'react-native';
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

export function SectionRow({ title, items }: { title: string; items: MediaItem[] }) {
  if (!items.length) return null;

  return (
    <View style={s.wrap}>
      <Text style={s.title}>{title}</Text>
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
});
