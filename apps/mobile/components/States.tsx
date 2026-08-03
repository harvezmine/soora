import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CloudOff, RefreshCw, SearchX, ServerCrash } from 'lucide-react-native';
import { colors, font, iconSize, iconStroke, radius, space, MIN_TOUCH } from '../theme/tokens';

/**
 * Keadaan kosong dan error.
 *
 * Ini bukan pelengkap. Sumber Soora sering mati — pada 2026-08-03 seluruh
 * provider anime mengembalikan bundle kosong dengan HTTP 200. Tanpa layar yang
 * mengatakannya, user melihat halaman kosong dan menyimpulkan aplikasinya rusak.
 */

export function ErrorState({
  message,
  onRetry,
  offline = false,
}: {
  message: string;
  onRetry?: () => void;
  offline?: boolean;
}) {
  const Icon = offline ? CloudOff : ServerCrash;
  return (
    <View style={s.wrap}>
      <Icon size={iconSize.lg} color={colors.textDim} strokeWidth={iconStroke} />
      <Text style={s.title}>{offline ? 'Tidak ada koneksi' : 'Gagal memuat'}</Text>
      <Text style={s.body}>
        {offline
          ? 'Sambungkan ke internet untuk memuat konten terbaru. Katalog yang pernah dibuka tetap bisa dilihat.'
          : message}
      </Text>
      {onRetry ? (
        <Pressable
          style={({ pressed }) => [s.btn, pressed && s.pressed]}
          onPress={onRetry}
          accessibilityRole="button"
        >
          <RefreshCw size={iconSize.sm} color={colors.text} strokeWidth={iconStroke} />
          <Text style={s.btnText}>Coba lagi</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Ditampilkan saat request berhasil tapi tidak menghasilkan apa pun.
 *
 * Dibedakan dari error dengan sengaja: "provider sedang tidak menyediakan
 * konten" adalah situasi berbeda dari "request gagal", dan user perlu tahu
 * bahwa mencoba lagi belum tentu menolong.
 */
export function EmptyState({
  title,
  body,
  onRetry,
}: {
  title: string;
  body: string;
  onRetry?: () => void;
}) {
  return (
    <View style={s.wrap}>
      <SearchX size={iconSize.lg} color={colors.textDim} strokeWidth={iconStroke} />
      <Text style={s.title}>{title}</Text>
      <Text style={s.body}>{body}</Text>
      {onRetry ? (
        <Pressable style={({ pressed }) => [s.btn, pressed && s.pressed]} onPress={onRetry}>
          <RefreshCw size={iconSize.sm} color={colors.text} strokeWidth={iconStroke} />
          <Text style={s.btnText}>Muat ulang</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Pita tipis saat menampilkan data cache sementara penyegaran gagal. */
export function StaleBanner() {
  return (
    <View style={s.banner}>
      <CloudOff size={iconSize.sm} color={colors.warning} strokeWidth={iconStroke} />
      <Text style={s.bannerText}>Menampilkan data tersimpan</Text>
    </View>
  );
}

const s = StyleSheet.create({
  // Diberi wadah seperti kartu, bukan teks melayang di tengah layar: pesan
  // tanpa bentuk terbaca sebagai galat sistem yang nyasar, bukan bagian
  // dari halaman.
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    // Tepi 16dp seperti kartu, bukan 24: keduanya berdiri berdampingan di
    // layar yang sama dan tepi yang berbeda langsung terlihat.
    marginHorizontal: space.lg,
    paddingVertical: space.xxl,
    paddingHorizontal: space.lg,
    gap: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { color: colors.text, fontSize: font.size.base, fontWeight: '700' },
  body: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    textAlign: 'center',
    lineHeight: font.size.sm * font.lineHeight.normal,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: MIN_TOUCH,
    paddingHorizontal: space.xl,
    marginTop: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  btnText: { color: colors.text, fontSize: font.size.md, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bannerText: { color: colors.textMuted, fontSize: font.size.xs },
});
