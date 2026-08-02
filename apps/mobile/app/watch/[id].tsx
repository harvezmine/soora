import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { getVixsrcStream } from '@soora/core/api';
import { resolvePlayback, shouldRefetchSource } from '@soora/core/player';
import { NativePlayer } from '../../components/player/NativePlayer';
import { EmbedPlayer } from '../../components/player/EmbedPlayer';
import { ErrorState } from '../../components/States';
import { getProgress, saveProgress } from '../../lib/progress';
import { colors, font, space } from '../../theme/tokens';

type Source = ReturnType<typeof resolvePlayback>;

/**
 * Layar tonton — immersive, di luar grup (tabs) sehingga tab bar tidak tampil.
 *
 * Sumber TIDAK di-cache. URL m3u8 membawa token dengan `expires`, jadi
 * menyimpannya berarti playback rusak beberapa menit kemudian dengan gejala
 * yang menyesatkan. Aturan yang sama sudah ditegakkan di cache katalog lewat
 * daftar NEVER_CACHE.
 */
export default function WatchScreen() {
  const { id, kind, title } = useLocalSearchParams<{
    id: string;
    kind?: string;
    title?: string;
  }>();
  const router = useRouter();

  const [source, setSource] = useState<Source>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  // Berapa kali sumber diambil ulang karena token kedaluwarsa. Dibatasi supaya
  // sumber yang benar-benar mati tidak memicu perulangan tanpa akhir.
  const refetches = useRef(0);
  const resumeAt = useRef(getProgress(String(id))?.position ?? 0);

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const res = await getVixsrcStream(kind === 'tv' ? 'tv' : 'movie', String(id));
      const next = resolvePlayback({ m3u8: res?.m3u8, ref: res?.ref });
      if (!next) {
        setError(
          'Tidak ada sumber yang bisa diputar untuk judul ini. ' +
            'Penyedia mungkin sedang tidak tersedia.'
        );
        setStatus('error');
        return;
      }
      setSource(next);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [id, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  // Izinkan landscape selama di layar ini, kembalikan ke portrait saat keluar.
  useEffect(() => {
    void ScreenOrientation.unlockAsync();
    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  const onProgress = useCallback(
    (position: number, duration: number) => {
      saveProgress({
        id: String(id),
        kind: kind === 'tv' ? 'tv' : 'movie',
        title: String(title || 'Tanpa judul'),
        position,
        duration,
      });
    },
    [id, kind, title]
  );

  const onPlayerError = useCallback(
    (message: string) => {
      // Token m3u8 kedaluwarsa di tengah tontonan panjang: ambil sumber baru
      // lalu lanjutkan dari posisi terakhir, jangan tampilkan layar error.
      if (shouldRefetchSource({ message }) && refetches.current < 2) {
        refetches.current += 1;
        resumeAt.current = getProgress(String(id))?.position ?? resumeAt.current;
        void load();
        return;
      }
      setError(message);
      setStatus('error');
    },
    [id, load]
  );

  return (
    <View style={s.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar hidden />

      {status === 'loading' && (
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={s.hint}>Mencari sumber…</Text>
        </View>
      )}

      {status === 'error' && (
        <View style={s.center}>
          <ErrorState message={error} onRetry={load} />
          <Text style={s.back} onPress={() => router.back()}>
            Kembali
          </Text>
        </View>
      )}

      {status === 'ready' && source?.mode === 'native' && (
        <NativePlayer
          uri={source.uri}
          title={String(title || '')}
          startAt={resumeAt.current}
          onProgress={onProgress}
          onError={onPlayerError}
        />
      )}

      {status === 'ready' && source?.mode === 'embed' && (
        <EmbedPlayer uri={source.uri} label={source.label} onError={onPlayerError} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.videoBg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint: { color: colors.textMuted, fontSize: font.size.sm, marginTop: space.md },
  back: { color: colors.accent, fontSize: font.size.md, padding: space.lg },
});
