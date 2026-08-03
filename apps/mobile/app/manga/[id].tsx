import { useCallback, useMemo, useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { getMangaInfo, detectMangaProvider } from '@soora/core/api';
import { resolveImage, unwrap } from '@soora/core/models';
import { useCatalog } from '../../lib/useCatalog';
import { DetailHeader, ListRow, SectionTitle } from '../../components/Detail';
import { SkeletonHero, SkeletonRow } from '../../components/Skeleton';
import { EmptyState, ErrorState } from '../../components/States';
import { SaveButton } from '../../components/SaveButton';
import { WatchLaterButton } from '../../components/WatchLaterButton';
import { ChapterToolbar, type Urutan } from '../../components/ChapterToolbar';
import { GenreChips } from '../../components/GenreChips';
import { getReadingPos, type ReadingPos } from '../../lib/reading';
import { colors, font, onAccent, radius, space, MIN_TOUCH } from '../../theme/tokens';

type Chapter = { id?: string; title?: string; chapterNumber?: string | number };

export default function MangaInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Sebelumnya selalu memakai default 'mangapill'. Judul dengan id berbentuk
  // slug ada di komiku, dan memanggil mangapill untuk id itu membalas 200 tanpa
  // chapter — layar tampak "belum ada chapter" padahal judulnya baik-baik saja.
  const provider = detectMangaProvider(id);

  const { data, status, error, refresh } = useCatalog(
    'title',
    `manga:${provider}:${id}`,
    useCallback(async () => unwrap(await getMangaInfo(id, provider)), [id, provider]),
    Boolean(id)
  );

  const [posBaca, setPosBaca] = useState<ReadingPos | null>(null);
  const [cariCh, setCariCh] = useState('');
  const [urutan, setUrutan] = useState<Urutan>('terbaru');
  // Dibaca ulang tiap layar mendapat fokus: user kembali ke sini tepat
  // setelah membaca, dan tombol lanjut harus menunjuk chapter terbaru.
  useFocusEffect(
    useCallback(() => {
      setPosBaca(getReadingPos(String(id)));
    }, [id])
  );

  const info = useMemo(() => data ?? {}, [data]);
  const title = typeof info?.title === 'string' ? info.title : 'Manga';

  const chapters: Chapter[] = useMemo(() => {
    const c = info?.chapters;
    return Array.isArray(c) ? c : [];
  }, [info]);

  const genres: string[] = useMemo(() => {
    const g = info?.genres;
    return Array.isArray(g) ? g.map(String) : [];
  }, [info]);

  /**
   * Urutan dan filter chapter.
   *
   * Nomor diambil dari judul kalau `chapterNumber` kosong — sebagian
   * penyedia hanya mengisi judul seperti "Chapter 52". Tanpa itu seluruh
   * daftar dianggap bernomor 0 dan pengurutan tidak melakukan apa-apa.
   */
  const tersaring = useMemo(() => {
    const nomor = (ch: Chapter) => {
      const n = Number(ch.chapterNumber);
      if (Number.isFinite(n) && n !== 0) return n;
      const m = String(ch.title ?? '').match(/([\d.]+)/);
      return m ? Number(m[1]) : 0;
    };
    const urut = [...chapters].sort((a, b) =>
      urutan === 'terbaru' ? nomor(b) - nomor(a) : nomor(a) - nomor(b)
    );
    const q = cariCh.trim().toLowerCase();
    if (!q) return urut;
    return urut.filter(
      (ch) =>
        String(ch.title ?? '').toLowerCase().includes(q) ||
        String(ch.chapterNumber ?? '').toLowerCase().includes(q)
    );
  }, [chapters, urutan, cariCh]);

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
        <Stack.Screen options={{ title: 'Manga' }} />
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  // Divirtualisasi karena alasan yang sama dengan layar anime: One Piece punya
  // ~1.130 chapter, dan merender semuanya sekaligus membekukan UI.
  return (
    <View style={s.screen}>
      <Stack.Screen options={{ title }} />
      <FlashList
        data={tersaring}
        keyExtractor={(ch, i) => ch.id ?? `ch-${i}`}
        contentContainerStyle={s.content}
        ListHeaderComponent={
          <>
            <DetailHeader
              title={title}
              poster={resolveImage(info?.image)}
              meta={[
                info?.status,
                info?.type,
                chapters.length ? `${chapters.length} chapter` : '',
              ].filter(Boolean)}
              synopsis={info?.description?.replace(/<[^>]*>/g, '')}
            />
            <SaveButton
              item={{ id: String(id), listType: 'manga', title, poster: info?.image }}
            />
        <WatchLaterButton
          item={{ id: String(id), listType: 'manga', title, poster: info?.image }}
            />
            {posBaca ? (
              <Pressable
                style={({ pressed }) => [s.lanjut, pressed && s.lanjutDitekan]}
                accessibilityRole="button"
                accessibilityLabel={`Lanjut baca ${posBaca.chLabel}`}
                onPress={() =>
                  router.push({
                    pathname: '/read/[chapter]',
                    params: {
                      chapter: posBaca.chId,
                      provider,
                      title,
                      mangaId: String(id),
                    },
                  } as never)
                }
              >
                <Text style={s.lanjutTeks} numberOfLines={1}>
                  Lanjut baca · {posBaca.chLabel}
                </Text>
              </Pressable>
            ) : null}
            <GenreChips genres={genres} kind="manga" />
            <SectionTitle>Chapter</SectionTitle>
            <ChapterToolbar
              jumlah={chapters.length}
              cari={cariCh}
              onCari={setCariCh}
              urutan={urutan}
              onUrutan={setUrutan}
            />
          </>
        }
        ListEmptyComponent={
          cariCh.trim() ? (
            <EmptyState
              title="Tidak ada yang cocok"
              body={`Tidak ada chapter yang mengandung "${cariCh.trim()}".`}
              onRetry={() => setCariCh('')}
            />
          ) : (
            <EmptyState
              title="Belum ada chapter"
              body="Penyedia tidak mengembalikan daftar chapter untuk judul ini."
              onRetry={refresh}
            />
          )
        }
        renderItem={({ item: ch, index }) => {
          const label = ch.title || `Chapter ${ch.chapterNumber ?? index + 1}`;
          const terakhir = posBaca?.chId === ch.id;
          return (
            <ListRow
              label={terakhir ? `${label}  ·  terakhir dibaca` : label}
              // Provider dan judul dibawa serta: reader tidak bisa menyimpulkan
              // provider dari id chapter dengan andal, dan tanpa judul header
              // reader hanya menampilkan "Baca".
              onPress={() =>
                router.push({
                  pathname: '/read/[chapter]',
                  params: { chapter: ch.id ?? '', provider, title, mangaId: String(id) },
                } as never)
              }
            />
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: space.xxxl },
  lanjut: {
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: space.lg,
    marginTop: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  lanjutDitekan: { opacity: 0.8 },
  lanjutTeks: {
    color: onAccent,
    fontSize: font.size.md,
    fontWeight: font.weight.semibold,
  },
});
