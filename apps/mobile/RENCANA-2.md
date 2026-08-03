# Rencana perbaikan putaran kedua — setelah uji perangkat v9

Ditulis 2026-08-03 dari temuan memakai APK v9 di perangkat sungguhan. Ini
putaran pertama yang berbasis pemakaian nyata, bukan dugaan.

Urutan mengikuti tingkat kerusakan: yang membuat layar tidak bisa dibuka lebih
dulu, baru yang mengganggu, baru yang kurang rapi.

---

## Fase 12 — Perbaikan yang menutup akses  ⭐ paling mendesak

### 12.1 Layar film jatuh saat dibuka — SUDAH DIPASTIKAN

`Rendered more hooks than during the previous render` di `MovieInfoScreen`.

Penyebabnya milik saya: saat menambahkan pemilih musim di fase 7a, `useMemo`
untuk `episodeMusim` diletakkan di baris 106 — **setelah** tiga `return` awal di
baris 63, 75, dan 84. Saat status masih `loading`, hook itu tidak dijalankan;
begitu data tiba ia ikut jalan, jumlah hook berubah antar render, dan React
menjatuhkan layarnya.

Perbaikan: pindahkan seluruh hook ke atas, sebelum percabangan `return` apa pun.
Ini persis kesalahan yang pernah terjadi di fase 1 pada layar yang sama, jadi
sekalian ditambahkan aturan lint `react-hooks/rules-of-hooks` yang menggagalkan
build — kalau tidak, ia akan terulang untuk ketiga kalinya.

### 12.2 Layar anime jatuh saat dibuka — BELUM DIPASTIKAN

Berbeda dari film: seluruh hook di `app/anime/[id].tsx` sudah berada di atas
sebelum `return` mana pun, jadi bukan penyebab yang sama. Belum ada jejak
tumpukan khususnya — tangkapan layar yang ada semuanya menunjuk
`MovieInfoScreen`.

Yang dikerjakan: minta jejaknya, dan sementara itu telusuri kandidat yang
berbeda dari film — normalisasi `episodeList` Samehadaku, dan `GenreChips` yang
menerima bentuk genre berbeda antar penyedia.

**Jangan diperbaiki dengan menebak.** Dua layar yang jatuh belum tentu satu
sebab, dan menambal yang salah akan menyembunyikan yang benar.

---

## Fase 13 — Gestur pembaca manga

Gulir sering tertahan karena dianggap awal cubitan, kadang jalan kadang tidak.
Di web mulus karena gulir ditangani peramban tanpa lapisan gestur di atasnya.

Penyebab yang dicurigai: `Gesture.Simultaneous(cubit, geser, ketuk)` membungkus
seluruh daftar. Gestur `Pan` satu jari ikut bersaing dengan gulir bawaan
FlashList meski hanya aktif saat diperbesar — pengenalannya tetap berjalan dan
menahan sentuhan beberapa milidetik sebelum menyerah.

Rencana:
- `Pan` dibatasi `minPointers(2)` atau dimatikan sepenuhnya saat skala 1, bukan
  sekadar mengabaikan hasilnya di dalam `onUpdate`.
- `Gesture.Race` untuk memisahkan ketuk dari gulir, bukan `Simultaneous`.
- `Pinch` diberi `blocksExternalGesture` terhadap daftar supaya gulir menang
  selama belum ada dua jari.
- Diuji di perangkat: gulir cepat 20 layar tanpa satu pun tersendat, lalu cubit,
  lalu gulir lagi.

---

## Fase 14 — Splash satu tahap

Sekarang terlihat dua tahap: splash native menampilkan wordmark **terpotong di
kiri dan kanan**, lalu digantikan layar sambutan JS dengan logo utuh yang
membesar.

Terpotongnya karena `imageWidth: 300` di plugin splash native diterapkan pada
gambar berbanding 1024×430; sebagian perangkat memangkasnya alih-alih
mengecilkan.

Perbaikan: splash native tidak lagi memuat gambar sama sekali — hanya warna
latar merek. Dengan begitu yang terlihat hanya satu tahap, yaitu logo yang
membesar seperti di web. Latar keduanya sudah sama (`#06060e`), jadi
peralihannya tidak terlihat.

---

## Fase 15 — Tata letak yang berantakan

### 15.1 Tombol Masuk dan Daftar di Profil
Ikon dan teks saling tumpang tindih, dan keduanya keluar dari kartu. Penyebabnya
gaya `btn` lama dipakai bersama `btnIsi` baru tanpa `flexDirection` dan `gap`
yang benar. Ditulis ulang sebagai satu komponen tombol, bukan gabungan gaya.

### 15.2 Layar Masuk dan Daftar terlalu ke atas
Isinya menempel di tepi atas. Diperbaiki dengan memusatkan secara vertikal saat
ruang cukup (`justifyContent: 'center'` pada `contentContainerStyle` dengan
`flexGrow: 1`), dan tetap bisa digulir saat papan ketik naik.

### 15.3 Kolom pencarian pindah ke bawah banner
Sekarang di atas banner sehingga banner tidak lagi jadi hal pertama yang
terlihat. Dipindah ke bawah sorotan di ketiga bagian.

---

## Fase 16 — Kartu, wadah, dan banner

### 16.1 Poster manga terlalu ter-zoom
Kartu memakai satu rasio untuk semua bagian. Sampul manga berbanding berbeda
dari poster film, sehingga `contentFit: 'cover'` memangkasnya berlebihan —
padahal di layar info gambarnya normal karena dirender dengan rasio berbeda.
Perbaikan: rasio kartu mengikuti `kind`.

### 16.2 Banner yang terus bergeser
Carousel berpindah tiap 5 detik. Di perangkat ini terasa terlalu cepat dan
mengganggu saat sedang membaca judulnya. Diperlambat, diberi transisi yang
lebih halus, dan berhenti permanen setelah interaksi pertama — bukan hanya saat
sedang digeser.

### 16.3 Rombak tombol, kartu, dan wadah di beranda
Ketiga bagian memakai komponen yang sama, jadi dikerjakan sekali:
- jarak dan sudut kartu diseragamkan dengan token
- bayangan dan batas yang konsisten, bukan campuran
- umpan balik tekan yang sama di semua kartu
- wadah baris diberi lebar maksimum agar tidak melar di tablet

---

## Fase 17 — Format chapter dan episode

Label sekarang menampilkan apa pun isi string dari penyedia, termasuk judul
panjang yang digabung dengan nomor. Terlihat seperti data mentah yang ditempel.

Rencana:
- Nomor chapter/episode dipisah dari judulnya: nomor sebagai elemen tersendiri,
  judul sebagai baris kedua yang lebih kecil.
- Nomor diambil dengan urutan: `chapterNumber` → angka pertama di judul → indeks.
- Judul yang hanya mengulang nomor ("Chapter 52") tidak ditampilkan dua kali.
- Grid episode menampilkan angka saja; judulnya muncul saat ditekan lama atau di
  daftar, bukan dijejalkan ke dalam sel.

---

## Fase 18 — Pencarian

### 18.1 Layar Cari tidak lagi kosong saat dibuka
Sekarang layar kosong sampai user mengetik. Diisi tiga bagian statis — Anime,
Film, Manga — masing-masing satu baris judul dari katalog yang sudah ada di
cache, sehingga tidak menambah request saat dibuka.

### 18.2 Pencarian manga mengikuti bahasa
Sekarang selalu mencari di mangapill. Kalau bahasa disetel Indonesia, pencarian
harus memakai kolam Komiku; kalau English, mangapill. Ini melanjutkan pilihan
bahasa yang sudah ada di beranda manga agar konsisten.

---

## Catatan urutan

12 lebih dulu dan sendirian: dua layar utama tidak bisa dibuka sama sekali, dan
apa pun yang dikerjakan di atasnya tidak bisa diuji. 13 dan 14 berikutnya karena
keduanya terasa tiap kali app dipakai. 15 sampai 18 menyusul.
