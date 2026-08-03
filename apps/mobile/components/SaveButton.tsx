import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Bookmark, BookmarkCheck } from 'lucide-react-native';
import { addToMyList, isInMyList, removeFromMyList, type ListItem } from '../lib/mylist';
import { colors, font, iconSize, iconStroke, radius, space, MIN_TOUCH } from '../theme/tokens';

/**
 * Tombol simpan ke Daftar Saya.
 *
 * State dibaca sekali saat mount lalu dikelola lokal — penyimpanan MMKV
 * sinkron, jadi tidak perlu menunggu apa pun dan tombolnya berubah seketika.
 */
export function SaveButton({ item }: { item: Omit<ListItem, 'addedAt'> }) {
  const [saved, setSaved] = useState(() => isInMyList(item.listType, item.id));

  const toggle = () => {
    // Status hanya berubah kalau penyimpanan benar-benar berhasil. Sebelumnya
    // tombol selalu berubah jadi "Tersimpan"; saat penyimpanan penuh, user
    // melihat konfirmasi palsu lalu judulnya hilang begitu layar dibuka ulang.
    const ok = saved
      ? removeFromMyList(item.listType, item.id)
      : addToMyList(item);
    if (ok) setSaved(!saved);
  };

  const Icon = saved ? BookmarkCheck : Bookmark;

  return (
    <Pressable
      style={({ pressed }) => [s.btn, saved && s.btnSaved, pressed && s.pressed]}
      onPress={toggle}
      accessibilityRole="button"
      accessibilityState={{ selected: saved }}
      accessibilityLabel={saved ? `Hapus ${item.title} dari daftar` : `Simpan ${item.title}`}
    >
      <Icon
        size={iconSize.sm}
        color={saved ? colors.accent : colors.text}
        strokeWidth={iconStroke}
      />
      <Text style={[s.text, saved && s.textSaved]}>{saved ? 'Tersimpan' : 'Simpan'}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: MIN_TOUCH,
    marginHorizontal: space.lg,
    marginTop: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnSaved: { borderColor: colors.accent },
  text: { color: colors.text, fontSize: font.size.md, fontWeight: '600' },
  textSaved: { color: colors.accent },
  pressed: { opacity: 0.7 },
});
