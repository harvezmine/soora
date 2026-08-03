# Cara membuat APK Soora

Tidak butuh Android Studio maupun Android SDK di mesinmu. Build berjalan di
cloud (EAS), dan hasilnya berupa tautan unduhan APK.

## Sekali saja: persiapan

```bash
npm i -g eas-cli
npx eas-cli login          # akun Expo (gratis)
cd apps/mobile
npx eas-cli init           # membuat project di akun Expo
```

`eas init` biasanya menulis sendiri `projectId` ke konfigurasi. Di sini tidak
bisa — `app.config.ts` adalah konfigurasi dinamis (TypeScript), dan EAS tidak
bisa menulis ke berkas TS. **Tempel id-nya manual** ke `app.config.ts`:

```ts
extra: {
  eas: { projectId: 'id-yang-diberikan-eas-init' },
},
```

Tanpa itu, `eas build` gagal seketika.

## Kenapa `soora.fun/download` bilang "belum tersedia"

Karena APK-nya memang belum pernah dibangun. Halaman itu membaca `apkUrl` dari
`/app/version`, dan nilainya masih kosong — tidak ada berkas untuk ditautkan.
Halamannya berfungsi normal; yang belum ada adalah APK-nya.

Urutannya: build dulu (di bawah) → dapat berkas APK → taruh di tempat yang bisa
diunduh → set `APP_APK_URL` di server. Setelah itu halaman download dan banner
pembaruan di dalam app langsung menampilkannya.

## Sekali saja: keystore

Ini bagian yang paling mudah salah, dan salahnya tidak bisa diperbaiki
belakangan.

APK Capacitor lama memakai `applicationId` **`fun.soora.app`** — sama dengan app
ini. Android hanya mengizinkan pemasangan sebagai pembaruan kalau
**tanda tangannya sama persis**. Kalau EAS membuat keystore baru, user yang
sudah memasang APK lama akan melihat *"App not installed"*
(`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) dan harus uninstall dulu — yang berarti
**kehilangan Daftar Saya dan riwayat tontonan** yang tersimpan di perangkat.

Jadi pakai keystore yang sudah ada:

Dua cara. **Cara berkas** lebih disarankan karena tidak butuh sesi interaktif
dan bisa diulang:

```bash
cd apps/mobile
cp credentials.example.json credentials.json
# isi kedua password di credentials.json (sudah di-gitignore)
```

lalu tambahkan ke profil yang dipakai di `eas.json`:

```json
"preview": {
  "android": { "buildType": "apk" },
  "credentialsSource": "local",
  "distribution": "internal"
}
```

**Cara interaktif**, kalau lebih suka menyimpan keystore di server Expo:

```bash
npx eas-cli credentials
# Android -> production -> Keystore -> Set up a new keystore -> Upload
```

Berkasnya: `apps/web/soora-keystore.jks`, alias **`soora`**.

Passwordnya **tidak lagi ada di dalam repo** — sengaja dicabut dari
`apps/web/scripts/*.js` karena repo ini publik. Ambil dari catatan pribadimu.
Skrip TWA lama kini membacanya dari `SOORA_KS_PASS`.

Sidik jari keystore, untuk didaftarkan ke Google Cloud Console:

```
SHA-1  F9:F7:EC:9E:69:C6:E9:E1:9B:43:63:9F:92:29:53:0C:94:D3:5A:52
```

**Backup keystore ini ke luar mesinmu.** Kalau hilang, tidak ada cara membuat
pembaruan untuk user yang sudah memasang — selamanya.

## Tiap rilis

1. Naikkan `android.versionCode` di `app.config.ts` (sekarang `2`).
   Dinaikkan manual — `autoIncrement` sengaja tidak dipakai karena EAS harus
   menulis balik ke berkas konfigurasi, dan itu mustahil untuk `.ts`.

2. Build:

   ```bash
   npx eas-cli build -p android --profile preview
   ```

   Profil `preview` dan `production` sama-sama menghasilkan **APK**, bukan AAB —
   karena distribusinya unduhan langsung, bukan Play Store.

3. EAS memberi tautan unduhan. Buka di HP, pasang (Android akan meminta izin
   "pasang dari sumber tidak dikenal").

4. Taruh APK-nya di tempat yang bisa diunduh publik. Dua pilihan:
   - **Paling cepat:** pakai tautan EAS apa adanya sebagai `APP_APK_URL`.
   - **Lebih rapi:** unduh APK-nya, letakkan di VPS, sajikan lewat nginx, lalu
     pakai URL itu. Tautan EAS bisa kedaluwarsa; berkas sendiri tidak.

5. Supaya halaman `soora.fun/download` dan banner di dalam app menampilkannya,
   set env berikut di
   `soora-backend/ecosystem.config.js` lalu
   `pm2 restart soora-backend --update-env`:

   ```js
   APP_VERSION_CODE: '2',
   APP_VERSION_NAME: '1.0.0',
   APP_APK_URL: 'https://soora.fun/download/soora-1.0.0.apk',
   APP_UPDATE_MANDATORY: 'false',
   APP_CHANGELOG: 'Katalog anime kembali, pemutar baru.',
   ```

   `APP_VERSION_CODE` harus bilangan bulat murni; `APP_APK_URL` harus diawali
   `https://`. Keduanya divalidasi backend dan diabaikan (dengan peringatan di
   log) kalau salah bentuk.

   **Penting:** menambahkan key BARU ke `ecosystem.config.js` tidak cukup dengan
   `pm2 restart soora-backend --update-env` — PM2 hanya menyegarkan variabel
   yang sudah dikenalnya. Untuk key baru, restart lewat berkasnya:

   ```bash
   cd ~/soora/soora-code/soora-backend
   pm2 restart ecosystem.config.js --update-env && pm2 save
   ```

   Selama `APP_APK_URL` kosong, `soora.fun/download` menampilkan "Belum
   tersedia untuk diunduh" dan banner pembaruan tidak pernah muncul — keduanya
   memang begitu, bukan kerusakan.

## Yang belum siap

| Hal | Keterangan |
|---|---|
| Login Google | Butuh **dua** pengisian, lihat bagian di bawah. Sampai selesai, layar login menampilkan panduan setup, bukan tombol. |
| Ikon dan splash | Belum ada direktori `assets/`. APK akan memakai ikon bawaan Expo. |
| Error reporting | `BOT_TOKEN` dan `CHAT_ID` tidak ada di env produksi, jadi laporan ke Telegram diam-diam tidak terkirim. |
| ~~Halaman `soora.fun/download`~~ | **Sudah live.** Mengambil versi dari `/app/version`, jadi cukup set env di server — tidak perlu deploy ulang web. |

## Mengaktifkan login Google

Login di soora.fun bekerja karena Google memvalidasi client **web** lewat
"Authorized JavaScript origins" — browsernya memang berada di origin itu.
Aplikasi Android tidak punya origin sama sekali; Google memvalidasinya lewat
**nama paket + sidik jari SHA-1** penandatangan APK. Itu jenis OAuth client
yang berbeda, dan client web tidak bisa dipakai untuk alur native.

Langkahnya:

1. Google Cloud Console → Credentials → Create OAuth client ID → **Android**
   - Package name: `fun.soora.app`
   - SHA-1: `F9:F7:EC:9E:69:C6:E9:E1:9B:43:63:9F:92:29:53:0C:94:D3:5A:52`

   Kalau nanti membiarkan EAS memakai keystore lain, SHA-1-nya berbeda dan
   harus didaftarkan juga — cek dengan `eas credentials`.

2. Tempel client ID itu ke **dua** tempat:

   - `apps/mobile/lib/config.ts` → `GOOGLE_ANDROID_CLIENT_ID`
   - `soora-backend/ecosystem.config.js` → `GOOGLE_ANDROID_CLIENT_ID`,
     lalu `pm2 restart soora-backend --update-env && pm2 save`

Kenapa dua tempat: app memakainya untuk meminta token ke Google, dan backend
memakainya untuk memverifikasi token itu. Backend sekarang menerima client web
**dan** client Android — kalau hanya sisi app yang diisi, Google akan berhasil
tapi backend menolak tokennya dengan "Verifikasi Google gagal".
