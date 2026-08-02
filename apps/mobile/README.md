# @soora/mobile

App Android Soora. Expo SDK 57, React Native 0.86, expo-router.

Perintah ada di [README root](../../README.md). Dokumen ini hanya memuat
keputusan yang tidak terbaca dari kode.

## Status: fase 1 (fondasi)

Belum ada katalog atau player sungguhan. Yang ada baru rangka: 5 tab, rute
fullscreen `watch`/`read`, layar login, dan harness spike. Layar Beranda sengaja
melakukan satu request API asli lewat `@soora/core` — itu gate fase 1, bukan
fitur produk.

## Yang butuh dikerjakan sebelum app bisa dipakai

### 1. Client ID Google Android

`lib/config.ts` → `GOOGLE_ANDROID_CLIENT_ID` masih kosong, jadi layar login
menampilkan panduan setup alih-alih tombol.

Butuh OAuth client **bertipe Android** (bukan Web) di Google Cloud Console,
dengan SHA-1 dari keystore rilis terdaftar:

```bash
keytool -list -v -keystore soora-keystore.jks -alias <alias>
```

Client ID web tetap dipakai — backend memerlukannya untuk memverifikasi ID token.

Skema `fun.soora.app` sudah didaftarkan di `app.json`. Ini wajib:
`expo-auth-session` memakai redirect `fun.soora.app:/oauthredirect`, dan tanpa
intent filter untuk skema itu, browser gagal dengan `ERR_UNKNOWN_URL_SCHEME`
setelah user memilih akun.

### 2. Universal link belum diaktifkan

`https://soora.fun/...` **sengaja belum** diklaim app. Dua syarat belum
terpenuhi:

1. `https://soora.fun/.well-known/assetlinks.json` harus memuat `fun.soora.app`
   beserta SHA-256 keystore rilis. Tanpa itu `autoVerify` gagal diam-diam — di
   Android 12+ link tidak ditawarkan ke app sama sekali, langsung dibuka Chrome,
   tanpa pesan error di mana pun.
2. App baru punya 8 rute, sementara web menyajikan `/anime/:id`, `/manga/*`,
   `/movies/*`, dan lainnya. Mengklaim seluruh host sekarang membuat link ke
   halaman yang belum ada mendarat di layar "Unmatched Route" — user justru
   kehilangan akses. Lebih buruk lagi, `/watch/anime?ep=1` akan cocok dengan
   `watch/[id]` dan `id` bernilai `"anime"`, menampilkan konten salah tanpa error.

Aktifkan di fase 2, setelah rute lengkap dan `assetlinks.json` ter-deploy.
Skema kustom `soora://` sudah aktif dan bisa dipakai sekarang.

### 3. Spike Referer

Rute `/spike` (bisa dibuka dari Profil). Menjawab risiko 3 di design spec:
bisakah ExoPlayer memutar m3u8 langsung dari CDN dengan header `Referer`
sendiri, tanpa `stream.soora.fun/proxy`?

Tiga percobaan berurutan: langsung tanpa header, langsung dengan Referer, dan
lewat proxy. Kalau backend tidak mengembalikan Referer untuk judul tersebut,
percobaan 2 otomatis ditandai **dilewati** — tanpa Referer dia identik dengan
percobaan 1 dan tidak membuktikan apa pun.

Hasilnya menentukan arsitektur player di fase 3, jadi jalankan pada beberapa
judul sebelum menyimpulkan.

## Catatan implementasi

**Warna latar terduplikasi.** `app.json` menuliskan `#06060e` untuk latar
jendela dan ikon adaptif, sementara `theme/tokens.ts` memilikinya sebagai
`colors.bg`. JSON tidak bisa meng-import TS. Kalau warna merek berubah, dua
tempat ini harus diubah bersama — kalau tidak, akan terlihat kedipan warna lama
saat cold start. Beralih ke `app.config.ts` di fase 2 akan menghilangkan
duplikasi ini.

**Folder `android/` di-gitignore.** `app.json` adalah sumber kebenaran; proyek
native dihasilkan ulang lewat `expo prebuild`. Jangan mengedit `android/`
langsung — perubahannya akan hilang.

**Verifikasi tanpa perangkat.** `pnpm --filter @soora/mobile export` mem-bundle
seluruh app sungguhan, sehingga kesalahan import atau resolusi lintas workspace
langsung ketahuan tanpa perlu HP.
