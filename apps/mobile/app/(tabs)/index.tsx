import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getAnimeHomeBundle } from '@soora/core/api';
import { getToken } from '@soora/core/user';
import { getCatalogCache } from '../../lib/db';
import { API_BASE } from '../../lib/config';
import { colors, font, radius, space } from '../../theme/tokens';

type Status = 'loading' | 'ok' | 'error';

/**
 * Layar Beranda fase 1 — sengaja belum berisi katalog sungguhan.
 *
 * Tugasnya membuktikan gate fase 1: satu request API asli menembus
 * @soora/core yang dikonfigurasi lewat configureCore(), hasilnya tersimpan di
 * SQLite lewat cache katalog, dan token MMKV terbaca. Kalau layar ini hijau,
 * artinya seluruh 1296 baris api.js dari web berjalan apa adanya di native.
 *
 * Katalog sungguhan dibangun di fase 2.
 */
export default function HomeScreen() {
  const [status, setStatus] = useState<Status>('loading');
  const [detail, setDetail] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [fromCache, setFromCache] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const cache = getCatalogCache();
      const before = cache.getEntry('home', 'anime');
      setFromCache(Boolean(before));

      const res = await cache.read(
        'home',
        'anime',
        async () => {
          const r = await getAnimeHomeBundle();
          return r?.data ?? r;
        },
        (fresh) => summarize(fresh)
      );

      summarize(res);
      setStatus('ok');
    } catch (e) {
      setDetail(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, []);

  const summarize = (data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const next: Record<string, number> = {};
    for (const k of ['spotlight', 'recentEpisodes', 'mostPopular', 'topAiring']) {
      const v = d[k];
      if (Array.isArray(v)) next[k] = v.length;
    }
    setCounts(next);
  };

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Text style={s.title}>Soora</Text>
      <Text style={s.subtitle}>Fase 1 — pemeriksaan fondasi</Text>

      <Row label="API base" value={API_BASE} />
      <Row label="Token MMKV" value={getToken() ? 'ada' : 'belum login'} />
      <Row label="Sumber data" value={fromCache ? 'cache SQLite' : 'jaringan'} />

      <View style={s.card}>
        {status === 'loading' && (
          <View style={s.center}>
            <ActivityIndicator color={colors.accent} />
            <Text style={s.muted}>Memuat bundle anime…</Text>
          </View>
        )}

        {status === 'ok' && (
          <>
            <Text style={s.ok}>Bundle diterima lewat @soora/core</Text>
            {Object.keys(counts).length === 0 ? (
              <Text style={s.muted}>Terhubung, tapi semua bagian kosong.</Text>
            ) : (
              Object.entries(counts).map(([k, n]) => <Row key={k} label={k} value={String(n)} />)
            )}
          </>
        )}

        {status === 'error' && (
          <>
            <Text style={s.err}>Request gagal</Text>
            <Text style={s.muted}>{detail}</Text>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.sm },
  title: { color: colors.text, fontSize: font.size.xxl, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: font.size.md, marginBottom: space.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    marginTop: space.lg,
    gap: space.sm,
  },
  center: { alignItems: 'center', gap: space.sm },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.xs,
  },
  rowLabel: { color: colors.textDim, fontSize: font.size.sm },
  rowValue: { color: colors.text, fontSize: font.size.sm, flexShrink: 1 },
  ok: { color: colors.success, fontSize: font.size.base, fontWeight: '600' },
  err: { color: colors.danger, fontSize: font.size.base, fontWeight: '600' },
  muted: { color: colors.textMuted, fontSize: font.size.sm },
});
