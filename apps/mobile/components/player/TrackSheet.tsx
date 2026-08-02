import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { colors, font, iconSize, iconStroke, radius, space, MIN_TOUCH } from '../../theme/tokens';

export type SheetOption = { id: string; label: string; active?: boolean };

/**
 * Sheet pemilih trek — dipakai untuk kualitas, subtitle, dan kecepatan.
 *
 * Scrim gelap 60% supaya konten di belakang tidak bersaing dengan daftar,
 * dan ketukan di luar sheet menutupnya — dua hal yang diharapkan user dari
 * sheet di Android.
 */
export function TrackSheet({
  visible,
  title,
  options,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: SheetOption[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Tutup" />
      <View style={s.sheet}>
        <View style={s.handle} />
        <Text style={s.title}>{title}</Text>
        <ScrollView style={s.list}>
          {options.length === 0 ? (
            <Text style={s.empty}>Tidak ada pilihan untuk sumber ini.</Text>
          ) : (
            options.map((o) => (
              <Pressable
                key={o.id}
                style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
                onPress={() => onPick(o.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: Boolean(o.active) }}
              >
                <Text style={[s.rowText, o.active && s.rowActive]}>{o.label}</Text>
                {o.active ? (
                  <Check size={iconSize.sm} color={colors.accent} strokeWidth={iconStroke} />
                ) : null}
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: space.xl,
    maxHeight: '60%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginVertical: space.md,
  },
  title: {
    color: colors.text,
    fontSize: font.size.lg,
    fontWeight: '600',
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  list: { paddingHorizontal: space.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowText: { color: colors.text, fontSize: font.size.md },
  rowActive: { color: colors.accent, fontWeight: '600' },
  empty: { color: colors.textMuted, fontSize: font.size.sm, paddingVertical: space.lg },
});
