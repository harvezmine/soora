# Soora — monorepo

```
apps/
  web/              Vite + React 19, di-deploy ke Vercel (soora.fun)
  mobile/           Expo React Native — dibuat di fase 1
packages/
  core/             Logika platform-agnostic (API, cache, auth) — dipakai web + mobile
  core-web/         Adapter browser untuk port core (localStorage / sessionStorage)
  core-native/      Adapter React Native (MMKV / SQLite) — dibuat di fase 1
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
pnpm test             # test @soora/core (watch mode)
pnpm test:run         # test @soora/core (sekali jalan, untuk CI)
```

Untuk satu package saja: `pnpm --filter @soora/web <script>`.

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
