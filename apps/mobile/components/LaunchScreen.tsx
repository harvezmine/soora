import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
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
import { colors } from '../theme/tokens';

/** Berapa lama layar sambutan bertahan sebelum memudar. */
const TAHAN_MS = 1000;
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
 * Logonya adalah berkas gambar yang sama persis, tidak digambar ulang. Yang
 * dianimasikan hanyalah komposisinya: cahaya di belakang berdenyut, wordmark
 * masuk dengan membesar halus. Menggambar ulang logo sebagai vektor akan
 * menghasilkan bentuk yang mirip tapi tidak identik dengan logo aslinya.
 *
 * Sengaja TIDAK menunggu data apa pun. Menahan layar sambutan sampai request
 * pertama selesai berarti user dengan sinyal buruk menatap logo belasan detik;
 * layar beranda punya skeleton-nya sendiri untuk itu.
 */
export function LaunchScreen({ onSelesai }: Props) {
  const { width } = useWindowDimensions();
  const opacity = useSharedValue(1);
  const skala = useSharedValue(0.86);
  const masuk = useSharedValue(0);
  const cahaya = useSharedValue(0.35);

  useEffect(() => {
    // Wordmark masuk dengan membesar halus — memberi kesan app sedang bangun,
    // bukan gambar diam yang membeku.
    skala.value = withTiming(1, { duration: 620, easing: Easing.out(Easing.back(1.4)) });
    masuk.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) });

    // Cahaya di belakang logo berdenyut pelan. Ini menggantikan halo yang ada
    // di berkas logo asli — halo itu sengaja dihapus saat latar dijadikan
    // transparan, karena versi yang dibuat di sini lebih tajam dan ikut skala.
    cahaya.value = withDelay(
      260,
      withRepeat(
        withSequence(
          withTiming(0.85, { duration: 760, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.4, { duration: 760, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      )
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
    // Sengaja sekali jalan: nilainya disimpan di shared value, jadi menjalankan
    // ulang effect akan mengulang animasi dari awal tiap render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gayaLuar = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const gayaLogo = useAnimatedStyle(() => ({
    opacity: masuk.value,
    transform: [{ scale: skala.value }],
  }));
  const gayaCahaya = useAnimatedStyle(() => ({
    opacity: cahaya.value,
    transform: [{ scale: 0.9 + cahaya.value * 0.25 }],
  }));

  const lebarLogo = Math.min(width * 0.72, 340);

  return (
    <Animated.View style={[s.lapisan, gayaLuar]} pointerEvents="none">
      <Animated.View style={[s.cahaya, { width: lebarLogo, height: lebarLogo }, gayaCahaya]} />
      <Animated.View style={gayaLogo}>
        <Image
          source={require('../assets/logo-wordmark.png')}
          style={{ width: lebarLogo, height: lebarLogo * RASIO }}
          contentFit="contain"
          // Aset lokal; transisi hanya menambah kedip yang tidak perlu.
          transition={0}
        />
      </Animated.View>
    </Animated.View>
  );
}

/** Tinggi dibagi lebar berkas logo-wordmark.png (1024x458). */
const RASIO = 458 / 1024;

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
  cahaya: {
    position: 'absolute',
    borderRadius: 999,
    // Jingga merek dari huruf S. Radius besar dengan opasitas rendah membaca
    // sebagai cahaya, bukan sebagai lingkaran.
    backgroundColor: '#ff6b4a',
    opacity: 0.4,
  },
});
