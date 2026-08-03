import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Download } from 'lucide-react-native';
import { checkForUpdate, type VersionInfo } from '../lib/updateCheck';
import { colors, font, iconSize, iconStroke, onAccent, radius, space, MIN_TOUCH } from '../theme/tokens';

/**
 * Pemberitahuan pembaruan APK.
 *
 * Ditampilkan sekali per pembukaan app, bukan pita yang menempel: distribusi
 * di luar Play Store berarti user harus mengunduh dan memasang manual, dan itu
 * keputusan yang layak diberi dialog, bukan disenggol lewat pita kecil.
 *
 * Kalau `mandatory`, dialog tidak bisa ditutup — dipakai untuk rilis yang
 * memperbaiki kerusakan, mis. saat penyedia berubah dan versi lama tidak bisa
 * memutar apa pun.
 */
export function UpdateBanner() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    void checkForUpdate().then((v) => {
      if (alive) setInfo(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!info || dismissed) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      // Tombol back Android tidak boleh menutup pembaruan wajib.
      onRequestClose={() => {
        if (!info.mandatory) setDismissed(true);
      }}
    >
      <View style={s.scrim}>
        <View style={s.card}>
          <Text style={s.title}>Versi baru tersedia</Text>
          <Text style={s.version}>
            {info.versionName ? `Versi ${info.versionName}` : `Build ${info.versionCode}`}
          </Text>

          {info.changelog ? (
            <ScrollView style={s.logBox}>
              <Text style={s.log}>{info.changelog}</Text>
            </ScrollView>
          ) : null}

          {info.mandatory ? (
            <Text style={s.mandatory}>
              Pembaruan ini wajib — versi yang kamu pakai sekarang sudah tidak berfungsi dengan
              benar.
            </Text>
          ) : null}

          <Pressable
            style={({ pressed }) => [s.btn, pressed && s.pressed]}
            onPress={() => void Linking.openURL(info.apkUrl)}
            accessibilityRole="button"
          >
            <Download size={iconSize.sm} color={onAccent} strokeWidth={iconStroke} />
            <Text style={s.btnText}>Unduh pembaruan</Text>
          </Pressable>

          {!info.mandatory && (
            <Pressable
              style={({ pressed }) => [s.later, pressed && s.pressed]}
              onPress={() => setDismissed(true)}
              accessibilityRole="button"
            >
              <Text style={s.laterText}>Nanti saja</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xl,
    gap: space.sm,
  },
  title: { color: colors.text, fontSize: font.size.lg, fontWeight: '700' },
  version: { color: colors.textMuted, fontSize: font.size.sm },
  logBox: { maxHeight: 160, marginTop: space.sm },
  log: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    lineHeight: font.size.sm * font.lineHeight.normal,
  },
  mandatory: { color: colors.warning, fontSize: font.size.sm, marginTop: space.xs },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: MIN_TOUCH,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    marginTop: space.md,
  },
  btnText: { color: onAccent, fontSize: font.size.base, fontWeight: '600' },
  later: { minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  laterText: { color: colors.textMuted, fontSize: font.size.md },
  pressed: { opacity: 0.7 },
});
