import { Tabs } from 'expo-router';
import { BookOpen, Clapperboard, Home, Search, User } from 'lucide-react-native';
import { colors, iconSize, iconStroke, font, MIN_TOUCH } from '../../theme/tokens';

/**
 * Lima tab — batas maksimum bottom navigation menurut Material.
 * Semua punya ikon DAN label: navigasi ikon-saja menurunkan penemuan fitur.
 *
 * Tiga bagian katalog dipisah seperti di web (Sooranime / Sooraflix /
 * Sooramics). "Daftar Saya" dikeluarkan dari tab bar dan pindah ke Profil:
 * enam tab melewati batas Material, dan dari tiga kandidat yang bisa dilepas,
 * daftar milik user adalah satu-satunya yang tidak dipakai untuk menjelajah.
 * Rutenya tetap hidup lewat `href: null`, jadi tautan lama tidak putus.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          minHeight: MIN_TOUCH,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textDim,
        tabBarLabelStyle: { fontSize: font.size.xs },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Anime',
          tabBarIcon: ({ color }) => (
            <Home size={iconSize.md} color={color} strokeWidth={iconStroke} />
          ),
        }}
      />
      <Tabs.Screen
        name="film"
        options={{
          title: 'Film',
          tabBarIcon: ({ color }) => (
            <Clapperboard size={iconSize.md} color={color} strokeWidth={iconStroke} />
          ),
        }}
      />
      <Tabs.Screen
        name="manga"
        options={{
          title: 'Manga',
          tabBarIcon: ({ color }) => (
            <BookOpen size={iconSize.md} color={color} strokeWidth={iconStroke} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Cari',
          tabBarIcon: ({ color }) => (
            <Search size={iconSize.md} color={color} strokeWidth={iconStroke} />
          ),
        }}
      />
      <Tabs.Screen
        name="mylist"
        options={{
          title: 'Daftar Saya',
          // Rute tetap ada, hanya tidak muncul di tab bar. Dibuka dari Profil.
          href: null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color }) => (
            <User size={iconSize.md} color={color} strokeWidth={iconStroke} />
          ),
        }}
      />
    </Tabs>
  );
}
