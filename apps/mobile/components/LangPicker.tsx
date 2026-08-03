import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, onAccent, radius, space, MIN_TOUCH } from '../theme/tokens';

export type LangOption<T extends string> = { id: T; label: string };

type Props<T extends string> = {
  options: LangOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Label yang dibacakan screen reader untuk kelompoknya. */
  label: string;
};

/**
 * Deret pil untuk memilih bahasa.
 *
 * Pil, bukan dropdown: hanya ada dua pilihan, dan dropdown menyembunyikan
 * keduanya di balik satu ketukan tambahan sekaligus menyembunyikan fakta bahwa
 * pilihan itu ada. Pilihan aktif ditandai warna DAN `accessibilityState`, tidak
 * warna saja.
 */
export function LangPicker<T extends string>({ options, value, onChange, label }: Props<T>) {
  return (
    <View style={s.baris} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const aktif = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            style={({ pressed }) => [s.pil, aktif && s.pilAktif, pressed && s.ditekan]}
            accessibilityRole="radio"
            accessibilityState={{ selected: aktif }}
            accessibilityLabel={o.label}
          >
            <Text style={[s.teks, aktif && s.teksAktif]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  baris: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  pil: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pilAktif: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  ditekan: { opacity: 0.7 },
  teks: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
  },
  teksAktif: { color: onAccent },
});
