import { useState, useRef, useEffect } from 'react';
import { nilaiLatensi } from '@soora/core/party/audio-tune';

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
  levelSaya = 0,
  mutu = {},
  mikrofon = [],
  perangkat,
  onGantiMikrofon,
  ptt = false,
  onSetPtt,
  onTahanBicara,
}) {
  const [setelanSuara, setSetelanSuara] = useState(false);
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

  // Tekan-untuk-bicara lewat papan tik. Spasi dipilih karena itulah tombol
  // yang dipakai hampir semua aplikasi suara — dan kolom obrolan dikecualikan
  // supaya mengetik spasi tidak membuka mikrofon.
  useEffect(() => {
    if (!terbuka || !ptt || !micOn) return;
    const bolehLewat = (e) => !['INPUT', 'TEXTAREA'].includes(e.target.tagName);
    const turun = (e) => { if (e.code === 'Space' && bolehLewat(e) && !e.repeat) { e.preventDefault(); onTahanBicara?.(true); } };
    const naik = (e) => { if (e.code === 'Space' && bolehLewat(e)) { e.preventDefault(); onTahanBicara?.(false); } };
    window.addEventListener('keydown', turun);
    window.addEventListener('keyup', naik);
    return () => {
      window.removeEventListener('keydown', turun);
      window.removeEventListener('keyup', naik);
      onTahanBicara?.(false);
    };
  }, [terbuka, ptt, micOn, onTahanBicara]);

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
                {mutu[o.id]?.lossPct > 3 && (
                  <span className="wpp-mutu" title={`${mutu[o.id].lossPct}% paket hilang${mutu[o.id].rtt != null ? ` · ${mutu[o.id].rtt} ms` : ''}`}>
                    Sinyal lemah
                  </span>
                )}
                {o.host && <span className="wpp-lencana">Tuan rumah</span>}
              </li>
            ))}
          </ul>
        </section>

        {/* ── Obrolan ── */}
        <section className="wpp-chat" aria-label="Obrolan">
          <div className="wpp-chat-list" ref={daftarRef}>
            {chat.length === 0 ? (
              <p className="wpp-kosong">Belum ada obrolan di ruang ini.</p>
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
        <div className="wpp-suara-baris">
          <button
            className={`wpp-mic ${micOn ? 'nyala' : ''} ${micOn && bisu ? 'bisu' : ''}`}
            onClick={onToggleMic}
            aria-pressed={micOn}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
              {micOn && !bisu ? (
                <>
                  <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
                  <path d="M19 11a7 7 0 0 1-14 0H3a9 9 0 0 0 8 8.94V23h2v-3.06A9 9 0 0 0 21 11z" />
                </>
              ) : (
                <path d="M15 10.6V5a3 3 0 0 0-5.9-.7zM4.3 3 3 4.3l6 6V11a3 3 0 0 0 4.6 2.5l1.5 1.5A5 5 0 0 1 7 11H5a7 7 0 0 0 6 6.9V21h2v-3.1a7 7 0 0 0 3-1.2l4 4 1.3-1.3z" />
              )}
            </svg>
            {!micOn ? 'Nyalakan mic' : bisu ? (ptt ? 'Tahan spasi' : 'Bisu') : 'Mic nyala'}
          </button>

          {micOn && !ptt && (
            <button className={`wpp-bisu ${bisu ? 'aktif' : ''}`} onClick={onToggleBisu} aria-pressed={bisu}>
              {bisu ? 'Bersuara' : 'Bisukan'}
            </button>
          )}

          {micOn && (
            <button
              className={`wpp-gear ${setelanSuara ? 'aktif' : ''}`}
              onClick={() => setSetelanSuara((v) => !v)}
              aria-label="Setelan suara"
              aria-expanded={setelanSuara}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          )}
        </div>

        {/* Penunjuk tenaga suara sendiri — cara paling cepat memastikan
            mikrofonnya memang menangkap sesuatu. */}
        {micOn && (
          <div className="wpp-level" aria-hidden="true">
            <span className="wpp-level-isi" style={{ width: `${Math.min(100, Math.round(levelSaya * 320))}%` }} />
          </div>
        )}

        {micOn && setelanSuara && (
          <div className="wpp-setelan">
            <label className="wpp-setelan-baris">
              <span>Mikrofon</span>
              <select
                className="wpp-select"
                value={perangkat || ''}
                onChange={(e) => onGantiMikrofon?.(e.target.value)}
              >
                {perangkat == null && <option value="">Bawaan sistem</option>}
                {mikrofon.map((m) => <option value={m.id} key={m.id}>{m.label}</option>)}
              </select>
            </label>
            {Object.entries(mutu).filter(([, q]) => q?.latencyMs != null).length > 0 && (
              <div className="wpp-ukur">
                <span className="wpp-ukur-judul">Latensi terukur</span>
                {Object.entries(mutu)
                  .filter(([, q]) => q?.latencyMs != null)
                  .map(([id, q]) => {
                    const nama = (peers?.people || []).find((o) => o.id === id)?.name || 'Peserta';
                    return (
                      <div className="wpp-ukur-baris" key={id}>
                        <span className="wpp-ukur-nama">{nama}</span>
                        <span className={`wpp-ukur-nilai n-${nilaiLatensi(q.latencyMs)}`}>
                          {q.latencyMs} ms
                        </span>
                        <span className="wpp-ukur-rinci">
                          {q.rtt != null ? `jaringan ${q.rtt} ms` : 'jaringan —'}
                          {q.jitterMs != null ? ` · antrean ${q.jitterMs} ms` : ''}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}

            <label className="wpp-setelan-baris">
              <span>Tekan spasi untuk bicara</span>
              <input
                type="checkbox"
                className="wpp-switch"
                checked={ptt}
                onChange={(e) => onSetPtt?.(e.target.checked)}
              />
            </label>
          </div>
        )}
      </footer>
    </aside>
  );
}
