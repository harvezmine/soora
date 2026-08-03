import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { getMangaHomeBundle } from '@soora/core/api';
import { buildSections, normalizeList, unwrap } from '@soora/core/models';
import { useCatalog } from '../../lib/useCatalog';
import { getMangaLang, setMangaLang, MANGA_LANGS, type MangaLang } from '../../lib/mangaLang';
import { LangPicker } from '../../components/LangPicker';
import { HeroSpotlight } from '../../components/HeroSpotlight';
import { SearchEntry } from '../../components/SearchEntry';
import { MasukBertahap } from '../../components/MasukBertahap';
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
  // Dibaca sekali dari MMKV lalu disimpan di state: MMKV sinkron, jadi tidak
  // perlu effect, tapi tanpa state layar tidak akan render ulang saat diganti.
  const [lang, setLang] = useState<MangaLang>(() => getMangaLang());

  const { data, status, error, stale, refreshing, refresh } = useCatalog(
    'home',
    // Bahasa masuk ke kunci cache. Tanpa itu, mengganti bahasa akan menyajikan
    // katalog bahasa sebelumnya dari cache sampai TTL satu jam habis.
    `manga:${lang}`,
    useCallback(async () => unwrap(await getMangaHomeBundle(lang)), [lang])
  );

  const gantiBahasa = useCallback((v: MangaLang) => {
    setMangaLang(v);
    setLang(v);
  }, []);

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
        {/* Pemilih bahasa tetap ditampilkan saat gagal. Kalau disembunyikan,
            user yang katalog bahasanya sedang mati tidak punya jalan keluar
            selain menutup app — padahal bahasa satunya mungkin sehat. */}
        <LangPicker
          label="Bahasa manga"
          options={MANGA_LANGS}
          value={lang}
          onChange={gantiBahasa}
        />
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
      <SearchEntry bagian="manga" />

      <LangPicker
        label="Bahasa manga"
        options={MANGA_LANGS}
        value={lang}
        onChange={gantiBahasa}
      />

      {sections.length === 0 ? (
        <EmptyState
          title="Belum ada manga"
          body="Penyedia manga sedang tidak mengembalikan data. Coba beberapa saat lagi."
          onRetry={refresh}
        />
      ) : (
        sections.map((sec, i) => (
          <MasukBertahap key={sec.title} indeks={i}>
            <SectionRow title={sec.title} items={sec.items} />
          </MasukBertahap>
        ))
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
