import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, font, radius, space } from '../../theme/tokens';

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
}: {
  uri: string;
  label?: string;
  onError?: (message: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(0);

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
});
