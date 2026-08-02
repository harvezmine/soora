# Fase 2 — Katalog: implementation plan

**Tanggal:** 2026-08-03
**Spec induk:** [2026-08-02-soora-native-apk-design.md](../specs/2026-08-02-soora-native-apk-design.md) §7.2 fase 2
**Prasyarat:** Fase 1 selesai (commit `f4ef523`)

---

## Tujuan

Mengubah rangka Fase 1 menjadi aplikasi katalog yang benar-benar bisa dipakai:
Beranda, Cari, Manga, dan tiga layar Info. Player dan reader tetap placeholder.

**Definisi selesai:** user bisa membuka app tanpa jaringan dan menelusuri
katalog yang pernah dilihat; dengan jaringan, bisa mencari judul dan membuka
halaman detailnya sampai ke daftar episode/chapter.

## Bukan bagian fase ini

Player, MangaReader, MyList, Profil lengkap, download offline, login.
Browse dan search publik — sesuai gate web, hanya `/watch/*` dan baca manga
yang butuh akun.

---

## Masalah utama: bentuk data tidak konsisten

Ini bagian yang paling mungkin melebihi perkiraan, jadi dikerjakan lebih dulu.

`packages/core/src/api/index.js` mengembalikan tiga bentuk berbeda:

| Fungsi | Bentuk kembalian |
|---|---|
| `getAnimeHomeBundle()` | respons axios — `res.data.spotlight`, `res.data.recentEpisodes`, … |
| `getMovieHomeBundle()` | objek `{ data: { trendingMovies, trendingTV, lk21Popular, … } }` |
| `getMangaHomeBundle()` | respons axios |
| `searchAnime()` | respons axios — `res.data.results` |
| `getGokuTrendingMovies()` | `{ data: [...] }` sudah dinormalkan sebagian |
| `getLK21HomeBundle()` | respons axios, item pakai `_id` bukan `id` |

Item-nya juga beda-beda. Web menanganinya tersebar di komponen; `Card.jsx`
menerima `id`, `animeId`, `lk21Id`, `image`, `cover`, `type`, `mediaType`,
`provider`, `rating`, `episodes`, `sub`, `dub`, `subOrDub` dan memilih mana
yang ada.

**Keputusan:** normalisasi dipusatkan di `packages/core/src/models/`, bukan di
komponen mobile. Alasannya web nanti bisa memakainya juga, dan aturan
"provider X memakai field Y" hanya hidup di satu tempat — penting karena
provider sering berganti.

Normalisasi TIDAK mengubah fungsi API yang ada. Dia lapisan di atasnya, jadi
web tidak tersentuh dan Fase 2 tidak bisa merusak produksi.

---

## Langkah 1 — Model ternormalisasi (`packages/core/models`)

Satu bentuk untuk semua kartu:

```js
/**
 * @typedef {object} MediaItem
 * @property {string} id            id kanonik untuk navigasi
 * @property {string} title
 * @property {string} poster        URL siap pakai, sudah lewat proxy bila perlu
 * @property {string} [backdrop]
 * @property {'anime'|'movie'|'tv'|'manga'} kind
 * @property {string} source        provider asal: hianime | goku | lk21 | tmdb | mangapill | komiku
 * @property {string} [badge]       teks sudut kartu: "EP 12", "HD", "Ch. 340"
 * @property {number} [rating]      0–100
 * @property {string} [subtitle]    baris kedua: tahun, tipe, bahasa
 */
```

Fungsi:

- `normalizeAnime(raw, source)`
- `normalizeMovie(raw, source)`
- `normalizeManga(raw, source)`
- `normalizeList(rawArray, kind, source)` — memfilter entri yang tidak bisa dipakai daripada merender kartu rusak
- `unwrap(res)` — menangani ketiga bentuk kembalian di atas jadi satu

**Test:** fixture nyata dari tiap provider (disalin dari respons produksi),
memastikan setiap fixture menghasilkan `MediaItem` valid, dan entri cacat
dibuang bukan diloloskan. Ini test paling berharga di fase ini — provider mati
akan terdeteksi di sini lebih dulu.

## Langkah 2 — Hook data (`apps/mobile/lib/useCatalog.ts`)

```ts
const { data, status, error, refresh, refreshing, stale } =
  useCatalog('home', 'anime', () => getAnimeHomeBundle())
```

Membungkus `catalogCache.read()` yang sudah ada, ditambah:

- penjaga mount, supaya callback refresh tidak setState setelah layar hilang
- `status`: `'idle' | 'loading' | 'ready' | 'error'` — `ready` bisa disertai
  `stale: true` saat menampilkan data cache sambil menyegarkan
- `refresh()` untuk pull-to-refresh dan tombol coba lagi
- dedup sudah ditangani lapisan cache

Varian `useCatalogQuery` untuk pencarian: debounce 350 ms, membatalkan kueri
usang, dan tidak menyimpan kueri kosong.

## Langkah 3 — Komponen bersama (`apps/mobile/components/`)

| Komponen | Catatan |
|---|---|
| `Poster` | `expo-image`, `contentFit="cover"`, blurhash placeholder, `recyclingKey` |
| `MediaCard` | Poster + judul + badge; area sentuh penuh ≥48dp |
| `SectionRow` | Baris horizontal `FlashList`, judul section, "Lihat semua" |
| `MediaGrid` | Grid `FlashList` untuk hasil cari |
| `HeroSpotlight` | Backdrop besar + judul + tombol |
| `SkeletonRow` / `SkeletonGrid` | Hanya saat cache kosong |
| `EmptyState` | "Belum ada apa-apa di sini" + aksi |
| `ErrorState` | Pesan + tombol Coba lagi + indikator offline |
| `OfflineBanner` | Muncul saat `stale` dan fetch gagal |

Dua dependensi baru: `@shopify/flash-list` dan `expo-image`.

`ErrorState` bukan pelengkap. Sumber stream Soora sering mati; layar harus
mengatakan "provider sedang tidak tersedia" dengan jelas, bukan menampilkan
grid kosong yang terlihat seperti bug.

## Langkah 4 — Layar

Urutan sengaja: Beranda dulu karena memakai semua komponen sekaligus, jadi
kesalahan desain komponen ketahuan sebelum disalin ke lima layar lain.

1. **Beranda** — spotlight, baris anime (recent, popular, top airing), baris
   film (trending, recent), tarik-untuk-segarkan
2. **Cari** — input debounce, hasil gabungan anime + film, riwayat pencarian
   di MMKV, keadaan kosong
3. **Manga** — beranda manga terpisah
4. **AnimeInfo** (`app/anime/[id].tsx`) — metadata, daftar episode, pemilih
   musim, penanda sub/dub
5. **MovieInfo** (`app/movie/[id].tsx`) — metadata TMDB, untuk serial: musim
   dan episode
6. **MangaInfo** (`app/manga/[id].tsx`) — metadata, daftar chapter

Semua menavigasi ke `watch/[id]` dan `read/[chapter]` yang masih placeholder.

## Langkah 5 — Perilaku pembeda

Ini alasan utama APK ada, jadi diperlakukan sebagai fitur:

- Layar merender dari SQLite seketika; skeleton hanya saat cache kosong
- Katalog yang pernah dilihat terbaca tanpa jaringan
- Ukuran gambar disesuaikan — TMDB `w342` untuk kartu, bukan `original`
- Posisi scroll pulih saat menekan back

## Langkah 6 — Kebersihan

- `app.config.ts` menggantikan `app.json`, supaya `#06060e` tidak lagi ditulis
  di dua tempat
- Universal link `soora.fun` diaktifkan setelah rute lengkap; butuh
  `assetlinks.json` ter-deploy

---

## Verifikasi

Tiap langkah harus lolos sebelum lanjut:

| Gate | Perintah |
|---|---|
| Model ternormalisasi | `pnpm --filter @soora/core test:run` |
| Typecheck | `cd apps/mobile && npx tsc --noEmit` |
| Resolusi modul | `pnpm --filter @soora/mobile export` |
| Kesehatan proyek | `pnpm --filter @soora/mobile doctor` |
| Web tidak regresi | `pnpm build` + `pnpm --filter @soora/core test:run` |
| Backend tidak regresi | `cd soora-backend && npx tsc --noEmit` |
| Produksi hidup | endpoint `api.soora.fun` mengembalikan 200 |

Yang tetap butuh perangkat: rendering nyata, perilaku scroll, memori saat
menggulir daftar panjang, dan mode pesawat.

---

## Risiko

| Risiko | Mitigasi |
|---|---|
| Normalisasi meleset dari perkiraan | Dikerjakan pertama, dengan fixture nyata; kalau meleset, potong Manga ke rilis berikutnya |
| Provider mati saat pengembangan | `ErrorState` dan `EmptyState` dibangun di awal, bukan belakangan |
| FlashList v2 mengubah API | Pin versi lewat `expo install`, jangan `*` |
| Bentuk data berbeda antar provider untuk kind yang sama | Fixture per provider, bukan per kind |
