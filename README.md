# Soora — monorepo

```
apps/
  web/              Vite + React 19, di-deploy ke Vercel (soora.fun)
  mobile/           Expo SDK 57 + React Native 0.86, APK unduhan langsung
packages/
  core/             Logika platform-agnostic (API, cache, auth) — dipakai web + mobile
  core-web/         Adapter browser untuk port core (localStorage / sessionStorage)
  core-native/      Adapter React Native (MMKV / expo-sqlite)
soora-backend/      Backend Express, di-deploy ke VPS (api.soora.fun)
api.consumet.org/   Fork Consumet, di-deploy ke VPS
```

`soora-backend/` dan `api.consumet.org/` **sengaja tidak** dimasukkan ke pnpm workspace —
keduanya di-deploy terpisah ke VPS dan punya siklus dependensi sendiri.

Desain lengkap: [apps/web/docs/superpowers/specs/2026-08-02-soora-native-apk-design.md](apps/web/docs/superpowers/specs/2026-08-02-soora-native-apk-design.md)

## Prasyarat

- Node.js >= 20
- pnpm 10 (`corepack enable && corepack prepare pnpm@10.8.1 --activate`)

## Perintah

Semua dijalankan dari root repo.

```bash
pnpm install          # install semua workspace sekaligus
pnpm dev              # dev server web
pnpm build            # build produksi web
pnpm lint             # lint web
pnpm test:run         # semua unit test (core + core-native)
```

Untuk satu package saja: `pnpm --filter @soora/web <script>`.

### App (Android)

```bash
pnpm --filter @soora/mobile start      # dev server, butuh dev client terpasang
pnpm --filter @soora/mobile prebuild   # generate proyek android/ dari app.json
pnpm --filter @soora/mobile android    # build + pasang ke HP/emulator
pnpm --filter @soora/mobile export     # bundling saja — cek resolusi modul tanpa device
pnpm --filter @soora/mobile doctor     # cek kesehatan proyek Expo
```

`expo export` adalah verifikasi terkuat yang bisa dijalankan tanpa perangkat:
dia benar-benar mem-bundle seluruh app, jadi kesalahan import atau resolusi
lintas workspace langsung ketahuan.

Folder `apps/mobile/android` sengaja di-gitignore. `app.json` adalah sumber
kebenaran; proyek native dihasilkan ulang lewat `expo prebuild`.

**Peringatan expo-doctor yang diterima:** pemeriksaan duplikat dependensi
melaporkan banyak salinan `react-dom`. Semuanya milik jalur web dan tidak ikut
ke bundle Android — sudah diverifikasi dengan memeriksa isi bundle hasil
`expo export`. `react` sendiri tunggal (19.2.3), dan itu yang penting: dua
salinan React di RN menyebabkan "Invalid hook call".

## Aturan packages/core

`packages/core` tidak boleh menyentuh `localStorage`, `sessionStorage`, `window`,
`document`, atau `import.meta.env`. Semuanya diinjeksi lewat `configureCore()`
saat aplikasi start:

```js
// apps/web/src/main.jsx
import { configureCore } from '@soora/core'
import { webCoreConfig } from '@soora/core-web'

configureCore(webCoreConfig(import.meta.env.VITE_API_URL || '/api'))
```

Aturan ini yang membuat modul yang sama bisa dipakai ulang di React Native nanti.
Test `packages/core` sengaja berjalan di environment node polos tanpa jsdom —
kalau ada dependensi browser yang bocor masuk, test langsung gagal.

## Deploy web (Vercel)

Struktur monorepo butuh setting berikut di project Vercel:

| Setting | Nilai |
|---|---|
| Root Directory | `apps/web` |
| Include files outside the root directory in the Build Step | **Enabled** (wajib — `packages/` ada di luar `apps/web`) |
| Install Command | default (Vercel mendeteksi pnpm workspace dari root) |
| Build Command | default |
| Output Directory | `dist` |

Tanpa opsi "Include files outside the root directory", build gagal dengan error
resolusi `@soora/core`.

## Keystore Android

`apps/web/soora-keystore.jks` menandatangani APK `fun.soora.app`. File ini
di-gitignore dan tidak pernah masuk riwayat git. **Backup ke luar mesin ini** —
kalau hilang, user yang sudah install tidak bisa lagi menerima update.
