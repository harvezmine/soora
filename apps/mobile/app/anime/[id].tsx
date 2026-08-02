import { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getAnimeInfo } from '@soora/core/api';
import { resolveImage, unwrap } from '@soora/core/models';
import { useCatalog } from '../../lib/useCatalog';
import { DetailHeader, ListRow, SectionTitle } from '../../components/Detail';
import { SkeletonHero, SkeletonRow } from '../../components/Skeleton';
import { EmptyState, ErrorState } from '../../components/States';
import { colors, space } from '../../theme/tokens';

type Episode = { id?: string; number?: number; title?: string };

export default function AnimeInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data, status, error, refresh } = useCatalog(
    'title',
    `anime:${id}`,
    useCallback(() => getAnimeInfo(id), [id]),
    Boolean(id)
  );

  const info = useMemo(() => unwrap(data) ?? {}, [data]);

  const episodes: Episode[] = useMemo(() => {
    const eps = info?.episodes;
    return Array.isArray(eps) ? eps : [];
  }, [info]);

  const title =
    typeof info?.title === 'string'
      ? info.title
      : (info?.title?.english ?? info?.title?.romaji ?? 'Anime');

  if (status === 'loading') {
    return (
      <ScrollView style={s.screen}>
        <SkeletonHero />
        <SkeletonRow title={false} />
      </ScrollView>
    );
  }

  if (status === 'error') {
    return (
      <View style={s.screen}>
        <Stack.Screen options={{ title: 'Anime' }} />
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Stack.Screen options={{ title }} />

      <DetailHeader
        title={title}
        poster={resolveImage(info?.image)}
        backdrop={info?.cover ? resolveImage(info.cover) : undefined}
        meta={[info?.type, info?.status, info?.releaseDate].filter(Boolean)}
        synopsis={info?.description?.replace(/<[^>]*>/g, '')}
      />

      <SectionTitle>Episode</SectionTitle>

      {episodes.length === 0 ? (
        <EmptyState
          title="Belum ada episode"
          body="Penyedia tidak mengembalikan daftar episode untuk judul ini."
          onRetry={refresh}
        />
      ) : (
        episodes.map((ep, i) => (
          <ListRow
            key={ep.id ?? `${i}`}
            label={ep.title ? `${ep.number ?? i + 1}. ${ep.title}` : `Episode ${ep.number ?? i + 1}`}
            onPress={() => router.push(`/watch/${encodeURIComponent(ep.id ?? '')}` as never)}
          />
        ))
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: space.xxxl },
});
