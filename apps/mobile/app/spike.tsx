import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { getVixsrcStream } from '@soora/core/api';
import { API_BASE, STREAM_PROXY } from '../lib/config';
import { colors, font, onAccent, radius, space, MIN_TOUCH } from '../theme/tokens';

/**
 * Spike fase 1 — risiko nomor 3 di design spec.
 *
 * Pertanyaan yang harus dijawab: bisakah ExoPlayer memutar m3u8 langsung dari
 * CDN dengan mengirim header Referer sendiri, TANPA melewati
 * stream.soora.fun/proxy?
 *
 * Kalau BISA: bandwidth VPS turun drastis (video tidak lagi transit lewat
 * server kita) dan playback kehilangan satu hop. Fase 3 dibangun di atas asumsi
 * ini.
 *
 * Kalau TIDAK: proxy tetap dipakai. App tetap berfungsi, tapi perkiraan biaya
 * dan latensi di fase 3 harus direvisi.
 *
 * Diuji tiga varian berurutan supaya penyebabnya jelas — kalau (1) gagal tapi
 * (2) berhasil, berarti memang Referer yang menentukan, bukan hal lain.
 */

type Attempt = {
  name: string;
  uri: string;
  headers?: Record<string, string>;
  /** Diisi kalau percobaan ini tidak bermakna, mis. backend tidak memberi Referer. */
  skip?: string;
};

type Verdict = 'belum' | 'memuat' | 'main' | 'gagal';

export default function SpikeScreen() {
  // Default: TMDB id Fight Club — judul stabil yang hampir selalu tersedia.
  const [tmdbId, setTmdbId] = useState('550');
  const [log, setLog] = useState<string[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [active, setActive] = useState<Attempt | null>(null);
  const [verdict, setVerdict] = useState<Verdict>('belum');

  const say = (line: string) => setLog((l) => [...l, line]);

  /**
   * Player dibuat sekali dengan sumber kosong, lalu diganti secara imperatif.
   *
   * Sengaja TIDAK memakai `useVideoPlayer(sumberDinamis)`: hook itu memoisasi
   * pada `JSON.stringify(source)`, dan `JSON.stringify` membuang key bernilai
   * undefined. Kalau backend tidak mengembalikan Referer, percobaan 2 akan
   * menghasilkan objek yang identik dengan percobaan 1, player tidak dibuat
   * ulang, dan stream percobaan 1 terus berjalan — spike lalu menyimpulkan
   * "ExoPlayer bisa kirim Referer sendiri" dari pengujian yang tidak pernah
   * berjalan. Menekan tombol yang sama dua kali juga tidak akan memuat ulang.
   */
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  const resolve = useCallback(async () => {
    setLog([]);
    setAttempts([]);
    setActive(null);
    setVerdict('belum');
    say(`Meminta sumber dari ${API_BASE} untuk TMDB ${tmdbId}…`);

    try {
      const { m3u8, ref } = (await getVixsrcStream('movie', tmdbId)) ?? {};
      if (!m3u8) {
        say('Backend tidak mengembalikan m3u8 (kemungkinan judul ini embed-only).');
        say('Coba TMDB id lain, atau kesimpulannya: judul ini masuk jalur EmbedPlayer.');
        return;
      }

      say(`m3u8 didapat. Referer yang diminta backend: ${ref || '(tidak ada)'}`);

      const list: Attempt[] = [
        { name: '1. Langsung, tanpa header', uri: m3u8 },
        {
          name: '2. Langsung + header Referer',
          uri: m3u8,
          headers: ref ? { Referer: ref } : undefined,
          // Tanpa Referer, percobaan 2 identik dengan percobaan 1 dan tidak
          // membuktikan apa pun. Ditandai supaya tidak salah dibaca "berhasil".
          skip: ref ? undefined : 'Backend tidak memberi Referer — percobaan ini sama dengan #1.',
        },
        {
          name: '3. Lewat stream.soora.fun/proxy',
          uri: `${STREAM_PROXY}?url=${encodeURIComponent(m3u8)}${
            ref ? `&referer=${encodeURIComponent(ref)}` : ''
          }`,
        },
      ];
      setAttempts(list);
      say('Pilih salah satu percobaan di bawah, lalu perhatikan apakah video jalan.');
    } catch (e) {
      say(`Gagal ambil sumber: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [tmdbId]);

  const run = async (a: Attempt) => {
    if (a.skip) {
      say(`⊘ ${a.name} — dilewati. ${a.skip}`);
      return;
    }
    setActive(a);
    setVerdict('memuat');
    say(`▶ ${a.name}`);
    say(`   header: ${a.headers ? JSON.stringify(a.headers) : '(tidak ada)'}`);
    try {
      // Penggantian imperatif: selalu memuat ulang, termasuk saat menekan
      // tombol yang sama dua kali untuk mencoba lagi.
      await player.replaceAsync({ uri: a.uri, headers: a.headers });
      player.play();
    } catch (e) {
      setVerdict('gagal');
      say(`   gagal memuat: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Text style={s.heading}>Spike: header Referer</Text>
      <Text style={s.body}>
        Menguji apakah ExoPlayer bisa memutar m3u8 langsung dari CDN dengan header Referer sendiri,
        tanpa melewati proxy. Hasilnya menentukan arsitektur player di fase 3.
      </Text>

      <View style={s.field}>
        <Text style={s.label}>TMDB movie id</Text>
        <TextInput
          value={tmdbId}
          onChangeText={setTmdbId}
          keyboardType="number-pad"
          style={s.input}
          placeholderTextColor={colors.textDim}
        />
      </View>

      <Pressable style={({ pressed }) => [s.btn, pressed && s.pressed]} onPress={resolve}>
        <Text style={s.btnText}>Ambil sumber</Text>
      </Pressable>

      {attempts.map((a) => (
        <Pressable
          key={a.name}
          style={({ pressed }) => [s.btnGhost, (pressed || a.skip) && s.pressed]}
          onPress={() => {
            void run(a);
          }}
        >
          <Text style={s.btnGhostText}>{a.skip ? `${a.name} — dilewati` : a.name}</Text>
        </Pressable>
      ))}

      {active && (
        <View style={s.playerWrap}>
          <VideoView
            player={player}
            style={s.player}
            fullscreenOptions={{ enable: true }}
            allowsPictureInPicture
            nativeControls
          />
        </View>
      )}

      {active && (
        <View style={s.verdictRow}>
          <Text style={s.label}>Hasil percobaan ini:</Text>
          <Pressable style={s.verdictBtn} onPress={() => setVerdict('main')}>
            <Text style={[s.verdictText, { color: colors.success }]}>Jalan</Text>
          </Pressable>
          <Pressable style={s.verdictBtn} onPress={() => setVerdict('gagal')}>
            <Text style={[s.verdictText, { color: colors.danger }]}>Gagal</Text>
          </Pressable>
          <Text style={s.value}>{verdict}</Text>
        </View>
      )}

      <View style={s.logBox}>
        {log.length === 0 ? (
          <Text style={s.logLine}>Log kosong.</Text>
        ) : (
          log.map((l, i) => (
            <Text key={i} style={s.logLine}>
              {l}
            </Text>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.md },
  heading: { color: colors.text, fontSize: font.size.xl, fontWeight: '700' },
  body: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: font.size.sm * font.lineHeight.normal },
  field: { gap: space.xs },
  label: { color: colors.textDim, fontSize: font.size.sm },
  value: { color: colors.text, fontSize: font.size.sm },
  input: {
    minHeight: MIN_TOUCH,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: space.md,
    fontSize: font.size.base,
  },
  btn: {
    minHeight: MIN_TOUCH,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: onAccent, fontSize: font.size.base, fontWeight: '600' },
  btnGhost: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  btnGhostText: { color: colors.text, fontSize: font.size.sm },
  pressed: { opacity: 0.7 },
  playerWrap: {
    aspectRatio: 16 / 9,
    backgroundColor: colors.videoBg,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  player: { width: '100%', height: '100%' },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  verdictBtn: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  verdictText: { fontSize: font.size.sm, fontWeight: '600' },
  logBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.xs,
  },
  logLine: { color: colors.textMuted, fontSize: font.size.xs, fontFamily: 'monospace' },
});
