# Fase 3 — Player: implementation plan

**Tanggal:** 2026-08-03
**Spec induk:** [2026-08-02-soora-native-apk-design.md](../specs/2026-08-02-soora-native-apk-design.md) §4, §7.2 fase 3
**Prasyarat:** Fase 2 selesai (`26fe1ad`); proxy sudah diperbaiki dan di-deploy (`51048a1`)

---

## Tujuan

Mengubah rute `watch/[id]` dari placeholder jadi pemutar yang benar-benar bisa
dipakai, dengan kemampuan yang mustahil didapat di web: putar di latar
belakang, Picture-in-Picture, kontrol di layar kunci, dan hardware decode.

**Definisi selesai:** user bisa memilih judul film dari katalog, memutarnya
sampai selesai, seek, mengganti kualitas dan subtitle, keluar dari app dengan
audio tetap jalan, lalu kembali dan melanjutkan dari posisi terakhir.

## Bukan bagian fase ini

MangaReader (fase 4), MyList dan Profil lengkap (fase 5), download offline
(fase 6).

---

## Dua kenyataan yang membentuk rencana ini

### 1. Proxy wajib — sudah terbukti, bukan asumsi

Spike 2026-08-03 membuktikan token m3u8 terikat ke IP yang memintanya (VPS).
URL yang sama: dari VPS 200 tanpa header apa pun, dari mesin lain 403 walau
dengan `Referer`. Perangkat mana pun akan 403.

Akibatnya `NativePlayer` **selalu** memakai `stream.soora.fun/proxy`. Tidak ada
cabang "coba langsung dulu". Rencana lama menghemat bandwidth VPS: batal.

Proxy sudah disiapkan untuk beban ini (commit `51048a1`): streaming alih-alih
buffer penuh (TTFB 0,93s → 0,26s), `Range` diteruskan (206), playlist
`no-store`. Terverifikasi di produksi.

### 2. Anime mati, film hidup

Per 2026-08-03: semua penyedia anime mengembalikan bundle kosong; TMDB via
VixSrc hidup dan mengembalikan m3u8 untuk semua judul uji.

Artinya **jalur NativePlayer bisa diverifikasi penuh, jalur EmbedPlayer tidak**
— karena embed justru dipakai anime. Konsekuensi untuk urutan kerja: bangun dan
tuntaskan NativePlayer dulu dengan film; EmbedPlayer ditulis mengikuti kode web
yang sudah terbukti, dan diverifikasi belakangan saat anime pulih.

---

## Langkah 1 — Resolusi sumber (`packages/core/src/player/`)

Fungsi murni, bisa dites tanpa perangkat — pola yang sama dengan normalisasi di
fase 2.

```js
/**
 * @typedef {object} PlaybackSource
 * @property {'native'|'embed'} mode
 * @property {string} uri        URL proxy (native) atau URL embed (embed)
 * @property {Track[]} [audio]
 * @property {Track[]} [subtitles]
 * @property {string} [label]    nama server, untuk UI ganti server
 */

resolveMovieSource(tmdbId, { season, episode })  // VixSrc → native
resolveAnimeSource(animeId, episodeId)           // m3u8 → native, else embed
buildProxyUrl(m3u8, ref)                         // selalu lewat proxy
```

`buildProxyUrl` memusatkan susunan `?url=&ref=&base=` supaya tidak tersebar di
komponen. Ini juga titik tunggal kalau host proxy berubah — relevan karena user
berencana pindah ke home server.

**Test:** daftar sumber → mode yang dipilih; sumber kosong → embed; m3u8 ada →
native; URL proxy tersusun benar termasuk encoding.

## Langkah 2 — NativePlayer

`react-native-video` v6. Sumber selalu URL proxy.

| Kemampuan | Cara |
|---|---|
| Background play | `playInBackground` + `MediaSession` |
| PiP | `pictureInPicture` (plugin sudah dipasang di fase 1) |
| Kualitas | `selectedVideoTrack` dari varian playlist |
| Subtitle | `textTracks` — playlist VixSrc menyediakan 4 bahasa |
| Audio | `selectedAudioTrack` — VixSrc menyediakan ita/eng |
| Lockscreen | notifikasi media dengan judul dan poster |

Kontrol overlay ditulis sendiri, meniru `VideoPlayer.jsx` di web:

- tap tunggal: tampil/sembunyi kontrol, auto-hide 3 detik
- double-tap kiri/kanan: ±10 detik
- swipe horizontal: seek dengan pratinjau posisi
- swipe vertikal kiri: kecerahan; kanan: volume
- sheet untuk kualitas, subtitle, kecepatan

## Langkah 3 — EmbedPlayer

`react-native-webview`, port dari `AnimeEmbedPlayer.jsx`.

- `onShouldStartLoadWithRequest` menolak navigasi ke host di luar embed asli —
  pengganti `sandbox` iframe, dan lebih ketat karena dikontrol di layer native
- `setSupportMultipleWindows={false}` memblokir `window.open`
- rotasi server otomatis saat timeout
- badge "Mode kompatibilitas" karena background play, PiP, dan download tidak
  tersedia di jalur ini

## Langkah 4 — Progress dan MiniPlayer

- Posisi ditulis ke MMKV tiap 5 detik. Inilah alasan MMKV dipilih di fase 1:
  sinkron, tanpa `await`, sehingga tidak menjatuhkan frame.
- Sinkron ke backend untuk user yang login (`/user/progress`, sudah ada).
- Baris "Lanjut Tonton" di Beranda akhirnya terisi.
- MiniPlayer persist di atas tab bar, drag-to-dismiss, `react-native-reanimated`
  di UI thread.

## Langkah 5 — Layar dan sistem

- `expo-keep-awake` selama memutar
- rotasi landscape, kembali ke portrait saat keluar
- kontrol menghindari notch dan gesture bar (`react-native-safe-area-context`)
- tombol back Android: keluar fullscreen dulu, baru meninggalkan layar

---

## Verifikasi

| Gate | Perintah | Bisa tanpa perangkat |
|---|---|---|
| Resolusi sumber | `pnpm --filter @soora/core test:run` | ya |
| Typecheck | `cd apps/mobile && npx tsc --noEmit` | ya |
| Resolusi modul | `pnpm --filter @soora/mobile export` | ya |
| Kesehatan proyek | `pnpm --filter @soora/mobile doctor` | ya |
| URL proxy valid terhadap produksi | skrip dari VPS | ya |
| Web + backend tidak regresi | `pnpm build`, `tsc` | ya |
| Playback, seek, PiP, background, baterai | — | **tidak** |

Fase ini lebih bergantung pada perangkat dibanding fase mana pun. Yang bisa
dibuktikan tanpa HP hanyalah bahwa URL yang dibangun benar dan modulnya
ter-resolve; mulus atau tidaknya pemutaran tidak.

---

## Risiko

| Risiko | Mitigasi |
|---|---|
| EmbedPlayer tidak bisa diuji (anime mati) | Port dari kode web yang sudah terbukti; tandai belum terverifikasi di README |
| Kapasitas proxy | User sadar dan menerima untuk sekarang; rencana pindah ke home server 16 GB |
| Token m3u8 kedaluwarsa di tengah tontonan panjang | Deteksi 403 saat playback → minta sumber baru → lanjut dari posisi terakhir |
| `react-native-video` v6 + RN 0.86 + New Arch | Pasang lewat `expo install`; kalau bentrok, `expo-video` sudah terbukti jalan di harness spike |
