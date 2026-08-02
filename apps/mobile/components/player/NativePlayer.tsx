import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEventListener } from 'expo';
import { Captions, Gauge, Layers } from 'lucide-react-native';
import { colors, font, iconSize, iconStroke, onAccent, radius, space, MIN_TOUCH } from '../../theme/tokens';
import { TrackSheet, type SheetOption } from './TrackSheet';

/**
 * Pemutar native berbasis expo-video (ExoPlayer di Android).
 *
 * Memakai expo-video, bukan react-native-video: seluruh kemampuan yang
 * dibutuhkan fase 3 sudah ada — `staysActiveInBackground`,
 * `showNowPlayingNotification`, pemilihan trek audio dan subtitle, serta
 * `keepScreenOnWhilePlaying` — sementara paketnya sudah terpasang dan terbukti
 * mem-bundle sejak harness spike fase 1. Satu dependensi native lebih sedikit.
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
}: {
  uri: string;
  title?: string;
  startAt?: number;
  onProgress?: (position: number, duration: number) => void;
  onError?: (message: string) => void;
}) {
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState<null | 'audio' | 'subtitle' | 'speed'>(null);
  const seeded = useRef(false);

  const player = useVideoPlayer({ uri }, (p: VideoPlayer) => {
    p.loop = false;
    // Audio lanjut saat app di-background — salah satu alasan utama APK ini ada.
    p.staysActiveInBackground = true;
    // Kontrol play/pause/seek di notifikasi dan layar kunci.
    p.showNowPlayingNotification = true;
    // Layar tidak mati saat menonton, tanpa perlu expo-keep-awake terpisah.
    p.keepScreenOnWhilePlaying = true;
    // Laporan posisi tiap detik — cukup halus untuk menyimpan progress,
    // tapi tidak sesering frame sehingga tidak membebani bridge.
    p.timeUpdateEventInterval = 1;
    p.play();
  });

  useEventListener(player, 'statusChange', ({ status, error }) => {
    if (status === 'readyToPlay') {
      setReady(true);
      // Lanjutkan dari posisi terakhir, sekali saja — kalau tidak, tiap
      // perubahan status akan melempar user kembali ke titik itu.
      if (!seeded.current && startAt > 5) {
        seeded.current = true;
        player.currentTime = startAt;
      }
    }
    if (status === 'error' && error) onError?.(error.message);
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    onProgress?.(currentTime, player.duration || 0);
  });

  /**
   * Trek audio — VixSrc menyediakan Italia dan Inggris.
   *
   * Pemilihan KUALITAS video sengaja tidak ada: `videoTrack` di expo-video
   * bersifat read-only, jadi kualitas hanya bisa diatur otomatis oleh ABR
   * ExoPlayer. Kalau pemilihan manual jadi kebutuhan keras nanti, jalannya
   * adalah pindah ke react-native-video — bukan menambal di sini.
   */
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

  // Simpan posisi terakhir saat layar ditinggalkan, bukan hanya lewat
  // timeUpdate — user yang menekan back tepat setelah seek akan kehilangan
  // beberapa detik terakhir kalau tidak.
  useEffect(() => {
    return () => {
      try {
        onProgress?.(player.currentTime, player.duration || 0);
      } catch {
        /* player sudah dilepas */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={s.wrap}>
      <VideoView
        player={player}
        style={s.video}
        contentFit="contain"
        nativeControls
        allowsPictureInPicture
        startsPictureInPictureAutomatically
        fullscreenOptions={{ enable: true }}
      />

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

      {/* Kontrol tambahan di luar kontrol bawaan: pemilih audio, subtitle,
          dan kecepatan. Kontrol transport (play/seek) sengaja dibiarkan bawaan
          supaya perilaku PiP dan notifikasi lockscreen tetap konsisten. */}
      <View style={s.extras}>
        <ExtraButton icon="audio" label="Audio" onPress={() => setSheet('audio')} />
        <ExtraButton icon="subtitle" label="Subtitle" onPress={() => setSheet('subtitle')} />
        <ExtraButton icon="speed" label="Kecepatan" onPress={() => setSheet('speed')} />
      </View>

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

function ExtraButton({
  icon,
  label,
  onPress,
}: {
  icon: 'audio' | 'subtitle' | 'speed';
  label: string;
  onPress: () => void;
}) {
  const Icon = icon === 'audio' ? Layers : icon === 'subtitle' ? Captions : Gauge;
  return (
    <Pressable
      style={({ pressed }) => [s.extraBtn, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon size={iconSize.sm} color={colors.text} strokeWidth={iconStroke} />
      <Text style={s.extraText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.videoBg },
  video: { flex: 1, width: '100%' },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
  },
  loadingText: { color: colors.textMuted, fontSize: font.size.sm, paddingHorizontal: space.xl },
  extras: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    backgroundColor: colors.videoBg,
  },
  extraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: MIN_TOUCH,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  extraText: { color: colors.text, fontSize: font.size.xs },
});

export { onAccent };
