import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import {
  colors,
  font,
  iconSize,
  iconStroke,
  onAccent,
  radius,
  space,
  MIN_TOUCH,
} from '../theme/tokens';

type Props = {
  mode: 'login' | 'register';
  sibuk: boolean;
  onKirim: (v: { email: string; password: string; name?: string }) => void;
};

/**
 * Kolom email dan sandi untuk layar Masuk dan Daftar.
 *
 * Satu komponen untuk keduanya: bedanya hanya kolom nama dan label tombol.
 * Validasi dijalankan di sini supaya kesalahan ketik ketahuan sebelum satu
 * perjalanan ke server — di jaringan seluler itu bedanya beberapa detik.
 */
export function AuthForm({ mode, sibuk, onKirim }: Props) {
  const daftar = mode === 'register';
  const [nama, setNama] = useState('');
  const [email, setEmail] = useState('');
  const [sandi, setSandi] = useState('');
  const [lihat, setLihat] = useState(false);
  const [galat, setGalat] = useState<Record<string, string>>({});

  const kirim = () => {
    const g: Record<string, string> = {};
    if (daftar && nama.trim().length < 2) g.nama = 'Nama minimal 2 huruf.';
    // Sengaja longgar. Memvalidasi email dengan regex ketat menolak alamat yang
    // sah lebih sering daripada menangkap yang salah; server tetap memeriksa.
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) g.email = 'Format email belum benar.';
    // Ambang 6 mengikuti backend; kalau berbeda, user ditolak server setelah
    // menunggu, dengan pesan yang tidak menunjuk kolom mana.
    if (sandi.length < 6) g.sandi = 'Sandi minimal 6 karakter.';

    setGalat(g);
    if (Object.keys(g).length > 0) return;

    onKirim({
      email: email.trim(),
      password: sandi,
      ...(daftar ? { name: nama.trim() } : {}),
    });
  };

  return (
    <View style={s.wadah}>
      {daftar ? (
        <Kolom
          label="Nama"
          nilai={nama}
          onUbah={setNama}
          galat={galat.nama}
          placeholder="Nama tampilan"
          autoCapitalize="words"
          textContentType="name"
        />
      ) : null}

      <Kolom
        label="Email"
        nilai={email}
        onUbah={setEmail}
        galat={galat.email}
        placeholder="nama@email.com"
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
      />

      <View>
        <Kolom
          label="Sandi"
          nilai={sandi}
          onUbah={setSandi}
          galat={galat.sandi}
          placeholder={daftar ? 'Minimal 6 karakter' : 'Sandi'}
          autoCapitalize="none"
          secureTextEntry={!lihat}
          // Membantu pengelola sandi menawarkan sandi baru saat mendaftar dan
          // sandi tersimpan saat masuk — dua hal yang berbeda.
          textContentType={daftar ? 'newPassword' : 'password'}
        />
        <Pressable
          onPress={() => setLihat((v) => !v)}
          style={s.mata}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={lihat ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
        >
          {lihat ? (
            <EyeOff size={iconSize.sm} color={colors.textDim} strokeWidth={iconStroke} />
          ) : (
            <Eye size={iconSize.sm} color={colors.textDim} strokeWidth={iconStroke} />
          )}
        </Pressable>
      </View>

      <Pressable
        onPress={kirim}
        disabled={sibuk}
        style={({ pressed }) => [s.tombol, (pressed || sibuk) && s.ditekan]}
        accessibilityRole="button"
        accessibilityState={{ disabled: sibuk, busy: sibuk }}
        accessibilityLabel={daftar ? 'Buat akun' : 'Masuk'}
      >
        {sibuk ? (
          <ActivityIndicator color={onAccent} />
        ) : (
          <Text style={s.tombolTeks}>{daftar ? 'Buat akun' : 'Masuk'}</Text>
        )}
      </Pressable>
    </View>
  );
}

function Kolom({
  label,
  nilai,
  onUbah,
  galat,
  ...rest
}: {
  label: string;
  nilai: string;
  onUbah: (v: string) => void;
  galat?: string;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={s.kolom}>
      {/* Label terlihat, bukan hanya placeholder: placeholder hilang begitu
          user mengetik, dan kolom yang sudah terisi jadi tidak punya nama. */}
      <Text style={s.label}>{label}</Text>
      <TextInput
        value={nilai}
        onChangeText={onUbah}
        placeholderTextColor={colors.textDim}
        style={[s.input, galat ? s.inputGalat : null]}
        {...rest}
      />
      {galat ? (
        <Text style={s.galat} accessibilityLiveRegion="polite">
          {galat}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wadah: { gap: space.md },
  kolom: { gap: space.xs },
  label: { color: colors.textMuted, fontSize: font.size.sm, fontWeight: font.weight.medium },
  input: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    // 16px: di bawah itu sebagian peluncur memperbesar halaman saat kolom
    // mendapat fokus.
    fontSize: font.size.base,
  },
  inputGalat: { borderColor: colors.danger },
  galat: { color: colors.danger, fontSize: font.size.xs },
  mata: {
    position: 'absolute',
    right: space.md,
    // Sejajar dengan kolom, bukan dengan labelnya di atas.
    top: 30,
    height: MIN_TOUCH - 8,
    justifyContent: 'center',
  },
  tombol: {
    minHeight: MIN_TOUCH + 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    marginTop: space.xs,
  },
  ditekan: { opacity: 0.8 },
  tombolTeks: { color: onAccent, fontSize: font.size.base, fontWeight: font.weight.semibold },
});
