import { StyleSheet, Text, View } from 'react-native';
import { colors, font, space } from '../theme/tokens';

/**
 * Layar kosong untuk rute yang kerangkanya sudah ada tapi isinya belum dibangun.
 *
 * Menyebut fase mana yang akan mengisinya, supaya jelas ini memang belum
 * dikerjakan — bukan fitur yang rusak.
 */
export function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <View style={s.wrap}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.note}>Dibangun di {phase}.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    gap: space.sm,
  },
  title: { color: colors.text, fontSize: font.size.lg, fontWeight: '600' },
  note: { color: colors.textMuted, fontSize: font.size.sm, textAlign: 'center' },
});
