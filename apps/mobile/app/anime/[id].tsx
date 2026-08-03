import { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getSamehadakuAnimeInfo } from '@soora/core/api';
import { resolveImage, unwrap } from '@soora/core/models';
import { useCatalog } from '../../lib/useCatalog';
import { DetailHeader, SectionTitle } from '../../components/Detail';
import { EpisodeGrid } from '../../components/EpisodeGrid';
import { GenreChips } from '../../components/GenreChips';
import { SerupaRow } from '../../components/SerupaRow';
import { SkeletonHero, SkeletonRow } from '../../components/Skeleton';
import { EmptyState, ErrorState } from '../../components/States';
import { SaveButton } from '../../components/SaveButton';
import { WatchLaterButton } from '../../components/WatchLaterButton';
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
  const genres: string[] = useMemo(() => {
    // Samehadaku memakai genreList berisi objek {title}; consumet memakai
    // genres berisi string. Keduanya diterima.
    const g = info?.genreList ?? info?.genres;
    if (!Array.isArray(g)) return [];
    return g.map((x: unknown) =>
      typeof x === 'string' ? x : String((x as { title?: string })?.title ?? '')
    );
  }, [info]);

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
      <ScrollView contentContainerStyle={s.content}>
        <DetailHeader
          title={title}
          poster={resolveImage(info?.image ?? info?.poster)}
          backdrop={resolveImage(info?.cover ?? info?.image ?? info?.poster)}
          meta={[info?.type, info?.status, info?.score, info?.aired].filter(Boolean)}
          synopsis={String(info?.synopsis ?? info?.description ?? '').replace(/<[^>]*>/g, '')}
        />
        <SaveButton item={{ id: String(id), listType: 'anime', title, poster: info?.image }} />
        <WatchLaterButton
          item={{ id: String(id), listType: 'anime', title, poster: info?.image }}
        />
        <GenreChips genres={genres} kind="anime" />

        <SectionTitle>Episode</SectionTitle>
        {episodes.length === 0 ? (
          <EmptyState
            title="Belum ada episode"
            body="Penyedia tidak mengembalikan daftar episode untuk judul ini."
            onRetry={refresh}
          />
        ) : (
          <EpisodeGrid
            episodes={episodes}
            onPilih={(ep) =>
              router.push(
                `/watch/${encodeURIComponent(ep.id ?? '')}?kind=anime` +
                  `&title=${encodeURIComponent(`${title} — Episode ${ep.number ?? ''}`)}` +
                  `&ep=${ep.number ?? ''}` +
                  `&animeId=${encodeURIComponent(String(id))}` as never
              )
            }
          />
        )}

        <SerupaRow idSekarang={String(id)} kind="anime" genres={genres} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: space.xxxl },
});
