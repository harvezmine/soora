import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { getSubIndoHomeBundle } from '@soora/core/api';
import { buildSections, unwrap } from '@soora/core/models';
import { useFocusEffect } from 'expo-router';
import { useCatalog } from '../../lib/useCatalog';
import { listProgress, type ProgressEntry } from '../../lib/progress';
import { ContinueRow } from '../../components/ContinueRow';
import { HeroSpotlight } from '../../components/HeroSpotlight';
import { SearchEntry } from '../../components/SearchEntry';
import { SectionRow } from '../../components/SectionRow';
import { SkeletonHero, SkeletonRow } from '../../components/Skeleton';
import { EmptyState, ErrorState, StaleBanner } from '../../components/States';
import { colors, space } from '../../theme/tokens';

/**
 * Beranda — anime, padanan bagian "Sooranime" di web.
 *
 * Film pindah ke tab tersendiri (./film.tsx). Saat keduanya satu layar, judul
 * film selalu berada di bawah tiga baris anime dan praktis tak terlihat.
 *
 * "Lanjut tonton" tetap di sini karena mencakup anime maupun film: itu daftar
 * milik user, bukan katalog salah satu bagian.
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

  const anime = useCatalog(
    'home',
    'anime',
    useCallback(async () => unwrap(await getSubIndoHomeBundle()), [])
  );

  /**
   * Anime memakai jalur Sub Indo (Samehadaku), bukan consumet.
   *
   * Diverifikasi 2026-08-03 dari VPS: hianime.to timeout, animekai.to menolak
   * koneksi, aniwatchtv.to balas 522 — seluruh penyedia direct English tidak
   * bisa dijangkau, dan `/anime/home` mengembalikan bundle kosong dengan HTTP
   * 200. Sementara `/anime/subindo/home` mengembalikan katalog penuh. Ini
   * arsitektur yang sama dengan web.
   */
  const sections = useMemo(() => {
    const d = anime.data ?? {};
    return buildSections([
      { title: 'Sedang Tayang', items: d.ongoing, kind: 'anime', source: 'samehadaku' },
      { title: 'Populer', items: d.popular, kind: 'anime', source: 'samehadaku' },
      { title: 'Terbaru', items: d.recent, kind: 'anime', source: 'samehadaku' },
    ]);
  }, [anime.data]);

  if (anime.status === 'loading') {
    return (
      <ScrollView style={s.screen}>
        <SkeletonHero />
        <SkeletonRow />
        <SkeletonRow />
      </ScrollView>
    );
  }

  if (anime.status === 'error') {
    return (
      <View style={s.screen}>
        <ErrorState message={anime.error} onRetry={anime.refresh} />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={anime.refreshing}
          onRefresh={anime.refresh}
          tintColor={colors.accent}
        />
      }
    >
      {anime.stale && <StaleBanner />}
      <HeroSpotlight items={(sections[0]?.items ?? []).slice(0, 5)} />
      <SearchEntry bagian="anime" />

      <ContinueRow items={continueItems} />

      {sections.length === 0 ? (
        <EmptyState
          title="Katalog anime kosong"
          body={
            'Penyedia anime sedang tidak mengembalikan data. Biasanya sementara — ' +
            'coba lagi sebentar. Film dan manga tetap bisa dibuka lewat tab lain.'
          }
          onRetry={anime.refresh}
        />
      ) : (
        sections.map((sec) => <SectionRow key={sec.title} title={sec.title} items={sec.items} />)
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: space.xxxl },
});
