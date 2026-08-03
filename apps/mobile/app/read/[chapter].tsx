import { useCallback, useMemo, useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import {
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMangaChapterPages, getKomikuChapterPages, detectMangaProvider } from '@soora/core/api';
import { resolveImage, unwrap } from '@soora/core/models';
import { useCatalog } from '../../lib/useCatalog';
import { MangaPage, type PageSource } from '../../components/MangaPage';
import { EmptyState, ErrorState } from '../../components/States';
import { colors, font, radius, space, MIN_TOUCH } from '../../theme/tokens';

type RawPage = string | { img?: string; url?: string; page?: number };

/**
 * Pembaca chapter — gulir vertikal menerus (mode webtoon).
 *
 * Hanya mode vertikal, tidak ada mode halaman-per-halaman seperti di web. Di
 * layar ponsel mode halaman berarti mengecilkan satu halaman penuh sampai
 * teksnya tidak terbaca; gulir vertikal cocok untuk manga maupun webtoon dan
 * itu pula yang dipakai pembaca native lain.
 *
 * Berada di luar grup (tabs) supaya tab bar tidak menutupi halaman.
 */
export default function ReadScreen() {
  const { chapter, provider: providerParam, title } = useLocalSearchParams<{
    chapter: string;
    provider?: string;
    title?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // Provider ikut lewat query kalau layar info sudah tahu; kalau tidak, tebak
  // dari bentuk id. Memakai provider yang salah tidak melempar error — endpoint
  // membalas 200 dengan daftar kosong, jadi layar akan tampak "chapter kosong"
  // dan penyebab aslinya tersembunyi.
  const provider = providerParam || detectMangaProvider(chapter);

  const [tampilKontrol, setTampilKontrol] = useState(true);
  const [halamanAktif, setHalamanAktif] = useState(0);

  const { data, status, error, refresh } = useCatalog(
    'episodes',
    `manga:pages:${provider}:${chapter}`,
    useCallback(async () => {
      const res =
        provider === 'komiku'
          ? await getKomikuChapterPages(chapter)
          : await getMangaChapterPages(chapter, provider);
      return unwrap(res);
    }, [chapter, provider]),
    Boolean(chapter)
  );

  /**
   * Bentuk respons berbeda antar penyedia: mangapill mengembalikan objek
   * `{ img, page }`, komiku kadang array string biasa. Dinormalkan di sini
   * supaya sisa layar tidak perlu tahu bedanya.
   */
  const pages: PageSource[] = useMemo(() => {
    const raw: RawPage[] = Array.isArray(data) ? data : [];
    return raw
      .map((p) => (typeof p === 'string' ? p : p?.img || p?.url || ''))
      .filter(Boolean)
      .map((url) => resolveImage(url) as PageSource)
      .filter((src) => Boolean(src?.uri));
  }, [data]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const tengahLayar = contentOffset.y + layoutMeasurement.height / 2;
      const rasio = contentSize.height > 0 ? tengahLayar / contentSize.height : 0;
      const perkiraan = Math.min(pages.length - 1, Math.max(0, Math.floor(rasio * pages.length)));
      setHalamanAktif(perkiraan);
    },
    [pages.length]
  );

  const judul = title || 'Baca';

  if (status === 'loading') {
    return (
      <View style={s.layar}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[s.tengah, { paddingTop: insets.top }]}>
          <Text style={s.memuat}>Memuat halaman…</Text>
        </View>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={[s.layar, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ title: judul }} />
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  if (pages.length === 0) {
    return (
      <View style={[s.layar, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ title: judul }} />
        <EmptyState
          title="Chapter ini kosong"
          body={`Penyedia ${provider} tidak mengembalikan satu halaman pun. Coba chapter lain atau muat ulang.`}
          onRetry={refresh}
        />
      </View>
    );
  }

  return (
    <View style={s.layar}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar hidden={!tampilKontrol} animated />

      <Pressable style={s.isi} onPress={() => setTampilKontrol((v) => !v)}>
        <FlashList
          data={pages}
          keyExtractor={(p, i) => `${p.uri}-${i}`}
          renderItem={({ item, index }) => <MangaPage source={item} width={width} index={index} />}
          onScroll={onScroll}
          scrollEventThrottle={64}
          // Halaman manga jauh lebih besar dari poster; menahan terlalu banyak
          // di luar layar memicu kehabisan memori di perangkat kelas bawah.
          drawDistance={width * 2}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom }}
        />
      </Pressable>

      {tampilKontrol && (
        <>
          <View style={[s.barAtas, { paddingTop: insets.top + space.sm }]}>
            <Pressable
              onPress={() => router.back()}
              style={s.tombolKembali}
              hitSlop={space.sm}
              accessibilityRole="button"
              accessibilityLabel="Kembali ke daftar chapter"
            >
              <Text style={s.tombolKembaliTeks}>‹</Text>
            </Pressable>
            <Text style={s.judul} numberOfLines={1}>
              {judul}
            </Text>
          </View>

          <View style={[s.barBawah, { paddingBottom: insets.bottom + space.sm }]}>
            <Text style={s.penghitung}>
              {halamanAktif + 1} / {pages.length}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  // Hitam murni, bukan colors.bg: latar ungu-gelap terlihat sebagai bingkai
  // berwarna di sekitar halaman yang tidak mengisi penuh lebar layar.
  layar: { flex: 1, backgroundColor: '#000000' },
  isi: { flex: 1 },
  tengah: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  memuat: { color: colors.textMuted, fontSize: font.size.md },

  barAtas: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  tombolKembali: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tombolKembaliTeks: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 38,
  },
  judul: {
    flex: 1,
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.semibold,
  },

  barBawah: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: space.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  penghitung: {
    color: colors.text,
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
});
