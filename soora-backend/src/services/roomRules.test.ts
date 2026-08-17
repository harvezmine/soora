import { describe, it, expect } from 'vitest';
import {
  RoomError,
  DRIFT_IGNORE_SEC,
  DRIFT_SEEK_SEC,
  assertValidContentKey,
  assertValidWatchPath,
  canControl,
  projectPosition,
  driftAction,
  playbackRateFor,
  clockOffset,
  bestOffset,
  sanitizeState,
} from './roomRules';

describe('assertValidWatchPath', () => {
  it('menerima alamat tonton yang wajar', () => {
    expect(assertValidWatchPath('/watch/movie?tmdbId=1315772&type=movie'))
      .toBe('/watch/movie?tmdbId=1315772&type=movie');
    expect(assertValidWatchPath('/watch/anime?aid=gachiakuta&ep=3'))
      .toBe('/watch/anime?aid=gachiakuta&ep=3');
  });

  it('menolak alamat di luar halaman tonton', () => {
    expect(() => assertValidWatchPath('/profile')).toThrow(RoomError);
    expect(() => assertValidWatchPath('')).toThrow(RoomError);
  });

  it('menolak URL penuh — tautan undangan tidak boleh jadi alat pengalihan', () => {
    expect(() => assertValidWatchPath('https://jahat.example/watch/movie')).toThrow(RoomError);
    expect(() => assertValidWatchPath('//jahat.example/watch/movie')).toThrow(RoomError);
    expect(() => assertValidWatchPath('/watch/movie//jahat.example')).toThrow(RoomError);
  });
});

describe('assertValidContentKey', () => {
  it('menerima kunci yang dipakai tiap bagian', () => {
    expect(assertValidContentKey('movie:1315772')).toBe('movie:1315772');
    expect(assertValidContentKey('anime:gachiakuta')).toBe('anime:gachiakuta');
  });
  it('menolak yang bisa membocorkan ruang kunci Redis', () => {
    expect(() => assertValidContentKey('movie:*')).toThrow(RoomError);
    expect(() => assertValidContentKey('1315772')).toThrow(RoomError);
  });
});

describe('canControl', () => {
  const room = { hostId: 'u_host' };
  it('hanya tuan rumah yang boleh mengubah keadaan', () => {
    expect(canControl(room, 'u_host')).toBe(true);
    expect(canControl(room, 'u_tamu')).toBe(false);
  });
  it('identitas kosong tidak pernah lolos', () => {
    expect(canControl(room, '')).toBe(false);
    expect(canControl({ hostId: '' }, '')).toBe(false);
  });
});

describe('projectPosition', () => {
  it('posisi diam saat dijeda, berapa pun waktu berlalu', () => {
    const state = { playing: false, position: 300, at: 1000 };
    expect(projectPosition(state, 1000)).toBe(300);
    expect(projectPosition(state, 999_000)).toBe(300);
  });

  it('posisi maju sebesar waktu yang lewat saat berjalan', () => {
    const state = { playing: true, position: 300, at: 10_000 };
    expect(projectPosition(state, 12_000)).toBe(302);
    expect(projectPosition(state, 10_000)).toBe(300);
  });

  it('tidak pernah mundur di bawah nol walau jam klien meleset', () => {
    const state = { playing: true, position: 5, at: 10_000 };
    expect(projectPosition(state, 9_000)).toBe(5);
  });
});

describe('driftAction', () => {
  it('selisih kecil dibiarkan — mengoreksinya justru mengganggu', () => {
    expect(driftAction(0)).toBe('ignore');
    expect(driftAction(0.3)).toBe('ignore');
    expect(driftAction(-0.49)).toBe('ignore');
  });

  it('selisih sedang dikejar dengan mengubah kecepatan', () => {
    expect(driftAction(1)).toBe('nudge-ahead');
    expect(driftAction(-1)).toBe('nudge-behind');
  });

  it('selisih besar digeser langsung', () => {
    expect(driftAction(5)).toBe('seek');
    expect(driftAction(-5)).toBe('seek');
  });

  it('tepat di ambang tidak menggeser — hanya yang melewatinya', () => {
    expect(driftAction(DRIFT_IGNORE_SEC)).toBe('nudge-ahead');
    expect(driftAction(DRIFT_SEEK_SEC)).toBe('nudge-ahead');
    expect(driftAction(DRIFT_SEEK_SEC + 0.01)).toBe('seek');
  });

  it('nilai tidak masuk akal diperlakukan aman', () => {
    expect(driftAction(NaN)).toBe('ignore');
    expect(driftAction(Infinity)).toBe('ignore');
  });
});

describe('playbackRateFor', () => {
  it('mengejar sedikit lebih cepat, menunggu sedikit lebih lambat', () => {
    expect(playbackRateFor('nudge-ahead')).toBeGreaterThan(1);
    expect(playbackRateFor('nudge-behind')).toBeLessThan(1);
  });
  it('kembali normal saat tidak ada koreksi', () => {
    expect(playbackRateFor('ignore')).toBe(1);
    expect(playbackRateFor('seek')).toBe(1);
  });
  it('perubahan kecepatan tetap halus, bukan lompatan yang terdengar', () => {
    expect(Math.abs(playbackRateFor('nudge-ahead') - 1)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(playbackRateFor('nudge-behind') - 1)).toBeLessThanOrEqual(0.1);
  });
});

describe('clockOffset', () => {
  it('nol saat jam sama dan perjalanan simetris', () => {
    // klien kirim 1000, server 1050, balasan tiba 1100 → tengahnya 1050
    expect(clockOffset(1000, 1050, 1100)).toBe(0);
  });

  it('menemukan selisih saat jam klien tertinggal', () => {
    // jam server 5000 ms di depan
    expect(clockOffset(1000, 6050, 1100)).toBe(5000);
  });
});

describe('bestOffset', () => {
  it('memilih sampel dengan perjalanan tersingkat, bukan rata-rata', () => {
    const samples = [
      { offset: 900, rtt: 400 },
      { offset: 120, rtt: 40 },
      { offset: 700, rtt: 250 },
    ];
    expect(bestOffset(samples)).toBe(120);
  });

  it('tanpa sampel dianggap tidak ada selisih', () => {
    expect(bestOffset([])).toBe(0);
  });
});

describe('sanitizeState', () => {
  it('menandai waktu dengan jam server, bukan angka kiriman klien', () => {
    const s = sanitizeState({ playing: true, position: 12, at: 1 }, 999);
    expect(s.at).toBe(999);
  });

  it('posisi tidak masuk akal jatuh ke nol', () => {
    expect(sanitizeState({ position: -5 }, 0).position).toBe(0);
    expect(sanitizeState({ position: 'dua belas' }, 0).position).toBe(0);
    expect(sanitizeState({}, 0).position).toBe(0);
  });

  it('playing selalu berupa boolean', () => {
    expect(sanitizeState({ playing: 'ya' }, 0).playing).toBe(true);
    expect(sanitizeState({ playing: 0 }, 0).playing).toBe(false);
  });
});
