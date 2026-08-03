import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { colors, font, space } from '../theme/tokens';

/** Berapa lama layar sambutan bertahan sebelum memudar. */
const TAHAN_MS = 900;
const PUDAR_MS = 420;

type Props = {
  /** Dipanggil setelah animasi pudar selesai dan komponen boleh dilepas. */
  onSelesai: () => void;
};

/**
 * Layar sambutan bermerek saat app pertama dibuka.
 *
 * Splash native (expo-splash-screen) tetap dipakai dan tampil lebih dulu — ia
 * muncul seketika, sebelum JS sempat berjalan, dan itulah yang mencegah kedip
 * putih. Masalahnya splash native hilang begitu bundel siap, sering terlalu
 * cepat untuk sempat terbaca.
 *
 * Komponen ini mengambil alih tepat setelahnya dengan gambar yang sama, lalu
 * memudar. Karena latar dan ikonnya identik dengan splash native, peralihannya
 * tidak terlihat sebagai dua layar berbeda.
 *
 * Sengaja TIDAK menunggu data apa pun. Menahan layar sambutan sampai request
 * pertama selesai berarti user dengan sinyal buruk menatap logo belasan detik;
 * layar beranda punya skeleton-nya sendiri untuk itu.
 */
export function LaunchScreen({ onSelesai }: Props) {
  const opacity = useSharedValue(1);
  const skala = useSharedValue(0.92);
  const denyut = useSharedValue(0.35);

  useEffect(() => {
    // Logo membesar sedikit saat masuk — memberi kesan app sedang bangun,
    // bukan gambar diam yang membeku.
    skala.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });

    denyut.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 620, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.35, { duration: 620, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );

    opacity.value = withDelay(
      TAHAN_MS,
      withTiming(0, { duration: PUDAR_MS, easing: Easing.in(Easing.quad) }, (selesai) => {
        'worklet';
        // Callback animasi berjalan di UI thread; setState harus dilempar
        // kembali ke JS thread atau app akan crash.
        if (selesai) runOnJS(onSelesai)();
      })
    );
    // Sengaja sekali jalan: nilai animasi disimpan di shared value, jadi
    // menjalankan ulang effect akan mengulang animasi dari awal tiap render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gayaLuar = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const gayaLogo = useAnimatedStyle(() => ({ transform: [{ scale: skala.value }] }));
  const gayaDenyut = useAnimatedStyle(() => ({ opacity: denyut.value }));

  return (
    <Animated.View style={[s.lapisan, gayaLuar]} pointerEvents="none">
      <Animated.View style={gayaLogo}>
        <Image
          source={require('../assets/icon.png')}
          style={s.logo}
          contentFit="contain"
          // Aset lokal; transisi hanya menambah kedip yang tidak perlu.
          transition={0}
        />
      </Animated.View>

      <Text style={s.nama}>Soora</Text>
      <Animated.Text style={[s.tagline, gayaDenyut]}>Anime · Film · Manga</Animated.Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  lapisan: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // Sama persis dengan backgroundColor splash native di app.config.ts.
    // Kalau beda sedikit saja, peralihannya terlihat sebagai kedipan.
    backgroundColor: colors.bg,
    zIndex: 100,
  },
  logo: { width: 108, height: 108 },
  nama: {
    color: colors.text,
    fontSize: font.size.xxl,
    fontWeight: font.weight.bold,
    letterSpacing: 1,
    marginTop: space.lg,
  },
  tagline: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    letterSpacing: 2,
    marginTop: space.sm,
  },
});
