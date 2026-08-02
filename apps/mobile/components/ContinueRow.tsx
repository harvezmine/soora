import { FlashList } from '@shopify/flash-list';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Play } from 'lucide-react-native';
import { colors, font, iconSize, iconStroke, onAccent, radius, space } from '../theme/tokens';
import type { ProgressEntry } from '../lib/progress';

/**
 * Baris "Lanjut Tonton".
 *
 * Berbeda dari SectionRow: sumbernya posisi tontonan di MMKV, bukan katalog
 * dari jaringan — jadi baris ini tetap terisi sepenuhnya saat offline.
 */
const CARD_W = 190;

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} j ${m % 60} m` : `${m} m`;
}

const keyOf = (e: ProgressEntry) => e.id;

export function ContinueRow({ items }: { items: ProgressEntry[] }) {
  const router = useRouter();
  if (!items.length) return null;

  return (
    <View style={s.wrap}>
      <Text style={s.title}>Lanjut Tonton</Text>
      <FlashList
        data={items}
        horizontal
        keyExtractor={keyOf}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.list}
        ItemSeparatorComponent={Separator}
        renderItem={({ item }) => {
          const pct = item.duration > 0 ? Math.min(1, item.position / item.duration) : 0;
          return (
            <Pressable
              style={({ pressed }) => [s.card, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={`Lanjutkan ${item.title}`}
              onPress={() =>
                router.push(
                  `/watch/${encodeURIComponent(item.id)}?kind=${item.kind}&title=${encodeURIComponent(
                    item.title
                  )}` as never
                )
              }
            >
              <View style={s.thumb}>
                <Play size={iconSize.lg} color={onAccent} strokeWidth={iconStroke} fill={onAccent} />
              </View>
              {/* Bar progres di bawah thumbnail — pola yang sama dengan web,
                  dan satu-satunya penanda visual seberapa jauh tontonannya. */}
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${pct * 100}%` }]} />
              </View>
              <Text style={s.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={s.cardMeta}>
                {item.duration > 0
                  ? `Sisa ${fmt(item.duration - item.position)}`
                  : fmt(item.position)}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const Separator = () => <View style={{ width: space.md }} />;

const s = StyleSheet.create({
  wrap: { paddingTop: space.xl, gap: space.md },
  title: {
    color: colors.text,
    fontSize: font.size.lg,
    fontWeight: '600',
    paddingHorizontal: space.lg,
  },
  list: { paddingHorizontal: space.lg },
  card: { width: CARD_W },
  thumb: {
    width: CARD_W,
    height: CARD_W * 0.56,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barTrack: {
    height: 3,
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    marginTop: space.xs,
    overflow: 'hidden',
  },
  barFill: { height: 3, backgroundColor: colors.accent },
  cardTitle: {
    color: colors.text,
    fontSize: font.size.sm,
    marginTop: space.xs,
    lineHeight: font.size.sm * font.lineHeight.tight,
  },
  cardMeta: { color: colors.textDim, fontSize: font.size.xs, marginTop: 2 },
});
