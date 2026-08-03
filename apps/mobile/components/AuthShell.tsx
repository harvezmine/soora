import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { colors, font, radius, space, MIN_TOUCH } from '../theme/tokens';

/** Logo "G" resmi Google. Panduan mereknya mewajibkan warna aslinya dipakai. */
export function LogoGoogle() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <Path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <Path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <Path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </Svg>
  );
}

/**
 * Rangka bersama layar Masuk dan Daftar.
 *
 * Menyatukan gradien merek, logo, judul, tombol Google, pemisah, dan tautan
 * silang. Dipisah jadi dua salinan, keduanya akan perlahan berbeda — dan dua
 * layar autentikasi yang tampak berbeda membuat orang ragu apakah masih di
 * aplikasi yang sama.
 */
export function AuthShell({
  judul,
  sub,
  children,
  onGoogle,
  googleSiap,
  googleSibuk,
  galat,
  tautanTeks,
  tautanAksi,
}: {
  judul: string;
  sub: string;
  children: ReactNode;
  onGoogle: () => void;
  googleSiap: boolean;
  googleSibuk: boolean;
  galat?: string;
  tautanTeks: string;
  tautanAksi: () => void;
}) {
  const { height } = useWindowDimensions();
  const sempit = height < 760;

  return (
    <View style={s.layar}>
      <LinearGradient
        colors={['#1a1035', '#12081f', colors.bg]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Papan ketik menutupi tombol kirim pada layar pendek kalau isinya tidak
          didorong naik. */}
      <KeyboardAvoidingView
        style={s.isi}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[s.gulir, sempit && s.gulirSempit]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Image
            source={require('../assets/logo-wordmark.png')}
            style={[s.logo, sempit && s.logoSempit]}
            contentFit="contain"
            contentPosition="left"
            transition={0}
            accessibilityLabel="Soora"
          />

          <Text style={[s.judul, sempit && s.judulSempit]}>{judul}</Text>
          <Text style={s.sub}>{sub}</Text>

          <View style={s.form}>{children}</View>

          {galat ? (
            <View style={s.galat} accessibilityLiveRegion="polite">
              <Text style={s.galatTeks}>{galat}</Text>
            </View>
          ) : null}

          <View style={s.pemisah}>
            <View style={s.garis} />
            <Text style={s.pemisahTeks}>atau</Text>
            <View style={s.garis} />
          </View>

          <Pressable
            onPress={onGoogle}
            disabled={!googleSiap || googleSibuk}
            style={({ pressed }) => [
              s.google,
              pressed && s.ditekan,
              (!googleSiap || googleSibuk) && s.mati,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Lanjutkan dengan Google"
            accessibilityState={{ disabled: !googleSiap || googleSibuk, busy: googleSibuk }}
          >
            <LogoGoogle />
            <Text style={s.googleTeks}>Lanjutkan dengan Google</Text>
          </Pressable>

          <Pressable
            onPress={tautanAksi}
            style={s.tautan}
            accessibilityRole="link"
            accessibilityLabel={tautanTeks}
          >
            <Text style={s.tautanTeks}>{tautanTeks}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  layar: { flex: 1, backgroundColor: colors.bg },
  isi: { flex: 1 },
  gulir: {
    flexGrow: 1,
    paddingHorizontal: space.xl,
    paddingTop: space.xxxl,
    paddingBottom: space.xl,
  },
  gulirSempit: { paddingTop: space.xl },

  // 1024x430 pada berkasnya; tinggi mengikuti agar tidak gepeng.
  logo: { width: 156, height: 65 },
  logoSempit: { width: 124, height: 52 },

  judul: {
    color: colors.text,
    fontSize: font.size.xxl,
    lineHeight: font.size.xxl * 1.15,
    fontWeight: font.weight.bold,
    letterSpacing: -0.5,
    marginTop: space.xl,
  },
  judulSempit: { fontSize: font.size.xl, lineHeight: font.size.xl * 1.15, marginTop: space.lg },
  sub: {
    color: colors.textMuted,
    fontSize: font.size.md,
    lineHeight: font.size.md * font.lineHeight.normal,
    marginTop: space.xs,
  },

  form: { marginTop: space.xl },

  galat: {
    marginTop: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    padding: space.md,
  },
  galatTeks: {
    color: colors.text,
    fontSize: font.size.sm,
    lineHeight: font.size.sm * font.lineHeight.normal,
  },

  pemisah: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginVertical: space.xl },
  garis: { flex: 1, height: 1, backgroundColor: colors.border },
  pemisahTeks: { color: colors.textDim, fontSize: font.size.sm },

  google: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    minHeight: MIN_TOUCH + 4,
    borderRadius: radius.pill,
    // Putih dengan teks gelap: bentuk tombol Google yang dikenali orang, dan
    // panduan mereknya melarang menaruh logo G di atas warna sembarang.
    backgroundColor: '#ffffff',
  },
  ditekan: { opacity: 0.85 },
  mati: { opacity: 0.5 },
  googleTeks: { color: '#1f1f1f', fontSize: font.size.base, fontWeight: font.weight.semibold },

  tautan: {
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.md,
  },
  tautanTeks: { color: colors.textMuted, fontSize: font.size.md },
});
