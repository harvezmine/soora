import { useCallback, useMemo } from 'react';
import { FlashList } from '@shopify/flash-list';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getSamehadakuAnimeInfo } from '@soora/core/api';
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
    useCallback(async () => unwrap(await getSamehadakuAnimeInfo(String(id))), [id]),
    Boolean(id)
  );

  const info = useMemo(() => data ?? {}, [data]);

  // Samehadaku memakai `episodeList` dengan field `episodeId`/`title`;
  // bentuk consumet lama memakai `episodes` dengan `id`/`number`. Keduanya
  // diterima supaya layar ini tidak pecah kalau penyedia English pulih.
  const episodes: Episode[] = useMemo(() => {
    const list = info?.episodeList ?? info?.episodes;
    if (!Array.isArray(list)) return [];
    return list.map((e: Record<string, unknown>, i: number) => ({
      id: String(e.episodeId ?? e.id ?? ''),
      number: Number(e.episodeNumber ?? e.number ?? i + 1),
      title: typeof e.title === 'string' ? e.title : undefined,
    }));
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

  // FlashList, bukan ScrollView + map.
  //
  // One Piece mengembalikan ~1.100 episode. Merendernya sebagai 1.100 Pressable
  // dalam satu commit membekukan UI beberapa detik di perangkat kelas bawah,
  // dan berisiko kehabisan memori. Header ikut masuk ke dalam daftar supaya
  // hanya ada satu wadah yang menggulir.
  return (
    <View style={s.screen}>
      <Stack.Screen options={{ title }} />
      <FlashList
        data={episodes}
        keyExtractor={(ep, i) => ep.id ?? `ep-${i}`}
        contentContainerStyle={s.content}
        ListHeaderComponent={
          <>
            <DetailHeader
              title={title}
              poster={resolveImage(info?.poster ?? info?.image)}
              backdrop={info?.cover ? resolveImage(info.cover) : undefined}
              meta={[info?.type, info?.status, info?.score, info?.aired].filter(Boolean)}
              synopsis={String(
                info?.synopsis?.paragraphs?.join('\n\n') ?? info?.description ?? ''
              ).replace(/<[^>]*>/g, '')}
            />
            <SectionTitle>Episode</SectionTitle>
          </>
        }
        ListEmptyComponent={
          <EmptyState
            title="Belum ada episode"
            body="Penyedia tidak mengembalikan daftar episode untuk judul ini."
            onRetry={refresh}
          />
        }
        renderItem={({ item: ep, index }) => (
          <ListRow
            label={
              ep.title
                ? `${ep.number ?? index + 1}. ${ep.title}`
                : `Episode ${ep.number ?? index + 1}`
            }
            onPress={() =>
              router.push(
                `/watch/${encodeURIComponent(ep.id ?? '')}?kind=anime` +
                  `&title=${encodeURIComponent(`${title} — Episode ${ep.number ?? index + 1}`)}` +
                  `&ep=${ep.number ?? index + 1}` +
                  `&animeId=${encodeURIComponent(String(id))}` as never
              )
            }
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
