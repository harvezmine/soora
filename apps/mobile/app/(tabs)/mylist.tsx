import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useRouter } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { isLoggedIn } from '@soora/core/user';
import { listMyList, removeFromMyList, syncMyList, type ListItem } from '../../lib/mylist';
import { Poster } from '../../components/Poster';
import { EmptyState } from '../../components/States';
import { colors, font, iconSize, iconStroke, radius, space, MIN_TOUCH } from '../../theme/tokens';

const keyOf = (e: ListItem) => `${e.listType}:${e.id}`;

export default function MyListScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ListItem[]>([]);

  // Dimuat ulang tiap layar mendapat fokus. Layar tab tidak pernah di-unmount,
  // jadi useEffect biasa hanya akan berjalan sekali seumur proses — sementara
  // user menambah judul dari layar detail lalu kembali ke sini.
  useFocusEffect(
    useCallback(() => {
      setItems(listMyList());
      // Sinkron akun berjalan di belakang; daftar lokal sudah tampil duluan.
      if (isLoggedIn()) void syncMyList().then(setItems);
    }, [])
  );

  const hrefFor = (e: ListItem) => {
    const id = encodeURIComponent(e.id);
    if (e.listType === 'manga') return `/manga/${id}`;
    if (e.listType === 'anime') return `/anime/${id}`;
    return `/movie/${id}?kind=${e.listType}&source=tmdb`;
  };

  const remove = (e: ListItem) => {
    removeFromMyList(e.listType, e.id);
    setItems(listMyList());
  };

  return (
    <View style={s.screen}>
      <FlashList
        data={items}
        keyExtractor={keyOf}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <View style={s.head}>
            <Text style={s.heading}>Daftar Saya</Text>
            {!isLoggedIn() && items.length > 0 ? (
              <Text style={s.note}>
                Belum masuk — daftar ini hanya tersimpan di perangkat ini.
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="Daftar masih kosong"
            body="Simpan anime, film, atau manga dari halaman detailnya, lalu semuanya muncul di sini."
          />
        }
        renderItem={({ item }) => (
          <View style={s.row}>
            <Pressable
              style={({ pressed }) => [s.rowMain, pressed && s.pressed]}
              onPress={() => router.push(hrefFor(item) as never)}
              accessibilityRole="button"
              accessibilityLabel={item.title}
            >
              <View style={s.thumb}>
                <Poster
                  source={{ uri: item.poster ?? '' }}
                  recyclingKey={keyOf(item)}
                />
              </View>
              <View style={s.meta}>
                <Text style={s.title} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={s.type}>{labelFor(item.listType)}</Text>
              </View>
            </Pressable>

            <Pressable
              style={({ pressed }) => [s.del, pressed && s.pressed]}
              onPress={() => remove(item)}
              accessibilityRole="button"
              accessibilityLabel={`Hapus ${item.title} dari daftar`}
              hitSlop={8}
            >
              <Trash2 size={iconSize.md} color={colors.textDim} strokeWidth={iconStroke} />
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

function labelFor(t: ListItem['listType']) {
  if (t === 'anime') return 'Anime';
  if (t === 'manga') return 'Manga';
  if (t === 'tv') return 'Serial';
  return 'Film';
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { paddingBottom: space.xxxl },
  head: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.xs },
  heading: { color: colors.text, fontSize: font.size.xl, fontWeight: '700' },
  note: { color: colors.textDim, fontSize: font.size.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
  },
  thumb: {
    width: 52,
    height: 78,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  meta: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: font.size.md },
  type: { color: colors.textDim, fontSize: font.size.xs },
  del: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
