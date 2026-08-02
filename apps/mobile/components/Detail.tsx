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
  meta?: string[];
  synopsis?: string;
}) {
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
          {meta && meta.length > 0 ? (
            <Text style={s.meta}>{meta.filter(Boolean).join(' · ')}</Text>
          ) : null}
        </View>
      </View>

      {synopsis ? <Text style={s.synopsis}>{synopsis}</Text> : null}
    </View>
  );
}

/** Satu baris episode atau chapter. */
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
});
