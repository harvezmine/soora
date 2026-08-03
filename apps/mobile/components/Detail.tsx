import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Poster, type ImageSource } from './Poster';
import { colors, font, radius, space, MIN_TOUCH } from '../theme/tokens';

/**
 * Bagian atas layar detail — dipakai bersama oleh anime, film, dan manga.
 *
 * Ketiganya menampilkan hal yang sama: latar besar, poster, judul, metadata,
 * sinopsis. Menyatukannya di sini mencegah tiga salinan yang perlahan berbeda.
 */
export function DetailHeader({
  title,
  poster,
  backdrop,
  meta,
  synopsis,
}: {
  title: string;
  poster?: ImageSource;
  backdrop?: ImageSource;
  /** Bentuknya sengaja longgar: penyedia tidak konsisten. */
  meta?: unknown[];
  synopsis?: string;
}) {
  /**
   * Metadata dipaksa jadi teks di sini, bukan dipercaya sudah berupa string.
   *
   * Penyedia mengembalikan bentuk yang tidak seragam: skor Samehadaku adalah
   * objek `{ value, users }`, bukan angka. Dulu meta digabung dengan join()
   * sehingga objek hanya tampil sebagai "[object Object]" — jelek tapi tidak
   * menjatuhkan layar. Begitu meta dirender sebagai anak React satu per satu,
   * objek yang sama melempar dan seluruh layar detail anime jatuh.
   */
  const metaBersih = (meta ?? [])
    .map((m) => {
      if (typeof m === 'string') return m.trim();
      if (typeof m === 'number') return String(m);
      if (m && typeof m === 'object') {
        const o = m as { value?: unknown; name?: string; title?: string };
        return String(o.value ?? o.name ?? o.title ?? '').trim();
      }
      return '';
    })
    .filter(Boolean);

  return (
    <View>
      <View style={s.backdropBox}>
        <Poster source={backdrop ?? poster} recyclingKey={`bd-${title}`} />
        <LinearGradient
          colors={['transparent', 'rgba(6,6,14,0.85)', colors.bg]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </View>

      <View style={s.head}>
        <View style={s.posterBox}>
          <Poster source={poster} recyclingKey={`ps-${title}`} />
        </View>
        <View style={s.headText}>
          <Text style={s.title}>{title}</Text>
          {/* Badge terpisah, bukan satu baris teks dipisah titik: status,
              tipe, dan skor adalah fakta yang berbeda jenis, dan disatukan
              jadi satu kalimat panjang keduanya sama-sama sulit dipindai. */}
          {metaBersih.length > 0 ? (
            <View style={s.badgeBaris}>
              {metaBersih.map((m) => (
                <View key={m} style={s.badge}>
                  <Text style={s.badgeTeks}>{m}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      {synopsis ? <Sinopsis teks={synopsis} /> : null}
    </View>
  );
}

/** Satu baris episode atau chapter. */
/**
 * Sinopsis dengan lipatan.
 *
 * Dipotong pada empat baris lalu diberi tombol. Memotong diam-diam dengan
 * numberOfLines saja menyembunyikan fakta bahwa masih ada teks; menampilkan
 * seluruhnya mendorong daftar episode jauh ke bawah pada judul bersinopsis
 * panjang.
 */
function Sinopsis({ teks }: { teks: string }) {
  const [terbuka, setTerbuka] = useState(false);
  const [bisaBuka, setBisaBuka] = useState(false);

  return (
    <View>
      <Text
        style={s.synopsis}
        numberOfLines={terbuka ? undefined : 4}
        onTextLayout={(e) => {
          // Tombol hanya muncul kalau teksnya memang terpotong. Menampilkan
          // "Selengkapnya" untuk sinopsis dua baris terasa rusak.
          if (!terbuka && e.nativeEvent.lines.length > 4) setBisaBuka(true);
        }}
      >
        {teks}
      </Text>
      {bisaBuka ? (
        <Pressable
          onPress={() => setTerbuka((v) => !v)}
          style={s.lipat}
          accessibilityRole="button"
          accessibilityLabel={terbuka ? 'Persingkat sinopsis' : 'Baca sinopsis selengkapnya'}
        >
          <Text style={s.lipatTeks}>{terbuka ? 'Persingkat' : 'Selengkapnya'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ListRow({
  label,
  sub,
  onPress,
}: {
  label: string;
  sub?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [s.row, pressed && s.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={s.rowText}>
        <Text style={s.rowLabel} numberOfLines={2}>
          {label}
        </Text>
        {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={s.sectionTitle}>{children}</Text>;
}

const s = StyleSheet.create({
  backdropBox: { height: 200, backgroundColor: colors.surfaceRaised },
  head: {
    flexDirection: 'row',
    gap: space.lg,
    paddingHorizontal: space.lg,
    // Poster naik menimpa backdrop, pola umum layar detail.
    marginTop: -70,
  },
  posterBox: {
    width: 110,
    height: 165,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  headText: { flex: 1, justifyContent: 'flex-end', gap: space.xs, paddingBottom: space.sm },
  title: { color: colors.text, fontSize: font.size.lg, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: font.size.sm },
  synopsis: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    lineHeight: font.size.sm * font.lineHeight.normal,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: font.size.lg,
    fontWeight: '600',
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.sm,
  },
  row: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: { opacity: 0.7 },
  rowText: { gap: 2 },
  rowLabel: { color: colors.text, fontSize: font.size.md },
  rowSub: { color: colors.textDim, fontSize: font.size.xs },
  badgeBaris: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm },
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  badgeTeks: { color: colors.textMuted, fontSize: font.size.xs, fontWeight: font.weight.medium },
  lipat: {
    alignSelf: 'flex-start',
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  lipatTeks: { color: colors.accent, fontSize: font.size.sm, fontWeight: font.weight.semibold },
});
