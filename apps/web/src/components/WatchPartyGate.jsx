/**
 * Gerbang gabung untuk tamu, menutupi pemutar.
 *
 * Bukan basa-basi: peramban hanya mengizinkan video mulai berbunyi sebagai
 * tanggapan atas gerak pengguna. Ketukan pada tombol inilah izinnya. Tanpa
 * gerbang ini video tamu akan diam dan terlihat seperti gagal memuat.
 */
export default function WatchPartyGate({ hostName, title, peers, onGabung }) {
  return (
    <div className="wpg" role="dialog" aria-modal="true" aria-labelledby="wpg-judul">
      <div className="wpg-card">
        <span className="wpg-eyebrow">Nonton bareng</span>
        <h2 className="wpg-title" id="wpg-judul">
          {hostName ? `${hostName} mengajakmu nonton bareng` : 'Kamu diundang nonton bareng'}
        </h2>
        {title && <p className="wpg-sub">{title}</p>}

        <button className="wpg-btn" onClick={onGabung} autoFocus>
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Gabung menonton
        </button>

        <p className="wpg-note">
          Putar dan jeda dikendalikan {hostName || 'tuan rumah'}.
          {peers > 1 ? ` ${peers} orang sudah di dalam.` : ''}
        </p>
      </div>
    </div>
  );
}
