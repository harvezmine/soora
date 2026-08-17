const inisial = (nama) => (nama || '?').trim().charAt(0).toUpperCase();

/**
 * Undangan nonton bareng, menutupi pemutar sampai tamu menerimanya.
 *
 * Ketukan pada tombolnya bukan formalitas: peramban hanya mengizinkan video
 * mulai berbunyi sebagai tanggapan atas gerak pengguna. Tanpa gerbang ini
 * video tamu akan diam dan terlihat seperti gagal memuat.
 */
export default function WatchPartyGate({ hostName, title, peers, people = [], onGabung }) {
  const tampil = people.slice(0, 6);
  const sisa = Math.max(0, peers - tampil.length);

  return (
    <div className="wpg" role="dialog" aria-modal="true" aria-labelledby="wpg-judul">
      <div className="wpg-card">
        <div className="wpg-host">
          <span className="wpg-host-av">
            {people.find((o) => o.host)?.avatar
              ? <img src={people.find((o) => o.host).avatar} alt="" referrerPolicy="no-referrer" />
              : inisial(hostName)}
            <span className="wpg-host-ring" aria-hidden="true" />
          </span>
        </div>

        <span className="wpg-eyebrow">Undangan nonton bareng</span>
        <h2 className="wpg-title" id="wpg-judul">
          {hostName ? `${hostName} mengajakmu nonton` : 'Kamu diundang nonton bareng'}
        </h2>
        {title && <p className="wpg-sub">{title}</p>}

        {tampil.length > 0 && (
          <div className="wpg-orang" aria-hidden="true">
            {tampil.map((o) => (
              <span className="wpg-orang-av" key={o.id} title={o.name}>
                {o.avatar
                  ? <img src={o.avatar} alt="" referrerPolicy="no-referrer" />
                  : inisial(o.name)}
              </span>
            ))}
            {sisa > 0 && <span className="wpg-orang-av wpg-orang-more">+{sisa}</span>}
          </div>
        )}

        <button className="wpg-btn" onClick={onGabung} autoFocus>
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Gabung nonton
        </button>

        <p className="wpg-note">
          Bisa ngobrol dan pakai mic di dalam. Putar dan jeda dipegang {hostName || 'tuan rumah'}.
        </p>
      </div>
    </div>
  );
}
