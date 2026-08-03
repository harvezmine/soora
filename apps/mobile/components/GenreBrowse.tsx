import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getTMDBGenres, getSubIndoHomeBundle } from '@soora/core/api';
import { unwrap } from '@soora/core/models';
import { useCatalog } from '../lib/useCatalog';
import { colors, font, radius, space } from '../theme/tokens';

type Genre = { slug: string; nama: string; kind: 'anime' | 'movie' };

/**
 * Jelajah per genre di layar Cari.
 *
 * Dua sumber berbeda karena backend tidak punya satu daftar genre bersama:
 * - Film memakai endpoint genre TMDB, yang mengembalikan id numerik — dan id
 *   itulah yang wajib dipakai `discover`, bukan namanya.
 * - Anime diturunkan dari `genreList` pada item di bundle beranda. Tidak ada
 *   endpoint daftar genre untuk Samehadaku, dan bundelnya hampir selalu sudah
 *   ada di cache sehingga ini tidak menambah request.
 *
 * Manga sengaja tidak ada: backend belum punya endpoint jelajah genre manga,
 * dan chip yang membuka layar kosong lebih buruk daripada tidak ada chip.
 */
export function GenreBrowse() {
  const router = useRouter();

  const { data } = useCatalog(
    'home',
    'genre:daftar',
    useCallback(async () => {
      const [tmdb, anime] = await Promise.allSettled([
        getTMDBGenres(),
        getSubIndoHomeBundle(),
      ]);
      return {
        tmdb: tmdb.status === 'fulfilled' ? unwrap(tmdb.value) : null,
        anime: anime.status === 'fulfilled' ? unwrap(anime.value) : null,
      };
    }, [])
  );

  const genres: Genre[] = useMemo(() => {
    const out: Genre[] = [];

    const film = (data?.tmdb as { id: number; name: string }[] | null) ?? [];
    if (Array.isArray(film)) {
      out.push(
        ...film.slice(0, 12).map((g) => ({
          slug: String(g.id),
          nama: String(g.name),
          kind: 'movie' as const,
        }))
      );
    }

    const bundle = (data?.anime ?? {}) as Record<string, unknown>;
    const semuaItem = [bundle.ongoing, bundle.popular, bundle.recent]
      .filter(Array.isArray)
      .flat() as { genreList?: { title?: string }[] }[];
    const namaAnime = new Set<string>();
    for (const it of semuaItem) {
      for (const g of it?.genreList ?? []) {
        const n = String(g?.title ?? '').trim();
        if (n) namaAnime.add(n);
      }
    }
    out.push(
      ...Array.from(namaAnime)
        .slice(0, 12)
        .map((n) => ({
          slug: n.toLowerCase().replace(/\s+/g, '-'),
          nama: n,
          kind: 'anime' as const,
        }))
    );

    return out;
  }, [data]);

  if (genres.length === 0) return null;

  const anime = genres.filter((g) => g.kind === 'anime');
  const film = genres.filter((g) => g.kind === 'movie');

  return (
    <View style={s.wadah}>
      {anime.length > 0 ? <Kelompok judul="Genre anime" genres={anime} onPilih={router.push} /> : null}
      {film.length > 0 ? <Kelompok judul="Genre film" genres={film} onPilih={router.push} /> : null}
    </View>
  );
}

function Kelompok({
  judul,
  genres,
  onPilih,
}: {
  judul: string;
  genres: Genre[];
  onPilih: (href: never) => void;
}) {
  return (
    <View style={s.kelompok}>
      <Text style={s.judul}>{judul}</Text>
      {/* Dibungkus ke baris berikutnya, bukan digulir mendatar: ini daftar
          untuk dipindai seluruhnya, bukan katalog yang dijelajahi. */}
      <View style={s.baris}>
        {genres.map((g) => (
          <Pressable
            key={`${g.kind}:${g.slug}`}
            onPress={() =>
              onPilih({
                pathname: '/genre/[slug]',
                params: { slug: g.slug, label: g.nama, kind: g.kind },
              } as never)
            }
            style={({ pressed }) => [s.chip, pressed && s.ditekan]}
            // Chip 40dp; hitSlop menaikkan area sentuh efektif ke 48dp tanpa
            // membuat deretan dua baris terlihat seperti dinding tombol.
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`Jelajahi genre ${g.nama}`}
          >
            <Text style={s.teks}>{g.nama}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wadah: { gap: space.lg, paddingTop: space.lg },
  kelompok: { gap: space.sm },
  judul: {
    color: colors.text,
    fontSize: font.size.base,
    fontWeight: '700',
    letterSpacing: 0.2,
    paddingHorizontal: space.lg,
  },
  baris: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  chip: {
    // 40dp, di bawah MIN_TOUCH tapi hitSlop menutupinya; chip setinggi 48dp
    // membuat deretan dua baris terasa seperti dinding tombol.
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ditekan: { opacity: 0.7, borderColor: colors.accent },
  teks: { color: colors.textMuted, fontSize: font.size.sm, fontWeight: '500' },
});
