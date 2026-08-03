import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-worklets';
import { colors, space } from '../../theme/tokens';

type Props = {
  position: number;
  duration: number;
  buffered: number;
  /** Dipanggil terus selama menyeret, untuk pratinjau waktu. */
  onScrub: (detik: number) => void;
  /** Dipanggil sekali saat jari diangkat — barulah player benar-benar seek. */
  onSeek: (detik: number) => void;
};

/**
 * Bilah waktu yang bisa diseret.
 *
 * Dibuat sendiri, bukan memakai @react-native-community/slider: slider itu
 * hanya menangani satu nilai, sementara di sini butuh dua lapis (progres dan
 * buffer) plus area sentuh yang jauh lebih tinggi daripada garisnya. Menambah
 * satu modul native untuk itu tidak sepadan.
 *
 * Seek sungguhan baru terjadi saat jari diangkat. Kalau seek dikirim tiap
 * frame, ExoPlayer akan membuang buffer berulang kali dan pemutaran tersendat
 * parah sepanjang seretan.
 */
export function SeekBar({ position, duration, buffered, onScrub, onSeek }: Props) {
  const [lebar, setLebar] = useState(0);
  const [seret, setSeret] = useState<number | null>(null);

  const aman = duration > 0 ? duration : 0;
  const tampil = seret ?? position;
  const rasio = aman > 0 ? Math.min(1, Math.max(0, tampil / aman)) : 0;
  const rasioBuffer = aman > 0 ? Math.min(1, Math.max(0, buffered / aman)) : 0;

  const keDetik = (x: number) => {
    if (lebar <= 0 || aman <= 0) return 0;
    return Math.min(aman, Math.max(0, (x / lebar) * aman));
  };

  const mulai = (x: number) => {
    const d = keDetik(x);
    setSeret(d);
    onScrub(d);
  };
  const gerak = (x: number) => {
    const d = keDetik(x);
    setSeret(d);
    onScrub(d);
  };
  const selesai = (x: number) => {
    const d = keDetik(x);
    setSeret(null);
    onSeek(d);
  };

  // Pan tanpa jarak minimum: mengetuk satu titik di bilah harus langsung
  // melompat ke sana, bukan menunggu jari digeser dulu.
  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      'worklet';
      runOnJS(mulai)(e.x);
    })
    .onUpdate((e) => {
      'worklet';
      runOnJS(gerak)(e.x);
    })
    .onFinalize((e) => {
      'worklet';
      runOnJS(selesai)(e.x);
    });

  return (
    <GestureDetector gesture={pan}>
      {/* Tinggi area sentuh jauh melebihi tebal garisnya: garis 4 px mustahil
          dikenai jari, dan memperbesar garisnya akan mengganggu tampilan. */}
      <View
        style={s.area}
        onLayout={(e) => setLebar(e.nativeEvent.layout.width)}
        accessibilityRole="adjustable"
        accessibilityLabel="Posisi pemutaran"
      >
        <View style={s.lintasan}>
          <View style={[s.buffer, { width: `${rasioBuffer * 100}%` }]} />
          <View style={[s.progres, { width: `${rasio * 100}%` }]} />
          <View style={[s.kenop, { left: `${rasio * 100}%` }, seret !== null && s.kenopAktif]} />
        </View>
      </View>
    </GestureDetector>
  );
}

const TEBAL = 4;
const KENOP = 14;

const s = StyleSheet.create({
  area: {
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: space.xs,
  },
  lintasan: {
    height: TEBAL,
    borderRadius: TEBAL / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.24)',
    justifyContent: 'center',
  },
  buffer: {
    position: 'absolute',
    height: TEBAL,
    borderRadius: TEBAL / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
  },
  progres: {
    position: 'absolute',
    height: TEBAL,
    borderRadius: TEBAL / 2,
    backgroundColor: colors.accent,
  },
  kenop: {
    position: 'absolute',
    width: KENOP,
    height: KENOP,
    borderRadius: KENOP / 2,
    marginLeft: -KENOP / 2,
    backgroundColor: colors.accent,
  },
  kenopAktif: {
    transform: [{ scale: 1.35 }],
  },
});
