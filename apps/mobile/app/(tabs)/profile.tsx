import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ringkasLog } from '../../lib/playbackLog';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Bookmark, ClipboardList, Clock, LogIn, LogOut, RefreshCw, Trash2 } from 'lucide-react-native';
import { getToken } from '@soora/core/user';
import { clearApiMemCache } from '@soora/core/api';
import { clearNativeCache } from '@soora/core-native';
import { getStoredUser, signOut, type SooraUser } from '../../lib/auth';
import { getCatalogCache } from '../../lib/db';
import { listProgress, clearProgress } from '../../lib/progress';
import { listMyList, syncMyList } from '../../lib/mylist';
import { currentVersionCode } from '../../lib/updateCheck';
import { ProfileHero } from '../../components/ProfileHero';
import { SettingsGroup, SettingsRow } from '../../components/SettingsGroup';
import { ContinueRow } from '../../components/ContinueRow';
import { SectionRow } from '../../components/SectionRow';
import { listWatchLater, toMediaItems } from '../../lib/watchLater';
import { colors, font, iconSize, iconStroke, onAccent, radius, space, MIN_TOUCH } from '../../theme/tokens';

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<SooraUser | null>(null);
  const [counts, setCounts] = useState({ list: 0, watching: 0 });
  const [syncing, setSyncing] = useState(false);
  const [lanjut, setLanjut] = useState<ReturnType<typeof listProgress>>([]);
  const [disimpan, setDisimpan] = useState<ReturnType<typeof toMediaItems>>([]);
  const [nanti, setNanti] = useState<ReturnType<typeof toMediaItems>>([]);

  const refresh = useCallback(() => {
    setUser(getToken() ? getStoredUser() : null);
    const progress = listProgress();
    const simpan = listMyList();
    const antre = listWatchLater();
    setCounts({ list: simpan.length, watching: progress.length });
    setLanjut(progress);
    // Dibatasi 20: baris mendatar tidak dibaca sampai ujung, dan memetakan
    // seluruh daftar tiap layar mendapat fokus membuang waktu di JS thread.
    setDisimpan(toMediaItems(simpan.slice(0, 20)));
    setNanti(toMediaItems(antre.slice(0, 20)));
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
      <ProfileHero
        nama={user?.name}
        email={user?.email}
        foto={user?.picture}
        masuk={loggedIn}
      />

      <View style={s.stats}>
        <Stat label="Disimpan" value={counts.list} />
        <Stat label="Ditonton" value={counts.watching} />
        <Stat label="Antrean" value={nanti.length} />
      </View>

      {!loggedIn && (
        <Link href="/(auth)/login" asChild>
          <Pressable style={({ pressed }) => [s.btn, pressed && s.pressed]}>
            <LogIn size={iconSize.sm} color={onAccent} strokeWidth={iconStroke} />
            <Text style={s.btnText}>Masuk dengan Google</Text>
          </Pressable>
        </Link>
      )}

      {/* Konten milik user ditaruh di ATAS pengaturan. Yang dicari orang saat
          membuka Profil hampir selalu "lanjutkan yang kemarin", bukan tombol
          bersihkan cache. */}
      <ContinueRow items={lanjut} />
      <SectionRow title="Tonton nanti" items={nanti} />
      <SectionRow title="Daftar Saya" items={disimpan} />

      <View style={s.grup}>
        <SettingsGroup judul="Daftar">
          <SettingsRow
            ikon={<Bookmark size={iconSize.sm} color={colors.textMuted} strokeWidth={iconStroke} />}
            label="Buka Daftar Saya"
            sub={`${counts.list} judul tersimpan`}
            onPress={() => router.push('/(tabs)/mylist' as never)}
          />
          {loggedIn ? (
            <SettingsRow
              ikon={<RefreshCw size={iconSize.sm} color={colors.textMuted} strokeWidth={iconStroke} />}
              label={syncing ? 'Menyinkronkan…' : 'Sinkronkan Daftar Saya'}
              sub="Dengan akun soora.fun"
              onPress={() => void doSync()}
              disabled={syncing}
              terakhir
            />
          ) : null}
        </SettingsGroup>

        <SettingsGroup judul="Data di perangkat">
          <SettingsRow
            ikon={<Trash2 size={iconSize.sm} color={colors.textMuted} strokeWidth={iconStroke} />}
            label="Bersihkan cache"
            sub="Katalog diambil ulang saat dibuka"
            onPress={clearCache}
          />
          <SettingsRow
            ikon={<Clock size={iconSize.sm} color={colors.textMuted} strokeWidth={iconStroke} />}
            label="Hapus riwayat tontonan"
            sub="Daftar Lanjut Tonton dikosongkan"
            onPress={confirmClearHistory}
            terakhir
          />
        </SettingsGroup>

        <SettingsGroup judul="Diagnostik">
          <SettingsRow
            ikon={<ClipboardList size={iconSize.sm} color={colors.textMuted} strokeWidth={iconStroke} />}
            label="Salin catatan pemutaran"
            sub="Untuk melaporkan judul yang gagal diputar"
            onPress={async () => {
              await Clipboard.setStringAsync(ringkasLog());
              Alert.alert('Tersalin', 'Catatan percobaan pemutaran sudah disalin.');
            }}
          />
          <SettingsRow
            ikon={<ClipboardList size={iconSize.sm} color={colors.textMuted} strokeWidth={iconStroke} />}
            label="Spike playback"
            sub="Uji sumber dan header"
            onPress={() => router.push('/spike' as never)}
            terakhir
          />
        </SettingsGroup>

        {loggedIn ? (
          <SettingsGroup judul="Akun">
            <SettingsRow
              ikon={<LogOut size={iconSize.sm} color={colors.danger} strokeWidth={iconStroke} />}
              label="Keluar"
              sub="Daftar dan riwayat di perangkat tetap tersimpan"
              onPress={confirmLogout}
              danger
              terakhir
            />
          </SettingsGroup>
        ) : null}
      </View>

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
  // Padding horizontal dilepas dari content: hero dan baris mendatar harus
  // mencapai tepi layar. Yang butuh jarak tepi mengaturnya sendiri.
  content: { paddingBottom: space.xxxl },
  grup: { gap: space.lg, paddingHorizontal: space.lg, paddingTop: space.lg },
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
  stats: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg },
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
  btnWrap: { paddingHorizontal: space.lg },
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
