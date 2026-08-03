import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Maximize, Minimize } from 'lucide-react-native';
import { colors, font, iconSize, iconStroke, radius, space, MIN_TOUCH } from '../../theme/tokens';

/**
 * Pemutar cadangan berbasis WebView, untuk sumber yang hanya tersedia sebagai
 * halaman embed.
 *
 * Port dari AnimeEmbedPlayer.jsx di web, dengan satu perbedaan penting:
 * pencegahan pop-up tidak lagi mengandalkan atribut `sandbox` iframe, tapi
 * `onShouldStartLoadWithRequest` di layer native. Itu lebih ketat — kita
 * memeriksa setiap navigasi yang diminta halaman dan menolak apa pun yang
 * meninggalkan host embed, sehingga iklan popunder tidak punya jalan keluar.
 *
 * BELUM DIVERIFIKASI TERHADAP DATA NYATA. Per 2026-08-03 seluruh penyedia
 * anime mengembalikan bundle kosong, dan embed justru jalur yang dipakai anime.
 * Logikanya diport dari kode web yang sudah terbukti, tapi perlu diuji ulang
 * begitu penyedia pulih.
 */
export function EmbedPlayer({
  uri,
  label,
  onError,
  onBack,
}: {
  uri: string;
  label?: string;
  onError?: (message: string) => void;
  onBack?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(0);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const lanskap = width > height;

  /**
   * Layar penuh memutar orientasi, bukan membesarkan view.
   *
   * Halaman embed hampir selalu 16:9; di potret ia hanya memakai sekitar
   * sepertiga tinggi layar. Keluar memakai unlockAsync, bukan mengunci
   * potret — mengunci berlaku untuk seluruh proses dan layar lain ikut
   * terkunci sampai app ditutup paksa.
   */
  const togglePenuh = () => {
    if (lanskap) void ScreenOrientation.unlockAsync();
    else void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  };

  // useMemo, bukan ref yang ditulis saat render: host harus dihitung ulang
  // kalau `uri` berganti (mis. saat tombol ganti server ditambahkan nanti),
  // dan menulis ref di fase render tidak aman di React 19.
  const allowedHost = useRef('');
  allowedHost.current = useMemo(() => {
    try {
      return new URL(uri).hostname;
    } catch {
      return '';
    }
  }, [uri]);

  return (
    <View style={s.wrap}>
      <WebView
        source={{ uri }}
        style={s.web}
        // Blokir window.open — jalur paling umum untuk popunder.
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        onLoadEnd={() => setLoading(false)}
        onError={(e) => onError?.(e.nativeEvent.description || 'Gagal memuat embed')}
        // Halaman embed yang membalas 404 atau 403 tetap memicu onLoadEnd
        // dan tampak "berhasil" — layarnya hanya hitam. Tanpa penanganan ini
        // user menatap layar kosong tanpa tahu sumbernya memang mati.
        onHttpError={(e) => {
          const st = e.nativeEvent.statusCode;
          if (st >= 400) {
            onError?.(`Sumber embed membalas HTTP ${st}. Sumber ini kemungkinan sudah mati.`);
          }
        }}
        onShouldStartLoadWithRequest={(req) => {
          // Navigasi awal selalu diizinkan.
          if (req.url === uri) return true;

          // HANYA navigasi frame utama yang dibatasi.
          //
          // Penyedia embed bekerja dengan cara meng-iframe player dari host
          // lain (mis. halaman di vidsrc memuat player di cloudnestra), dan
          // memblokir semua host berbeda akan menghasilkan layar hitam
          // permanen. Yang berbahaya adalah frame utama berpindah ke domain
          // lain — itulah pola pop-under/redirect iklan.
          if (!req.isTopFrame) return true;

          // Skema non-http (about:blank, data:, blob:) dipakai secara sah oleh
          // banyak player. Diizinkan, dan tidak dihitung sebagai pop-up.
          if (!/^https?:/i.test(req.url)) return true;

          let host = '';
          try {
            host = new URL(req.url).hostname;
          } catch {
            return false;
          }

          const sameHost = host === allowedHost.current || host.endsWith(`.${allowedHost.current}`);
          if (!sameHost) {
            setBlocked((n) => n + 1);
            return false;
          }
          return true;
        }}
      />

      <View style={[s.barAtas, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <Pressable
          onPress={() => onBack?.()}
          style={s.ikonBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Kembali"
        >
          <ArrowLeft size={iconSize.md} color={colors.text} strokeWidth={iconStroke} />
        </Pressable>
        <Text style={s.judul} numberOfLines={1}>
          {label || 'Mode kompatibilitas'}
        </Text>
        <Pressable
          onPress={togglePenuh}
          style={s.ikonBtn}
          accessibilityRole="button"
          accessibilityLabel={lanskap ? 'Keluar dari layar penuh' : 'Layar penuh'}
        >
          {lanskap ? (
            <Minimize size={iconSize.md} color={colors.text} strokeWidth={iconStroke} />
          ) : (
            <Maximize size={iconSize.md} color={colors.text} strokeWidth={iconStroke} />
          )}
        </Pressable>
      </View>

      {loading && (
        <View style={s.loading} pointerEvents="none">
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      )}

      <View style={s.badge}>
        <Text style={s.badgeText}>
          Mode kompatibilitas{label ? ` · ${label}` : ''}
          {blocked > 0 ? ` · ${blocked} pop-up diblokir` : ''}
        </Text>
        <Text style={s.badgeSub}>
          Putar di latar belakang, PiP, dan unduh tidak tersedia di mode ini.
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.videoBg },
  web: { flex: 1, backgroundColor: colors.videoBg },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    gap: 2,
    borderRadius: radius.sm,
  },
  badgeText: { color: colors.warning, fontSize: font.size.xs, fontWeight: '600' },
  badgeSub: { color: colors.textDim, fontSize: font.size.xs },
  barAtas: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  ikonBtn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  judul: { flex: 1, color: colors.text, fontSize: font.size.md, fontWeight: font.weight.semibold },
});
