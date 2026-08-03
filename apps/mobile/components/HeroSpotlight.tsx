import { useEffect, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Play } from 'lucide-react-native';
import { Poster } from './Poster';
import { hrefFor, type MediaItem } from './MediaCard';
import { colors, font, iconSize, iconStroke, onAccent, radius, space, MIN_TOUCH } from '../theme/tokens';

/**
 * Kartu sorotan di puncak Beranda.
 *
 * Memakai backdrop kalau ada; kalau tidak, poster. Gradien gelap di bawah
 * memastikan judul tetap terbaca berapa pun terangnya gambar — tanpa itu,
 * judul putih di atas poster cerah bisa turun jauh di bawah rasio kontras 4.5:1.
 */
/** Satu kartu sorotan. */
function Kartu({ item, lebar }: { item: MediaItem; lebar: number }) {
  const router = useRouter();

  return (
    <Pressable
      style={({ pressed }) => [s.wrap, { width: lebar }, pressed && s.pressed]}
      onPress={() => router.push(hrefFor(item) as never)}
      accessibilityRole="button"
      accessibilityLabel={`Sorotan: ${item.title}`}
    >
      <Poster source={item.backdrop ?? item.poster} recyclingKey={`hero-${item.id}`} />

      <LinearGradient
        colors={['transparent', 'rgba(6,6,14,0.75)', colors.bg]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={s.info}>
        <Text style={s.title} numberOfLines={2}>
          {item.title}
        </Text>
        {item.subtitle ? <Text style={s.meta}>{item.subtitle}</Text> : null}
        <View style={s.cta}>
          <Play size={iconSize.sm} color={onAccent} strokeWidth={iconStroke} fill={onAccent} />
          <Text style={s.ctaText}>Lihat detail</Text>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Sorotan berbentuk carousel.
 *
 * Menerima satu item atau beberapa. Dengan satu item ia berperilaku persis
 * seperti sebelumnya — tanpa titik indikator dan tanpa pergantian otomatis,
 * karena carousel satu halaman hanya menambah elemen yang tidak berarti.
 *
 * Pergantian otomatis berhenti begitu user menggeser sendiri. Carousel yang
 * terus berpindah saat sedang dilihat membuat orang kehilangan judul yang baru
 * saja menarik perhatiannya.
 */
export function HeroSpotlight({
  item,
  items,
}: {
  item?: MediaItem | null;
  items?: MediaItem[];
}) {
  const daftar = (items && items.length ? items : item ? [item] : []).slice(0, 5);
  const { width } = useWindowDimensions();
  const [aktif, setAktif] = useState(0);
  const [otomatis, setOtomatis] = useState(true);
  const listRef = useRef<FlatList<MediaItem> | null>(null);

  useEffect(() => {
    // 8 detik, bukan 5: pada 5 detik banner berpindah sebelum judulnya sempat
    // dibaca, dan itu terasa mengganggu alih-alih hidup.
    if (!otomatis || daftar.length < 2) return;
    const t = setInterval(() => {
      setAktif((i) => {
        const berikut = (i + 1) % daftar.length;
        listRef.current?.scrollToOffset({ offset: berikut * width, animated: true });
        return berikut;
      });
    }, 8000);
    return () => clearInterval(t);
  }, [otomatis, daftar.length, width]);

  if (daftar.length === 0) return null;

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    setAktif(Math.min(daftar.length - 1, Math.max(0, i)));
  };

  return (
    <View>
      <FlatList
        ref={listRef}
        data={daftar}
        keyExtractor={(x) => `${x.kind}:${x.id}`}
        renderItem={({ item: x }) => <Kartu item={x} lebar={width} />}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        // Berhenti PERMANEN setelah sentuhan pertama, bukan hanya selama
        // digeser: user yang sudah memilih sendiri tidak ingin dipindahkan
        // lagi beberapa detik kemudian.
        onTouchStart={() => setOtomatis(false)}
        // Lebar tetap per halaman; tanpa ini FlatList mengukur tiap kartu dan
        // scrollToOffset bisa meleset setengah halaman.
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
      />

      {daftar.length > 1 ? (
        <View style={s.titik} pointerEvents="none">
          {daftar.map((x, i) => (
            <View key={`${x.kind}:${x.id}`} style={[s.titikSatu, i === aktif && s.titikAktif]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  titik: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: -space.md,
    marginBottom: space.sm,
  },
  titikSatu: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  titikAktif: { backgroundColor: colors.accent, width: 18 },
  wrap: {
    height: 260,
    marginHorizontal: space.lg,
    marginTop: space.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  pressed: { opacity: 0.9 },
  info: { position: 'absolute', left: space.lg, right: space.lg, bottom: space.lg, gap: space.xs },
  title: { color: colors.text, fontSize: font.size.xl, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: font.size.sm },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    alignSelf: 'flex-start',
    minHeight: MIN_TOUCH,
    paddingHorizontal: space.xl,
    marginTop: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  ctaText: { color: onAccent, fontSize: font.size.md, fontWeight: '600' },
});
