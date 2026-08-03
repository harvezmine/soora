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

4. Supaya user lain tahu ada versi baru, set env berikut di
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

## Yang belum siap

| Hal | Keterangan |
|---|---|
| Login Google | `GOOGLE_ANDROID_CLIENT_ID` di `lib/config.ts` masih kosong. Butuh OAuth client tipe **Android** dengan SHA-1 di atas terdaftar di Google Cloud Console. Sampai itu diisi, layar login menampilkan panduan setup, bukan tombol. |
| Ikon dan splash | Belum ada direktori `assets/`. APK akan memakai ikon bawaan Expo. |
| Error reporting | `BOT_TOKEN` dan `CHAT_ID` tidak ada di env produksi, jadi laporan ke Telegram diam-diam tidak terkirim. |
| Halaman `soora.fun/download` | Belum dibuat. Untuk sekarang tautan EAS bisa dipakai langsung. |
