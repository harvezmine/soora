import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Poster, type ImageSource } from './Poster';
import { colors, font, radius, space } from '../theme/tokens';

export type MediaItem = {
  id: string;
  title: string;
  poster: ImageSource;
  backdrop?: ImageSource;
  kind: 'anime' | 'movie' | 'tv' | 'manga';
  source: string;
  badge?: string;
  rating?: number;
  subtitle?: string;
};

/** Lebar kartu di baris horizontal. 2:3 adalah rasio poster standar. */
export const CARD_WIDTH = 118;
export const CARD_HEIGHT = CARD_WIDTH * 1.5;

/** Rute detail per jenis media. */
export function hrefFor(item: MediaItem): string {
  const id = encodeURIComponent(item.id);
  if (item.kind === 'manga') return `/manga/${id}`;
  if (item.kind === 'anime') return `/anime/${id}`;
  return `/movie/${id}?kind=${item.kind}`;
}

/**
 * Kartu katalog.
 *
 * Di-memo karena FlashList merender ulang sel saat menggulir, dan kartu ini
 * dipakai ratusan kali per layar.
 */
export const MediaCard = memo(function MediaCard({ item }: { item: MediaItem }) {
  const router = useRouter();

  return (
    <Pressable
      // Seluruh kartu adalah area sentuh — jauh di atas minimum 48dp.
      style={({ pressed }) => [s.wrap, pressed && s.pressed]}
      onPress={() => router.push(hrefFor(item) as never)}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View style={s.posterBox}>
        <Poster source={item.poster} recyclingKey={item.id} />
        {item.badge ? (
          <View style={s.badge}>
            <Text style={s.badgeText} numberOfLines={1}>
              {item.badge}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={s.title} numberOfLines={2}>
        {item.title}
      </Text>
      {item.subtitle ? (
        <Text style={s.subtitle} numberOfLines={1}>
          {item.subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
});

const s = StyleSheet.create({
  wrap: { width: CARD_WIDTH },
  // Hanya opacity: transform akan menggeser tetangganya saat menggulir.
  pressed: { opacity: 0.7 },
  posterBox: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  badge: {
    position: 'absolute',
    left: space.xs,
    bottom: space.xs,
    paddingHorizontal: space.xs + 2,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.75)',
    maxWidth: CARD_WIDTH - space.sm,
  },
  badgeText: { color: colors.text, fontSize: font.size.xs, fontWeight: '600' },
  title: {
    color: colors.text,
    fontSize: font.size.sm,
    marginTop: space.xs,
    lineHeight: font.size.sm * font.lineHeight.tight,
  },
  subtitle: { color: colors.textDim, fontSize: font.size.xs, marginTop: 2 },
});
