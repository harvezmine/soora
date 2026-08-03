import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { getSubIndoGenre, discoverByGenre } from '@soora/core/api';
import { normalizeList, unwrap } from '@soora/core/models';
import { useCatalog } from '../../lib/useCatalog';
import { MediaGrid } from '../../components/MediaGrid';
import { SkeletonRow } from '../../components/Skeleton';
import { EmptyState, ErrorState } from '../../components/States';
import { colors, space } from '../../theme/tokens';

/**
 * Jelajah judul per genre.
 *
 * Dipakai chip genre di layar detail. Sumbernya berbeda per bagian: anime
 * lewat Samehadaku (satu-satunya penyedia yang bisa dijangkau dari VPS), film
 * lewat TMDB discover yang memakai id numerik, bukan nama.
 */
export default function GenreScreen() {
  const { slug, label, kind } = useLocalSearchParams<{
    slug: string;
    label?: string;
    kind?: string;
  }>();

  const judul = String(label || slug || 'Genre');
  const bagian = kind === 'movie' || kind === 'tv' ? 'movie' : 'anime';

  const { data, status, error, refresh } = useCatalog(
    'search',
    `genre:${bagian}:${slug}`,
    useCallback(async () => {
      if (bagian === 'movie') {
        // TMDB memakai id genre numerik. Chip mengirim id-nya lewat `slug`.
        return unwrap(await discoverByGenre(String(slug), 1, kind === 'tv' ? 'tv' : 'movie'));
      }
      return unwrap(await getSubIndoGenre(String(slug)));
    }, [slug, bagian, kind]),
    Boolean(slug)
  );

  const items = useMemo(() => {
    const d = data as { results?: unknown; animeList?: unknown } | null;
    if (!d) return [];
    return bagian === 'movie'
      ? normalizeList(d.results, kind === 'tv' ? 'tv' : 'movie', 'tmdb')
      : normalizeList(d.animeList ?? d.results, 'anime', 'samehadaku');
  }, [data, bagian, kind]);

  if (status === 'loading') {
    return (
      <View style={s.layar}>
        <Stack.Screen options={{ title: judul }} />
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={s.layar}>
        <Stack.Screen options={{ title: judul }} />
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <View style={s.layar}>
      <Stack.Screen options={{ title: judul }} />
      {items.length === 0 ? (
        <EmptyState
          title="Tidak ada judul"
          body={`Penyedia tidak mengembalikan judul untuk genre ${judul}.`}
          onRetry={refresh}
        />
      ) : (
        <MediaGrid items={items} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  layar: { flex: 1, backgroundColor: colors.bg, paddingTop: space.sm },
});
