import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { getToken } from '@soora/core/user';
import { clearNativeCache } from '@soora/core-native';
import { getCatalogCache } from '../../lib/db';
import { colors, font, radius, space, MIN_TOUCH } from '../../theme/tokens';

/**
 * Profil fase 1: status login, dan tombol bersihkan cache.
 *
 * Tombol cache sengaja dibuat sekarang, bukan nanti. Selama pengembangan
 * fase 2–4 akan sering perlu membuang data basi, dan tanpa tombol ini
 * satu-satunya cara adalah uninstall app.
 */
export default function ProfileScreen() {
  const loggedIn = Boolean(getToken());

  const clearCache = () => {
    // Dua lapisan terpisah: MMKV untuk respons API, SQLite untuk katalog.
    // Keduanya dibuang; sesi login (MMKV instance lain) tidak tersentuh.
    clearNativeCache();
    getCatalogCache().clearAll();
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Text style={s.heading}>Profil</Text>

      <View style={s.card}>
        <Text style={s.label}>Status</Text>
        <Text style={s.value}>{loggedIn ? 'Sudah masuk' : 'Belum masuk'}</Text>
      </View>

      {!loggedIn && (
        <Link href="/(auth)/login" asChild>
          <Pressable style={({ pressed }) => [s.btn, pressed && s.btnPressed]}>
            <Text style={s.btnText}>Masuk dengan Google</Text>
          </Pressable>
        </Link>
      )}

      <Pressable style={({ pressed }) => [s.btnGhost, pressed && s.btnPressed]} onPress={clearCache}>
        <Text style={s.btnGhostText}>Bersihkan cache</Text>
      </Pressable>

      <Link href="/spike" asChild>
        <Pressable style={({ pressed }) => [s.btnGhost, pressed && s.btnPressed]}>
          <Text style={s.btnGhostText}>Spike playback (header Referer)</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.md },
  heading: { color: colors.text, fontSize: font.size.xl, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.xs,
  },
  label: { color: colors.textDim, fontSize: font.size.sm },
  value: { color: colors.text, fontSize: font.size.base },
  btn: {
    minHeight: MIN_TOUCH,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#fff', fontSize: font.size.base, fontWeight: '600' },
  btnGhost: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhostText: { color: colors.textMuted, fontSize: font.size.md },
  // Umpan balik tekan tanpa menggeser layout — hanya opacity, bukan transform.
  btnPressed: { opacity: 0.7 },
});
