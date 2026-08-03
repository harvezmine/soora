import { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { BookOpen, Bookmark, Play, Wifi } from 'lucide-react-native';
import { useGoogleSignIn } from '../../lib/auth';
import { isGoogleLoginConfigured } from '../../lib/config';
import { colors, font, iconSize, iconStroke, radius, space, MIN_TOUCH } from '../../theme/tokens';

const FITUR = [
  { Icon: Play, teks: 'Streaming tanpa batas' },
  { Icon: BookOpen, teks: 'Baca manga sepuasnya' },
  { Icon: Bookmark, teks: 'Daftar Saya tersinkron' },
  { Icon: Wifi, teks: 'Katalog tetap terbuka offline' },
];

/**
 * Layar masuk.
 *
 * Menyusun ulang layar masuk web ke satu kolom: web memakai dua panel —
 * branding di kiri, tombol di kanan — yang tidak muat di ponsel. Urutannya
 * dipertahankan (merek → alasan → tombol) supaya user mengerti untuk apa akun
 * itu sebelum diminta menekannya.
 */
export default function LoginScreen() {
  const router = useRouter();
  const { signIn, busy, error, user, ready } = useGoogleSignIn();
  const configured = isGoogleLoginConfigured();
  const { height } = useWindowDimensions();
  // Layar pendek tidak muat memuat hero besar beserta daftar fitur; kecilkan
  // alih-alih memaksa user menggulir untuk mencapai tombolnya.
  const sempit = height < 700;

  // Tutup layar begitu penukaran token berhasil.
  useEffect(() => {
    if (user) router.back();
  }, [user, router]);

  return (
    <View style={s.layar}>
      <LinearGradient
        // Gradien merek yang sama dengan panel kiri di web.
        colors={['#1a1035', '#12081f', colors.bg]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={[s.isi, sempit && s.isiSempit]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Wordmark, bukan ikon + teks terpisah: logonya sudah memuat namanya,
            jadi menaruh keduanya berarti menulis "Soora" dua kali. */}
        <Image
          source={require('../../assets/logo-wordmark.png')}
          style={[s.logo, sempit && s.logoSempit]}
          contentFit="contain"
          contentPosition="left"
          transition={0}
          accessibilityLabel="Soora"
        />

        <Text style={[s.judul, sempit && s.judulSempit]}>Selamat datang{'\n'}kembali.</Text>
        <Text style={s.sub}>
          Daftar Saya dan riwayat tontonan tersinkron lewat akun yang sama dengan di soora.fun.
        </Text>

        {!sempit && (
          <View style={s.fitur}>
            {FITUR.map(({ Icon, teks }) => (
              <View key={teks} style={s.fiturBaris}>
                <View style={s.fiturIkon}>
                  <Icon size={iconSize.sm} color={colors.text} strokeWidth={iconStroke} />
                </View>
                <Text style={s.fiturTeks}>{teks}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.aksi}>
          {!configured ? (
            // Gagal terang-terangan, bukan diam-diam. Tanpa ini, gejalanya cuma
            // DEVELOPER_ERROR dari Google yang tidak menjelaskan penyebabnya.
            <View style={s.setup}>
              <Text style={s.setupJudul}>Login Google belum dikonfigurasi</Text>
              <Text style={s.setupBody}>
                Perlu OAuth client ID bertipe Android di Google Cloud Console, dengan SHA-1
                fingerprint dari soora-keystore.jks terdaftar.
              </Text>
            </View>
          ) : (
            <Pressable
              disabled={busy || !ready}
              onPress={() => void signIn()}
              style={({ pressed }) => [
                s.tombol,
                pressed && s.tombolDitekan,
                (busy || !ready) && s.tombolMati,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Lanjutkan dengan Google"
              accessibilityState={{ disabled: busy || !ready, busy }}
            >
              {busy ? (
                <ActivityIndicator color="#1f1f1f" />
              ) : (
                <>
                  <LogoGoogle />
                  <Text style={s.tombolTeks}>Lanjutkan dengan Google</Text>
                </>
              )}
            </Pressable>
          )}

          {error !== '' && (
            <View style={s.galat} accessibilityLiveRegion="polite">
              <Text style={s.galatTeks}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={() => router.back()}
            style={s.lewati}
            accessibilityRole="button"
            accessibilityLabel="Kembali tanpa masuk"
          >
            <Text style={s.lewatiTeks}>Nanti saja</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

/** Logo "G" resmi Google. Panduan mereknya mewajibkan warna aslinya dipakai. */
function LogoGoogle() {
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

const s = StyleSheet.create({
  layar: { flex: 1, backgroundColor: colors.bg },
  isi: {
    flexGrow: 1,
    paddingHorizontal: space.xl,
    paddingTop: space.xxxl,
    paddingBottom: space.xl,
  },
  isiSempit: { paddingTop: space.xl },

  // 1024x430 pada berkasnya; tinggi mengikuti agar tidak gepeng.
  logo: { width: 168, height: 71 },
  logoSempit: { width: 132, height: 55 },

  judul: {
    color: colors.text,
    fontSize: font.size.xxl,
    lineHeight: font.size.xxl * 1.15,
    fontWeight: font.weight.bold,
    letterSpacing: -0.5,
    marginTop: space.xxl,
  },
  judulSempit: { fontSize: font.size.xl, lineHeight: font.size.xl * 1.15, marginTop: space.lg },
  sub: {
    color: colors.textMuted,
    fontSize: font.size.base,
    lineHeight: font.size.base * font.lineHeight.normal,
    marginTop: space.md,
  },

  fitur: { marginTop: space.xxl, gap: space.md },
  fiturBaris: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  fiturIkon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fiturTeks: { color: colors.textMuted, fontSize: font.size.md },

  // Didorong ke bawah supaya tombol berada dalam jangkauan ibu jari, bukan
  // menempel tepat di bawah teks di tengah layar.
  aksi: { marginTop: 'auto', paddingTop: space.xxl, gap: space.md },

  tombol: {
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
  tombolDitekan: { opacity: 0.85 },
  tombolMati: { opacity: 0.5 },
  tombolTeks: {
    color: '#1f1f1f',
    fontSize: font.size.base,
    fontWeight: font.weight.semibold,
  },

  galat: {
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

  lewati: { minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  lewatiTeks: { color: colors.textDim, fontSize: font.size.md },

  setup: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: space.lg,
  },
  setupJudul: {
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.semibold,
    marginBottom: space.xs,
  },
  setupBody: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    lineHeight: font.size.sm * font.lineHeight.normal,
  },
});
