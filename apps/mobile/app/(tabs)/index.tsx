import { useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getAnimeHomeBundle, getMovieHomeBundle } from '@soora/core/api';
import { buildSections, unwrap } from '@soora/core/models';
import { useCatalog } from '../../lib/useCatalog';
import { HeroSpotlight } from '../../components/HeroSpotlight';
import { SectionRow } from '../../components/SectionRow';
import { SkeletonHero, SkeletonRow } from '../../components/Skeleton';
import { EmptyState, ErrorState, StaleBanner } from '../../components/States';
import { colors, font, space } from '../../theme/tokens';

/**
 * Beranda — anime dan film dalam satu layar.
 *
 * Dua bundle diambil terpisah dan sengaja tidak saling menggagalkan. Pada
 * 2026-08-03 seluruh provider anime mengembalikan bundle kosong sementara film
 * lewat TMDB tetap hidup; kalau keduanya digabung dalam satu request, matinya
 * anime akan mengosongkan seluruh layar.
 */
export default function HomeScreen() {
  const anime = useCatalog('home', 'anime', useCallback(async () => unwrap(await getAnimeHomeBundle()), []));
  const movie = useCatalog('home', 'movie', useCallback(async () => unwrap(await getMovieHomeBundle()), []));

  const animeSections = useMemo(() => {
    const d = anime.data ?? {};
    return buildSections([
      { title: 'Episode Terbaru', items: d.recentEpisodes, kind: 'anime', source: 'hianime' },
      { title: 'Paling Populer', items: d.mostPopular, kind: 'anime', source: 'hianime' },
      { title: 'Sedang Tayang', items: d.topAiring, kind: 'anime', source: 'hianime' },
    ]);
  }, [anime.data]);

  const spotlight = useMemo(() => {
    const d = anime.data ?? {};
    const [first] = buildSections([
      { title: 'Spotlight', items: d.spotlight, kind: 'anime', source: 'hianime' },
    ]);
    return first?.items?.[0] ?? null;
  }, [anime.data]);

  const movieSections = useMemo(() => {
    const d = movie.data ?? {};
    return buildSections([
      { title: 'Film Trending', items: d.tmdbTrending, kind: 'movie', source: 'tmdb' },
      { title: 'Film Populer', items: d.tmdbPopularMovies, kind: 'movie', source: 'tmdb' },
      { title: 'Serial Populer', items: d.tmdbPopularTV, kind: 'tv', source: 'tmdb' },
      { title: 'LK21 Populer', items: d.lk21Popular, kind: 'movie', source: 'lk21' },
    ]);
  }, [movie.data]);

  const loading = anime.status === 'loading' && movie.status === 'loading';
  // Kedua sumber sudah selesai — barulah boleh menyimpulkan "tidak ada apa-apa".
  const settled = anime.status !== 'loading' && movie.status !== 'loading';
  const sections = [...animeSections, ...movieSections];
  const bothFailed = anime.status === 'error' && movie.status === 'error';
  const refreshing = anime.refreshing || movie.refreshing;

  const refresh = useCallback(() => {
    anime.refresh();
    movie.refresh();
  }, [anime, movie]);

  if (loading) {
    return (
      <ScrollView style={s.screen}>
        <SkeletonHero />
        <SkeletonRow />
        <SkeletonRow />
      </ScrollView>
    );
  }

  if (bothFailed) {
    return (
      <View style={s.screen}>
        <ErrorState message={anime.error || movie.error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
      }
    >
      {(anime.stale || movie.stale) && <StaleBanner />}

      {spotlight ? <HeroSpotlight item={spotlight} /> : null}

      {sections.length === 0 && settled ? (
        <EmptyState
          title="Belum ada konten"
          body={
            'Semua penyedia sedang tidak mengembalikan data. Ini biasanya sementara — ' +
            'coba beberapa saat lagi.'
          }
          onRetry={refresh}
        />
      ) : (
        sections.map((sec) => <SectionRow key={sec.title} title={sec.title} items={sec.items} />)
      )}

      {/* Kalau salah satu sumber mati sementara yang lain hidup, katakan —
          jangan biarkan user mengira katalognya memang sekecil itu.
          Digate pada status: tanpa itu, sumber yang masih memuat akan
          diumumkan "tidak tersedia" lalu pesannya hilang sendiri. */}
      {anime.status !== 'loading' && animeSections.length === 0 && movieSections.length > 0 ? (
        <Text style={s.note}>Penyedia anime sedang tidak tersedia.</Text>
      ) : null}
      {movie.status !== 'loading' && movieSections.length === 0 && animeSections.length > 0 ? (
        <Text style={s.note}>Penyedia film sedang tidak tersedia.</Text>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: space.xxxl },
  note: {
    color: colors.textDim,
    fontSize: font.size.sm,
    textAlign: 'center',
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
  },
});
