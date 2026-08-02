import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
  ReduceMotion,
} from 'react-native-reanimated';
import { CARD_HEIGHT, CARD_WIDTH } from './MediaCard';
import { colors, motion, radius, space } from '../theme/tokens';

/**
 * Skeleton hanya ditampilkan saat cache benar-benar kosong.
 *
 * Kalau ada data tersimpan, layar merender data itu seketika dan menyegarkan
 * di belakang — itu inti kenapa app terasa lebih cepat dari web. Menampilkan
 * skeleton padahal data cache tersedia justru membuang keunggulan tersebut.
 */
function useShimmer() {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      // ReduceMotion.System menghormati pengaturan aksesibilitas perangkat:
      // saat "kurangi gerak" aktif, denyutnya tidak dijalankan.
      withTiming(0.85, { duration: motion.slow * 2, reduceMotion: ReduceMotion.System }),
      -1,
      true
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

function Block({ w, h, r = radius.md }: { w: number | string; h: number; r?: number }) {
  const style = useShimmer();
  return (
    <Animated.View
      style={[{ width: w as number, height: h, borderRadius: r }, s.block, style]}
    />
  );
}

export function SkeletonRow({ title = true }: { title?: boolean }) {
  return (
    <View style={s.section}>
      {title ? <Block w={140} h={18} r={radius.sm} /> : null}
      <View style={s.row}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={s.card}>
            <Block w={CARD_WIDTH} h={CARD_HEIGHT} />
            <Block w={CARD_WIDTH - 20} h={12} r={radius.sm} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function SkeletonHero() {
  return (
    <View style={s.hero}>
      <Block w="100%" h={220} r={radius.lg} />
    </View>
  );
}

export function SkeletonGrid({ count = 9 }: { count?: number }) {
  return (
    <View style={s.grid}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={s.card}>
          <Block w={CARD_WIDTH} h={CARD_HEIGHT} />
          <Block w={CARD_WIDTH - 20} h={12} r={radius.sm} />
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  block: { backgroundColor: colors.surfaceRaised },
  section: { gap: space.md, paddingHorizontal: space.lg, paddingTop: space.lg },
  row: { flexDirection: 'row', gap: space.md },
  card: { gap: space.xs },
  hero: { paddingHorizontal: space.lg, paddingTop: space.lg },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    padding: space.lg,
  },
});
