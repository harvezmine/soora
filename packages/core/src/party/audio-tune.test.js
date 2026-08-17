import { describe, it, expect } from 'vitest';
import {
  tuneOpusSdp,
  createVad,
  rmsDari,
  jitterDelayMs,
  perkiraanLatensiMs,
  nilaiLatensi,
  LATENSI_TETAP_MS,
  OPUS_DEFAULT,
  clampVolume,
  volumeToElementGain,
  VOLUME_DEFAULT,
  keputusanSinyal,
  tingkatSuara,
  TINGKAT_SUARA_MAKS,
} from './audio-tune.js';

const SDP_DENGAN_FMTP = [
  'v=0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111 103',
  'a=rtpmap:111 opus/48000/2',
  'a=fmtp:111 minptime=10;useinbandfec=1',
  'a=rtpmap:103 ISAC/16000',
].join('\r\n');

const SDP_TANPA_FMTP = [
  'v=0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111',
  'a=rtpmap:111 opus/48000/2',
  'a=rtcp-fb:111 transport-cc',
].join('\r\n');

describe('tuneOpusSdp', () => {
  it('menyisipkan setelan ke baris fmtp yang sudah ada', () => {
    const out = tuneOpusSdp(SDP_DENGAN_FMTP);
    const baris = out.split('\r\n').find((l) => l.startsWith('a=fmtp:111'));
    expect(baris).toContain('useinbandfec=1');
    expect(baris).toContain('usedtx=1');
    expect(baris).toContain('stereo=0');
    expect(baris).toContain(`maxaveragebitrate=${OPUS_DEFAULT.maxaveragebitrate}`);
  });

  it('tidak menggandakan parameter yang sudah kita atur', () => {
    const baris = tuneOpusSdp(SDP_DENGAN_FMTP)
      .split('\r\n')
      .find((l) => l.startsWith('a=fmtp:111'));
    expect(baris.match(/useinbandfec=/g)).toHaveLength(1);
    expect(baris.match(/minptime=/g)).toHaveLength(1);
  });

  it('membuat baris fmtp bila belum ada', () => {
    const out = tuneOpusSdp(SDP_TANPA_FMTP);
    expect(out).toContain('a=fmtp:111 ');
    // Disisipkan tepat setelah rtpmap-nya, bukan di ujung berkas.
    const baris = out.split('\r\n');
    expect(baris[baris.indexOf('a=rtpmap:111 opus/48000/2') + 1]).toMatch(/^a=fmtp:111 /);
  });

  it('memakai nomor payload dari rtpmap, bukan angka tetap', () => {
    const sdp = 'a=rtpmap:96 opus/48000/2';
    expect(tuneOpusSdp(sdp)).toContain('a=fmtp:96 ');
  });

  it('mengembalikan SDP apa adanya bila tidak ada Opus', () => {
    const sdp = 'v=0\r\na=rtpmap:103 ISAC/16000';
    expect(tuneOpusSdp(sdp)).toBe(sdp);
  });

  it('tidak menyentuh codec lain', () => {
    expect(tuneOpusSdp(SDP_DENGAN_FMTP)).toContain('a=rtpmap:103 ISAC/16000');
  });

  it('masukan kosong atau bukan teks tidak melempar', () => {
    expect(tuneOpusSdp('')).toBe('');
    expect(tuneOpusSdp(null)).toBeNull();
    expect(tuneOpusSdp(undefined)).toBeUndefined();
  });
});

describe('createVad', () => {
  it('menyala begitu suara melewati ambang atas', () => {
    const vad = createVad();
    expect(vad.perbarui(0.01, 0)).toBe(false);
    expect(vad.perbarui(0.05, 100)).toBe(true);
  });

  it('tetap menyala saat jeda antar-kata, bukan berkedip', () => {
    const vad = createVad({ tahanMs: 300 });
    vad.perbarui(0.06, 0);
    // Hening sesaat di tengah kalimat
    expect(vad.perbarui(0.005, 100)).toBe(true);
    expect(vad.perbarui(0.005, 250)).toBe(true);
    // Lanjut bicara lagi
    expect(vad.perbarui(0.06, 300)).toBe(true);
  });

  it('mati setelah hening bertahan melewati waktu tahan', () => {
    const vad = createVad({ tahanMs: 300 });
    vad.perbarui(0.06, 0);
    vad.perbarui(0.005, 100);
    expect(vad.perbarui(0.005, 401)).toBe(false);
  });

  it('nilai di antara dua ambang tidak menyalakan dari keadaan diam', () => {
    const vad = createVad({ ambangNyala: 0.035, ambangMati: 0.02 });
    // 0,025 ada di antara keduanya — histeresis inilah yang mencegah kedip
    expect(vad.perbarui(0.025, 0)).toBe(false);
  });

  it('nilai tidak masuk akal tidak mengubah keadaan', () => {
    const vad = createVad();
    vad.perbarui(0.06, 0);
    expect(vad.perbarui(NaN, 100)).toBe(true);
    expect(vad.perbarui(undefined, 200)).toBe(true);
  });

  it('reset mengembalikan ke diam', () => {
    const vad = createVad();
    vad.perbarui(0.06, 0);
    vad.reset();
    expect(vad.aktif).toBe(false);
  });
});

describe('rmsDari', () => {
  it('gelombang diam bernilai nol', () => {
    expect(rmsDari(new Uint8Array(64).fill(128))).toBe(0);
  });

  it('simpangan penuh mendekati satu', () => {
    expect(rmsDari(new Uint8Array(64).fill(255))).toBeCloseTo(0.99, 1);
  });

  it('semakin keras semakin besar', () => {
    const pelan = new Uint8Array(64).fill(133);
    const keras = new Uint8Array(64).fill(180);
    expect(rmsDari(keras)).toBeGreaterThan(rmsDari(pelan));
  });

  it('data kosong tidak melempar', () => {
    expect(rmsDari(new Uint8Array(0))).toBe(0);
    expect(rmsDari(null)).toBe(0);
  });
});

describe('jitterDelayMs', () => {
  it('memakai selisih dua cuplikan, bukan rata-rata seumur sesi', () => {
    // Sesi lama punya rata-rata tinggi, tapi belakangan membaik.
    const sebelum = { delay: 100, count: 1000 };   // rata-rata 100 ms
    const sesudah = { delay: 102, count: 1100 };   // 100 paket terakhir: 20 ms
    expect(jitterDelayMs(sebelum, sesudah)).toBe(20);
  });

  it('cuplikan pertama memakai rata-rata seumur sesi', () => {
    expect(jitterDelayMs(undefined, { delay: 4.5, count: 100 })).toBe(45);
  });

  it('tanpa paket baru, jatuh ke rata-rata seumur sesi', () => {
    const sama = { delay: 4.5, count: 100 };
    expect(jitterDelayMs(sama, sama)).toBe(45);
  });

  it('null saat belum ada data — bukan nol, karena artinya berbeda', () => {
    expect(jitterDelayMs(undefined, { delay: 0, count: 0 })).toBeNull();
    expect(jitterDelayMs(undefined, undefined)).toBeNull();
    expect(jitterDelayMs({ delay: 1, count: 10 }, null)).toBeNull();
  });
});

describe('perkiraanLatensiMs', () => {
  it('memakai separuh waktu pulang-pergi, bukan seluruhnya', () => {
    // rtt 40 → satu arah 20, ditambah jitter 30 dan tetapan
    expect(perkiraanLatensiMs({ rttMs: 40, jitterMs: 30 })).toBe(20 + 30 + LATENSI_TETAP_MS);
  });

  it('tetap memberi angka bila salah satu belum terukur', () => {
    expect(perkiraanLatensiMs({ rttMs: 40, jitterMs: null })).toBe(20 + LATENSI_TETAP_MS);
    expect(perkiraanLatensiMs({ rttMs: null, jitterMs: 30 })).toBe(30 + LATENSI_TETAP_MS);
  });

  it('null saat tidak ada yang terukur sama sekali', () => {
    expect(perkiraanLatensiMs({ rttMs: null, jitterMs: null })).toBeNull();
  });
});

describe('nilaiLatensi', () => {
  it('memberi penilaian yang bisa dibaca, bukan angka telanjang', () => {
    expect(nilaiLatensi(80)).toBe('bagus');
    expect(nilaiLatensi(120)).toBe('bagus');
    expect(nilaiLatensi(121)).toBe('cukup');
    expect(nilaiLatensi(250)).toBe('cukup');
    expect(nilaiLatensi(251)).toBe('lambat');
  });
  it('null tetap null — belum terukur bukan berarti lambat', () => {
    expect(nilaiLatensi(null)).toBeNull();
  });
});

describe('clampVolume', () => {
  it('membatasi ke rentang 0..2', () => {
    expect(clampVolume(-5)).toBe(0);
    expect(clampVolume(0)).toBe(0);
    expect(clampVolume(1)).toBe(1);
    expect(clampVolume(2)).toBe(2);
    expect(clampVolume(9)).toBe(2);
  });
  it('nilai tidak masuk akal jatuh ke bawaan (100%)', () => {
    expect(clampVolume(NaN)).toBe(VOLUME_DEFAULT);
    expect(clampVolume(undefined)).toBe(VOLUME_DEFAULT);
    expect(clampVolume('sepuluh')).toBe(VOLUME_DEFAULT);
  });
});

describe('volumeToElementGain', () => {
  it('di bawah 100%, elemen ikut nilainya dan penguat tidak aktif', () => {
    expect(volumeToElementGain(0.4)).toEqual({ element: 0.4, gain: 1 });
    expect(volumeToElementGain(0)).toEqual({ element: 0, gain: 1 });
  });
  it('tepat 100%, keduanya normal', () => {
    expect(volumeToElementGain(1)).toEqual({ element: 1, gain: 1 });
  });
  it('di atas 100%, elemen penuh dan penguat yang menaikkan — elemen sendiri dibatasi peramban ke 0..1', () => {
    expect(volumeToElementGain(1.5)).toEqual({ element: 1, gain: 1.5 });
    expect(volumeToElementGain(2)).toEqual({ element: 1, gain: 2 });
  });
});

describe('keputusanSinyal', () => {
  const dasar = { sedangMenawar: false, signalingState: 'stable' };

  it('tawaran saat tenang diterima dan dijawab oleh kedua peran', () => {
    for (const sopan of [true, false]) {
      expect(keputusanSinyal({ ...dasar, tipe: 'offer', sopan })).toEqual({
        abaikan: false, rollback: false, jawab: true,
      });
    }
  });

  it('jawaban tidak pernah dianggap bentrok — hanya tawaran yang bisa bertabrakan', () => {
    expect(keputusanSinyal({ tipe: 'answer', sopan: false, sedangMenawar: true, signalingState: 'have-local-offer' }))
      .toEqual({ abaikan: false, rollback: false, jawab: false });
  });

  // Inti perbaikan bug "aku tidak bisa mendengar dia, dia bisa mendengarku":
  // dua sisi kini boleh menawar, dan tabrakannya harus selesai secara
  // berlawanan — tepat satu sisi yang mengalah.
  it('bentrok: yang tidak sopan mengabaikan tawaran lawan', () => {
    expect(keputusanSinyal({ tipe: 'offer', sopan: false, sedangMenawar: true, signalingState: 'stable' }))
      .toEqual({ abaikan: true, rollback: false, jawab: false });
  });

  it('bentrok: yang sopan membatalkan tawarannya sendiri lalu menjawab', () => {
    expect(keputusanSinyal({ tipe: 'offer', sopan: true, sedangMenawar: true, signalingState: 'have-local-offer' }))
      .toEqual({ abaikan: false, rollback: true, jawab: true });
  });

  it('tepat satu sisi mengalah pada tabrakan yang sama', () => {
    const keadaan = { tipe: 'offer', sedangMenawar: true, signalingState: 'have-local-offer' };
    const a = keputusanSinyal({ ...keadaan, sopan: true });
    const b = keputusanSinyal({ ...keadaan, sopan: false });
    expect([a.abaikan, b.abaikan]).toEqual([false, true]);
  });

  it('rollback dilewati bila tawaran sendiri belum terpasang — membatalkan di keadaan stable justru galat', () => {
    const k = keputusanSinyal({ tipe: 'offer', sopan: true, sedangMenawar: true, signalingState: 'stable' });
    expect(k).toEqual({ abaikan: false, rollback: false, jawab: true });
  });

  it('bentrok terdeteksi dari signalingState walau penanda menawar sudah turun', () => {
    expect(keputusanSinyal({ tipe: 'offer', sopan: false, sedangMenawar: false, signalingState: 'have-local-offer' }).abaikan)
      .toBe(true);
  });
});

describe('tingkatSuara', () => {
  it('hening jadi nol', () => {
    expect(tingkatSuara(0)).toBe(0);
    expect(tingkatSuara(-1)).toBe(0);
  });

  it('nilai tidak masuk akal jadi nol, bukan NaN', () => {
    expect(tingkatSuara(NaN)).toBe(0);
    expect(tingkatSuara(undefined)).toBe(0);
    expect(tingkatSuara('keras')).toBe(0);
  });

  it('tidak pernah keluar dari rentang 0..maks', () => {
    for (const rms of [1e-9, 0.0001, 0.02, 0.2, 1, 99]) {
      const t = tingkatSuara(rms);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(TINGKAT_SUARA_MAKS);
    }
  });

  it('suara lebih keras tidak pernah memberi tingkat lebih rendah', () => {
    const naik = [0.005, 0.01, 0.03, 0.06, 0.12, 0.3, 0.8];
    const hasil = naik.map(tingkatSuara);
    expect(hasil).toEqual([...hasil].sort((a, b) => a - b));
  });

  it('membedakan tenaga percakapan biasa, bukan menumpuk di satu tingkat', () => {
    // Kalau dipetakan linier, semua nilai ini jatuh ke tingkat terendah.
    const berbeda = new Set([0.01, 0.03, 0.08, 0.18].map(tingkatSuara));
    expect(berbeda.size).toBeGreaterThanOrEqual(3);
  });

  it('mencapai tingkat penuh pada suara keras', () => {
    expect(tingkatSuara(0.5)).toBe(TINGKAT_SUARA_MAKS);
  });
});
