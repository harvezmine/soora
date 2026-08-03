import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Search as SearchIcon, X } from 'lucide-react-native';
import { searchSamehadaku, searchMoviesTMDB, searchManga, searchKomiku } from '@soora/core/api';
import { normalizeList, unwrap } from '@soora/core/models';
import { getRuntime } from '@soora/core';
import { useLocalSearchParams } from 'expo-router';
import { getMangaLang } from '../../lib/mangaLang';
import { getSubIndoHomeBundle, getMovieHomeBundle, getMangaHomeBundle } from '@soora/core/api';
import { buildSections } from '@soora/core/models';
import { SectionRow } from '../../components/SectionRow';
import { GenreBrowse } from '../../components/GenreBrowse';
import { useCatalog, useDebounced } from '../../lib/useCatalog';
import { MediaGrid } from '../../components/MediaGrid';
import { SkeletonGrid } from '../../components/Skeleton';
import { EmptyState, ErrorState } from '../../components/States';
import { colors, font, iconSize, iconStroke, radius, space, MIN_TOUCH } from '../../theme/tokens';

const RECENT_KEY = 'soora_recent_searches';
const MAX_RECENT = 8;

function readRecent(): string[] {
  try {
    const raw = getRuntime().kv.get(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function pushRecent(q: string) {
  const trimmed = q.trim();
  if (!trimmed) return;
  const next = [trimmed, ...readRecent().filter((v) => v !== trimmed)].slice(0, MAX_RECENT);
  getRuntime().kv.set(RECENT_KEY, JSON.stringify(next));
}

/**
 * Pencarian gabungan anime + film.
 *
 * Kueri di-debounce 350 ms. Tanpa itu, mengetik "one piece" mengirim sembilan
 * request dan hasil yang datang tidak berurutan membuat daftar berkedip ke
 * hasil kueri lama.
 */
type Bagian = 'all' | 'anime' | 'movie' | 'manga';

const PLACEHOLDER: Record<Bagian, string> = {
  all: 'Cari anime, film, serial…',
  anime: 'Cari anime…',
  movie: 'Cari film dan serial…',
  manga: 'Cari manga dan manhwa…',
};

export default function SearchScreen() {
  // Bagian aktif datang dari tab yang membuka layar ini. Mencari manga di
  // antara ratusan judul film tidak berguna; tiap bagian mencari di
  // penyedianya sendiri.
  const { type } = useLocalSearchParams<{ type?: string }>();
  const bagian: Bagian = type === 'anime' || type === 'movie' || type === 'manga' ? type : 'all';

  const [raw, setRaw] = useState('');
  const query = useDebounced(raw.trim(), 350);
  // Minimal 2 huruf, berbeda dari web yang memicu sejak 1 huruf. Satu huruf
  // menghasilkan ribuan judul yang praktis acak, dan di ponsel tiap kueri
  // itu memakan kuota serta satu perjalanan penuh ke tiga penyedia.
  const enabled = query.length >= 2;
  const [recent, setRecent] = useState<string[]>(() => readRecent());

  const fetcher = useCallback(async () => {
    // Penyedia dijalankan bersamaan dan kegagalan salah satu tidak membatalkan
    // yang lain — anime sering mati sementara TMDB tetap hidup.
    // Anime lewat Samehadaku: penyedia English tidak bisa dijangkau dari VPS.
    const tugas = {
      anime: () => searchSamehadaku(query),
      movie: () => searchMoviesTMDB(query),
      // Kolam manga mengikuti bahasa yang dipilih di beranda manga. Mencari
      // judul Indonesia di mangapill hampir selalu nihil, dan sebaliknya.
      manga: () => (getMangaLang() === 'id' ? searchKomiku(query) : searchManga(query)),
    };
    const aktif = bagian === 'all' ? (['anime', 'movie'] as const) : ([bagian] as const);

    const hasil = await Promise.allSettled(aktif.map((k) => tugas[k]()));

    const items: ReturnType<typeof normalizeList> = [];
    let gagal = false;
    aktif.forEach((k, idx) => {
      const r = hasil[idx];
      if (r.status !== 'fulfilled') {
        gagal = true;
        return;
      }
      const d = unwrap(r.value);
      if (k === 'anime') {
        items.push(...normalizeList(d?.animeList ?? d?.results, 'anime', 'samehadaku'));
      } else if (k === 'movie') {
        items.push(...normalizeList(d?.results, 'movie', 'tmdb'));
      } else {
        const sumber = getMangaLang() === 'id' ? 'komiku' : 'mangapill';
        items.push(...normalizeList(d?.results ?? d, 'manga', sumber));
      }
    });

    // Kegagalan parsial tidak boleh diam-diam ter-cache 15 menit.
    //
    // Kalau anime mati saat pencarian dijalankan, hasilnya tetap "sukses"
    // (hanya film). Menyimpannya berarti saat anime pulih 30 detik kemudian,
    // kueri yang sama tetap mengembalikan hasil tanpa anime selama sisa TTL,
    // dan user tidak punya cara memaksa muat ulang dari layar ini.
    return { items, partial: gagal };
  }, [query, bagian]);

  const { data, status, error, refresh } = useCatalog(
    'search',
    `${bagian}:${query}`,
    fetcher,
    enabled,
    // Jangan simpan hasil yang salah satu penyedianya gagal.
    (d) => !d?.partial
  );

  const items = useMemo(() => data?.items ?? [], [data]);

  /**
   * Tiga bagian statis saat kolom pencarian masih kosong.
   *
   * Layar Cari sebelumnya kosong sampai user mengetik, dan layar kosong
   * tidak memberi petunjuk apa pun tentang apa yang bisa dicari.
   *
   * Dijalankan HANYA saat kolom kosong (`!enabled`), dan bundelnya sudah
   * dipakai beranda masing-masing bagian sehingga hampir selalu tersedia
   * dari cache — membuka layar Cari tidak menambah request baru.
   */
  const jelajah = useCatalog(
    'home',
    'cari:jelajah',
    useCallback(async () => {
      const [a, f, m] = await Promise.allSettled([
        getSubIndoHomeBundle(),
        getMovieHomeBundle(),
        getMangaHomeBundle(getMangaLang()),
      ]);
      const isi = (r: PromiseSettledResult<unknown>) =>
        r.status === 'fulfilled' ? (unwrap(r.value) as Record<string, unknown>) : {};
      return { anime: isi(a), film: isi(f), manga: isi(m) };
    }, []),
    !enabled
  );

  const barisJelajah = useMemo(() => {
    const d = jelajah.data;
    if (!d) return [];
    const mangaSections = (d.manga as { sections?: Record<string, unknown> })?.sections ?? {};
    const mangaPertama = Object.values(mangaSections)[0];
    return buildSections([
      {
        title: 'Anime populer',
        items: (d.anime as { popular?: unknown; ongoing?: unknown })?.popular ??
          (d.anime as { ongoing?: unknown })?.ongoing,
        kind: 'anime' as const,
        source: 'samehadaku',
      },
      {
        title: 'Film trending',
        items: (d.film as { tmdbTrending?: unknown })?.tmdbTrending,
        kind: 'movie' as const,
        source: 'tmdb',
      },
      {
        title: 'Manga pilihan',
        items: mangaPertama,
        kind: 'manga' as const,
        source: getMangaLang() === 'id' ? 'komiku' : 'mangapill',
      },
    ]);
  }, [jelajah.data]);

  const submit = () => {
    if (!enabled) return;
    pushRecent(query);
    setRecent(readRecent());
  };

  const clearRecent = () => {
    getRuntime().kv.remove(RECENT_KEY);
    setRecent([]);
  };

  return (
    <View style={s.screen}>
      <View style={s.searchBar}>
        <SearchIcon size={iconSize.md} color={colors.textDim} strokeWidth={iconStroke} />
        <TextInput
          value={raw}
          onChangeText={setRaw}
          onSubmitEditing={submit}
          placeholder={PLACEHOLDER[bagian]}
          placeholderTextColor={colors.textDim}
          style={s.input}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Kolom pencarian"
        />
        {raw.length > 0 && (
          <Pressable onPress={() => setRaw('')} hitSlop={12} accessibilityLabel="Bersihkan">
            <X size={iconSize.md} color={colors.textDim} strokeWidth={iconStroke} />
          </Pressable>
        )}
      </View>

      {!enabled ? (
        <ScrollView
          contentContainerStyle={s.recentWrap}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {recent.length > 0 ? (
            <>
              <View style={s.recentHead}>
                <Text style={s.recentTitle}>Pencarian terakhir</Text>
                <Pressable onPress={clearRecent} hitSlop={12}>
                  <Text style={s.clear}>Hapus</Text>
                </Pressable>
              </View>
              {recent.map((q) => (
                <Pressable
                  key={q}
                  style={({ pressed }) => [s.recentRow, pressed && s.pressed]}
                  onPress={() => setRaw(q)}
                >
                  <SearchIcon size={iconSize.sm} color={colors.textDim} strokeWidth={iconStroke} />
                  <Text style={s.recentText}>{q}</Text>
                </Pressable>
              ))}
            </>
          ) : (
            <Text style={s.hint}>Ketik minimal 2 huruf untuk mulai mencari.</Text>
          )}

          {barisJelajah.map((sec) => (
            <SectionRow key={sec.title} title={sec.title} items={sec.items} />
          ))}

          <GenreBrowse />
        </ScrollView>
      ) : status === 'loading' ? (
        <SkeletonGrid />
      ) : status === 'error' ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <MediaGrid
          items={items}
          ListEmptyComponent={
            <EmptyState
              title="Tidak ada hasil"
              body={`Tidak ada yang cocok dengan "${query}". Coba kata kunci lain, atau penyedia sedang tidak tersedia.`}
            />
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    margin: space.lg,
    paddingHorizontal: space.md,
    minHeight: MIN_TOUCH,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  input: { flex: 1, color: colors.text, fontSize: font.size.base, paddingVertical: space.sm },
  recentWrap: { paddingHorizontal: space.lg, gap: space.xs },
  recentHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recentTitle: { color: colors.textMuted, fontSize: font.size.sm, fontWeight: '600' },
  clear: { color: colors.accent, fontSize: font.size.sm },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: MIN_TOUCH,
  },
  recentText: { color: colors.text, fontSize: font.size.md },
  pressed: { opacity: 0.7 },
  hint: { color: colors.textDim, fontSize: font.size.sm, paddingTop: space.xl },
});
