# Rencana perbaikan app Soora — fase 6 sampai 10

Ditulis 2026-08-03, setelah APK v8 live. Urutan fase mengikuti dampak ke user,
bukan kemudahan pengerjaan.

Tiap fase berdiri sendiri: bisa di-build, diuji, dan dirilis tanpa menunggu fase
berikutnya. Kalau berhenti di tengah, yang sudah jadi tetap dipakai.

---

## Fase 6 — Manga reader setara web  ⭐ prioritas tertinggi

Reader sekarang hanya memuat satu chapter lalu berhenti. Web sudah punya
sambung-otomatis yang jauh lebih enak dipakai, dan itu yang paling sering
dipakai orang.

### 6.1 Sambung chapter otomatis
- Ganti sumber data reader dari satu chapter jadi array segmen:
  `[{ chId, nomor, judul, halaman[] }]`.
- Pakai `onEndReached` FlashList dengan `onEndReachedThreshold` setara ~1.5
  layar, meniru `rootMargin: 1200px` di web — pemuatan mulai jauh sebelum
  halaman terakhir terlihat.
- Jeda 1,2 detik sebelum menyambung, sama seperti web. Tanpa jeda, chapter
  berikutnya muncul begitu cepat sampai terasa seperti melompat.
- `Set` berisi id chapter yang sudah dimuat, dan **dihapus lagi kalau
  pengambilan gagal** — kalau tidak, satu kegagalan jaringan mengunci chapter
  itu selamanya sampai app ditutup.

### 6.2 Judul dan posisi ikut berpindah
- `viewabilityConfig` FlashList melacak segmen mana yang sedang terlihat, lalu
  memperbarui judul di bar atas dan penghitung halaman.
- Penghitung jadi relatif per chapter (`12 / 34`), bukan terhadap gabungan
  semua segmen — angka 212/540 tidak berarti apa-apa bagi pembaca.

### 6.3 Navigasi chapter manual
- Tombol chapter sebelumnya / berikutnya di bar bawah, mengikuti chapter yang
  sedang terlihat.
- Pemisah antar chapter di dalam gulungan: garis tipis + label
  "Chapter 53" supaya jelas kapan berpindah.

### 6.4 Simpan posisi baca
- Simpan `{ mangaId, chId, indeksHalaman }` ke MMKV saat gulir berhenti.
- Layar info manga menandai chapter yang sudah dibaca dan menambahkan tombol
  "Lanjut baca".

### 6.5 Kenyamanan
- Kunci orientasi ke potret khusus di reader (manga dibaca potret; lanskap
  membuat satu halaman jadi terlalu kecil).
- Tahan layar tetap menyala selama membaca.
- Zoom cubit untuk halaman padat teks.

**Selesai kalau:** membaca 3 chapter berturut-turut tanpa satu pun ketukan
manual, judul di bar atas ikut berganti, dan menutup lalu membuka app kembali
ke halaman terakhir.

---

## Fase 7 — Splash dan OAuth (perbaikan, bukan fitur)

Dua cacat yang sudah terlihat di v8.

### 7.1 Splash: hilangkan cakram oranye
Penyebabnya: React Native tidak punya `filter: blur()`. Lingkaran ber-`borderRadius`
dengan warna solid tampil sebagai cakram keras, bukan cahaya seperti di web.

Perbaikan: gambar cahayanya dengan `RadialGradient` dari `react-native-svg`
(sudah terpasang) — gradien betulan dari pusat ke transparan. Sekalian samakan
kurva dan durasinya dengan splash web supaya dua platform terasa satu produk.

### 7.2 OAuth
Client Android sudah benar (package `fun.soora.app`, SHA-1 cocok). Yang belum
diperiksa dan paling mungkin jadi penyebab:
- **Branding / OAuth consent screen** — nama app masih `docloq`.
- **Audience** — kalau masih "Testing", hanya akun yang terdaftar sebagai test
  user yang bisa masuk; sisanya ditolak tanpa penjelasan berarti.
- Layar masuk perlu menampilkan pesan galat mentah dari Google, bukan pesan
  umum. Tanpa itu penyebabnya tidak bisa dipersempit.

**Butuh dari kamu:** tangkapan layar galat persis saat menekan tombol masuk di
app, plus isi halaman Branding dan Audience di Google Cloud Console.

---

## Fase 8 — Kartu dan baris (fondasi tampilan)

Sumber kesan "polos" ada di sini: kartu hanya poster dan judul, tanpa satu pun
penanda. Diperbaiki sekali, ketiga bagian ikut membaik.

- **MediaCard**: badge tipe (TV/Film/Manga), skor, penanda "Baru"/"Sub Indo",
  gradien bawah supaya judul tetap terbaca di poster terang.
- **SectionRow**: judul bagian lebih tegas, tombol "Lihat semua", indikator
  gulir, dan tinggi seragam antar baris.
- **HeroSpotlight**: jadi carousel 5 judul dengan pergantian otomatis, backdrop
  lanskap (bukan poster potret yang dipaksa melebar), tombol Tonton dan Simpan.
- **Skeleton**: bentuknya mengikuti kartu asli. Skeleton yang berbeda bentuk
  membuat layar melompat saat data tiba.
- Transisi tekan pada kartu: skala 0.96 dengan pantulan pegas.

---

## Fase 9 — Halaman detail

Sekarang: poster, judul, sinopsis, daftar episode. Web jauh lebih kaya.

- Backdrop lebar di belakang poster dengan gradien ke warna latar.
- Baris meta: tahun, durasi, skor, genre sebagai chip yang bisa diketuk.
- Sinopsis dilipat dengan "Selengkapnya" — bukan dipotong diam-diam.
- Pemilih musim untuk serial, kartu episode dengan thumbnail dan progres.
- Baris "Serupa" di bawah.
- Header menempel yang muncul saat digulir melewati judul.

---

## Fase 10 — Pencarian dan penemuan

- Riwayat pencarian dan saran, tersimpan lokal.
- Filter: genre, tahun, tipe, status.
- Jelajah per genre.
- Hasil dikelompokkan per bagian (anime / film / manga) dalam satu pencarian.

---

## Yang sengaja TIDAK masuk rencana

- **Pemilihan kualitas video manual.** `videoTrack` di expo-video read-only.
  Butuh pindah ke react-native-video — biaya besar untuk satu fitur.
- **Subtitle sidecar dari API.** expo-video hanya mengekspos trek yang sudah
  ada di manifest HLS.
- **Rilis iOS.** Kodenya kompatibel, tapi tidak ada padanan sideload APK; harus
  lewat App Store yang hampir pasti menolak agregator streaming
  (Guideline 5.2), ditambah Apple Developer Program 99 USD/tahun.

## Urutan yang disarankan

Fase 6 dulu — manga praktis tidak bisa dipakai dengan nyaman sekarang.
Lalu 7, karena dua-duanya cacat yang sudah kelihatan. Baru 8, yang memberi
lompatan tampilan paling besar per satuan usaha. 9 dan 10 menyusul.
