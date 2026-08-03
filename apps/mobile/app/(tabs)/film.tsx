import { useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { getMovieHomeBundle } from '@soora/core/api';
import { buildSections, unwrap } from '@soora/core/models';
import { useCatalog } from '../../lib/useCatalog';
import { HeroSpotlight } from '../../components/HeroSpotlight';
import { SearchEntry } from '../../components/SearchEntry';
import { SectionRow } from '../../components/SectionRow';
import { SkeletonHero, SkeletonRow } from '../../components/Skeleton';
import { EmptyState, ErrorState, StaleBanner } from '../../components/States';
import { colors, space } from '../../theme/tokens';

/**
 * Film dan serial — padanan bagian "Sooraflix" di web.
 *
 * Sebelumnya film menumpang di Beranda bersama anime. Digabung begitu, judul
 * film terdorong jauh ke bawah oleh tiga baris anime dan praktis tidak
 * ditemukan; web memisahkan keduanya dan app sekarang mengikuti.
 */
export default function FilmScreen() {
  const movie = useCatalog(
    'home',
    'movie',
    useCallback(async () => unwrap(await getMovieHomeBundle()), [])
  );

  const sections = useMemo(() => {
    const d = movie.data ?? {};
    return buildSections([
      { title: 'Trending', items: d.tmdbTrending, kind: 'movie', source: 'tmdb' },
      { title: 'Film Populer', items: d.tmdbPopularMovies, kind: 'movie', source: 'tmdb' },
      { title: 'Serial Populer', items: d.tmdbPopularTV, kind: 'tv', source: 'tmdb' },
      { title: 'LK21 Populer', items: d.lk21Popular, kind: 'movie', source: 'lk21' },
    ]);
  }, [movie.data]);

  if (movie.status === 'loading') {
    return (
      <ScrollView style={s.screen}>
        <SkeletonHero />
        <SkeletonRow />
        <SkeletonRow />
      </ScrollView>
    );
  }

  if (movie.status === 'error') {
    return (
      <View style={s.screen}>
        <ErrorState message={movie.error} onRetry={movie.refresh} />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={movie.refreshing}
          onRefresh={movie.refresh}
          tintColor={colors.accent}
        />
      }
    >
      {movie.stale && <StaleBanner />}
      <HeroSpotlight items={(sections[0]?.items ?? []).slice(0, 5)} />
      <SearchEntry bagian="movie" />

      {sections.length === 0 ? (
        <EmptyState
          title="Katalog film kosong"
          body="TMDB dan LK21 sedang tidak mengembalikan data. Biasanya sementara — coba lagi sebentar."
          onRetry={movie.refresh}
        />
      ) : (
        sections.map((sec) => <SectionRow key={sec.title} title={sec.title} items={sec.items} />)
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // gap menyeragamkan jarak antar blok besar; sebelumnya tiap komponen
  // mengatur marginnya sendiri sehingga jarak sorotan->pencarian berbeda
  // dari pencarian->baris pertama tanpa alasan.
  content: { gap: space.lg, paddingBottom: space.xxxl },
});
