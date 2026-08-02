import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Search as SearchIcon, X } from 'lucide-react-native';
import { searchAnime, searchMoviesTMDB } from '@soora/core/api';
import { normalizeList, unwrap } from '@soora/core/models';
import { getRuntime } from '@soora/core';
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
export default function SearchScreen() {
  const [raw, setRaw] = useState('');
  const query = useDebounced(raw.trim(), 350);
  const enabled = query.length >= 2;
  const [recent, setRecent] = useState<string[]>(() => readRecent());

  const fetcher = useCallback(async () => {
    // Dua provider dijalankan bersamaan dan kegagalan salah satu tidak
    // membatalkan yang lain — anime sering mati sementara TMDB tetap hidup.
    const [animeRes, movieRes] = await Promise.allSettled([
      searchAnime(query),
      searchMoviesTMDB(query),
    ]);

    const animeItems =
      animeRes.status === 'fulfilled'
        ? normalizeList(unwrap(animeRes.value)?.results, 'anime', 'hianime')
        : [];
    const movieItems =
      movieRes.status === 'fulfilled'
        ? normalizeList(unwrap(movieRes.value)?.results, 'movie', 'tmdb')
        : [];

    // Kegagalan parsial tidak boleh diam-diam ter-cache 15 menit.
    //
    // Kalau anime mati saat pencarian dijalankan, hasilnya tetap "sukses"
    // (hanya film). Menyimpannya berarti saat anime pulih 30 detik kemudian,
    // kueri yang sama tetap mengembalikan hasil tanpa anime selama sisa TTL,
    // dan user tidak punya cara memaksa muat ulang dari layar ini.
    if (animeRes.status === 'rejected' || movieRes.status === 'rejected') {
      return { animeItems, movieItems, partial: true };
    }

    return { animeItems, movieItems, partial: false };
  }, [query]);

  const { data, status, error, refresh } = useCatalog(
    'search',
    query,
    fetcher,
    enabled,
    // Jangan simpan hasil yang salah satu penyedianya gagal.
    (d) => !d?.partial
  );

  const items = useMemo(() => {
    if (!data) return [];
    return [...(data.animeItems ?? []), ...(data.movieItems ?? [])];
  }, [data]);

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
          placeholder="Cari anime, film, serial…"
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
        <View style={s.recentWrap}>
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
        </View>
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
