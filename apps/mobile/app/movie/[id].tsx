import { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getMovieDetailsTMDB, getTVDetailsTMDB } from '@soora/core/api';
import { resolveImage, tmdbSize, unwrap } from '@soora/core/models';
import { useCatalog } from '../../lib/useCatalog';
import { DetailHeader, ListRow, SectionTitle } from '../../components/Detail';
import { SkeletonHero, SkeletonRow } from '../../components/Skeleton';
import { ErrorState } from '../../components/States';
import { colors, space } from '../../theme/tokens';

/**
 * Detail film atau serial dari TMDB.
 *
 * `kind` dibawa lewat query karena id TMDB untuk film dan serial berada di
 * ruang penomoran berbeda — id 5920 valid untuk keduanya dan menunjuk judul
 * yang sama sekali berbeda. Tanpa `kind`, layar bisa memuat judul yang salah
 * tanpa error apa pun.
 */
export default function MovieInfoScreen() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: string }>();
  const router = useRouter();
  const isTV = kind === 'tv';

  const { data, status, error, refresh } = useCatalog(
    'title',
    `${isTV ? 'tv' : 'movie'}:${id}`,
    useCallback(() => (isTV ? getTVDetailsTMDB(id) : getMovieDetailsTMDB(id)), [id, isTV]),
    Boolean(id)
  );

  const info = useMemo(() => unwrap(data) ?? {}, [data]);
  const title = info?.title || info?.name || (isTV ? 'Serial' : 'Film');

  const seasons = useMemo(() => {
    const list = info?.seasons;
    if (!Array.isArray(list)) return [];
    // Season 0 adalah "Specials" di TMDB dan hampir selalu tidak punya sumber
    // stream; menampilkannya hanya menghasilkan jalan buntu.
    return list.filter((se: { season_number?: number }) => (se?.season_number ?? 0) > 0);
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
        <Stack.Screen options={{ title: isTV ? 'Serial' : 'Film' }} />
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  const poster = info?.poster_path
    ? `https://image.tmdb.org/t/p/w342${info.poster_path}`
    : info?.image;
  const backdrop = info?.backdrop_path
    ? `https://image.tmdb.org/t/p/w780${info.backdrop_path}`
    : info?.cover;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Stack.Screen options={{ title }} />

      <DetailHeader
        title={title}
        poster={resolveImage(tmdbSize(poster, 'w342'))}
        backdrop={backdrop ? resolveImage(backdrop) : undefined}
        meta={[
          isTV ? 'Serial' : 'Film',
          (info?.release_date || info?.first_air_date || '').slice(0, 4),
          info?.vote_average ? `${Math.round(info.vote_average * 10)}%` : '',
          (info?.genres ?? []).map((g: { name?: string }) => g?.name).filter(Boolean).join(', '),
        ].filter(Boolean)}
        synopsis={info?.overview}
      />

      {isTV && seasons.length > 0 ? (
        <>
          <SectionTitle>Musim</SectionTitle>
          {seasons.map((se: { id?: number; season_number?: number; name?: string; episode_count?: number }) => (
            <ListRow
              key={se.id ?? se.season_number}
              label={se.name ?? `Musim ${se.season_number}`}
              sub={se.episode_count ? `${se.episode_count} episode` : undefined}
              onPress={() =>
                router.push(`/watch/${encodeURIComponent(`${id}:s${se.season_number}`)}` as never)
              }
            />
          ))}
        </>
      ) : (
        <>
          <SectionTitle>Tonton</SectionTitle>
          <ListRow
            label="Putar film"
            onPress={() => router.push(`/watch/${encodeURIComponent(String(id))}` as never)}
          />
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: space.xxxl },
});
