import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Play } from 'lucide-react-native';
import { Poster } from './Poster';
import { hrefFor, type MediaItem } from './MediaCard';
import { colors, font, iconSize, iconStroke, onAccent, radius, space, MIN_TOUCH } from '../theme/tokens';

/**
 * Kartu sorotan di puncak Beranda.
 *
 * Memakai backdrop kalau ada; kalau tidak, poster. Gradien gelap di bawah
 * memastikan judul tetap terbaca berapa pun terangnya gambar — tanpa itu,
 * judul putih di atas poster cerah bisa turun jauh di bawah rasio kontras 4.5:1.
 */
export function HeroSpotlight({ item }: { item: MediaItem }) {
  const router = useRouter();

  return (
    <Pressable
      style={({ pressed }) => [s.wrap, pressed && s.pressed]}
      onPress={() => router.push(hrefFor(item) as never)}
      accessibilityRole="button"
      accessibilityLabel={`Sorotan: ${item.title}`}
    >
      <Poster source={item.backdrop ?? item.poster} recyclingKey={`hero-${item.id}`} />

      <LinearGradient
        colors={['transparent', 'rgba(6,6,14,0.75)', colors.bg]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={s.info}>
        <Text style={s.title} numberOfLines={2}>
          {item.title}
        </Text>
        {item.subtitle ? <Text style={s.meta}>{item.subtitle}</Text> : null}
        <View style={s.cta}>
          <Play size={iconSize.sm} color={onAccent} strokeWidth={iconStroke} fill={onAccent} />
          <Text style={s.ctaText}>Lihat detail</Text>
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: {
    height: 260,
    marginHorizontal: space.lg,
    marginTop: space.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  pressed: { opacity: 0.9 },
  info: { position: 'absolute', left: space.lg, right: space.lg, bottom: space.lg, gap: space.xs },
  title: { color: colors.text, fontSize: font.size.xl, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: font.size.sm },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    alignSelf: 'flex-start',
    minHeight: MIN_TOUCH,
    paddingHorizontal: space.xl,
    marginTop: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  ctaText: { color: onAccent, fontSize: font.size.md, fontWeight: '600' },
});
