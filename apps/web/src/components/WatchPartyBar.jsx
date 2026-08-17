import { useState } from 'react';
import { inviteLink } from '@soora/core/party';

const inisial = (nama) => (nama || '?').trim().charAt(0).toUpperCase();

/**
 * Bilah ruang, duduk di bawah pemilihan kualitas.
 *
 * Sengaja ringkas: tugasnya cuma menunjukkan siapa yang ikut dan membuka
 * panel. Obrolan, daftar orang, dan mikrofon ada di panel.
 *
 * Judul yang tidak bisa dinonton bareng tidak memunculkan apa pun — bukan
 * pemberitahuan, bukan tombol mati. Fitur yang tidak berlaku sebaiknya
 * tidak terlihat sama sekali.
 */
export default function WatchPartyBar({
  room,
  role,
  peers,
  status,
  membuat,
  onBuat,
  onBukaPanel,
  onKeluar,
  panelTerbuka,
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
      window.prompt('Salin tautan ini:', tautan);
    }
  };

  /* ── Belum ada ruang ── */
  if (!room) {
    return (
      <button className="wp-mulai" onClick={onBuat} disabled={membuat}>
        <span className="wp-mulai-ikon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" width="18" height="18">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </span>
        <span className="wp-mulai-teks">
          <span className="wp-mulai-judul">{membuat ? 'Menyiapkan ruang…' : 'Nonton bareng'}</span>
          <span className="wp-mulai-sub">Ajak teman, ngobrol, dan bisa pakai mic</span>
        </span>
        <span className="wp-mulai-cta" aria-hidden="true">Buat ruang</span>
      </button>
    );
  }

  const berakhir = status === 'ended';
  const orang = peers?.people || [];
  const tampil = orang.slice(0, 5);
  const sisa = Math.max(0, (peers?.count || 0) - tampil.length);

  return (
    <div className={`wp-bar ${berakhir ? 'wp-bar-ended' : ''}`}>
      <span className={`wp-dot wp-dot-${status}`} aria-hidden="true" />

      <div className="wp-info">
        <span className="wp-title">
          {berakhir ? 'Ruang sudah berakhir' : role === 'host' ? 'Ruangmu aktif' : `Ruang ${room.hostName}`}
        </span>
        <span className="wp-sub">
          {berakhir
            ? 'Buat ruang baru untuk mengajak lagi'
            : role === 'guest'
              ? 'Putar dan jeda dikendalikan tuan rumah'
              : 'Kendali putar ada di tanganmu'}
        </span>
      </div>

      {!berakhir && tampil.length > 0 && (
        <button className="wp-peers" onClick={onBukaPanel} aria-label={`${peers.count} orang di ruang ini`}>
          {tampil.map((o) => (
            <span className="wp-peer" key={o.id} title={o.name}>
              {o.avatar
                ? <img src={o.avatar} alt="" referrerPolicy="no-referrer" />
                : inisial(o.name)}
            </span>
          ))}
          {sisa > 0 && <span className="wp-peer wp-peer-more">+{sisa}</span>}
        </button>
      )}

      <div className="wp-actions">
        {!berakhir && (
          <>
            <button
              className={`wp-btn wp-btn-primary ${panelTerbuka ? 'aktif' : ''}`}
              onClick={onBukaPanel}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Obrolan
            </button>
            <button className="wp-btn" onClick={salin}>
              {tersalin ? 'Tersalin' : 'Undang'}
            </button>
          </>
        )}
        <button className="wp-btn wp-btn-quiet" onClick={onKeluar}>
          {berakhir ? 'Tutup' : role === 'host' ? 'Akhiri' : 'Keluar'}
        </button>
      </div>
    </div>
  );
}
