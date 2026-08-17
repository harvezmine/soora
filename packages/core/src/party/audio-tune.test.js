import { describe, it, expect } from 'vitest';
import { tuneOpusSdp, createVad, rmsDari, OPUS_DEFAULT } from './audio-tune.js';

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
