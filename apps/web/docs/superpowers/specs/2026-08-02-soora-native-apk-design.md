# Soora Native APK — Design Spec

**Tanggal:** 2026-08-02
**Status:** Approved — Fase 0 selesai
**Scope:** Rewrite Soora ke React Native (Expo), didistribusikan sebagai APK unduhan langsung.

---

## 1. Latar & keputusan

### 1.1 Kondisi sebelum Fase 0

Soora adalah web app React 19 + Vite (`stream-app`, ~16.700 LOC) yang di-deploy ke
Vercel di `soora.fun`, dengan backend + Consumet di VPS (`api.soora.fun`).

Sudah ada dua percobaan pembungkusan:

- **Capacitor** — `capacitor.config.ts` (appId `fun.soora.app`), folder `android/`
  dan `ios/` ter-generate, `soora-keystore.jks` ada, script `npm run build:apk`.
- **TWA** — `twa-manifest.json`, folder `twa-build/`.

Keduanya tetap WebView: playback lewat `hls.js`, tanpa background play, tanpa PiP,
tanpa offline, tanpa hardware decode yang efisien.

### 1.2 Keputusan yang diambil

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Level native | **React Native full rewrite** | Navigasi, gesture, list, dan player semuanya native. Capacitor + plugin player hanya menyelesaikan playback, tidak menyelesaikan feel. |
| Scope v1 | **Semua fitur** — anime + movie + manga | Manga reader native (pinch-zoom, prefetch, offline) bernilai tinggi di mobile dan tidak punya masalah embed. |
| Codebase | **Monorepo, share core layer** | Provider stream sering mati/berubah. Fix API sekali, kena web + mobile. |
| Toolchain | **Expo prebuild + EAS Build**, APK unduhan langsung | Config plugin menangani native deps. Play Store dilewat (konten agregator hampir pasti ditolak review). |
| Embed-only source | **Dual player** — native untuk m3u8, WebView untuk embed | Native untuk mayoritas playback; embed tetap ada supaya tidak kehilangan judul. |
| Cache lokal | **Penuh** — MMKV + SQLite + disk image cache + offline download | Ini value utama APK dibanding web. |

### 1.3 Yang **tidak** masuk scope

- Halaman `Admin.jsx`, `MarketingLanding.jsx`, `Landing.jsx` — web-only, tidak diport.
- iOS — opsional, fase terpisah, butuh Mac + akun Apple Developer.
- Play Store submission.
- Migrasi data lokal dari web ke app (lihat §3.4).

---

## 2. Arsitektur & struktur repo

```
soora/                              ← pnpm workspace root
├── packages/
│   ├── core/                       ← platform-agnostic, dipakai web + mobile
│   │   ├── api/                    ← eks src/api.js (1296 LOC)
│   │   ├── komikplus/              ← eks src/komikplusApi.js
│   │   ├── user/                   ← eks src/utils/userApi.js
│   │   ├── runtime.js              ← configureCore / getRuntime
│   │   └── ports/                  ← interface KVPort, PageRefPort
│   ├── core-web/                   ← adapter: localStorage, sessionStorage, window
│   └── core-native/                ← adapter: MMKV, expo-sqlite (fase 1)
├── apps/
│   ├── web/                        ← eks stream-app
│   └── mobile/                     ← Expo RN (fase 1)
└── pnpm-workspace.yaml
```

### 2.1 Aturan `packages/core`

`packages/core` tidak boleh meng-import apa pun yang platform-specific. Tidak ada
`localStorage`, `sessionStorage`, `window`, `document`, `import.meta.env`.
Semua diakses lewat port, implementasinya di-inject lewat `configureCore()`.

```js
// packages/core/src/ports/index.js
/**
 * @typedef {object} KVPort
 * @property {(key: string) => string | null} get
 * @property {(key: string, value: string) => void} set
 * @property {(key: string) => void} remove
 */
```

Runtime menyediakan empat hal: `apiBase`, `kv` (persisten — token), `cache`
(sesi — respons API), dan `getPage()` (lokasi user untuk laporan error).

Penegakan aturan ini otomatis: test `packages/core` berjalan di environment node
polos tanpa jsdom. Kalau ada dependensi browser bocor masuk, test gagal.

### 2.2 Migrasi web (Fase 0 — SELESAI)

1. Pindah `stream-app/` → `apps/web/`.
2. Ekstrak `api.js`, `komikplusApi.js`, `utils/userApi.js` → `packages/core`.
3. Buat `packages/core-web` dengan adapter localStorage/sessionStorage/window.
4. Rewire 18 file di `apps/web` ke `@soora/core/*`.
5. Bootstrap `configureCore()` di `apps/web/src/main.jsx`.

Hasil verifikasi: build hijau, daftar chunk identik dengan baseline, lint error
turun dari 445 → 440, 30 unit test core hijau.

---

## 3. Layer data & cache lokal

### 3.1 Empat tingkat penyimpanan

| Tingkat | Teknologi | Isi | Alasan |
|---|---|---|---|
| KV panas | `react-native-mmkv` | auth token, watch progress, settings | API sinkron. Progress video ditulis tiap 5 detik; AsyncStorage async akan menyebabkan frame drop. |
| Katalog | `expo-sqlite` | metadata, daftar episode & chapter, riwayat, MyList | Query offline, bisa di-index. Daftar chapter manga bisa ratusan baris. |
| Gambar | `expo-image` disk cache | poster, thumbnail, banner | Persist antar sesi. |
| File besar | `expo-file-system` + Media3 | halaman manga offline, episode video offline | Storage nyata, bukan kuota browser. |

### 3.2 Pola baca: stale-while-revalidate

1. Layar dibuka → render dari SQLite langsung (tanpa spinner).
2. Fetch di background.
3. Diff hasil dengan cache.
4. Update tabel, UI re-render hanya kalau ada perubahan.

Skeleton hanya ditampilkan kalau SQLite kosong untuk key tersebut.

### 3.3 TTL per tipe data

| Data | TTL |
|---|---|
| Metadata judul | 7 hari |
| Daftar episode / chapter | 6 jam |
| Home / trending / recent | 1 jam |
| Hasil search | 15 menit |
| **Source / stream URL** | **Tidak di-cache** |

Source URL tidak boleh di-cache: m3u8 membawa token yang kedaluwarsa.

### 3.4 Migrasi data

`utils/mangaDB.js` (IndexedDB), `utils/progress.js` dan `utils/mylist.js`
(localStorage) tidak dibawa ke app. Akun Google + Redis backend menjadi source of
truth; user login → data tersinkron turun. User guest mulai dari kosong.

### 3.5 Budget storage

- Disk image cache: cap 500 MB, eviction LRU.
- Download video: dikontrol user, tampilkan sisa ruang sebelum unduh.
- Manga offline: per-judul, bisa dihapus per-judul.
- Tombol **Bersihkan cache** di Profile dengan rincian per kategori.

---

## 4. Player

### 4.1 Pemilihan mode

```
Watch screen → resolveSources()
   ├── ada m3u8 direct        → NativePlayer
   ├── m3u8 + butuh Referer   → NativePlayer + headers
   └── embed-only             → EmbedPlayer (WebView)
```

### 4.2 NativePlayer

`react-native-video` v6 (backend ExoPlayer / Media3).

- `source={{ uri, headers: { Referer } }}` — request langsung ke CDN, melewati
  `stream.soora.fun/proxy`. **Harus diverifikasi lewat spike di fase 1** (§7 risiko 3).
- `playInBackground`, `pictureInPicture`.
- Hardware decode — 1080p/4K tanpa panas berlebih.
- `textTracks` untuk subtitle eksternal, `selectedAudioTrack` untuk sub/dub.
- `MediaSession` — kontrol di notifikasi dan lockscreen.

Kontrol overlay ditulis sendiri agar UX identik dengan `VideoPlayer.jsx`:
swipe horizontal seek, swipe vertikal kiri brightness / kanan volume,
double-tap ±10 detik, pemilihan kualitas dan kecepatan.

### 4.3 EmbedPlayer

`react-native-webview`, port dari `AnimeEmbedPlayer.jsx`. Anti-pop-up diganti
dari `sandbox` iframe ke kontrol native:

- `onShouldStartLoadWithRequest` — tolak navigasi ke host di luar embed asli.
- `setSupportMultipleWindows={false}` — blokir `window.open`.
- Auto-rotasi server saat timeout.

Batasan: tidak ada background play, PiP, atau download. Tampilkan badge
"Mode kompatibilitas".

### 4.4 Download episode offline

`react-native-video` tidak menyediakan API download. Diperlukan native module
Kotlin yang membungkus Media3 `DownloadService` + `DownloadManager`, dibungkus
sebagai Expo config plugin. Perkiraan 400–600 baris Kotlin plus jembatan TS.

**Mitigasi:** ditempatkan di fase 6. Fase 0–5 harus bisa dirilis tanpanya.

---

## 5. Navigasi & UI

### 5.1 Struktur route (`expo-router`)

```
app/
├── (tabs)/
│   ├── index.tsx        Home        (anime + movie)
│   ├── manga.tsx        Manga
│   ├── search.tsx       Search
│   ├── mylist.tsx       My List
│   └── profile.tsx      Profile
├── anime/[id].tsx       AnimeInfo
├── movie/[id].tsx       MovieInfo
├── manga/[id].tsx       MangaInfo
├── watch/[id].tsx       Watch        (fullscreen, di luar tabs)
├── read/[chapter].tsx   MangaReader  (fullscreen, di luar tabs)
├── sooramics-plus.tsx   SooramicsPlus
└── (auth)/login.tsx, register.tsx
```

5 tab — tepat di batas maksimum bottom navigation. `watch` dan `read` di luar
grup tabs: immersive, tab bar hilang, status bar disembunyikan. Deep link
`soora://` dan universal link `https://soora.fun/...` dari struktur folder.

### 5.2 Keputusan visual

- Pertahankan palet gelap yang sudah ada (`#06060e`) — sudah OLED-friendly.
- Ikon **Lucide** via `lucide-react-native` (SVG). Tidak ada emoji sebagai ikon.
- Font Inter (sama dengan web).
- Token ukuran ikon: `icon-sm` 16, `icon-md` 24, `icon-lg` 32. Stroke 2.

### 5.3 Performa & aksesibilitas

- List panjang pakai `@shopify/flash-list`, bukan `FlatList`.
- Gambar pakai `expo-image` dengan blurhash placeholder — tanpa layout shift.
- Skeleton hanya saat cache kosong.
- Tap target minimum 44pt; `hitSlop` untuk ikon lebih kecil.
- `react-native-safe-area-context` — tab bar dan kontrol player di atas gesture bar.
- Back Android menghormati stack, restore scroll + state filter.
- Animasi 150–300 ms, hormati reduced-motion.
- Kontras teks primer ≥4.5:1, sekunder ≥3:1.

### 5.4 MangaReader

Pinch-to-zoom, prefetch 3 halaman, mode vertikal/horizontal, `expo-keep-awake`,
unduh chapter per-chapter dengan progress.

### 5.5 MiniPlayer

Port dari `MiniPlayerContext.jsx` jadi komponen persist di atas tab bar,
drag-to-dismiss, animasi `react-native-reanimated` di UI thread.

---

## 6. Build, signing, distribusi, update

### 6.1 Signing

Pakai `soora-keystore.jks` yang sudah ada, applicationId tetap `fun.soora.app`.
User yang sudah install APK Capacitor lama bisa update di tempat tanpa uninstall.
Syarat: keystore sama, applicationId sama, `versionCode` naik.

**Status keamanan (terverifikasi 2026-08-02):** keystore tidak ter-track git dan
tercakup `.gitignore` (`*.jks`, `*.keystore`). `git log --all` untuk file ini
kosong — tidak pernah terkirim ke remote. Aman dipakai ulang.

Tindakan yang tetap perlu:

1. Backup keystore ke luar mesin ini. Kalau hilang, tidak ada cara membuat update.
2. Simpan sebagai EAS secret (`eas secret:create`).

### 6.2 Build

- `eas build -p android --profile production` → APK. `"buildType": "apk"` di `eas.json`.
- Profil `preview` untuk internal testing, `development` untuk dev-client.
- Fallback: `npx expo prebuild` lalu `./gradlew assembleRelease` lokal.

### 6.3 Distribusi

Halaman `soora.fun/download`: deteksi Android, tombol unduh, panduan izinkan
sumber tidak dikenal, tampilkan versi/ukuran/tanggal. Sajikan APK dari VPS atau
object storage, bukan Vercel (batas ukuran file).

### 6.4 Dua jalur update

| Jenis perubahan | Mekanisme | Waktu sampai user |
|---|---|---|
| Fix provider mati, ubah URL source, bug JS | **EAS Update (OTA)** | Menit, tanpa unduh APK |
| Native module, upgrade SDK, ubah izin | APK baru + in-app prompt | User harus mengunduh |

Provider stream Soora sering berubah — OTA membuat perbaikan itu jadi push JS
bundle beberapa menit. Ini alasan utama memilih Expo dibanding bare RN CLI.

### 6.5 In-app update check

```
GET api.soora.fun/app/version
→ { versionCode, versionName, apkUrl, mandatory, changelog }
```

Dicek saat cold start. Kalau `mandatory: true`, sheet tidak bisa ditutup.

### 6.6 Error reporting

Sambungkan ke pelaporan Telegram backend yang sudah ada. Kirim crash, kegagalan
playback (judul, episode, source yang dicoba, mode player), dan kegagalan
resolusi source. Tujuan: tahu provider mati sebelum user melapor.

---

## 7. Testing, fase, risiko

### 7.1 Testing

| Target | Cara |
|---|---|
| `packages/core` | Vitest — parsing respons API, fallback chain, cache |
| Adapter cache | TTL, stale-while-revalidate, migrasi skema SQLite |
| Logika pemilihan player | Test murni: daftar source → mode terpilih |
| Layar & interaksi | Manual QA matrix |

Manual QA matrix: Android 9 / 12 / 14, layar kecil + tablet, portrait + landscape,
mode gelap, reduced-motion aktif, tanpa jaringan, jaringan lambat.

Detox / E2E tidak dipakai — biaya setup tidak sepadan untuk tim satu orang.

### 7.2 Fase

| Fase | Isi | Perkiraan | Status |
|---|---|---|---|
| 0 | Monorepo + ekstrak `packages/core` + web tetap jalan | 3–5 hari | **selesai** |
| 1 | Expo scaffold, expo-router, tema, adapter MMKV/SQLite, login Google, **spike header/Referer** | 1–2 minggu | **selesai kecuali verifikasi di perangkat** |
| 2 | Home / Search / AnimeInfo / MovieInfo + FlashList + cache SWR | 2–3 minggu | |
| 3 | Watch — NativePlayer + EmbedPlayer + gesture + PiP + MiniPlayer | 3–4 minggu | |
| 4 | Manga: MangaHome / MangaInfo / MangaReader + offline gambar | 2–3 minggu | |
| 5 | MyList, Profile, SooramicsPlus, in-app update, error reporting → **RILIS APK** | 1–2 minggu | |
| 6 | Download episode offline (native module Media3) | 2–3 minggu | |
| 7 | iOS (opsional) | 2–3 minggu | |

**Total sampai rilis (fase 0–5): 10–15 minggu.**

### 7.3 Risiko

| # | Risiko | Dampak | Mitigasi |
|---|---|---|---|
| 1 | Download offline butuh native module Kotlin | Tinggi | Ditempatkan di fase 6; rilis tidak bergantung padanya |
| 2 | Provider embed berubah / mati | Tinggi, sering | EAS Update OTA |
| 3 | Header/Referer di native berbeda dari web | Sedang | **Spike 1 hari di fase 1**. Kalau source tetap butuh `/proxy`, penghematan VPS batal tapi app tetap berfungsi |
| 4 | Regresi web saat pindah monorepo | Tinggi | Fase 0 berdiri sendiri, diverifikasi sebelum menyentuh RN |
| 5 | Scope creep — 14 layar | Sedang | Kalau timeline meleset, potong fase 4 ke rilis kedua |
| 6 | OAuth Google di native berbeda dari web | Sedang | Butuh `expo-auth-session`, client ID Android terpisah, SHA-1 keystore didaftarkan di Google Console. Dialokasikan di fase 1 |
| 7 | Keystore hilang | Tinggi kalau terjadi | Backup ke luar mesin + EAS secret. Tanpa keystore, user lama tidak bisa menerima update |

---

### 7.4 Status Fase 1 (2026-08-03)

Sudah dibangun dan terverifikasi tanpa perangkat:

- `apps/mobile` — Expo SDK 57, RN 0.86.2, expo-router. Bundling Android berhasil
  (2947 modul), typecheck 0 error, expo-doctor 19/20.
- `packages/core-native` — adapter MMKV (`kv` + `cache` sebagai dua instance
  terpisah) dan cache katalog SQLite. 28 unit test, dijalankan dengan engine
  SQLite asli lewat `node:sqlite` sehingga skema dan SQL ikut tervalidasi.
- Design token (`theme/tokens.ts`), struktur 5 tab + rute fullscreen,
  layar login Google, dan harness spike Referer.
- Terverifikasi lewat isi bundle: `@soora/core` benar-benar ikut ke Android —
  string `soora_cache:`, `api.soora.fun`, `soora_token`, dan skema SQL katalog
  semuanya ditemukan di bundle hasil `expo export`.

**Belum terverifikasi — butuh perangkat fisik:**

1. Spike Referer (risiko 3). Harness siap di rute `/spike`; hasilnya menentukan
   apakah fase 3 memakai proxy atau tidak.
2. Login Google. Kode siap, tapi `GOOGLE_ANDROID_CLIENT_ID` di
   `apps/mobile/lib/config.ts` masih kosong — butuh OAuth client bertipe Android
   dengan SHA-1 dari `soora-keystore.jks` terdaftar di Google Cloud Console.
3. Perilaku MMKV dan expo-sqlite di runtime (unit test memakai fake dan
   `node:sqlite`, bukan modul native sesungguhnya).

## 8. Dekomposisi implementation plan

Spec ini mencakup delapan fase — terlalu besar untuk satu implementation plan.
Setiap fase mendapat plan-nya sendiri, ditulis tepat sebelum fase itu dikerjakan,
karena hasil fase sebelumnya mengubah asumsi fase berikutnya.

Fase 0 adalah gate dan sudah lolos.

---

## 9. Kriteria selesai (definition of done untuk rilis)

- [x] Web berjalan normal dari `apps/web` di monorepo.
- [ ] APK ter-install dan berjalan di Android 9, 12, dan 14.
- [ ] Anime, movie, dan manga bisa dibuka, dicari, dan diputar/dibaca.
- [ ] Playback m3u8 di NativePlayer; source embed-only jatuh ke EmbedPlayer.
- [ ] Background play dan PiP berfungsi.
- [ ] App bisa dibuka tanpa jaringan dan menampilkan katalog ter-cache.
- [ ] Manga yang sudah diunduh bisa dibaca offline.
- [ ] Login Google berfungsi; MyList dan progress tersinkron.
- [ ] In-app update check berfungsi terhadap `api.soora.fun/app/version`.
- [ ] Crash dan kegagalan playback terlapor ke Telegram.
- [ ] Halaman `soora.fun/download` tersedia.
- [ ] Keystore ter-backup di luar mesin dan terdaftar sebagai EAS secret.
