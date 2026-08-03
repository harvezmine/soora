import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ringkasLog } from '../../lib/playbackLog';
import { Link, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { LogOut, RefreshCw, Trash2 } from 'lucide-react-native';
import { getToken } from '@soora/core/user';
import { clearApiMemCache } from '@soora/core/api';
import { clearNativeCache } from '@soora/core-native';
import { getStoredUser, signOut, type SooraUser } from '../../lib/auth';
import { getCatalogCache } from '../../lib/db';
import { listProgress, clearProgress } from '../../lib/progress';
import { listMyList, syncMyList } from '../../lib/mylist';
import { currentVersionCode } from '../../lib/updateCheck';
import { colors, font, iconSize, iconStroke, onAccent, radius, space, MIN_TOUCH } from '../../theme/tokens';

export default function ProfileScreen() {
  const [user, setUser] = useState<SooraUser | null>(null);
  const [counts, setCounts] = useState({ list: 0, watching: 0 });
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => {
    setUser(getToken() ? getStoredUser() : null);
    setCounts({ list: listMyList().length, watching: listProgress().length });
  }, []);

  useFocusEffect(refresh);

  const loggedIn = Boolean(getToken());

  const doSync = async () => {
    setSyncing(true);
    try {
      await syncMyList();
      refresh();
    } finally {
      setSyncing(false);
    }
  };

  const clearCache = () => {
    // TIGA lapisan. @soora/core/api menyimpan Map in-memory dengan TTL stale
    // sampai 45 menit; tanpa membersihkannya, tombol ini tidak berefek apa pun
    // selama sesi berjalan karena bundle lama tetap disajikan dari memori.
    clearApiMemCache();
    clearNativeCache();
    getCatalogCache().clearAll();
    Alert.alert('Cache dibersihkan', 'Katalog akan diambil ulang saat dibuka.');
  };

  const confirmLogout = () => {
    Alert.alert('Keluar dari akun?', 'Daftar dan riwayat di perangkat ini tetap tersimpan.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Keluar',
        style: 'destructive',
        onPress: () => {
          signOut();
          refresh();
        },
      },
    ]);
  };

  const confirmClearHistory = () => {
    Alert.alert('Hapus riwayat tontonan?', 'Daftar "Lanjut Tonton" akan dikosongkan.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          clearProgress();
          refresh();
        },
      },
    ]);
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Text style={s.heading}>Profil</Text>

      <View style={s.card}>
        {loggedIn ? (
          <>
            <Text style={s.name}>{user?.name || user?.email || 'Akun Soora'}</Text>
            {user?.email ? <Text style={s.sub}>{user.email}</Text> : null}
          </>
        ) : (
          <>
            <Text style={s.name}>Belum masuk</Text>
            <Text style={s.sub}>
              Masuk untuk menyinkronkan Daftar Saya dan riwayat dengan soora.fun.
            </Text>
          </>
        )}
      </View>

      <View style={s.stats}>
        <Stat label="Daftar Saya" value={counts.list} />
        <Stat label="Sedang ditonton" value={counts.watching} />
      </View>

      {/* Daftar Saya keluar dari tab bar saat tab Film ditambahkan (enam tab
          melewati batas Material). Tautannya ditaruh paling atas di sini,
          sebelum semua aksi pengaturan, supaya tetap mudah ditemukan. */}
      <Link href="/(tabs)/mylist" asChild>
        <Pressable style={({ pressed }) => [s.btn, pressed && s.pressed]}>
          <Text style={s.btnText}>Buka Daftar Saya</Text>
        </Pressable>
      </Link>

      {!loggedIn && (
        <Link href="/(auth)/login" asChild>
          <Pressable style={({ pressed }) => [s.btn, pressed && s.pressed]}>
            <Text style={s.btnText}>Masuk dengan Google</Text>
          </Pressable>
        </Link>
      )}

      {loggedIn && (
        <Row
          icon="sync"
          label={syncing ? 'Menyinkronkan…' : 'Sinkronkan Daftar Saya'}
          onPress={() => void doSync()}
          disabled={syncing}
        />
      )}

      <Row icon="cache" label="Bersihkan cache" onPress={clearCache} />
      <Row icon="cache" label="Hapus riwayat tontonan" onPress={confirmClearHistory} />

      {/* Catatan percobaan pemutaran. Kegagalan pemutaran tidak bisa
          diperbaiki dengan menebak; ini yang memberi judul, penyedia, dan
          pesan aslinya saat melapor. */}
      <Row
        icon="cache"
        label="Salin catatan pemutaran"
        onPress={async () => {
          const teks = ringkasLog();
          await Clipboard.setStringAsync(teks);
          Alert.alert('Tersalin', 'Catatan percobaan pemutaran sudah disalin.');
        }}
      />

      <Link href="/spike" asChild>
        <Pressable style={({ pressed }) => [s.row, pressed && s.pressed]}>
          <Text style={s.rowText}>Spike playback (diagnostik)</Text>
        </Pressable>
      </Link>

      {loggedIn && <Row icon="logout" label="Keluar" onPress={confirmLogout} danger />}

      <Text style={s.version}>
        Soora {Constants.expoConfig?.version ?? '?'} (build {currentVersionCode()})
      </Text>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function Row({
  icon,
  label,
  onPress,
  danger,
  disabled,
}: {
  icon: 'sync' | 'cache' | 'logout';
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const Icon = icon === 'sync' ? RefreshCw : icon === 'logout' ? LogOut : Trash2;
  const color = danger ? colors.danger : colors.textMuted;
  return (
    <Pressable
      style={({ pressed }) => [s.row, (pressed || disabled) && s.pressed]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
    >
      <Icon size={iconSize.md} color={color} strokeWidth={iconStroke} />
      <Text style={[s.rowText, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xxxl },
  heading: { color: colors.text, fontSize: font.size.xl, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.xs,
  },
  name: { color: colors.text, fontSize: font.size.lg, fontWeight: '600' },
  sub: { color: colors.textMuted, fontSize: font.size.sm },
  stats: { flexDirection: 'row', gap: space.md },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.md,
    alignItems: 'center',
    gap: 2,
  },
  statValue: { color: colors.text, fontSize: font.size.xl, fontWeight: '700' },
  statLabel: { color: colors.textDim, fontSize: font.size.xs },
  btn: {
    minHeight: MIN_TOUCH,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: onAccent, fontSize: font.size.base, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: MIN_TOUCH,
    paddingHorizontal: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  rowText: { color: colors.text, fontSize: font.size.md },
  pressed: { opacity: 0.7 },
  version: {
    color: colors.textDim,
    fontSize: font.size.xs,
    textAlign: 'center',
    paddingTop: space.xl,
  },
});
