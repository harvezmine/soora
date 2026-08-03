# Fase 19 — Rombak visual beranda

Ini pekerjaan visual, bukan perbaikan kerusakan. Ditulis terpisah karena
cakupannya besar dan menyentuh komponen yang dipakai ketiga bagian sekaligus:
salah menyentuhnya berarti tiga layar ikut rusak.

## Aturan yang mengikat seluruh fase ini

**Ini Android, bukan halaman web.** Tiga hal berbeda dan sering terlupakan:

1. **Spasi mengikuti kelipatan 4dp Material**, bukan angka bebas. Skala `space`
   di `theme/tokens.ts` sudah 4/8/12/16/24/32/48 — tidak boleh ada angka mentah
   di berkas layar.
2. **Tepi layar 16dp**, bukan 20 atau 24. Itu ukuran yang dipakai seluruh
   aplikasi Android bawaan, dan bedanya langsung terasa saat app dibuka
   bersebelahan dengan yang lain.
3. **Baris yang digulir mendatar harus menyentuh tepi layar.** Memberi padding
   kiri-kanan pada wadahnya membuat kartu terpotong rapi di tepi dan terlihat
   seperti daftar buntu. Yang benar: padding di `contentContainerStyle`, wadah
   tanpa padding, sehingga kartu terakhir bisa digulir keluar layar.
4. **Target sentuh 48dp**, bukan 44. Angka Apple lebih kecil; ambil yang lebih
   besar.
5. **Jangan ada bayangan CSS-style.** `elevation` Android dan `shadow*` iOS
   berperilaku berbeda; pakai batas tipis (`borderWidth: 1`) yang sudah dipakai
   di seluruh app, konsisten dan murah dirender.

---

## 19.1 Ritme vertikal beranda

Sekarang jarak antar bagian ditentukan masing-masing komponen, jadi jarak
sorotan→pencarian berbeda dari pencarian→baris pertama tanpa alasan.

- Satu sumber jarak: `space.xl` (24dp) antar blok besar, `space.md` (12dp)
  antar elemen di dalam blok.
- `SectionRow` tidak lagi mengatur margin atasnya sendiri; jaraknya diberikan
  wadah beranda.
- Bagian terakhir diberi `paddingBottom` setinggi tab bar + `space.xxxl`, kalau
  tidak kartu terakhir tertutup tab bar.

## 19.2 Kartu

- Sudut `radius.md` (10dp) untuk poster, seragam di baris maupun grid.
- Batas tipis `colors.border` menggantikan bayangan.
- Judul dua baris tetap, bukan satu — judul anime kerap panjang dan satu baris
  memotongnya di tempat yang tidak terbaca. Tinggi baris dikunci supaya kartu
  tetap sejajar meski judulnya satu baris.
- Umpan balik tekan: `opacity` saja, TIDAK memakai `transform: scale`. Skala
  menggeser tetangganya saat baris sedang digulir.

## 19.3 Sorotan

- Tinggi mengikuti lebar layar (`width * 0.56`, mendekati 16:9), bukan 260dp
  tetap. Pada ponsel sempit 260dp terasa terlalu tinggi, pada tablet terlalu
  pendek.
- Titik indikator dipindah ke dalam kartu, bukan menggantung di bawahnya.
- Tombol aksi memakai tinggi 48dp penuh.

## 19.4 Bar pencarian

- Sejajar dengan tepi kartu di bawahnya (16dp), sekarang tidak.
- Tinggi 48dp, sudut penuh (`radius.pill`).

## 19.5 Kepala bagian

- Judul bagian dan "Lihat semua" berada pada garis dasar yang sama.
- Ukuran judul turun satu tingkat: sekarang hampir sebesar judul layar dan
  bersaing perhatian dengan konten yang seharusnya jadi bintangnya.

## 19.6 Keadaan kosong dan galat

Ketiganya sekarang tampil sebagai teks di tengah tanpa bentuk. Diberi wadah
yang sama dengan kartu supaya terbaca sebagai bagian dari halaman, bukan pesan
sistem yang nyasar.

---

## Cara memastikan tidak merusak tiga layar sekaligus

Perubahan dilakukan di komponen bersama, jadi setelah tiap langkah:
`tsc`, `eslint`, `expo export`, lalu periksa ketiga tab di perangkat. Bukan
hanya beranda anime.

## Yang TIDAK dikerjakan di fase ini

- Animasi peralihan antar layar. Itu pekerjaan tersendiri dan mudah membuat
  navigasi terasa lambat kalau salah durasi.
- Tema terang. App ini gelap-saja, sama seperti web.
