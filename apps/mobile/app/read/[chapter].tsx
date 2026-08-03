import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import {
  ActivityIndicator,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useKeepAwake } from 'expo-keep-awake';
import { ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react-native';
import { getMangaInfo, detectMangaProvider } from '@soora/core/api';
import { unwrap } from '@soora/core/models';
import { useCatalog } from '../../lib/useCatalog';
import { useChapterFeed, type Chapter, type BarisReader } from '../../lib/useChapterFeed';
import { saveReadingPos } from '../../lib/reading';
import { MangaPage } from '../../components/MangaPage';
import { EmptyState, ErrorState } from '../../components/States';
import { colors, font, radius, space, iconSize, iconStroke, MIN_TOUCH } from '../../theme/tokens';

/**
 * Pembaca chapter — gulir vertikal menerus dengan sambung chapter otomatis.
 *
 * Hanya mode vertikal, tidak ada mode halaman-per-halaman seperti di web. Di
 * layar ponsel mode halaman berarti mengecilkan satu halaman penuh sampai
 * teksnya tidak terbaca.
 *
 * Berada di luar grup (tabs) supaya tab bar tidak menutupi halaman.
 */
export default function ReadScreen() {
  const {
    chapter,
    provider: providerParam,
    title,
    mangaId,
  } = useLocalSearchParams<{
    chapter: string;
    provider?: string;
    title?: string;
    mangaId?: string;
  }>();

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // Layar tidak mati selama membaca. Satu halaman webtoon bisa dibaca lebih
  // lama dari batas layar mati bawaan perangkat.
  useKeepAwake();

  const provider = providerParam || detectMangaProvider(chapter);

  const [tampilKontrol, setTampilKontrol] = useState(true);
  const [chAktif, setChAktif] = useState(chapter);
  const [posisi, setPosisi] = useState({ ke: 0, dari: 0 });

  /**
   * Kunci potret selama membaca.
   *
   * Manga dibaca potret; di lanskap satu halaman menyusut sampai teksnya tidak
   * terbaca. Dilepas saat keluar — mengunci tanpa melepas berlaku untuk seluruh
   * proses, sehingga pemutar video ikut terkunci sampai app ditutup paksa.
   */
  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    return () => {
      void ScreenOrientation.unlockAsync();
    };
  }, []);

  // Daftar chapter diambil dari info manga; tanpa ini reader tidak tahu apa
  // chapter berikutnya dan tidak bisa menyambung.
  const info = useCatalog(
    'title',
    `manga:${provider}:${mangaId}`,
    useCallback(async () => unwrap(await getMangaInfo(String(mangaId), provider)), [
      mangaId,
      provider,
    ]),
    Boolean(mangaId)
  );

  const chapters: Chapter[] = useMemo(() => {
    const c = (info.data as { chapters?: unknown })?.chapters;
    return Array.isArray(c) ? (c as Chapter[]) : [];
  }, [info.data]);

  const judulManga = String(title || (info.data as { title?: string })?.title || 'Baca');

  const feed = useChapterFeed({
    chapterAwal: chapter,
    provider,
    chapters,
    judulManga,
  });

  const labelAktif = useMemo(() => {
    const s = feed.segmen.find((x) => x.chId === chAktif);
    return s?.label ?? judulManga;
  }, [feed.segmen, chAktif, judulManga]);

  /**
   * Lacak baris yang terlihat untuk memperbarui judul dan penghitung.
   *
   * Penghitung dibuat relatif terhadap chapter yang sedang dibaca, bukan
   * terhadap gabungan seluruh segmen: setelah tiga chapter tersambung, angka
   * seperti 212/540 tidak berarti apa-apa bagi pembaca.
   */
  const onViewable = useRef(
    ({ viewableItems }: { viewableItems: { item: BarisReader }[] }) => {
      const halaman = viewableItems.map((v) => v.item).filter((b) => b?.jenis === 'halaman');
      const pertama = halaman[0];
      if (!pertama || pertama.jenis !== 'halaman') return;
      setChAktif(pertama.chId);
      setPosisi({ ke: pertama.ke, dari: pertama.dari });
    }
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 40 }).current;

  // Simpan posisi baca saat berpindah halaman. Ditulis lewat ref supaya effect
  // tidak berjalan ulang tiap kali angka halaman berubah.
  const simpanRef = useRef({ chAktif, posisi, mangaId, labelAktif });
  simpanRef.current = { chAktif, posisi, mangaId, labelAktif };
  useEffect(() => {
    if (!mangaId || !chAktif || posisi.ke <= 0) return;
    const t = setTimeout(() => {
      const s = simpanRef.current;
      saveReadingPos({
        mangaId: String(s.mangaId),
        chId: s.chAktif,
        chLabel: s.labelAktif,
        page: Math.max(0, s.posisi.ke - 1),
      });
    }, 800);
    return () => clearTimeout(t);
  }, [chAktif, posisi.ke, mangaId]);

  const pindahChapter = useCallback(
    (arah: -1 | 1) => {
      const i = feed.indeksChapter(chAktif);
      const target = feed.urut[i + arah];
      if (!target?.id) return;
      router.replace({
        pathname: '/read/[chapter]',
        params: { chapter: target.id, provider, title, mangaId },
      } as never);
    },
    [feed, chAktif, provider, title, mangaId, router]
  );

  const idxAktif = feed.indeksChapter(chAktif);
  const adaSebelum = idxAktif > 0;
  const adaBerikut = idxAktif >= 0 && idxAktif < feed.urut.length - 1;

  if (feed.status === 'memuat' || (info.status === 'loading' && feed.segmen.length === 0)) {
    return (
      <View style={s.layar}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[s.tengah, { paddingTop: insets.top }]}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={s.memuat}>Memuat halaman…</Text>
        </View>
      </View>
    );
  }

  if (feed.status === 'galat') {
    return (
      <View style={[s.layar, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ title: judulManga }} />
        <ErrorState message={feed.galat} onRetry={() => router.replace({ pathname: '/read/[chapter]', params: { chapter, provider, title, mangaId } } as never)} />
      </View>
    );
  }

  if (feed.baris.length === 0) {
    return (
      <View style={[s.layar, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ title: judulManga }} />
        <EmptyState
          title="Chapter ini kosong"
          body={`Penyedia ${provider} tidak mengembalikan satu halaman pun. Coba chapter lain.`}
          onRetry={() => router.back()}
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
          data={feed.baris}
          keyExtractor={(b) => b.kunci}
          // Halaman dan pemisah tingginya jauh berbeda; memberi tahu jenisnya
          // membuat FlashList mendaur ulang view yang benar dan tidak
          // menghitung ulang tata letak tiap kali melewati pemisah.
          getItemType={(b) => b.jenis}
          renderItem={({ item }) =>
            item.jenis === 'pemisah' ? (
              <Pemisah label={item.label} />
            ) : (
              <MangaPage
                source={{ uri: item.uri, headers: item.headers }}
                width={width}
                index={item.ke - 1}
              />
            )
          }
          onViewableItemsChanged={onViewable}
          viewabilityConfig={viewabilityConfig}
          onEndReached={() => void feed.sambung()}
          // 1.5 layar sebelum ujung — setara rootMargin 1200px di web. Mulai
          // memuat jauh sebelum halaman terakhir terlihat supaya sambungannya
          // tidak pernah terlihat sebagai jeda.
          onEndReachedThreshold={1.5}
          drawDistance={width * 2}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom }}
          ListFooterComponent={
            feed.menyambung ? (
              <View style={s.kaki}>
                <ActivityIndicator color={colors.accent} />
                <Text style={s.kakiTeks}>Memuat chapter berikutnya…</Text>
              </View>
            ) : feed.habis || !adaBerikut ? (
              <View style={s.kaki}>
                <Text style={s.kakiTeks}>Chapter terakhir.</Text>
              </View>
            ) : null
          }
        />
      </Pressable>

      {tampilKontrol && (
        <>
          <View style={[s.barAtas, { paddingTop: insets.top + space.sm }]}>
            <Pressable
              onPress={() => router.back()}
              style={s.ikonBtn}
              hitSlop={space.sm}
              accessibilityRole="button"
              accessibilityLabel="Kembali ke daftar chapter"
            >
              <ArrowLeft size={iconSize.md} color={colors.text} strokeWidth={iconStroke} />
            </Pressable>
            <View style={s.judulKotak}>
              <Text style={s.judul} numberOfLines={1}>
                {judulManga}
              </Text>
              <Text style={s.subJudul} numberOfLines={1}>
                {labelAktif}
              </Text>
            </View>
          </View>

          <View style={[s.barBawah, { paddingBottom: insets.bottom + space.sm }]}>
            <Pressable
              onPress={() => pindahChapter(-1)}
              disabled={!adaSebelum}
              style={[s.navBtn, !adaSebelum && s.navMati]}
              accessibilityRole="button"
              accessibilityLabel="Chapter sebelumnya"
              accessibilityState={{ disabled: !adaSebelum }}
            >
              <ChevronLeft size={iconSize.md} color={colors.text} strokeWidth={iconStroke} />
            </Pressable>

            <Text style={s.penghitung}>
              {posisi.dari > 0 ? `${posisi.ke} / ${posisi.dari}` : '—'}
            </Text>

            <Pressable
              onPress={() => pindahChapter(1)}
              disabled={!adaBerikut}
              style={[s.navBtn, !adaBerikut && s.navMati]}
              accessibilityRole="button"
              accessibilityLabel="Chapter berikutnya"
              accessibilityState={{ disabled: !adaBerikut }}
            >
              <ChevronRight size={iconSize.md} color={colors.text} strokeWidth={iconStroke} />
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

/** Penanda batas antar chapter di dalam gulungan. */
function Pemisah({ label }: { label: string }) {
  return (
    <View style={s.pemisah}>
      <View style={s.garis} />
      <Text style={s.pemisahTeks} numberOfLines={1}>
        {label}
      </Text>
      <View style={s.garis} />
    </View>
  );
}

const s = StyleSheet.create({
  // Hitam murni, bukan colors.bg: latar ungu-gelap terlihat sebagai bingkai
  // berwarna di sekitar halaman yang tidak mengisi penuh lebar layar.
  layar: { flex: 1, backgroundColor: '#000000' },
  isi: { flex: 1 },
  tengah: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  memuat: { color: colors.textMuted, fontSize: font.size.md },

  pemisah: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingVertical: space.xxl,
    backgroundColor: '#000000',
  },
  garis: { flex: 1, height: 1, backgroundColor: colors.border },
  pemisahTeks: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    maxWidth: '60%',
  },

  kaki: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: space.xxl,
  },
  kakiTeks: { color: colors.textDim, fontSize: font.size.sm },

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
  judulKotak: { flex: 1 },
  judul: { color: colors.text, fontSize: font.size.md, fontWeight: font.weight.semibold },
  subJudul: { color: colors.textMuted, fontSize: font.size.xs, marginTop: 1 },

  barBawah: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  navBtn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  navMati: { opacity: 0.3 },
  ikonBtn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  penghitung: {
    color: colors.text,
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
    fontVariant: ['tabular-nums'],
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
});
