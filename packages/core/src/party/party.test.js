import { describe, it, expect } from 'vitest';
import {
  DRIFT_IGNORE_SEC,
  DRIFT_SEEK_SEC,
  driftAction,
  playbackRateFor,
  clockOffset,
  projectPosition,
  inviteLink,
} from './index.js';

/**
 * Nilai di sini harus sama persis dengan services/roomRules.ts di backend.
 * Kalau salah satunya digeser tanpa yang lain, tamu dan tuan rumah akan
 * memakai aturan berbeda — dan gejalanya sulit dilacak.
 */
describe('ambang koreksi sepakat dengan server', () => {
  it('memakai nilai yang sama', () => {
    expect(DRIFT_IGNORE_SEC).toBe(0.5);
    expect(DRIFT_SEEK_SEC).toBe(2);
  });
});

describe('driftAction', () => {
  it('selisih kecil dibiarkan', () => {
    expect(driftAction(0)).toBe('ignore');
    expect(driftAction(0.49)).toBe('ignore');
    expect(driftAction(-0.49)).toBe('ignore');
  });

  it('selisih sedang dikejar dengan mengubah kecepatan', () => {
    expect(driftAction(1)).toBe('nudge-ahead');
    expect(driftAction(-1)).toBe('nudge-behind');
  });

  it('selisih besar digeser langsung', () => {
    expect(driftAction(2.5)).toBe('seek');
    expect(driftAction(-30)).toBe('seek');
  });

  it('nilai tidak masuk akal tidak menyentuh pemutar', () => {
    expect(driftAction(NaN)).toBe('ignore');
    expect(driftAction(Infinity)).toBe('ignore');
    expect(driftAction(undefined)).toBe('ignore');
  });
});

describe('playbackRateFor', () => {
  it('kejar sedikit lebih cepat, tunggu sedikit lebih lambat', () => {
    expect(playbackRateFor('nudge-ahead')).toBe(1.05);
    expect(playbackRateFor('nudge-behind')).toBe(0.95);
  });
  it('normal saat tidak mengoreksi', () => {
    expect(playbackRateFor('ignore')).toBe(1);
    expect(playbackRateFor('seek')).toBe(1);
  });
});

describe('clockOffset', () => {
  it('nol saat jam sama', () => {
    expect(clockOffset(1000, 1050, 1100)).toBe(0);
  });
  it('menemukan jam server yang lebih maju', () => {
    expect(clockOffset(1000, 6050, 1100)).toBe(5000);
  });
  it('menemukan jam server yang tertinggal', () => {
    expect(clockOffset(1000, -3950, 1100)).toBe(-5000);
  });
});

describe('projectPosition', () => {
  it('diam saat dijeda', () => {
    expect(projectPosition({ playing: false, position: 300, at: 0 }, 60_000)).toBe(300);
  });
  it('maju sebesar waktu yang lewat saat berjalan', () => {
    expect(projectPosition({ playing: true, position: 300, at: 10_000 }, 13_000)).toBe(303);
  });
  it('tidak mundur di bawah nol walau jam klien meleset', () => {
    expect(projectPosition({ playing: true, position: 5, at: 10_000 }, 1_000)).toBe(5);
  });
  it('keadaan kosong tidak melempar', () => {
    expect(projectPosition(null, 1000)).toBe(0);
    expect(projectPosition(undefined, 1000)).toBe(0);
  });
});

describe('inviteLink', () => {
  const asal = 'https://soora.fun';
  it('menempelkan room dengan & bila sudah ada query', () => {
    const t = inviteLink({ id: 'abc', watchPath: '/watch/movie?tmdbId=1&type=movie' });
    expect(t).toBe(`${asal}/watch/movie?tmdbId=1&type=movie&room=abc`);
  });
  it('menempelkan room dengan ? bila belum ada query', () => {
    const t = inviteLink({ id: 'abc', watchPath: '/watch/movie' });
    expect(t).toBe(`${asal}/watch/movie?room=abc`);
  });
  it('id yang mengandung karakter khusus di-escape', () => {
    const t = inviteLink({ id: 'a/b+c', watchPath: '/watch/movie' });
    expect(t).toBe(`${asal}/watch/movie?room=a%2Fb%2Bc`);
  });
});
