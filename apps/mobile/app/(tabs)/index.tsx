import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getSubIndoHomeBundle, getMovieHomeBundle } from '@soora/core/api';
import { buildSections, unwrap } from '@soora/core/models';
import { useFocusEffect } from 'expo-router';
import { useCatalog } from '../../lib/useCatalog';
import { listProgress, type ProgressEntry } from '../../lib/progress';
import { ContinueRow } from '../../components/ContinueRow';
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
  // Dibaca ulang tiap layar mendapat fokus, bukan sekali saat mount: user
  // kembali ke sini tepat setelah menonton, dan posisi terbaru harus langsung
  // terlihat. Layar tab tidak pernah di-unmount, jadi useEffect biasa tidak
  // akan pernah berjalan lagi.
  const [continueItems, setContinueItems] = useState<ProgressEntry[]>([]);
  useFocusEffect(
    useCallback(() => {
      setContinueItems(listProgress());
    }, [])
  );

  const anime = useCatalog('home', 'anime', useCallback(async () => unwrap(await getSubIndoHomeBundle()), []));
  const movie = useCatalog('home', 'movie', useCallback(async () => unwrap(await getMovieHomeBundle()), []));

  /**
   * Anime memakai jalur Sub Indo (Samehadaku), bukan consumet.
   *
   * Diverifikasi 2026-08-03 dari VPS: hianime.to timeout, animekai.to menolak
   * koneksi, aniwatchtv.to balas 522 — seluruh penyedia direct English tidak
   * bisa dijangkau, dan `/anime/home` mengembalikan bundle kosong dengan HTTP
   * 200. Sementara `/anime/subindo/home` mengembalikan katalog penuh. Ini
   * arsitektur yang sama dengan web.
   */
  const animeSections = useMemo(() => {
    const d = anime.data ?? {};
    return buildSections([
      { title: 'Sedang Tayang', items: d.ongoing, kind: 'anime', source: 'samehadaku' },
      { title: 'Populer', items: d.popular, kind: 'anime', source: 'samehadaku' },
      { title: 'Terbaru', items: d.recent, kind: 'anime', source: 'samehadaku' },
    ]);
  }, [anime.data]);

  const spotlight = useMemo(() => {
    const d = anime.data ?? {};
    const [first] = buildSections([
      { title: 'Spotlight', items: d.ongoing ?? d.popular, kind: 'anime', source: 'samehadaku' },
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

      <ContinueRow items={continueItems} />

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
