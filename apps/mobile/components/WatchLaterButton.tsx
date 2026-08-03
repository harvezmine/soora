import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Clock, Check } from 'lucide-react-native';
import { inWatchLater, toggleWatchLater, type WatchLaterItem } from '../lib/watchLater';
import { colors, font, iconSize, iconStroke, radius, space, MIN_TOUCH } from '../theme/tokens';

type Props = { item: Omit<WatchLaterItem, 'addedAt'> };

/**
 * Tombol "Tonton nanti".
 *
 * Terpisah dari SaveButton karena kedua daftarnya berbeda maksud: Daftar Saya
 * adalah koleksi, ini antrean. Lihat catatan di lib/watchLater.ts.
 */
export function WatchLaterButton({ item }: Props) {
  const [ada, setAda] = useState(() => inWatchLater(item.id, item.listType));

  return (
    <Pressable
      onPress={() => setAda(toggleWatchLater(item))}
      style={({ pressed }) => [s.tombol, ada && s.aktif, pressed && s.ditekan]}
      accessibilityRole="button"
      accessibilityState={{ selected: ada }}
      accessibilityLabel={ada ? 'Hapus dari Tonton nanti' : 'Tambahkan ke Tonton nanti'}
    >
      {ada ? (
        <Check size={iconSize.sm} color={colors.text} strokeWidth={iconStroke} />
      ) : (
        <Clock size={iconSize.sm} color={colors.textMuted} strokeWidth={iconStroke} />
      )}
      <Text style={[s.teks, ada && s.teksAktif]}>{ada ? 'Di antrean' : 'Tonton nanti'}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  tombol: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: MIN_TOUCH,
    marginHorizontal: space.lg,
    marginTop: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  aktif: { borderColor: colors.accent, backgroundColor: 'rgba(225, 29, 72, 0.12)' },
  ditekan: { opacity: 0.75 },
  teks: { color: colors.textMuted, fontSize: font.size.md, fontWeight: font.weight.medium },
  teksAktif: { color: colors.text },
});
