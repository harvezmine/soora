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
      renderItem={({ item }) => (
        <View style={s.cell}>
          <MediaCard item={item} />
        </View>
      )}
      keyExtractor={(item) => `${item.kind}:${item.id}`}
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
  cell: { paddingBottom: space.lg, alignItems: 'center' },
});
