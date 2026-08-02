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
import { CARD_HEIGHT, CARD_WIDTH, GRID_ASPECT } from './MediaCard';
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

function Block({
  w,
  h,
  r = radius.md,
  aspect = false,
}: {
  w: number | `${number}%`;
  h: number;
  r?: number;
  /** Pakai rasio poster 2:3 alih-alih tinggi tetap — untuk sel grid. */
  aspect?: boolean;
}) {
  const style = useShimmer();
  return (
    <Animated.View
      style={[
        aspect
          ? { width: w, aspectRatio: 1 / GRID_ASPECT, borderRadius: r }
          : { width: w, height: h, borderRadius: r },
        s.block,
        style,
      ]}
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
      {/* Tinggi harus sama dengan HeroSpotlight (260), kalau tidak seluruh
          isi Beranda melompat turun saat data mendarat. */}
      <Block w="100%" h={260} r={radius.lg} />
    </View>
  );
}

export function SkeletonGrid({ count = 9 }: { count?: number }) {
  // Tiga kolom, sama dengan MediaGrid. Versi sebelumnya memakai flexWrap
  // dengan lebar kartu tetap, yang di layar 360dp hanya muat dua kolom —
  // sehingga grid melompat dari 2 ke 3 kolom saat hasil pencarian mendarat.
  return (
    <View style={s.grid}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={s.gridCell}>
          <Block w="100%" h={0} r={radius.md} aspect />
          <Block w="70%" h={12} r={radius.sm} />
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  block: { backgroundColor: colors.surfaceRaised },
  // paddingTop disamakan dengan SectionRow (space.xl), bukan space.lg.
  section: { gap: space.md, paddingHorizontal: space.lg, paddingTop: space.xl },
  row: { flexDirection: 'row', gap: space.md },
  card: { gap: space.xs },
  hero: { paddingHorizontal: space.lg, paddingTop: space.lg },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
  },
  gridCell: { width: '33.33%', paddingHorizontal: space.xs, paddingBottom: space.lg, gap: space.xs },
});
