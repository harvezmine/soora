import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getMovieDetailsTMDB, getTVDetailsTMDB } from '@soora/core/api';
import { resolveImage, tmdbSize, unwrap } from '@soora/core/models';
import { useCatalog } from '../../lib/useCatalog';
import { DetailHeader, ListRow, SectionTitle } from '../../components/Detail';
import { EpisodeGrid } from '../../components/EpisodeGrid';
import { GenreChips } from '../../components/GenreChips';
import { SkeletonHero, SkeletonRow } from '../../components/Skeleton';
import { EmptyState, ErrorState } from '../../components/States';
import { SaveButton } from '../../components/SaveButton';
import { WatchLaterButton } from '../../components/WatchLaterButton';
import { colors, font, onAccent, radius, space } from '../../theme/tokens';

/**
 * Detail film atau serial dari TMDB.
 *
 * `kind` dibawa lewat query karena id TMDB untuk film dan serial berada di
 * ruang penomoran berbeda — id 5920 valid untuk keduanya dan menunjuk judul
 * yang sama sekali berbeda. Tanpa `kind`, layar bisa memuat judul yang salah
 * tanpa error apa pun.
 */
export default function MovieInfoScreen() {
  const { id, kind, source } = useLocalSearchParams<{
    id: string;
    kind?: string;
    source?: string;
  }>();
  const router = useRouter();
  const isTV = kind === 'tv';

  // Hanya judul TMDB yang punya layar detail di fase 2. LK21 dan Goku memakai
  // slug, bukan id TMDB, jadi memanggil endpoint TMDB dengan slug itu hanya
  // menghasilkan 404 dan layar error yang membingungkan.
  const supported = !source || source === 'tmdb';

  const { data, status, error, refresh } = useCatalog(
    'title',
    `${isTV ? 'tv' : 'movie'}:${id}`,
    useCallback(
      async () => unwrap(await (isTV ? getTVDetailsTMDB(id) : getMovieDetailsTMDB(id))),
      [id, isTV]
    ),
    Boolean(id) && supported
  );

  const info = useMemo(() => data ?? {}, [data]);
  const title = info?.title || info?.name || (isTV ? 'Serial' : 'Film');

  const [musimAktif, setMusimAktif] = useState(1);

  const seasons = useMemo(() => {
    const list = info?.seasons;
    if (!Array.isArray(list)) return [];
    // Season 0 adalah "Specials" di TMDB dan hampir selalu tidak punya sumber
    // stream; menampilkannya hanya menghasilkan jalan buntu.
    return list.filter((se: { season_number?: number }) => (se?.season_number ?? 0) > 0);
  }, [info]);

  // Semua hook di atas dipanggil tanpa syarat — return lebih awal baru boleh
  // setelah titik ini.
  if (!supported) {
    return (
      <View style={s.screen}>
        <Stack.Screen options={{ title: 'Belum didukung' }} />
        <EmptyState
          title="Sumber ini belum didukung"
          body={`Judul dari penyedia "${source}" belum punya halaman detail di aplikasi. Untuk sekarang, buka lewat soora.fun.`}
        />
      </View>
    );
  }

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
        <Stack.Screen options={{ title: isTV ? 'Serial' : 'Film' }} />
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  const poster = info?.poster_path
    ? `https://image.tmdb.org/t/p/w342${info.poster_path}`
    : info?.image;
  const backdrop = info?.backdrop_path
    ? `https://image.tmdb.org/t/p/w780${info.backdrop_path}`
    : info?.cover;

  /**
   * Episode dibentuk dari `episode_count` musim, bukan dari panggilan API
   * terpisah. Yang dibutuhkan untuk menavigasi ke pemutar hanya nomornya,
   * jadi mengambil detail tiap musim berarti satu request tambahan yang
   * hasilnya tidak dipakai.
   */
  const episodeMusim = useMemo(() => {
    const se = seasons.find(
      (x: { season_number?: number }) => (x.season_number ?? 1) === musimAktif
    );
    const n = Number(se?.episode_count ?? 0);
    if (!Number.isFinite(n) || n <= 0) return [];
    return Array.from({ length: n }, (_, i) => ({ id: String(i + 1), number: i + 1 }));
  }, [seasons, musimAktif]);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Stack.Screen options={{ title }} />

      <DetailHeader
        title={title}
        poster={resolveImage(tmdbSize(poster, 'w342'))}
        backdrop={backdrop ? resolveImage(backdrop) : undefined}
        meta={[
          isTV ? 'Serial' : 'Film',
          (info?.release_date || info?.first_air_date || '').slice(0, 4),
          info?.vote_average ? `${Math.round(info.vote_average * 10)}%` : '',
        ].filter(Boolean)}
        synopsis={info?.overview}
      />

      <SaveButton
        item={{ id: String(id), listType: isTV ? 'tv' : 'movie', title, poster }}
      />
      <WatchLaterButton
        item={{ id: String(id), listType: isTV ? 'tv' : 'movie', title, poster }}
      />

      {/* Objek genre TMDB diteruskan apa adanya: id numeriknya yang dipakai
          discover, dan mengubahnya jadi nama lebih dulu membuang id itu. */}
      <GenreChips genres={info?.genres ?? []} kind={isTV ? 'tv' : 'movie'} />

      {isTV && seasons.length > 0 ? (
        <>
          <SectionTitle>Musim</SectionTitle>
          {/* Pemilih musim berupa pil, lalu grid episodenya muncul di bawah.
              Sebelumnya tiap musim adalah baris yang langsung melompat ke
              episode 1 — tidak ada cara memilih episode tertentu sama sekali. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.musimBaris}
          >
            {seasons.map(
              (se: { id?: number; season_number?: number; name?: string; episode_count?: number }) => {
                const nomor = se.season_number ?? 1;
                const aktif = nomor === musimAktif;
                return (
                  <Pressable
                    key={se.id ?? nomor}
                    onPress={() => setMusimAktif(nomor)}
                    style={[s.musimChip, aktif && s.musimAktif]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: aktif }}
                    accessibilityLabel={se.name ?? `Musim ${nomor}`}
                  >
                    <Text style={[s.musimTeks, aktif && s.musimTeksAktif]}>
                      {se.name ?? `Musim ${nomor}`}
                    </Text>
                  </Pressable>
                );
              }
            )}
          </ScrollView>

          <SectionTitle>Episode</SectionTitle>
          <EpisodeGrid
            episodes={episodeMusim}
            onPilih={(ep) =>
              router.push(
                `/watch/${encodeURIComponent(String(id))}?kind=tv` +
                  `&season=${musimAktif}&ep=${ep.number ?? 1}` +
                  `&title=${encodeURIComponent(
                    `${title} — S${musimAktif}E${ep.number ?? 1}`
                  )}` as never
              )
            }
          />
        </>
      ) : (
        <>
          <SectionTitle>Tonton</SectionTitle>
          <ListRow
            label="Putar film"
            onPress={() =>
              router.push(
                `/watch/${encodeURIComponent(String(id))}?kind=movie&title=${encodeURIComponent(
                  title
                )}` as never
              )
            }
          />
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: space.xxxl },
  musimBaris: { gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm },
  musimChip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  musimAktif: { backgroundColor: colors.accent, borderColor: colors.accent },
  musimTeks: { color: colors.textMuted, fontSize: font.size.sm, fontWeight: font.weight.medium },
  musimTeksAktif: { color: onAccent },
});
