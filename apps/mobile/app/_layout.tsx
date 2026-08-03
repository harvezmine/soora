// Import ini HARUS pertama: efek sampingnya memanggil configureCore(), dan itu
// wajib selesai sebelum modul mana pun sempat membuat request.
import '../lib/core';

import { useEffect, useState } from 'react';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { setCurrentPath } from '../lib/core';
import { LaunchScreen } from '../components/LaunchScreen';
import { useReduceMotion } from '../lib/useReduceMotion';
import { UpdateBanner } from '../components/UpdateBanner';
import { colors } from '../theme/tokens';

// Dipanggil di lingkup modul, bukan di dalam effect: effect pertama berjalan
// SETELAH render pertama, dan pada saat itu splash native sudah sempat
// disembunyikan otomatis — layarnya akan berkedip putih sesaat.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const pathname = usePathname();
  const [sambutanSelesai, setSambutanSelesai] = useState(false);
  const kurangiGerak = useReduceMotion();

  // Lepas splash native begitu React siap menggambar. LaunchScreen memakai
  // latar dan ikon yang sama, jadi user tidak melihat pergantian.
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  // Jaga agar laporan error tahu user sedang di layar mana.
  useEffect(() => {
    setCurrentPath(pathname);
  }, [pathname]);

  return (
    // WAJIB membungkus seluruh app: tanpa ini setiap Gesture dari
    // react-native-gesture-handler diam saja tanpa error — ketuk-ganda untuk
    // melompat dan seretan bilah waktu di pemutar tidak akan pernah terpicu.
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      {/* Distribusi di luar Play Store tidak punya pembaruan otomatis, jadi app
          yang menanyakannya sendiri saat dibuka. */}
      <UpdateBanner />
      {/* Tanpa backgroundColor: app edge-to-edge (app.json), jadi status bar
          transparan dan latar diambil dari konten di bawahnya. */}
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
          // Geser dari kanan untuk maju, dan sistem membalikkannya sendiri
          // saat mundur — arah gerak itu yang memberi tahu user ia masuk
          // lebih dalam atau keluar.
          //
          // 220ms: di bawah 150ms peralihannya tidak terbaca sebagai gerak,
          // di atas 300ms navigasi mulai terasa lambat.
          animation: kurangiGerak ? 'none' : 'slide_from_right',
          animationDuration: 220,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* Layar detail: header standar, judul diisi layarnya sendiri
            lewat <Stack.Screen options={{ title }} /> setelah data tiba. */}
        <Stack.Screen name="anime/[id]" options={{ title: '' }} />
        <Stack.Screen name="movie/[id]" options={{ title: '' }} />
        <Stack.Screen name="manga/[id]" options={{ title: '' }} />
        {/* Watch dan Read immersive: tanpa header, tanpa tab bar. */}
        <Stack.Screen
          name="watch/[id]"
          options={{ headerShown: false, animation: kurangiGerak ? 'none' : 'fade' }}
        />
        <Stack.Screen
          name="read/[chapter]"
          options={{ headerShown: false, animation: kurangiGerak ? 'none' : 'fade' }}
        />
        <Stack.Screen
          name="(auth)/login"
          options={{
            headerShown: false,
            animation: kurangiGerak ? 'none' : 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="(auth)/register"
          options={{
            headerShown: false,
            animation: kurangiGerak ? 'none' : 'slide_from_bottom',
          }}
        />
        <Stack.Screen name="spike" options={{ title: 'Spike Referer' }} />
      </Stack>
      {/* Di atas Stack, bukan menggantikannya: navigator tetap dipasang dan
          layar pertama sudah selesai memuat di belakang layar sambutan. */}
      {!sambutanSelesai && <LaunchScreen onSelesai={() => setSambutanSelesai(true)} />}
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
