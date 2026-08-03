import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { getVixsrcStream, getSubIndoPlay, fetchAnimeIds } from '@soora/core/api';
import { buildAnimeEmbeds, resolvePlayback, shouldRefetchSource } from '@soora/core/player';
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
  const { id, kind, title, season, ep, animeId } = useLocalSearchParams<{
    id: string;
    kind?: string;
    title?: string;
    season?: string;
    ep?: string;
    animeId?: string;
  }>();
  const router = useRouter();

  const [source, setSource] = useState<Source>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  // Berapa kali sumber diambil ulang karena token kedaluwarsa. Dibatasi supaya
  // sumber yang benar-benar mati tidak memicu perulangan tanpa akhir.
  const refetches = useRef(0);

  // Dibaca sekali lewat inisialisasi malas. `useRef(getProgress(...))`
  // mengevaluasi argumennya TIAP render, jadi versi sebelumnya membaca MMKV
  // dan mem-parse seluruh daftar progress di setiap render lalu membuangnya.
  const resumeAt = useRef<number | null>(null);
  if (resumeAt.current === null) resumeAt.current = getProgress(String(id))?.position ?? 0;

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      let next = null;

      if (kind === 'anime') {
        // Anime: coba m3u8 langsung dulu, lalu embed.
        //
        // Jalur embed inilah yang dipakai anime, dan BELUM bisa diverifikasi —
        // per 2026-08-03 semua penyedia anime mengembalikan kosong. Strukturnya
        // mengikuti AnimeEmbedPlayer.jsx di web yang sudah terbukti.
        let m3u8: string | undefined;
        const ref: string | undefined = undefined;
        try {
          // Sub Indo (Samehadaku) — satu-satunya penyedia anime yang bisa
          // dijangkau dari VPS. Backend sudah memvalidasi tiap URL dan
          // membuang yang mati, jadi `sources` di sini sudah tersaring.
          const play = await getSubIndoPlay(String(id));
          m3u8 = play?.default?.url ?? play?.sources?.find((x: { url?: string }) => x?.url)?.url;
        } catch {
          /* penyedia mati — lanjut ke embed */
        }

        let embeds: Array<{ url: string; label: string }> = [];
        if (!m3u8 && animeId) {
          try {
            const ids = await fetchAnimeIds(String(animeId), String(title || ''));
            embeds = buildAnimeEmbeds({
              malId: ids?.malId,
              alId: ids?.alId,
              episode: Number(ep) || 1,
            });
          } catch {
            /* tanpa MAL id tidak ada embed yang bisa dibangun */
          }
        }

        next = resolvePlayback({ m3u8, ref, embeds });
      } else {
        // Film dan serial. Untuk serial, season WAJIB dikirim — tanpa itu
        // endpoint tv dipanggil tanpa nomor musim dan tidak pernah
        // mengembalikan sumber.
        const res = await getVixsrcStream(
          kind === 'tv' ? 'tv' : 'movie',
          String(id),
          season ? Number(season) : undefined,
          ep ? Number(ep) : kind === 'tv' ? 1 : undefined
        );
        next = resolvePlayback({ m3u8: res?.m3u8, ref: res?.ref });
      }

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
      // Pemulihan berhasil — kembalikan jatah pengambilan ulang. Tanpa ini,
      // film panjang dengan token berumur pendek kehabisan jatah lalu
      // menampilkan layar error padahal percobaan berikutnya pasti berhasil.
      refetches.current = 0;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [id, kind, season, ep, animeId, title]);

  useEffect(() => {
    void load();
  }, [load]);

  // Izinkan landscape selama di layar ini, kembalikan ke portrait saat keluar.
  useEffect(() => {
    void ScreenOrientation.unlockAsync();
    return () => {
      // `unlockAsync`, BUKAN lock portrait. Mengunci portrait di sini akan
      // berlaku untuk seluruh proses, sehingga setelah sekali menonton, semua
      // layar lain (termasuk pembaca manga) tidak bisa lagi diputar ke
      // landscape sampai app ditutup paksa.
      void ScreenOrientation.unlockAsync();
    };
  }, []);

  const onProgress = useCallback(
    (position: number, duration: number) => {
      // Jangkar resume milik sesi ini sendiri.
      //
      // Tidak boleh bersandar pada getProgress(): store itu sengaja MENGHAPUS
      // entri yang lewat 92%. Kalau token mati di menit ke-113 dari film 2 jam,
      // getProgress mengembalikan null dan pemutaran akan dimulai ulang dari
      // nol setelah pengambilan sumber baru.
      if (Number.isFinite(position) && position > 0) resumeAt.current = position;

      saveProgress({
        id: String(id),
        kind: kind === 'anime' ? 'anime' : kind === 'tv' ? 'tv' : 'movie',
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
        // resumeAt sudah dijaga terkini oleh onProgress; jangan baca ulang
        // dari store yang memangkas entri hampir-selesai.
        void load();
        return;
      }
      setError(message);
      setStatus('error');
    },
    [load]
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
          onBack={() => router.back()}
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
