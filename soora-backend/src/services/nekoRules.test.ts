import { describe, it, expect } from 'vitest';
import {
  pemutarSah,
  urlAman,
  decodeEntitas,
  buangTag,
  bersih,
  slugDariUrl,
  slugSah,
  kategoriSah,
  halamanSah,
  bacaKartu,
  bacaDetail,
  bacaKategori,
  adaHalamanLagi,
} from './nekoRules';

/* Potongan HTML tetap. Dipakai supaya uji ini tidak bergantung pada isi situs
   hari itu — yang diuji cara membacanya, bukan apa yang sedang tayang. */

const KARTU_BERANDA = `
<div class="nk-post-card">
  <div style="background-image: url('https://nekopoi.care/wp/a-300x170.jpg')"></div>
  <h2><a href="https://nekopoi.care/judul-satu/">Judul &#8211; Satu</a></h2>
  <span>Selasa, 18 Agustus</span>
</div>
<div class="nk-post-card">
  <div style="background-image:url(//nekopoi.care/wp/b.jpg)"></div>
  <h2><a href="https://nekopoi.care/judul-dua/">Judul &amp; Dua</a></h2>
</div>
<a href="https://iklan.example/promo">Iklan</a>
`;

/* Urutan atributnya SENGAJA seperti situs aslinya: href ditulis SEBELUM
   class. Dulu penguraiannya memotong teks pada penanda kelas, sehingga tiap
   potongan dimulai setelah href miliknya sendiri dan yang terbaca justru href
   kartu berikutnya — judulnya benar tapi tautannya bergeser satu kartu.
   Dua kartu dipakai karena dengan satu kartu pergeseran itu tidak kelihatan. */
const KARTU_DAFTAR = `
<li><a href="https://nekopoi.care/judul-tiga/" class="nk-search-item">
  <div class="nk-search-thumb" style="background-image:url('https://nekopoi.care/wp/c.jpg')"></div>
  <div class="nk-search-info">
    <h2>Judul Tiga</h2>
    <p class="nk-search-desc">Ringkasan <b>tiga</b>.</p>
  </div>
</a></li>
<li><a href="https://nekopoi.care/judul-empat/" class="nk-search-item">
  <div class="nk-search-thumb" style="background-image:url('https://nekopoi.care/wp/d.jpg')"></div>
  <div class="nk-search-info">
    <h2>Judul Empat</h2>
    <p class="nk-search-desc">Ringkasan empat.</p>
  </div>
</a></li>
`;

describe('penyaringan pemutar', () => {
  it('hanya host pemutar yang dikenal yang lolos', () => {
    expect(pemutarSah('https://playmogo.com/e/abc')).toBe(true);
    expect(pemutarSah('https://cdn.playmogo.com/e/abc')).toBe(true);
    expect(pemutarSah('https://yandex.ru/x')).toBe(true);
  });

  it('pelacak, iklan, dan host mirip ditolak', () => {
    expect(pemutarSah('https://tracker.example/i.html')).toBe(false);
    // Ini yang berbahaya: nama host yang cuma MENGANDUNG nama yang sah.
    expect(pemutarSah('https://playmogo.com.jahat.example/e/x')).toBe(false);
    expect(pemutarSah('https://notplaymogo.com/e/x')).toBe(false);
    expect(pemutarSah('bukan url')).toBe(false);
  });
});

describe('pembersihan', () => {
  it('menolak skema berbahaya', () => {
    expect(urlAman('javascript:alert(1)')).toBe('');
    expect(urlAman('data:text/html,x')).toBe('');
    expect(urlAman('https://ok.example/a')).toBe('https://ok.example/a');
  });

  it('entitas HTML didekode', () => {
    expect(decodeEntitas('a &#8211; b')).toBe('a – b');
    expect(decodeEntitas('Tom&#8217;s')).toBe('Tom’s');
    expect(decodeEntitas('a &amp; b')).toBe('a & b');
  });

  it('tag dibuang beserta isi skrip', () => {
    expect(buangTag('<p>Halo <b>dunia</b></p>')).toBe('Halo dunia');
    expect(buangTag('<script>jahat()</script>aman')).toBe('aman');
  });

  it('bersih menggabungkan keduanya', () => {
    expect(bersih('<b>Judul &#8211; Bagus</b>')).toBe('Judul – Bagus');
  });
});

describe('penyaringan parameter', () => {
  it('slug diambil dari ujung alamat', () => {
    expect(slugDariUrl('https://nekopoi.care/judul-abc/')).toBe('judul-abc');
    expect(slugDariUrl('bukan url')).toBe('');
  });

  it('slug menolak jalur dan spasi', () => {
    expect(slugSah('judul-abc')).toBe('judul-abc');
    expect(slugSah('Judul-ABC')).toBe('judul-abc');
    expect(slugSah('../../etc/passwd')).toBe('');
    expect(slugSah('a/b')).toBe('');
    expect(slugSah('')).toBe('');
  });

  it('kategori hanya huruf, angka, tanda hubung', () => {
    expect(kategoriSah('jav-cosplay')).toBe('jav-cosplay');
    expect(kategoriSah('../admin')).toBe('');
  });

  it('halaman dijaga di rentang wajar', () => {
    expect(halamanSah('3')).toBe(3);
    expect(halamanSah('0')).toBe(1);
    expect(halamanSah('abc')).toBe(1);
    expect(halamanSah('99999')).toBe(200);
  });
});

describe('membaca kartu', () => {
  it('membaca bentuk kartu beranda', () => {
    const k = bacaKartu(KARTU_BERANDA);
    expect(k).toHaveLength(2);
    expect(k[0]).toMatchObject({
      id: 'judul-satu',
      title: 'Judul – Satu',
      thumb: 'https://nekopoi.care/wp/a-300x170.jpg',
    });
    expect(k[0].date).toContain('Selasa');
    expect(k[1].title).toBe('Judul & Dua');
  });

  it('gambar tanpa skema dilengkapi jadi https', () => {
    expect(bacaKartu(KARTU_BERANDA)[1].thumb).toBe('https://nekopoi.care/wp/b.jpg');
  });

  it('tautan keluar tidak ikut jadi kartu', () => {
    expect(bacaKartu(KARTU_BERANDA).some((k) => k.id === 'promo')).toBe(false);
  });

  it('membaca bentuk kartu kategori beserta ringkasannya', () => {
    const k = bacaKartu(KARTU_DAFTAR);
    expect(k).toHaveLength(2);
    expect(k[0]).toMatchObject({ id: 'judul-tiga', title: 'Judul Tiga', synopsis: 'Ringkasan tiga.' });
  });

  it('tautan tiap kartu adalah miliknya sendiri, bukan kartu berikutnya', () => {
    // Inti bug yang pernah terjadi: judul benar, tautan bergeser satu, dan
    // kartu membuka judul yang salah tanpa ada tanda apa pun bahwa itu salah.
    const k = bacaKartu(KARTU_DAFTAR);
    expect(k.map((x) => [x.id, x.title])).toEqual([
      ['judul-tiga', 'Judul Tiga'],
      ['judul-empat', 'Judul Empat'],
    ]);
    expect(k[0].thumb).toBe('https://nekopoi.care/wp/c.jpg');
    expect(k[1].thumb).toBe('https://nekopoi.care/wp/d.jpg');
  });

  it('slug kembar tidak muncul dua kali walau ada di dua bentuk', () => {
    const dobel = `
      <div class="nk-post-card"><h2><a href="https://nekopoi.care/sama/">Sama</a></h2></div>
      <a class="nk-search-item" href="https://nekopoi.care/sama/"><h2>Sama</h2></a>`;
    expect(bacaKartu(dobel)).toHaveLength(1);
  });

  it('HTML kosong atau bukan teks tidak melempar', () => {
    expect(bacaKartu('')).toEqual([]);
    expect(bacaKartu(null as any)).toEqual([]);
  });

  it('halaman berikutnya dikenali dari tautannya', () => {
    expect(adaHalamanLagi('<a href="/page/2/">2</a>', 1)).toBe(true);
    expect(adaHalamanLagi('<a href="/page/2/">2</a>', 2)).toBe(false);
  });
});

describe('membaca detail', () => {
  const HTML = `
    <title>Judul Video Episode 1 &#8211; Nekopoi.care</title>
    <meta property="og:image" content="https://nekopoi.care/wp/besar.jpg" />
    <iframe src="https://pelacak.example/t.html"></iframe>
    <iframe src="https://playmogo.com/e/aaa"></iframe>
    <iframe src="//playmogo.com/e/bbb"></iframe>
    <iframe src="https://playmogo.com/e/aaa"></iframe>
    <p>Ini sinopsisnya yang cukup panjang untuk lolos ambang minimal empat puluh huruf.</p>`;

  it('judul dibersihkan dari embel-embel nama situs', () => {
    expect(bacaDetail(HTML, 'x').title).toBe('Judul Video Episode 1');
  });

  it('hanya bingkai pemutar sah yang diteruskan', () => {
    const d = bacaDetail(HTML, 'x');
    expect(d.players).toEqual(['https://playmogo.com/e/aaa', 'https://playmogo.com/e/bbb']);
    expect(d.players.some((u) => u.includes('pelacak'))).toBe(false);
  });

  it('pemutar kembar hanya dihitung sekali', () => {
    expect(bacaDetail(HTML, 'x').players.filter((u) => u.endsWith('/aaa'))).toHaveLength(1);
  });

  it('gambar dan sinopsis terbaca', () => {
    const d = bacaDetail(HTML, 'x');
    expect(d.thumb).toBe('https://nekopoi.care/wp/besar.jpg');
    expect(d.synopsis).toContain('sinopsisnya');
    expect(d.id).toBe('x');
  });

  it('halaman tanpa pemutar tetap mengembalikan bentuk yang utuh', () => {
    const d = bacaDetail('<title>Kosong</title>', 'y');
    expect(d.players).toEqual([]);
    expect(d.id).toBe('y');
  });
});

describe('membaca kategori', () => {
  it('kategori dikumpulkan tanpa kembar dan diberi nama layak baca', () => {
    const html = `
      <a href="https://nekopoi.care/category/jav-cosplay/">x</a>
      <a href="https://nekopoi.care/category/hentai/">y</a>
      <a href="https://nekopoi.care/category/hentai/">y lagi</a>`;
    expect(bacaKategori(html)).toEqual([
      { slug: 'jav-cosplay', name: 'Jav Cosplay' },
      { slug: 'hentai', name: 'Hentai' },
    ]);
  });
});
