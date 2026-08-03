import { useCallback, useMemo } from 'react';
import { discoverByGenre, getSubIndoGenre } from '@soora/core/api';
import { normalizeList, unwrap } from '@soora/core/models';
import { useCatalog } from '../lib/useCatalog';
import { SectionRow } from './SectionRow';

type Props = {
  /** Id judul yang sedang dibuka — dikeluarkan dari hasil. */
  idSekarang: string;
  kind: 'anime' | 'movie' | 'tv';
  /** Genre pertama dipakai sebagai dasar kemiripan. */
  genres: (string | { id?: number | string; name?: string })[];
};

/**
 * Baris "Serupa" di bawah halaman detail.
 *
 * Memakai genre pertama sebagai dasar, sama seperti web — tidak ada endpoint
 * rekomendasi khusus di backend, dan genre adalah kemiripan yang paling murah
 * sekaligus paling bisa dijelaskan ke user.
 *
 * Tidak merender apa pun kalau genre kosong atau hasilnya nihil. Baris kosong
 * berjudul "Serupa" lebih buruk daripada tidak ada baris sama sekali.
 */
export function SerupaRow({ idSekarang, kind, genres }: Props) {
  const pertama = genres[0];
  const slug =
    typeof pertama === 'string'
      ? pertama.trim().toLowerCase().replace(/\s+/g, '-')
      : String(pertama?.id ?? pertama?.name ?? '');

  const { data } = useCatalog(
    'search',
    `serupa:${kind}:${slug}`,
    useCallback(async () => {
      if (kind === 'anime') return unwrap(await getSubIndoGenre(slug));
      return unwrap(await discoverByGenre(slug, 1, kind === 'tv' ? 'tv' : 'movie'));
    }, [slug, kind]),
    Boolean(slug)
  );

  const items = useMemo(() => {
    const d = data as { results?: unknown; animeList?: unknown } | null;
    if (!d) return [];
    const list =
      kind === 'anime'
        ? normalizeList(d.animeList ?? d.results, 'anime', 'samehadaku')
        : normalizeList(d.results, kind === 'tv' ? 'tv' : 'movie', 'tmdb');
    // Judul yang sedang dibuka selalu ikut muncul di hasil genre-nya sendiri.
    return list.filter((x) => String(x.id) !== String(idSekarang)).slice(0, 20);
  }, [data, kind, idSekarang]);

  if (items.length === 0) return null;

  return <SectionRow title="Serupa" items={items} />;
}
