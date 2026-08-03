import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEventListener } from 'expo';
import { colors, font, space } from '../../theme/tokens';
import { TrackSheet, type SheetOption } from './TrackSheet';
import { PlayerControls, formatWaktu } from './PlayerControls';

/**
 * Pemutar native berbasis expo-video (ExoPlayer di Android).
 *
 * Memakai expo-video, bukan react-native-video: `staysActiveInBackground`,
 * `showNowPlayingNotification`, pemilihan trek audio dan subtitle, serta
 * `keepScreenOnWhilePlaying` semuanya sudah ada.
 *
 * Kontrolnya dibuat sendiri, `nativeControls` dimatikan. Kontrol bawaan
 * ExoPlayer tidak bisa diberi tombol kembali, tidak mengenal tema app, tidak
 * punya gestur ketuk-ganda untuk melompat, dan memaksa tombol audio/subtitle
 * diletakkan di bar terpisah di luar video — memakan tinggi layar yang justru
 * paling langka di ponsel.
 *
 * Satu hal yang TIDAK didukung: pemilihan kualitas manual. `videoTrack` di
 * expo-video read-only, jadi kualitas sepenuhnya ditentukan ABR ExoPlayer.
 *
 * `uri` SELALU URL proxy. Token m3u8 terikat IP VPS, jadi memutar URL CDN asli
 * dari perangkat selalu 403 — lihat buildProxyUrl di @soora/core/player.
 */
export function NativePlayer({
  uri,
  title,
  startAt = 0,
  onProgress,
  onError,
  onBack,
}: {
  uri: string;
  title?: string;
  startAt?: number;
  onProgress?: (position: number, duration: number) => void;
  onError?: (message: string) => void;
  onBack?: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState<null | 'audio' | 'subtitle' | 'speed'>(null);
  const [tampilKontrol, setTampilKontrol] = useState(true);
  const [bermain, setBermain] = useState(true);
  const [posisi, setPosisi] = useState(0);
  const [durasi, setDurasi] = useState(0);
  const [buffered, setBuffered] = useState(0);
  /** Waktu pratinjau saat bilah diseret; null berarti tidak sedang diseret. */
  const [scrub, setScrub] = useState<number | null>(null);
  const [lompatan, setLompatan] = useState<null | { arah: -1 | 1; nonce: number }>(null);
  const seeded = useRef(false);

  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const lanskap = width > height;

  const player = useVideoPlayer({ uri }, (p: VideoPlayer) => {
    p.loop = false;
    // Audio lanjut saat app di-background — salah satu alasan utama APK ini ada.
    p.staysActiveInBackground = true;
    // Kontrol play/pause/seek di notifikasi dan layar kunci.
    p.showNowPlayingNotification = true;
    // Layar tidak mati saat menonton, tanpa perlu expo-keep-awake terpisah.
    p.keepScreenOnWhilePlaying = true;
    // Seek SEBELUM play. Kalau dibalik, user yang melanjutkan dari menit 45
    // akan melihat dan mendengar beberapa detik adegan pembuka lebih dulu,
    // baru melompat.
    if (startAt > 5) {
      p.currentTime = startAt;
      seeded.current = true;
    }
    // 1 detik, bukan 5. Bilah waktu yang hanya bergerak tiap 5 detik terlihat
    // patah-patah; penulisan progress ke penyimpanan tetap diredam terpisah
    // di bawah supaya frekuensinya tidak ikut naik.
    p.timeUpdateEventInterval = 1;
    p.play();
  });

  useEventListener(player, 'statusChange', ({ status, error }) => {
    if (status === 'readyToPlay') {
      setReady(true);
      setDurasi(player.duration || 0);
      // Cadangan kalau seek di setup belum sempat diterapkan sebelum sumber
      // siap. Sekali saja — kalau tidak, tiap perubahan status akan melempar
      // user kembali ke titik itu.
      if (!seeded.current && startAt > 5) {
        seeded.current = true;
        player.currentTime = startAt;
      }
    }
    if (status === 'error') {
      // `error` bisa kosong. Tanpa pesan cadangan, overlay memuat berputar
      // selamanya tanpa penjelasan dan tanpa tombol coba lagi.
      onError?.(error?.message || 'Pemutaran gagal tanpa pesan dari pemutar.');
    }
  });

  useEventListener(player, 'playingChange', ({ isPlaying }) => setBermain(isPlaying));

  // Posisi terakhir yang diketahui, disimpan di ref supaya tetap terbaca saat
  // unmount. Membaca `player.currentTime` di cleanup TIDAK bisa diandalkan:
  // effect internal expo-video yang melepas player terdaftar lebih dulu, jadi
  // saat cleanup kita berjalan objeknya sudah dilepas.
  const lastSeen = useRef({ position: 0, duration: 0 });
  const tulisTerakhir = useRef(0);

  useEventListener(player, 'timeUpdate', ({ currentTime, bufferedPosition }) => {
    const duration = player.duration || 0;
    lastSeen.current = { position: currentTime, duration };
    setPosisi(currentTime);
    setDurasi(duration);
    // -1 berarti buffer tidak bisa ditentukan; jangan gambarkan sebagai 0,
    // itu membuat lapisan buffer berkedip hilang.
    if (bufferedPosition >= 0) setBuffered(bufferedPosition);

    // Penyimpanan progress tetap ~5 detik sekali meski event tiap detik: tiap
    // penulisan mem-parse dan menulis ulang seluruh daftar di JS thread yang
    // sedang merender video.
    if (currentTime - tulisTerakhir.current >= 5 || currentTime < tulisTerakhir.current) {
      tulisTerakhir.current = currentTime;
      onProgress?.(currentTime, duration);
    }
  });

  /** Sembunyikan kontrol otomatis, tapi jangan saat sedang dijeda atau menyeret. */
  useEffect(() => {
    if (!tampilKontrol || !bermain || sheet !== null || scrub !== null) return;
    const t = setTimeout(() => setTampilKontrol(false), 3500);
    return () => clearTimeout(t);
  }, [tampilKontrol, bermain, sheet, scrub, posisi]);

  const lompat = useCallback(
    (delta: number) => {
      const d = player.duration || 0;
      const target = Math.min(d > 0 ? d : Infinity, Math.max(0, player.currentTime + delta));
      player.currentTime = target;
      setPosisi(target);
    },
    [player]
  );

  const lompatGestur = useCallback(
    (arah: -1 | 1) => {
      lompat(arah * 10);
      // nonce memaksa indikator muncul lagi walau arahnya sama dengan ketukan
      // sebelumnya; tanpa itu, ketuk-ganda beruntun tidak memberi umpan balik.
      setLompatan({ arah, nonce: Date.now() });
    },
    [lompat]
  );

  useEffect(() => {
    if (!lompatan) return;
    const t = setTimeout(() => setLompatan(null), 550);
    return () => clearTimeout(t);
  }, [lompatan]);

  const togglePlay = useCallback(() => {
    if (player.playing) player.pause();
    else player.play();
  }, [player]);

  /**
   * Tombol layar penuh memutar orientasi, bukan membesarkan view.
   *
   * Pemutar sudah mengisi layar; yang sebenarnya dicari user saat menekan
   * "layar penuh" di ponsel adalah gambar melebar ke sisi panjang layar. Video
   * 16:9 pada layar potret hanya memakai sekitar sepertiga tinggi.
   *
   * Keluar dari lanskap memakai `unlockAsync`, bukan mengunci potret: mengunci
   * berlaku untuk seluruh proses, sehingga layar lain ikut terkunci sampai app
   * ditutup paksa.
   */
  const togglePenuh = useCallback(() => {
    if (lanskap) void ScreenOrientation.unlockAsync();
    else void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  }, [lanskap]);

  // Kembalikan orientasi saat pemutar ditutup, kalau tidak user terdampar di
  // lanskap saat kembali ke daftar.
  useEffect(() => {
    return () => {
      void ScreenOrientation.unlockAsync();
    };
  }, []);

  /**
   * Ketuk tunggal membuka/menutup kontrol; ketuk ganda melompat 10 detik.
   *
   * `requireExternalGestureToFail` membuat ketuk tunggal menunggu ketuk ganda
   * gagal lebih dulu. Tanpa itu, tiap ketukan ganda juga memicu ketuk tunggal
   * dan kontrol berkedip muncul-hilang di tengah lompatan.
   */
  const ketukGanda = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(280)
    .onEnd((e) => {
      'worklet';
      runOnJS(lompatGestur)(e.x < width / 2 ? -1 : 1);
    });

  const ketukTunggal = Gesture.Tap()
    .numberOfTaps(1)
    .requireExternalGestureToFail(ketukGanda)
    .onEnd(() => {
      'worklet';
      runOnJS(setTampilKontrol)(!tampilKontrol);
    });

  const gestur = Gesture.Exclusive(ketukGanda, ketukTunggal);

  const audioOptions = useCallback((): SheetOption[] => {
    const tracks = player.availableAudioTracks ?? [];
    return tracks.map((t, i) => ({
      id: String(i),
      label: t.label || t.language || `Audio ${i + 1}`,
      active: player.audioTrack?.id === t.id,
    }));
  }, [player]);

  const subtitleOptions = useCallback((): SheetOption[] => {
    const tracks = player.availableSubtitleTracks ?? [];
    return [
      { id: 'off', label: 'Mati', active: player.subtitleTrack == null },
      ...tracks.map((t, i) => ({
        id: String(i),
        label: t.label || t.language || `Subtitle ${i + 1}`,
        active: player.subtitleTrack?.id === t.id,
      })),
    ];
  }, [player]);

  const speedOptions = useCallback(
    (): SheetOption[] =>
      [0.75, 1, 1.25, 1.5, 2].map((v) => ({
        id: String(v),
        label: v === 1 ? 'Normal' : `${v}x`,
        active: Math.abs(player.playbackRate - v) < 0.01,
      })),
    [player]
  );

  const pick = (id: string) => {
    if (sheet === 'audio') {
      player.audioTrack = player.availableAudioTracks[Number(id)] ?? null;
    } else if (sheet === 'subtitle') {
      player.subtitleTrack =
        id === 'off' ? null : (player.availableSubtitleTracks[Number(id)] ?? null);
    } else if (sheet === 'speed') {
      player.playbackRate = Number(id);
    }
    setSheet(null);
  };

  // Simpan posisi terakhir saat layar ditinggalkan. Memakai nilai ter-cache,
  // bukan membaca player — lihat catatan di `lastSeen`.
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  useEffect(() => {
    return () => {
      const { position, duration } = lastSeen.current;
      if (position > 0) onProgressRef.current?.(position, duration);
    };
  }, []);

  return (
    <View style={s.wrap}>
      <GestureDetector gesture={gestur}>
        <View style={s.isi}>
          <VideoView
            player={player}
            style={s.video}
            contentFit="contain"
            // Kontrol bawaan dimatikan; lihat catatan di atas komponen.
            nativeControls={false}
            allowsPictureInPicture
            startsPictureInPictureAutomatically
            fullscreenOptions={{ enable: true }}
          />
        </View>
      </GestureDetector>

      {!ready && (
        <View style={s.loading} pointerEvents="none">
          <ActivityIndicator color={colors.accent} size="large" />
          {title ? (
            <Text style={s.loadingText} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
        </View>
      )}

      {/* Umpan balik ketuk-ganda. Tanpa ini gestur terasa seperti tidak
          terjadi apa-apa sampai gambar berpindah. */}
      {lompatan && (
        <View
          style={[s.lompatIndikator, lompatan.arah === -1 ? s.lompatKiri : s.lompatKanan]}
          pointerEvents="none"
        >
          <Text style={s.lompatTeks}>{lompatan.arah === -1 ? '−10 dtk' : '+10 dtk'}</Text>
        </View>
      )}

      {/* Waktu tujuan saat menyeret, ditaruh di tengah gambar: jari user
          menutupi bilah di bawah, jadi angka di sana tidak terbaca. */}
      {scrub !== null && (
        <View style={s.scrubKotak} pointerEvents="none">
          <Text style={s.scrubTeks}>{formatWaktu(scrub)}</Text>
        </View>
      )}

      {tampilKontrol && ready && (
        <PlayerControls
          judul={title}
          bermain={bermain}
          posisi={scrub ?? posisi}
          durasi={durasi}
          buffered={buffered}
          penuh={lanskap}
          onPlayPause={togglePlay}
          onLompat={lompat}
          onScrub={setScrub}
          onSeek={(d) => {
            player.currentTime = d;
            setPosisi(d);
            setScrub(null);
          }}
          onKembali={() => onBack?.()}
          onPenuh={togglePenuh}
          onSheet={setSheet}
          inset={insets}
        />
      )}

      <TrackSheet
        visible={sheet !== null}
        title={sheet === 'audio' ? 'Audio' : sheet === 'subtitle' ? 'Subtitle' : 'Kecepatan'}
        options={
          sheet === 'audio'
            ? audioOptions()
            : sheet === 'subtitle'
              ? subtitleOptions()
              : sheet === 'speed'
                ? speedOptions()
                : []
        }
        onPick={pick}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

const ABSOLUT_ISI_PENUH = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.videoBg },
  isi: { flex: 1 },
  video: { flex: 1, width: '100%' },
  loading: {
    ...ABSOLUT_ISI_PENUH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
  },
  loadingText: { color: colors.textMuted, fontSize: font.size.sm, paddingHorizontal: space.xl },

  lompatIndikator: {
    position: 'absolute',
    top: '45%',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  lompatKiri: { left: '12%' },
  lompatKanan: { right: '12%' },
  lompatTeks: {
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.semibold,
  },

  scrubKotak: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  scrubTeks: {
    color: colors.text,
    fontSize: font.size.xl,
    fontWeight: font.weight.bold,
    fontVariant: ['tabular-nums'],
  },
});
