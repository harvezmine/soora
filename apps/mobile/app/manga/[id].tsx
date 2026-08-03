import { useCallback, useMemo } from 'react';
import { FlashList } from '@shopify/flash-list';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getMangaInfo } from '@soora/core/api';
import { resolveImage, unwrap } from '@soora/core/models';
import { useCatalog } from '../../lib/useCatalog';
import { DetailHeader, ListRow, SectionTitle } from '../../components/Detail';
import { SkeletonHero, SkeletonRow } from '../../components/Skeleton';
import { EmptyState, ErrorState } from '../../components/States';
import { SaveButton } from '../../components/SaveButton';
import { colors, space } from '../../theme/tokens';

type Chapter = { id?: string; title?: string; chapterNumber?: string | number };

export default function MangaInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data, status, error, refresh } = useCatalog(
    'title',
    `manga:${id}`,
    useCallback(async () => unwrap(await getMangaInfo(id)), [id]),
    Boolean(id)
  );

  const info = useMemo(() => data ?? {}, [data]);
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

  // Divirtualisasi karena alasan yang sama dengan layar anime: One Piece punya
  // ~1.130 chapter, dan merender semuanya sekaligus membekukan UI.
  return (
    <View style={s.screen}>
      <Stack.Screen options={{ title }} />
      <FlashList
        data={chapters}
        keyExtractor={(ch, i) => ch.id ?? `ch-${i}`}
        contentContainerStyle={s.content}
        ListHeaderComponent={
          <>
            <DetailHeader
              title={title}
              poster={resolveImage(info?.image)}
              meta={[
                info?.status,
                info?.type,
                chapters.length ? `${chapters.length} chapter` : '',
              ].filter(Boolean)}
              synopsis={info?.description?.replace(/<[^>]*>/g, '')}
            />
            <SaveButton
              item={{ id: String(id), listType: 'manga', title, poster: info?.image }}
            />
            <SectionTitle>Chapter</SectionTitle>
          </>
        }
        ListEmptyComponent={
          <EmptyState
            title="Belum ada chapter"
            body="Penyedia tidak mengembalikan daftar chapter untuk judul ini."
            onRetry={refresh}
          />
        }
        renderItem={({ item: ch, index }) => (
          <ListRow
            label={ch.title || `Chapter ${ch.chapterNumber ?? index + 1}`}
            onPress={() => router.push(`/read/${encodeURIComponent(ch.id ?? '')}` as never)}
          />
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: space.xxxl },
});
