import { StyleSheet, Pressable, Text, View } from 'react-native';
import {
  ArrowLeft,
  Captions,
  Gauge,
  Layers,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
} from 'lucide-react-native';
import { SeekBar } from './SeekBar';
import { colors, font, iconSize, iconStroke, radius, space, MIN_TOUCH } from '../../theme/tokens';

/** Detik → `1:02:03` atau `2:05`. Jam disembunyikan untuk durasi pendek. */
export function formatWaktu(detik: number): string {
  if (!Number.isFinite(detik) || detik < 0) return '0:00';
  const total = Math.floor(detik);
  const j = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const d = total % 60;
  const dd = String(d).padStart(2, '0');
  return j > 0 ? `${j}:${String(m).padStart(2, '0')}:${dd}` : `${m}:${dd}`;
}

type Props = {
  judul?: string;
  bermain: boolean;
  posisi: number;
  durasi: number;
  buffered: number;
  penuh: boolean;
  onPlayPause: () => void;
  onSeek: (detik: number) => void;
  onScrub: (detik: number) => void;
  onLompat: (delta: number) => void;
  onKembali: () => void;
  onPenuh: () => void;
  onSheet: (jenis: 'audio' | 'subtitle' | 'speed') => void;
  /** Ruang aman perangkat, supaya kontrol tidak masuk ke area notch. */
  inset: { top: number; bottom: number; left: number; right: number };
};

/**
 * Lapisan kontrol pemutar.
 *
 * Menggantikan `nativeControls` ExoPlayer. Kontrol bawaan tidak bisa diberi
 * tombol kembali, tidak mengenal tema app, dan menaruh tombol audio/subtitle di
 * bar terpisah di luar video — di layar ponsel itu memakan tinggi yang justru
 * paling langka.
 *
 * Semua elemen sentuh berukuran MIN_TOUCH. Pada kontrol bawaan, tombol seek
 * berdiameter sekitar 24 dp dan sering meleset.
 */
export function PlayerControls({
  judul,
  bermain,
  posisi,
  durasi,
  buffered,
  penuh,
  onPlayPause,
  onSeek,
  onScrub,
  onLompat,
  onKembali,
  onPenuh,
  onSheet,
  inset,
}: Props) {
  const sisi = { paddingLeft: inset.left + space.md, paddingRight: inset.right + space.md };

  return (
    <View style={s.lapisan} pointerEvents="box-none">
      {/* Gradien palsu dua lapis: latar gelap hanya di tepi atas dan bawah,
          supaya teks kontrol tetap terbaca di atas adegan terang tanpa
          menggelapkan bagian tengah gambar. */}
      <View style={[s.atas, sisi, { paddingTop: inset.top + space.sm }]}>
        <Pressable
          onPress={onKembali}
          style={s.ikonBtn}
          hitSlop={space.sm}
          accessibilityRole="button"
          accessibilityLabel="Kembali"
        >
          <ArrowLeft size={iconSize.md} color={colors.text} strokeWidth={iconStroke} />
        </Pressable>
        {judul ? (
          <Text style={s.judul} numberOfLines={1}>
            {judul}
          </Text>
        ) : (
          <View style={s.isi} />
        )}
        <Pressable
          onPress={() => onSheet('audio')}
          style={s.ikonBtn}
          accessibilityRole="button"
          accessibilityLabel="Pilih trek audio"
        >
          <Layers size={iconSize.md} color={colors.text} strokeWidth={iconStroke} />
        </Pressable>
        <Pressable
          onPress={() => onSheet('subtitle')}
          style={s.ikonBtn}
          accessibilityRole="button"
          accessibilityLabel="Pilih subtitle"
        >
          <Captions size={iconSize.md} color={colors.text} strokeWidth={iconStroke} />
        </Pressable>
        <Pressable
          onPress={() => onSheet('speed')}
          style={s.ikonBtn}
          accessibilityRole="button"
          accessibilityLabel="Kecepatan pemutaran"
        >
          <Gauge size={iconSize.md} color={colors.text} strokeWidth={iconStroke} />
        </Pressable>
      </View>

      <View style={s.tengah} pointerEvents="box-none">
        <Pressable
          onPress={() => onLompat(-10)}
          style={s.lompatBtn}
          accessibilityRole="button"
          accessibilityLabel="Mundur 10 detik"
        >
          <RotateCcw size={iconSize.lg} color={colors.text} strokeWidth={iconStroke} />
          <Text style={s.lompatTeks}>10</Text>
        </Pressable>

        <Pressable
          onPress={onPlayPause}
          style={s.mainBtn}
          accessibilityRole="button"
          accessibilityLabel={bermain ? 'Jeda' : 'Putar'}
        >
          {bermain ? (
            <Pause size={34} color={colors.text} strokeWidth={iconStroke} fill={colors.text} />
          ) : (
            <Play size={34} color={colors.text} strokeWidth={iconStroke} fill={colors.text} />
          )}
        </Pressable>

        <Pressable
          onPress={() => onLompat(10)}
          style={s.lompatBtn}
          accessibilityRole="button"
          accessibilityLabel="Maju 10 detik"
        >
          <RotateCw size={iconSize.lg} color={colors.text} strokeWidth={iconStroke} />
          <Text style={s.lompatTeks}>10</Text>
        </Pressable>
      </View>

      <View style={[s.bawah, sisi, { paddingBottom: inset.bottom + space.sm }]}>
        <View style={s.barisWaktu}>
          {/* Angka tabular: tanpa itu lebar teks berubah tiap detik dan
              seluruh baris bergeser-geser saat video berjalan. */}
          <Text style={s.waktu}>{formatWaktu(posisi)}</Text>
          <View style={s.isi} />
          <Text style={s.waktu}>{formatWaktu(durasi)}</Text>
          <Pressable
            onPress={onPenuh}
            style={s.ikonBtn}
            accessibilityRole="button"
            accessibilityLabel={penuh ? 'Keluar dari layar penuh' : 'Layar penuh'}
          >
            {penuh ? (
              <Minimize size={iconSize.md} color={colors.text} strokeWidth={iconStroke} />
            ) : (
              <Maximize size={iconSize.md} color={colors.text} strokeWidth={iconStroke} />
            )}
          </Pressable>
        </View>

        <SeekBar
          position={posisi}
          duration={durasi}
          buffered={buffered}
          onScrub={onScrub}
          onSeek={onSeek}
        />
      </View>
    </View>
  );
}

const ABSOLUT_ISI_PENUH = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

const s = StyleSheet.create({
  lapisan: { ...ABSOLUT_ISI_PENUH, justifyContent: 'space-between' },
  isi: { flex: 1 },

  atas: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingBottom: space.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  judul: {
    flex: 1,
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.semibold,
  },

  tengah: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxl,
  },
  mainBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  lompatBtn: {
    width: MIN_TOUCH + space.md,
    height: MIN_TOUCH + space.md,
    borderRadius: (MIN_TOUCH + space.md) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  lompatTeks: {
    position: 'absolute',
    color: colors.text,
    fontSize: 9,
    fontWeight: font.weight.bold,
    marginTop: 1,
  },

  bawah: {
    paddingTop: space.xl,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  barisWaktu: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  waktu: {
    color: colors.text,
    fontSize: font.size.sm,
    fontVariant: ['tabular-nums'],
  },

  ikonBtn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
});
