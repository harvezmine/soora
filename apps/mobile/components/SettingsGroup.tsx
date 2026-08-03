import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { colors, font, iconSize, iconStroke, radius, space, MIN_TOUCH } from '../theme/tokens';

/**
 * Kelompok pengaturan berbentuk kartu.
 *
 * Layar Profil sebelumnya satu tumpukan baris datar tanpa pengelompokan, jadi
 * "Keluar" berdiri sejajar dengan "Bersihkan cache" seolah keduanya sederajat.
 * Mengelompokkan membuat aksi berbahaya terpisah dari aksi biasa, dan judul
 * kelompok memberi tahu apa yang akan ditemukan tanpa perlu membaca semuanya.
 */
export function SettingsGroup({ judul, children }: { judul: string; children: ReactNode }) {
  return (
    <View style={s.kelompok}>
      <Text style={s.judulKelompok}>{judul}</Text>
      <View style={s.kartu}>{children}</View>
    </View>
  );
}

export function SettingsRow({
  ikon,
  label,
  sub,
  onPress,
  danger,
  disabled,
  /** Baris terakhir dalam kartu tidak diberi garis pemisah. */
  terakhir,
}: {
  ikon: ReactNode;
  label: string;
  sub?: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
  terakhir?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.baris,
        !terakhir && s.berGaris,
        pressed && s.ditekan,
        disabled && s.mati,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      accessibilityLabel={sub ? `${label}. ${sub}` : label}
    >
      <View style={[s.ikonKotak, danger && s.ikonBahaya]}>{ikon}</View>
      <View style={s.teksKotak}>
        <Text style={[s.label, danger && s.labelBahaya]}>{label}</Text>
        {sub ? (
          <Text style={s.sub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={iconSize.sm} color={colors.textDim} strokeWidth={iconStroke} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  kelompok: { gap: space.sm },
  judulKelompok: {
    color: colors.textDim,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: space.xs,
  },
  kartu: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  baris: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: MIN_TOUCH + 8,
    paddingHorizontal: space.md,
  },
  // Garis dimulai setelah ikon, bukan dari tepi kartu — pola yang sama dipakai
  // daftar pengaturan bawaan iOS dan Android, dan membuat ikon terbaca sebagai
  // satu kolom.
  berGaris: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  ditekan: { backgroundColor: colors.surfaceRaised },
  mati: { opacity: 0.5 },
  ikonKotak: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  ikonBahaya: { backgroundColor: 'rgba(239, 68, 68, 0.14)' },
  teksKotak: { flex: 1 },
  label: { color: colors.text, fontSize: font.size.md, fontWeight: font.weight.medium },
  labelBahaya: { color: colors.danger },
  sub: { color: colors.textDim, fontSize: font.size.xs, marginTop: 1 },
});
