import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Search } from 'lucide-react-native';
import { buildEpisodeRanges, splitLabel } from '@soora/core/models';
import {
  colors,
  font,
  iconSize,
  iconStroke,
  onAccent,
  radius,
  space,
  MIN_TOUCH,
} from '../theme/tokens';

export type Episode = {
  id?: string;
  number?: number | string;
  title?: string;
};

type Props = {
  episodes: Episode[];
  /** Episode yang sedang/terakhir ditonton, ditandai. */
  aktifId?: string | null;
  onPilih: (ep: Episode) => void;
};

/**
 * Grid episode dengan pemilih rentang, pencarian, dan urutan — mengikuti web.
 *
 * Grid bernomor, bukan daftar baris: satu baris per episode berarti judul
 * dengan 1.100 episode memakan gulungan yang tak masuk akal. Web memakai grid
 * untuk alasan yang sama.
 */
export function EpisodeGrid({ episodes, aktifId, onPilih }: Props) {
  const [cari, setCari] = useState('');
  const [rentangAktif, setRentangAktif] = useState(0);
  const [terbaruDulu, setTerbaruDulu] = useState(false);

  const urut = useMemo(
    () => (terbaruDulu ? [...episodes].reverse() : episodes),
    [episodes, terbaruDulu]
  );

  const rentang = useMemo(() => buildEpisodeRanges(urut), [urut]);

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    // Saat mencari, rentang diabaikan: hasil bisa tersebar di beberapa rentang
    // dan menyaring dua kali membuat episode yang cocok tidak muncul.
    if (q) {
      return urut.filter(
        (ep) =>
          String(ep.number ?? '').toLowerCase().includes(q) ||
          String(ep.title ?? '').toLowerCase().includes(q)
      );
    }
    const r = rentang[rentangAktif] ?? rentang[0];
    return r ? urut.slice(r.start, r.end) : urut;
  }, [urut, cari, rentang, rentangAktif]);

  if (episodes.length === 0) return null;

  return (
    <View>
      <View style={s.alat}>
        <View style={s.kolom}>
          <Search size={iconSize.sm} color={colors.textDim} strokeWidth={iconStroke} />
          <TextInput
            value={cari}
            onChangeText={setCari}
            placeholder={`Cari di ${episodes.length} episode…`}
            placeholderTextColor={colors.textDim}
            style={s.input}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Cari episode"
          />
        </View>
        <Pressable
          onPress={() => {
            setTerbaruDulu((v) => !v);
            // Rentang dihitung ulang setelah dibalik; tetap di indeks lama akan
            // menampilkan potongan yang berbeda dari labelnya.
            setRentangAktif(0);
          }}
          style={({ pressed }) => [s.tombolUrut, pressed && s.ditekan]}
          accessibilityRole="button"
          accessibilityLabel={
            terbaruDulu ? 'Urutkan dari episode pertama' : 'Urutkan dari episode terbaru'
          }
        >
          {terbaruDulu ? (
            <ArrowDownWideNarrow size={iconSize.sm} color={colors.text} strokeWidth={iconStroke} />
          ) : (
            <ArrowUpNarrowWide size={iconSize.sm} color={colors.text} strokeWidth={iconStroke} />
          )}
        </Pressable>
      </View>

      {rentang.length > 1 && !cari.trim() ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.rentangBaris}
        >
          {rentang.map((r, i) => {
            const aktif = i === rentangAktif;
            return (
              <Pressable
                key={r.label}
                onPress={() => setRentangAktif(i)}
                style={[s.rentangChip, aktif && s.rentangAktif]}
                accessibilityRole="tab"
                accessibilityState={{ selected: aktif }}
                accessibilityLabel={`Episode ${r.label}`}
              >
                <Text style={[s.rentangTeks, aktif && s.rentangTeksAktif]}>{r.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={s.grid}>
        {tampil.map((ep, i) => {
          const aktif = Boolean(aktifId) && ep.id === aktifId;
          // Sel hanya memuat NOMOR. Judul episode dijejalkan ke dalam sel
          // 56px akan terpotong jadi satu-dua huruf yang tidak berarti;
          // judulnya dibawa ke label aksesibilitas.
          const { nomor, judul } = splitLabel(ep, i);
          const label = nomor;
          return (
            <Pressable
              key={ep.id ?? `ep-${label}-${i}`}
              onPress={() => onPilih(ep)}
              style={({ pressed }) => [s.sel, aktif && s.selAktif, pressed && s.ditekan]}
              accessibilityRole="button"
              accessibilityLabel={judul ? `Episode ${nomor}: ${judul}` : `Episode ${nomor}`}
            >
              <Text style={[s.selTeks, aktif && s.selTeksAktif]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tampil.length === 0 ? (
        <Text style={s.kosong}>Tidak ada episode yang cocok dengan “{cari.trim()}”.</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  alat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  kolom: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: MIN_TOUCH,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: { flex: 1, color: colors.text, fontSize: font.size.base, paddingVertical: 0 },
  tombolUrut: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ditekan: { opacity: 0.75 },

  rentangBaris: { gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.md },
  rentangChip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rentangAktif: { backgroundColor: colors.accent, borderColor: colors.accent },
  rentangTeks: { color: colors.textMuted, fontSize: font.size.sm, fontWeight: font.weight.medium },
  rentangTeksAktif: { color: onAccent },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  sel: {
    // 56px memberi empat sampai lima kolom pada ponsel umum, dan tetap di atas
    // ambang sentuh 48dp.
    minWidth: 56,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selAktif: { backgroundColor: colors.accent, borderColor: colors.accent },
  selTeks: {
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.medium,
    fontVariant: ['tabular-nums'],
  },
  selTeksAktif: { color: onAccent },

  kosong: {
    color: colors.textDim,
    fontSize: font.size.sm,
    textAlign: 'center',
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
  },
});
