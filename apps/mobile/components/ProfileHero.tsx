import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { colors, font, onAccent, radius, space } from '../theme/tokens';

type Props = {
  nama?: string;
  email?: string;
  foto?: string;
  masuk: boolean;
};

/**
 * Kepala layar Profil.
 *
 * Gradien merek + avatar, bukan judul teks polos. Layar Profil adalah satu-
 * satunya layar yang isinya milik user, dan sebelumnya tampil sebagai daftar
 * pengaturan tanpa identitas apa pun.
 */
export function ProfileHero({ nama, email, foto, masuk }: Props) {
  const label = nama || email || 'Akun Soora';
  // Huruf awal sebagai avatar cadangan. Foto Google bisa kosong, dan lingkaran
  // abu-abu kosong terlihat seperti gambar yang gagal dimuat.
  const inisial = (label.trim()[0] ?? 'S').toUpperCase();

  return (
    <View style={s.wadah}>
      <LinearGradient
        colors={['#2a1440', '#150a24', colors.bg]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={s.isi}>
        <View style={s.avatar}>
          {foto ? (
            <Image source={{ uri: foto }} style={s.foto} contentFit="cover" transition={160} />
          ) : (
            <Text style={s.inisial}>{inisial}</Text>
          )}
        </View>

        <View style={s.teks}>
          <Text style={s.nama} numberOfLines={1}>
            {masuk ? label : 'Belum masuk'}
          </Text>
          <Text style={s.sub} numberOfLines={2}>
            {masuk
              ? email || 'Tersinkron dengan soora.fun'
              : 'Masuk untuk menyinkronkan Daftar Saya dan riwayat dengan soora.fun.'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wadah: { paddingTop: space.xxl, paddingBottom: space.xl, overflow: 'hidden' },
  isi: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: space.lg },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.accent,
  },
  foto: { width: '100%', height: '100%' },
  inisial: { color: onAccent, fontSize: font.size.xl, fontWeight: font.weight.bold },
  teks: { flex: 1 },
  nama: { color: colors.text, fontSize: font.size.lg, fontWeight: font.weight.bold },
  sub: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    lineHeight: font.size.sm * font.lineHeight.normal,
    marginTop: 2,
  },
});
