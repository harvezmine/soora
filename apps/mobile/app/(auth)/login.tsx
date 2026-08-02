import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoogleSignIn } from '../../lib/auth';
import { isGoogleLoginConfigured } from '../../lib/config';
import { colors, font, onAccent, radius, space, MIN_TOUCH } from '../../theme/tokens';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, busy, error, user, ready } = useGoogleSignIn();
  const configured = isGoogleLoginConfigured();

  // Tutup layar begitu penukaran token berhasil.
  useEffect(() => {
    if (user) router.back();
  }, [user, router]);

  const onPress = () => {
    void signIn();
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Text style={s.heading}>Masuk</Text>
      <Text style={s.body}>
        Menonton dan membaca butuh akun. Daftar Saya dan riwayat tersinkron lewat akun yang sama
        dengan di soora.fun.
      </Text>

      {!configured ? (
        // Gagal terang-terangan, bukan diam-diam. Tanpa ini, gejalanya cuma
        // DEVELOPER_ERROR dari Google yang tidak menjelaskan penyebabnya.
        <View style={s.setup}>
          <Text style={s.setupTitle}>Login Google belum dikonfigurasi</Text>
          <Text style={s.setupBody}>
            Perlu OAuth client ID bertipe Android di Google Cloud Console, dengan SHA-1 fingerprint
            dari soora-keystore.jks terdaftar. Isi GOOGLE_ANDROID_CLIENT_ID di lib/config.ts.
          </Text>
          <Text style={s.setupCmd}>
            keytool -list -v -keystore soora-keystore.jks -alias &lt;alias&gt;
          </Text>
        </View>
      ) : (
        <Pressable
          disabled={busy || !ready}
          onPress={onPress}
          style={({ pressed }) => [s.btn, (pressed || busy || !ready) && s.btnPressed]}
        >
          {busy ? (
            <ActivityIndicator color={onAccent} />
          ) : (
            <Text style={s.btnText}>Lanjutkan dengan Google</Text>
          )}
        </Pressable>
      )}

      {error !== '' && <Text style={s.error}>{error}</Text>}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.lg },
  heading: { color: colors.text, fontSize: font.size.xl, fontWeight: '700' },
  body: { color: colors.textMuted, fontSize: font.size.md, lineHeight: font.size.md * font.lineHeight.normal },
  btn: {
    minHeight: MIN_TOUCH,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: { opacity: 0.7 },
  btnText: { color: onAccent, fontSize: font.size.base, fontWeight: '600' },
  setup: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: space.lg,
    gap: space.sm,
  },
  setupTitle: { color: colors.warning, fontSize: font.size.base, fontWeight: '600' },
  setupBody: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: font.size.sm * font.lineHeight.normal },
  setupCmd: {
    color: colors.textDim,
    fontSize: font.size.xs,
    fontFamily: 'monospace',
    backgroundColor: colors.bg,
    padding: space.sm,
    borderRadius: radius.sm,
  },
  error: { color: colors.danger, fontSize: font.size.sm },
});
