import { describe, it, expect } from 'vitest';
import {
  generateKey,
  decryptHex,
  candidateKeys,
  decryptResponse,
  cariRahasia,
  cariBundle,
  urlAman,
  bersihkanSinopsis,
  mapItem,
  mapDetail,
  mapGenre,
  mapChapter,
  urutSah,
  jenisSah,
  slugSah,
  idChapterSah,
  halamanSah,
  batasSah,
} from './doujinRules';

/**
 * Enkripsi tiruan — kebalikan persis dari decryptHex.
 *
 * Ada di uji, bukan di kode produksi: kita tidak pernah perlu mengenkripsi
 * apa pun. Yang dibutuhkan hanya cara membuat bahan uji yang sah tanpa
 * memanggil situs aslinya.
 */
function encryptHex(teks: string, key: string): string {
  const keyLen = key.length;
  let n = 42;
  let out = '';
  for (let d = 0; d < teks.length; d++) {
    const c = teks.charCodeAt(d) & 255;
    const p = key.charCodeAt(d % keyLen);
    const w = (c ^ p ^ (d * 13) ^ n) & 255;
    out += w.toString(16).padStart(2, '0');
    n = (n + w) % 256;
  }
  return out;
}

describe('kunci & dekripsi', () => {
  it('kunci selalu 32 karakter printable', () => {
    for (const s of ['a', 'salt_123', '', 'panjang sekali sekali sekali']) {
      const k = generateKey(s);
      expect(k).toHaveLength(32);
      expect(/^[\x21-\x7d]+$/.test(k)).toBe(true);
    }
  });

  it('kunci sama untuk masukan sama, beda untuk masukan beda', () => {
    expect(generateKey('x')).toBe(generateKey('x'));
    expect(generateKey('x')).not.toBe(generateKey('y'));
  });

  it('dekripsi membalikkan enkripsi', () => {
    const key = generateKey('uji');
    const asli = 'Halo dunia';
    expect(decryptHex(encryptHex(asli, key), key)).toBe(asli);
  });

  it('kunci salah tidak menghasilkan teks asli', () => {
    const asli = 'rahasia';
    const hex = encryptHex(asli, generateKey('a'));
    expect(decryptHex(hex, generateKey('b'))).not.toBe(asli);
  });

  it('tiga kunci dicoba: jam ini, sejam lalu, sejam depan', () => {
    const now = 1_700_000_000_000;
    const k = candidateKeys('garam', now);
    expect(k).toHaveLength(3);
    expect(new Set(k).size).toBe(3);
    const bucket = Math.floor(now / 3_600_000);
    expect(k[0]).toBe(generateKey(`garam_${bucket}`));
    expect(k[1]).toBe(generateKey(`garam_${bucket - 1}`));
  });

  it('response yang dienkripsi dengan kunci jam LALU tetap terbaca', () => {
    // Inti kenapa tiga bucket dicoba: jam server kita dan jam mereka tidak
    // dijamin sama, dan pergantian jam tidak boleh mematikan halaman.
    const now = 1_700_000_000_000;
    const salt = 'garam';
    const kunciLama = generateKey(`${salt}_${Math.floor(now / 3_600_000) - 1}`);
    const muatan = encodeURIComponent(JSON.stringify({ ok: true, judul: 'Uji' }));
    const hex = encryptHex(muatan, kunciLama);
    expect(decryptResponse(hex, salt, now)).toEqual({ ok: true, judul: 'Uji' });
  });

  it('response tak terbaca melempar, bukan mengembalikan sampah', () => {
    expect(() => decryptResponse('deadbeef', 'garam', 1_700_000_000_000)).toThrow();
  });
});

describe('pencarian rahasia di bundle', () => {
  it('menemukan app-secret dan salt', () => {
    const bundle = `var a="0123456789abcdef0123456789abcdef";fetch(u,{headers:{"X-App-Secret":a}});var s="doujindesu-scrapers-cannot-read-this-super-secret-salt-2026-v2";`;
    expect(cariRahasia(bundle)).toEqual({
      appSecret: '0123456789abcdef0123456789abcdef',
      salt: 'doujindesu-scrapers-cannot-read-this-super-secret-salt-2026-v2',
    });
  });

  it('bundle yang berubah struktur mengembalikan null, bukan menebak', () => {
    expect(cariRahasia('var a=1;')).toBeNull();
    expect(cariRahasia('"super-secret-salt-tanpa-app-secret"')).toBeNull();
  });

  it('memilih bundle index- lebih dulu daripada aset lain', () => {
    const html = `<script src="/assets/vendor-a1.js"></script><script src="/assets/index-XYZ.js"></script>`;
    expect(cariBundle(html)).toBe('/assets/index-XYZ.js');
  });

  it('halaman tanpa bundle mengembalikan null', () => {
    expect(cariBundle('<html></html>')).toBeNull();
  });
});

describe('pembersihan', () => {
  it('menolak skema berbahaya', () => {
    expect(urlAman('javascript:alert(1)')).toBe('');
    expect(urlAman('data:text/html,<script>')).toBe('');
    expect(urlAman('vbscript:x')).toBe('');
    expect(urlAman('  JavaScript:alert(1)')).toBe('');
  });

  it('meloloskan http dan https saja', () => {
    expect(urlAman('https://a.example/x.jpg')).toBe('https://a.example/x.jpg');
    expect(urlAman('ftp://a.example/x')).toBe('');
    expect(urlAman(null)).toBe('');
    expect(urlAman('bukan url')).toBe('');
  });

  it('sinopsis dibersihkan dari tag dan entitas ganda', () => {
    expect(bersihkanSinopsis('<p>Halo <b>dunia</b></p>')).toBe('Halo dunia');
    // Ter-encode dua kali: &amp;gt; harus jadi ">" bukan "&gt;"
    expect(bersihkanSinopsis('a &amp;gt; b')).toBe('a > b');
    expect(bersihkanSinopsis('<script>jahat()</script>aman')).toBe('aman');
    expect(bersihkanSinopsis('Sinopsis:\nIsi cerita')).toBe('Isi cerita');
    expect(bersihkanSinopsis(null)).toBe('');
  });
});

describe('pemetaan data', () => {
  it('item tanpa slug dibuang — tak ada yang bisa dibuka darinya', () => {
    expect(mapItem({ title: 'x' })).toBeNull();
    expect(mapItem(null)).toBeNull();
  });

  it('item memakai slug sebagai id dan mengambil chapter terbaru', () => {
    expect(mapItem({
      slug: 'judul-a', title: 'Judul A', cover_url: 'https://cdn.example/a.jpg',
      rating: 8.5, type: 'manhwa', status: 'publishing',
      chapters: [{ chapter_number: 12 }, { chapter_number: 11 }],
    })).toEqual({
      id: 'judul-a', title: 'Judul A', thumb: 'https://cdn.example/a.jpg',
      rating: 8.5, type: 'manhwa', status: 'publishing', latestChapter: 12,
    });
  });

  it('sampul berupa jalur relatif dijadikan URL penuh', () => {
    expect(mapItem({ slug: 's', cover_url: '/uploads/x.jpg' })?.thumb)
      .toBe('https://doujin.desu.xxx/uploads/x.jpg');
  });

  it('detail memetakan genre, chapter, dan tanggal ISO', () => {
    const d = mapDetail({
      title: 'Judul', alt_titles: 'Alt', cover_url: 'https://c.example/a.jpg',
      rating: 9, status: 'publishing', type: 'manga',
      description: '<p>Cerita</p>', author: { name: 'A' }, artist: 'B',
      manga_genres: [{ genres: { name: 'Romance', slug: 'romance' } }, { genres: {} }],
      chapters: [
        { id: 7, chapter_number: 1, title: 'Ch 1', created_at: '2026-01-02T03:04:05Z' },
        { chapter_number: 2 },
      ],
      views: 42,
    }, 'judul');
    expect(d?.id).toBe('judul');
    expect(d?.genres).toEqual([{ name: 'Romance', slug: 'romance' }]);
    expect(d?.chapters).toHaveLength(1);
    expect(d?.chapters[0]).toEqual({
      id: '7', number: 1, title: 'Ch 1', date: '2026-01-02T03:04:05.000Z',
    });
    expect(d?.author).toBe('A');
    expect(d?.artist).toBe('B');
    expect(d?.synopsis).toBe('Cerita');
  });

  it('genre diurutkan dari yang terbanyak dan yang cacat dibuang', () => {
    expect(mapGenre([
      { slug: 'a', name: 'A', manga_count: 5 },
      { slug: 'b', name: 'B', manga_count: 90 },
      { slug: '', name: 'X', manga_count: 99 },
    ])).toEqual([
      { slug: 'b', name: 'B', count: 90 },
      { slug: 'a', name: 'A', count: 5 },
    ]);
  });

  it('chapter kosong mengembalikan daftar kosong, bukan melempar', () => {
    const c = mapChapter({ chapter_number: 3 });
    expect(c.images).toEqual([]);
    expect(c.title).toBe('Chapter 3');
  });

  it('gambar chapter yang tidak aman disaring', () => {
    expect(mapChapter({
      content_urls: ['https://ok.example/1.webp', 'javascript:x', ''],
    }).images).toEqual(['https://ok.example/1.webp']);
  });
});

describe('penyaringan parameter', () => {
  it('urutan di luar daftar dikembalikan ke bawaan', () => {
    expect(urutSah('views')).toBe('views');
    expect(urutSah('rating')).toBe('rating');
    expect(urutSah('DROP TABLE')).toBe('latest_chapter');
    expect(urutSah(undefined)).toBe('latest_chapter');
  });

  it('jenis di luar daftar jadi kosong, bukan diteruskan', () => {
    expect(jenisSah('manhwa')).toBe('manhwa');
    expect(jenisSah('../etc')).toBe('');
  });

  it('slug hanya huruf kecil, angka, dan tanda hubung', () => {
    expect(slugSah('judul-a1')).toBe('judul-a1');
    expect(slugSah('Judul-A1')).toBe('judul-a1');
    expect(slugSah('../rahasia')).toBe('');
    expect(slugSah('a/b')).toBe('');
    expect(slugSah('')).toBe('');
  });

  it('id chapter menolak jalur', () => {
    expect(idChapterSah('12345')).toBe('12345');
    expect(idChapterSah('a-b_c')).toBe('a-b_c');
    expect(idChapterSah('../../etc/passwd')).toBe('');
  });

  it('halaman dan batas dijaga di rentang masuk akal', () => {
    expect(halamanSah('3')).toBe(3);
    expect(halamanSah('0')).toBe(1);
    expect(halamanSah('-5')).toBe(1);
    expect(halamanSah('abc')).toBe(1);
    expect(halamanSah('99999')).toBe(500);
    expect(batasSah('40')).toBe(40);
    expect(batasSah('9999')).toBe(60);
    expect(batasSah(undefined)).toBe(24);
  });
});
