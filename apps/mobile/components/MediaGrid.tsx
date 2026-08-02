import type { ReactElement } from 'react';
import type { RefreshControlProps } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { StyleSheet, View } from 'react-native';
import { MediaCard, type MediaItem } from './MediaCard';
import { space } from '../theme/tokens';

/**
 * Grid untuk hasil pencarian dan daftar panjang.
 *
 * `numColumns` tetap 3: pada lebar telepon umum (360–430dp) itu menghasilkan
 * kartu yang cukup besar untuk terbaca, tanpa menyisakan ruang kosong lebar di
 * sisi kanan.
 */
/**
 * Diangkat ke konstanta modul, bukan arrow inline.
 *
 * Komparator memo milik ViewHolder FlashList v2 membandingkan identitas
 * `renderItem`. Arrow baru tiap render membuat perbandingan itu selalu gagal,
 * sehingga setiap sel yang terlihat dirender ulang tiap kali induknya render —
 * `memo` di MediaCard pun tidak menolong.
 */
const renderCell = ({ item }: { item: MediaItem }) => (
  <View style={s.cell}>
    <MediaCard item={item} fill />
  </View>
);

const keyOf = (item: MediaItem) => `${item.kind}:${item.id}`;

export function MediaGrid({
  items,
  ListHeaderComponent,
  ListEmptyComponent,
  onEndReached,
  refreshControl,
}: {
  items: MediaItem[];
  ListHeaderComponent?: ReactElement | null;
  ListEmptyComponent?: ReactElement | null;
  onEndReached?: () => void;
  refreshControl?: ReactElement<RefreshControlProps>;
}) {
  return (
    <FlashList
      data={items}
      numColumns={3}
      renderItem={renderCell}
      keyExtractor={keyOf}
      contentContainerStyle={s.content}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      refreshControl={refreshControl}
      // FlashList v2 mengukur sel sendiri; `estimatedItemSize` sudah dihapus
      // dari API dan menyetelnya sekarang adalah error tipe.
      keyboardShouldPersistTaps="handled"
    />
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxxl },
  // Padding horizontal di sel, bukan lebar tetap di kartu: FlashList v2
  // menetapkan lebar sel sendiri dan kartu harus mengikutinya.
  cell: { paddingBottom: space.lg, paddingHorizontal: space.xs },
});
