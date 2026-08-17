import { useState } from 'react';
import { inviteLink } from '@soora/core/party';

/**
 * Bilah nonton bareng di bawah pemutar.
 *
 * Tiga keadaan: belum ada ruang (ajakan membuat), tidak bisa (judul ini tak
 * punya sumber langsung), dan sedang berjalan (tautan + jumlah orang).
 */
export default function WatchPartyBar({
  bisa,
  alasanTidakBisa,
  room,
  role,
  peers,
  status,
  notice,
  membuat,
  onBuat,
  onKeluar,
}) {
  const [tersalin, setTersalin] = useState(false);

  const salin = async () => {
    if (!room) return;
    const tautan = inviteLink(room);
    try {
      await navigator.clipboard.writeText(tautan);
      setTersalin(true);
      setTimeout(() => setTersalin(false), 2500);
    } catch {
      // Peramban tanpa izin papan klip — tampilkan supaya bisa disalin manual.
      window.prompt('Salin tautan ini:', tautan);
    }
  };

  /* ── Sedang berjalan ── */
  if (room) {
    return (
      <div className="wp-bar wp-bar-live">
        <span className={`wp-dot wp-dot-${status}`} aria-hidden="true" />
        <div className="wp-info">
          <span className="wp-title">
            {role === 'host' ? 'Ruangmu aktif' : `Nonton bareng ${room.hostName}`}
          </span>
          <span className="wp-sub">
            {notice
              ? notice
              : role === 'guest'
                ? 'Putar dan jeda dikendalikan tuan rumah'
                : `${peers.count} orang di ruang ini`}
          </span>
        </div>
        <div className="wp-actions">
          <button className="wp-btn" onClick={salin}>
            {tersalin ? 'Tautan tersalin' : 'Salin tautan'}
          </button>
          <button className="wp-btn wp-btn-quiet" onClick={onKeluar}>
            {role === 'host' ? 'Akhiri' : 'Keluar'}
          </button>
        </div>
      </div>
    );
  }

  /* ── Tidak bisa untuk judul ini ── */
  if (!bisa) {
    return (
      <div className="wp-bar wp-bar-off">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18" aria-hidden="true">
          <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
        </svg>
        <div className="wp-info">
          <span className="wp-title">Nonton bareng belum bisa di judul ini</span>
          <span className="wp-sub">{alasanTidakBisa}</span>
        </div>
      </div>
    );
  }

  /* ── Ajakan membuat ── */
  return (
    <div className="wp-bar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
      <div className="wp-info">
        <span className="wp-title">Nonton bareng</span>
        <span className="wp-sub">Bagikan tautan, kendali putar tetap di tanganmu</span>
      </div>
      <div className="wp-actions">
        <button className="wp-btn wp-btn-primary" onClick={onBuat} disabled={membuat}>
          {membuat ? 'Membuat…' : 'Buat ruang'}
        </button>
      </div>
    </div>
  );
}
