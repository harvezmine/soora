import { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getMangaInfo } from '@soora/core/api';
import { resolveImage, unwrap } from '@soora/core/models';
import { useCatalog } from '../../lib/useCatalog';
import { DetailHeader, ListRow, SectionTitle } from '../../components/Detail';
import { SkeletonHero, SkeletonRow } from '../../components/Skeleton';
import { EmptyState, ErrorState } from '../../components/States';
import { colors, space } from '../../theme/tokens';

type Chapter = { id?: string; title?: string; chapterNumber?: string | number };

export default function MangaInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data, status, error, refresh } = useCatalog(
    'title',
    `manga:${id}`,
    useCallback(() => getMangaInfo(id), [id]),
    Boolean(id)
  );

  const info = useMemo(() => unwrap(data) ?? {}, [data]);
  const title = typeof info?.title === 'string' ? info.title : 'Manga';

  const chapters: Chapter[] = useMemo(() => {
    const c = info?.chapters;
    return Array.isArray(c) ? c : [];
  }, [info]);

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
        <Stack.Screen options={{ title: 'Manga' }} />
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
        meta={[info?.status, info?.type, chapters.length ? `${chapters.length} chapter` : ''].filter(
          Boolean
        )}
        synopsis={info?.description?.replace(/<[^>]*>/g, '')}
      />

      <SectionTitle>Chapter</SectionTitle>

      {chapters.length === 0 ? (
        <EmptyState
          title="Belum ada chapter"
          body="Penyedia tidak mengembalikan daftar chapter untuk judul ini."
          onRetry={refresh}
        />
      ) : (
        chapters.map((ch, i) => (
          <ListRow
            key={ch.id ?? `${i}`}
            label={ch.title || `Chapter ${ch.chapterNumber ?? i + 1}`}
            onPress={() => router.push(`/read/${encodeURIComponent(ch.id ?? '')}` as never)}
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
