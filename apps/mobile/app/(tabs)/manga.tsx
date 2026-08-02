import { useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { getMangaHomeBundle } from '@soora/core/api';
import { buildSections, normalizeList, unwrap } from '@soora/core/models';
import { useCatalog } from '../../lib/useCatalog';
import { HeroSpotlight } from '../../components/HeroSpotlight';
import { SectionRow } from '../../components/SectionRow';
import { SkeletonHero, SkeletonRow } from '../../components/Skeleton';
import { EmptyState, ErrorState, StaleBanner } from '../../components/States';
import { colors, space } from '../../theme/tokens';

/**
 * Beranda manga.
 *
 * Bentuk bundle-nya berbeda dari anime dan film: `sections` adalah objek
 * bernama ("Trending", "Action", "Romance", …), bukan array dengan kunci tetap.
 * Nama section datang dari backend, jadi disusun dinamis.
 */
export default function MangaScreen() {
  const { data, status, error, stale, refreshing, refresh } = useCatalog(
    'home',
    'manga',
    useCallback(async () => unwrap(await getMangaHomeBundle()), [])
  );

  const hero = useMemo(() => {
    const d = data ?? {};
    return normalizeList(d.heroItems, 'manga', 'mangapill')[0] ?? null;
  }, [data]);

  const sections = useMemo(() => {
    const d = data ?? {};
    const raw = d.sections;
    if (!raw || typeof raw !== 'object') return [];
    return buildSections(
      Object.entries(raw).map(([title, items]) => ({
        title,
        items,
        kind: 'manga' as const,
        source: 'mangapill',
      }))
    );
  }, [data]);

  if (status === 'loading') {
    return (
      <ScrollView style={s.screen}>
        <SkeletonHero />
        <SkeletonRow />
        <SkeletonRow />
      </ScrollView>
    );
  }

  if (status === 'error') {
    return (
      <View style={s.screen}>
        <ErrorState message={error} onRetry={refresh} />
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
      {stale && <StaleBanner />}
      {hero ? <HeroSpotlight item={hero} /> : null}

      {sections.length === 0 ? (
        <EmptyState
          title="Belum ada manga"
          body="Penyedia manga sedang tidak mengembalikan data. Coba beberapa saat lagi."
          onRetry={refresh}
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
