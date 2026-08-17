# Foto profil bawaan Soora

Taruh berkas gambar di folder ini dengan penamaan berurutan:

```
soora-01.png
soora-02.png
soora-03.png
...
```

Nomornya dua digit dengan nol di depan, dan **harus berurutan tanpa lompat** —
backend menyusun daftarnya dari 1 sampai `AVATAR_COUNT`, jadi nomor yang
dilewati akan menghasilkan gambar rusak.

## Saran teknis

- **Ukuran** 256x256 piksel. Ditampilkan paling besar 84px di profil, jadi
  256px sudah cukup tajam untuk layar kepadatan ganda tanpa memberatkan.
- **Bentuk** persegi. Pemotongan lingkaran dilakukan CSS, jadi jangan
  bulatkan gambarnya sendiri — sudut yang sudah dibulatkan akan terlihat
  bergerigi setelah dipotong ulang.
- **Format** PNG bila ada bagian transparan, JPG bila fotonya penuh warna.
  Kalau memakai JPG, ganti akhiran di `services/avatars.ts`.
- Jaga tiap berkas di bawah ~40 KB. Pemilih avatar memuat semuanya sekaligus.

## Menyalakannya

Setelah berkasnya ada, atur jumlahnya di env backend
(`soora-backend/ecosystem.config.js`):

```js
env: {
  AVATAR_COUNT: 12,   // sebanyak berkas yang ada
  // AVATAR_BASE_URL: 'https://soora.fun/avatars',  // bawaan, ubah bila pindah
}
```

lalu `pm2 restart soora-backend`.

Selama `AVATAR_COUNT` masih 0, pendaftar baru mendapat avatar inisial
(huruf pertama namanya) dan pemilih foto profil menampilkan keterangan
bahwa belum ada gambar bawaan. Tidak ada yang rusak — fiturnya hanya
menunggu isinya.
