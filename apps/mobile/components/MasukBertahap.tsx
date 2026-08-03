import type { ReactNode } from 'react';
import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useReduceMotion } from '../lib/useReduceMotion';

type Props = {
  children: ReactNode;
  /** Urutan blok di layar. Menentukan penundaannya. */
  indeks?: number;
};

/** Jeda antar blok. 45ms — cukup terbaca sebagai berurutan, belum terasa lambat. */
const JEDA_MS = 45;
/** Blok ke berapa yang masih ditunda. */
const MAKS_TERTUNDA = 6;

/**
 * Memunculkan blok beranda secara berurutan saat data tiba.
 *
 * Naik sedikit sambil memudar masuk, bukan sekadar muncul. Tanpa ini seluruh
 * halaman terpasang sekaligus dan terasa seperti berkedip.
 *
 * Penundaan dibatasi enam blok pertama: setelah itu blok berada di bawah
 * lipatan dan penundaannya hanya membuat gulungan pertama terasa kosong.
 *
 * Menghormati "kurangi gerak" — saat aktif, isinya langsung tampil tanpa
 * animasi sama sekali.
 */
export function MasukBertahap({ children, indeks = 0 }: Props) {
  const kurangiGerak = useReduceMotion();
  const maju = useSharedValue(kurangiGerak ? 1 : 0);

  useEffect(() => {
    if (kurangiGerak) {
      maju.value = 1;
      return;
    }
    maju.value = withDelay(
      Math.min(indeks, MAKS_TERTUNDA) * JEDA_MS,
      // 260ms dengan ease-out: gerak masuk melambat di ujung, itu yang membuat
      // elemen terasa mendarat alih-alih berhenti mendadak.
      withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) })
    );
  }, [kurangiGerak, indeks, maju]);

  const gaya = useAnimatedStyle(() => ({
    opacity: maju.value,
    // 12dp, bukan lebih: pergeseran besar menarik perhatian ke gerakannya
    // sendiri alih-alih ke isinya.
    transform: [{ translateY: (1 - maju.value) * 12 }],
  }));

  return <Animated.View style={gaya}>{children}</Animated.View>;
}
