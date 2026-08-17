import { useState, useRef, useEffect } from 'react';

const inisial = (nama) => (nama || '?').trim().charAt(0).toUpperCase();

const jam = (ts) =>
  new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

function Avatar({ orang, bicara, ukuran = 'md' }) {
  return (
    <span className={`wpp-av wpp-av-${ukuran} ${bicara ? 'is-bicara' : ''}`}>
      {orang.avatar
        ? <img src={orang.avatar} alt="" referrerPolicy="no-referrer" />
        : <span className="wpp-av-fallback">{inisial(orang.name)}</span>}
      {orang.voice && (
        <span className="wpp-av-mic" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
            <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
            <path d="M19 11a7 7 0 0 1-14 0H3a9 9 0 0 0 8 8.94V23h2v-3.06A9 9 0 0 0 21 11z" />
          </svg>
        </span>
      )}
    </span>
  );
}

/**
 * Panel ruang: siapa yang ikut, obrolan, dan mikrofon.
 *
 * Di layar lebar ia berdiri sebagai dok di kanan; di ponsel jadi lembar yang
 * naik dari bawah. Keduanya memakai markup yang sama — bedanya hanya tata
 * letak, jadi tidak ada dua jalur kode yang bisa saling menyimpang.
 */
export default function WatchPartyPanel({
  terbuka,
  onTutup,
  room,
  role,
  peers,
  chat,
  onKirimChat,
  micOn,
  bisu,
  bicara,
  onToggleMic,
  onToggleBisu,
  selfId,
  notice,
}) {
  const [teks, setTeks] = useState('');
  const [tab, setTab] = useState('obrolan'); // obrolan | orang (hanya di ponsel)
  const ujungRef = useRef(null);
  const daftarRef = useRef(null);

  // Gulir ke pesan terbaru, tapi hanya bila pembaca memang sedang di bawah —
  // menyeret paksa saat ia membaca ke atas itu menyebalkan.
  useEffect(() => {
    const el = daftarRef.current;
    if (!el) return;
    const diBawah = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (diBawah) ujungRef.current?.scrollIntoView({ block: 'end' });
  }, [chat]);

  if (!terbuka) return null;

  const kirim = (e) => {
    e.preventDefault();
    const isi = teks.trim();
    if (!isi) return;
    onKirimChat(isi);
    setTeks('');
  };

  const orang = peers?.people || [];

  return (
    <aside className="wpp" aria-label="Ruang nonton bareng">
      <header className="wpp-head">
        <div className="wpp-head-id">
          <span className="wpp-head-title">{room?.title || 'Nonton bareng'}</span>
          <span className="wpp-head-sub">
            {role === 'host' ? 'Kamu tuan rumahnya' : `Ruang ${room?.hostName || ''}`}
          </span>
        </div>
        <button className="wpp-x" onClick={onTutup} aria-label="Tutup panel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="18" height="18">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      {/* Tab hanya muncul di ponsel; di layar lebar keduanya tampil sekaligus */}
      <div className="wpp-tabs" role="tablist">
        <button
          className={`wpp-tab ${tab === 'obrolan' ? 'aktif' : ''}`}
          onClick={() => setTab('obrolan')}
          role="tab"
          aria-selected={tab === 'obrolan'}
        >
          Obrolan
        </button>
        <button
          className={`wpp-tab ${tab === 'orang' ? 'aktif' : ''}`}
          onClick={() => setTab('orang')}
          role="tab"
          aria-selected={tab === 'orang'}
        >
          Orang <span className="wpp-tab-n">{peers?.count || 0}</span>
        </button>
      </div>

      <div className={`wpp-body tab-${tab}`}>
        {/* ── Orang ── */}
        <section className="wpp-orang" aria-label="Peserta">
          <h3 className="wpp-h3">Di ruang ini — {peers?.count || 0}</h3>
          <ul className="wpp-orang-list">
            {orang.map((o) => (
              <li className={`wpp-orang-item ${bicara?.[o.id] ? 'is-bicara' : ''}`} key={o.id}>
                <Avatar orang={o} bicara={bicara?.[o.id]} />
                <span className="wpp-orang-nama">
                  {o.name}{o.id === selfId ? ' (kamu)' : ''}
                </span>
                {o.host && <span className="wpp-lencana">Tuan rumah</span>}
              </li>
            ))}
          </ul>
        </section>

        {/* ── Obrolan ── */}
        <section className="wpp-chat" aria-label="Obrolan">
          <div className="wpp-chat-list" ref={daftarRef}>
            {chat.length === 0 ? (
              <p className="wpp-kosong">Belum ada obrolan. Sapa dulu 👋</p>
            ) : (
              chat.map((m) => (
                <div className={`wpp-msg ${m.userId === selfId ? 'milikku' : ''}`} key={m.id}>
                  <Avatar orang={m} ukuran="sm" />
                  <div className="wpp-msg-body">
                    <div className="wpp-msg-head">
                      <span className="wpp-msg-nama">{m.name}</span>
                      <span className="wpp-msg-jam">{jam(m.at)}</span>
                    </div>
                    {/* Dirender sebagai teks polos — tidak ada jalan bagi
                        markup pengguna untuk dieksekusi. */}
                    <p className="wpp-msg-teks">{m.text}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={ujungRef} />
          </div>

          <form className="wpp-kirim" onSubmit={kirim}>
            <input
              className="wpp-input"
              value={teks}
              onChange={(e) => setTeks(e.target.value.slice(0, 500))}
              placeholder="Tulis pesan…"
              aria-label="Tulis pesan"
            />
            <button className="wpp-kirim-btn" type="submit" disabled={!teks.trim()} aria-label="Kirim">
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
              </svg>
            </button>
          </form>
        </section>
      </div>

      {notice && <p className="wpp-notice" role="status">{notice}</p>}

      {/* ── Bilah suara ── */}
      <footer className="wpp-suara">
        <button
          className={`wpp-mic ${micOn ? 'nyala' : ''}`}
          onClick={onToggleMic}
          aria-pressed={micOn}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
            {micOn ? (
              <>
                <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
                <path d="M19 11a7 7 0 0 1-14 0H3a9 9 0 0 0 8 8.94V23h2v-3.06A9 9 0 0 0 21 11z" />
              </>
            ) : (
              <>
                <path d="M15 10.6V5a3 3 0 0 0-5.9-.7zM4.3 3 3 4.3l6 6V11a3 3 0 0 0 4.6 2.5l1.5 1.5A5 5 0 0 1 7 11H5a7 7 0 0 0 6 6.9V21h2v-3.1a7 7 0 0 0 3-1.2l4 4 1.3-1.3z" />
              </>
            )}
          </svg>
          {micOn ? 'Mic nyala' : 'Nyalakan mic'}
        </button>

        {micOn && (
          <button
            className={`wpp-bisu ${bisu ? 'aktif' : ''}`}
            onClick={onToggleBisu}
            aria-pressed={bisu}
          >
            {bisu ? 'Bersuara' : 'Bisukan'}
          </button>
        )}
      </footer>
    </aside>
  );
}
