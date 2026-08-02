import { Tabs } from 'expo-router';
import { BookOpen, Bookmark, Home, Search, User } from 'lucide-react-native';
import { colors, iconSize, iconStroke, font, MIN_TOUCH } from '../../theme/tokens';

/**
 * Lima tab — batas maksimum bottom navigation menurut Material.
 * Semua punya ikon DAN label: navigasi ikon-saja menurunkan penemuan fitur.
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
          title: 'Beranda',
          tabBarIcon: ({ color }) => (
            <Home size={iconSize.md} color={color} strokeWidth={iconStroke} />
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
          tabBarIcon: ({ color }) => (
            <Bookmark size={iconSize.md} color={color} strokeWidth={iconStroke} />
          ),
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
