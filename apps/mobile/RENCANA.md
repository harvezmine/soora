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

## Fase 7 — Player film dan anime  ⭐ prioritas kedua

Sesudah manga. Beberapa sumber masih gagal diputar dan tampilannya kalah dari
web. Fase ini memperbaiki dulu yang rusak, baru mempercantik — memperindah
pemutar yang tidak bisa memutar tidak ada gunanya.

### 7.1 Petakan dulu apa yang rusak
Tidak ada gunanya menebak. Yang dikerjakan lebih dulu:
- Rekam tiap kegagalan pemutaran ke penyimpanan lokal: judul, sumber, mode
  (native / embed), pesan galat, dan status HTTP dari proxy.
- Layar diagnostik di Profil untuk menyalin rekaman itu.
- Uji langsung dari VPS untuk 10 judul film dan 10 anime, catat mana yang
  mengembalikan m3u8, mana yang hanya embed, mana yang 403.

Baru setelah ada daftarnya, perbaikannya bisa ditargetkan.

### 7.2 Rantai sumber yang bisa gagal dengan anggun
- Web memakai failover server otomatis; mobile belum. Kalau sumber pertama
  gagal, coba berikutnya tanpa melempar user ke layar galat.
- Bedakan galat yang bisa diulang (token kedaluwarsa, jaringan) dari yang tidak
  (judul memang tidak punya sumber) — sekarang keduanya tampil sama.
- Layar galat menyebutkan sumber mana yang dicoba dan menawarkan pilihan lain,
  bukan hanya "Pemutaran gagal".

### 7.3 Pemutar embed
Anime Sub Indo diputar lewat WebView. Sekarang praktis tanpa kendali.
- Bar atas sendiri dengan judul dan tombol kembali.
- Tombol layar penuh yang memutar orientasi.
- Blokir popup dan pengalihan yang dilakukan situs sumber.
- Deteksi halaman embed yang gagal dimuat, lalu tawarkan sumber lain.

### 7.4 Rapikan pemutar native
- Pengaturan kecepatan dan trek bertahan antar episode.
- Tombol episode berikutnya di dalam pemutar; putar otomatis setelah selesai.
- Lewati opening: lompat 85 detik, tampil hanya di menit-menit awal.
- Indikator buffering yang terpisah dari indikator memuat awal — sekarang
  keduanya sama sehingga tersendat di tengah terlihat seperti hang.

**Selesai kalau:** 10 judul film dan 10 anime dari daftar uji bisa diputar, dan
yang gagal memberi pesan yang menjelaskan sebabnya.

---

## Fase 8 — Splash dan OAuth (perbaikan, bukan fitur)

Dua cacat yang sudah terlihat di v8.

### 8.1 Splash: hilangkan cakram oranye — SELESAI (commit 4c7ef58)
Penyebabnya: React Native tidak punya `filter: blur()`. Lingkaran ber-`borderRadius`
dengan warna solid tampil sebagai cakram keras, bukan cahaya seperti di web.

Perbaikan: gambar cahayanya dengan `RadialGradient` dari `react-native-svg`
(sudah terpasang) — gradien betulan dari pusat ke transparan. Sekalian samakan
kurva dan durasinya dengan splash web supaya dua platform terasa satu produk.

### 8.2 OAuth — TERTAHAN

Yang sudah diperiksa dan TERBUKTI benar, jadi tidak perlu diperiksa lagi:
- Client Android: package `fun.soora.app`, SHA-1 cocok dengan keystore.
- Redirect: expo memakai `fun.soora.app:/oauthredirect`, dan skema itu
  memang dideklarasikan di `app.config.ts`.
- Backend: `audience` memuat client web DAN client Android, keduanya ada di
  env proses produksi.
- Alur token: expo-auth-session menukar `code` jadi `id_token` sendiri di
  Android. Sempat diduga inilah penyebabnya — ternyata bukan.

Yang BELUM diperiksa, dan sekarang menjadi satu-satunya tersangka tersisa:
- **Branding / OAuth consent screen** — nama app masih `docloq`.
- **Audience** — kalau masih "Testing", hanya akun yang terdaftar sebagai test
  user yang bisa masuk; sisanya ditolak tanpa penjelasan berarti.
- Layar masuk perlu menampilkan pesan galat mentah dari Google, bukan pesan
  umum. Tanpa itu penyebabnya tidak bisa dipersempit.

**Butuh dari kamu:** tangkapan layar galat persis saat menekan tombol masuk di
app, plus isi halaman Branding dan Audience di Google Cloud Console.

---

## Fase 9 — Kartu dan baris (fondasi tampilan)

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

## Fase 10 — Halaman detail

Sekarang: poster, judul, sinopsis, daftar episode. Web jauh lebih kaya.

- Backdrop lebar di belakang poster dengan gradien ke warna latar.
- Baris meta: tahun, durasi, skor, genre sebagai chip yang bisa diketuk.
- Sinopsis dilipat dengan "Selengkapnya" — bukan dipotong diam-diam.
- Pemilih musim untuk serial, kartu episode dengan thumbnail dan progres.
- Baris "Serupa" di bawah.
- Header menempel yang muncul saat digulir melewati judul.

---

## Fase 11 — Pencarian dan penemuan

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
Lalu 7 (player film dan anime), karena pemutaran yang gagal lebih merugikan
daripada tampilan yang polos. 8 menyusul: dua cacat kecil yang sudah
kelihatan dan murah diperbaiki. Baru 9, yang memberi lompatan tampilan
paling besar per satuan usaha. 10 dan 11 terakhir.
