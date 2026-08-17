import { useState, useRef, useEffect } from 'react';
import { nilaiLatensi, TINGKAT_SUARA_MAKS } from '@soora/core/party/audio-tune';
import {
  IconMicOn, IconMicOff, IconHeadsetOn, IconHeadsetOff, IconPhoneOff, IconGear,
} from './icons';

const inisial = (nama) => (nama || '?').trim().charAt(0).toUpperCase();

const jam = (ts) =>
  new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

/**
 * Lencana status suara di avatar. Prioritasnya bentuk, bukan cuma warna:
 * dibisukan-semua > mikrofon menyala > sekadar bergabung mendengarkan.
 */
function LencanaSuara({ orang }) {
  if (!orang.voice) return null;
  if (orang.deafened) {
    return (
      <span className="wpp-av-badge deafen" aria-label="Membisukan semua suara">
        <IconHeadsetOff size={10} />
      </span>
    );
  }
  if (orang.micOn) {
    return (
      <span className="wpp-av-badge mic" aria-label="Mikrofon menyala">
        <IconMicOn size={10} />
      </span>
    );
  }
  return (
    <span className="wpp-av-badge dengar" aria-label="Bergabung, mendengarkan">
      <IconHeadsetOn size={10} />
    </span>
  );
}

/**
 * Avatar dengan cincin suara.
 *
 * Cincinnya dua lapis dan sengaja berbeda sifat: satu cincin rapat yang
 * ketebalannya mengikuti tenaga suara (jadi keras-lirihnya terlihat), dan
 * beberapa riak yang mengembang keluar terus-menerus (jadi geraknya tidak
 * pernah membeku walau suaranya rata). Tanpa riak, penanda ini cuma cincin
 * yang berkedip; tanpa cincin yang mengikuti tenaga, riaknya terasa seperti
 * animasi hiasan yang tidak berhubungan dengan suara siapa pun.
 *
 * `--lvl` (0..1) menyetir keduanya lewat CSS, bukan lewat render ulang React
 * tiap bingkai: nilainya sudah dibulatkan di hulu, dan sisanya diperhalus
 * transisi CSS yang jalan di luar utas utama.
 */
function Avatar({ orang, bicara, tingkat = 0, ukuran = 'md' }) {
  // Bicara tanpa angka tenaga berarti kabarnya datang dari server, bukan dari
  // pengukuran sendiri — penonton yang tidak ikut kanal suara tidak menerima
  // audio siapa pun untuk diukur. Dipakai nilai tengah supaya cincinnya tetap
  // hidup, bukan tampil selemah orang yang hampir tidak bersuara.
  const efektif = bicara && !tingkat ? TINGKAT_SUARA_MAKS * 0.55 : tingkat;
  const lvl = Math.max(0, Math.min(1, efektif / TINGKAT_SUARA_MAKS));
  return (
    <span
      className={`wpp-av wpp-av-${ukuran} ${bicara ? 'is-bicara' : ''}`}
      style={{ '--lvl': lvl }}
    >
      {bicara && (
        <span className="wpp-av-riak" aria-hidden="true">
          <i /><i /><i />
        </span>
      )}
      {orang.avatar
        ? <img src={orang.avatar} alt="" referrerPolicy="no-referrer" />
        : <span className="wpp-av-fallback">{inisial(orang.name)}</span>}
      <LencanaSuara orang={orang} />
    </span>
  );
}

/**
 * Panel ruang: siapa yang ikut, obrolan, dan suara.
 *
 * Di layar lebar ia berdiri sebagai dok di kanan; di ponsel jadi lembar yang
 * naik dari bawah. Keduanya memakai markup yang sama — bedanya hanya tata
 * letak, jadi tidak ada dua jalur kode yang bisa saling menyimpang.
 *
 * Suara punya dua langkah: bergabung ke kanal (mendengarkan, otomatis) dan
 * menyalakan mikrofon (berbicara). Tombol mic/deafen baru muncul setelah
 * bergabung — sebelum itu satu-satunya aksi adalah "Gabung Suara".
 */
export default function WatchPartyPanel({
  terbuka,
  onTutup,
  room,
  role,
  peers,
  chat,
  onKirimChat,
  voiceJoined,
  onGabungSuara,
  onKeluarSuara,
  micOn,
  bisu,
  deafen,
  onToggleMic,
  onToggleDeafen,
  onToggleBisu,
  bicara,
  tingkat = {},
  volumes = {},
  onSetVolume,
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
            {orang.map((o) => {
              const bisaVolume = o.id !== selfId && o.voice;
              return (
                <li className={`wpp-orang-item ${bicara?.[o.id] ? 'is-bicara' : ''}`} key={o.id}>
                  <div className="wpp-orang-baris">
                    <Avatar orang={o} bicara={bicara?.[o.id]} tingkat={tingkat?.[o.id] ?? 0} />
                    <span className="wpp-orang-nama">
                      {o.name}{o.id === selfId ? ' (kamu)' : ''}
                    </span>
                    {mutu[o.id]?.lossPct > 3 && (
                      <span
                        className="wpp-mutu"
                        title={`${mutu[o.id].lossPct}% paket hilang${mutu[o.id].rtt != null ? ` · ${mutu[o.id].rtt} ms` : ''}`}
                      >
                        Sinyal lemah
                      </span>
                    )}
                    {o.host && <span className="wpp-lencana">Tuan rumah</span>}
                  </div>
                  {/* Volume orang ini saja — tidak berlaku untuk diri sendiri,
                      dan hanya berarti bila ia sedang di kanal suara. */}
                  {bisaVolume && (
                    <div className="wpp-vol">
                      <input
                        type="range"
                        className="wpp-vol-slider"
                        min={0}
                        max={2}
                        step={0.05}
                        value={volumes[o.id] ?? 1}
                        onChange={(e) => onSetVolume?.(o.id, parseFloat(e.target.value))}
                        aria-label={`Volume ${o.name}`}
                      />
                      <span className="wpp-vol-nilai">
                        {Math.round((volumes[o.id] ?? 1) * 100)}%
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
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
        {!voiceJoined ? (
          <button className="wpp-gabung-suara" onClick={onGabungSuara}>
            <span className="wpp-gabung-suara-ikon"><IconHeadsetOn size={19} /></span>
            <span className="wpp-gabung-suara-teks">
              <span className="wpp-gabung-suara-judul">Gabung Suara</span>
              <span className="wpp-gabung-suara-sub">Langsung dengar semua orang di ruang ini</span>
            </span>
          </button>
        ) : (
          <>
            <div className="wpp-suara-baris">
              <button
                className={`wpp-bulat ${micOn && !bisu ? 'nyala' : ''} ${micOn && bisu ? 'bisu' : ''}`}
                // Mikrofon yang belum pernah dibuka: tekan untuk membukanya.
                // Sudah terbuka: tekan hanya membisukan/membunyikan lagi —
                // perangkatnya tetap dipegang, tak perlu minta izin ulang
                // tiap kali menekan tombol ini.
                onClick={micOn ? onToggleBisu : onToggleMic}
                aria-pressed={micOn && !bisu}
                aria-label={micOn ? (bisu ? 'Mikrofon dibisukan — nyalakan lagi' : 'Matikan mikrofon') : 'Nyalakan mikrofon'}
                title={micOn ? (bisu ? 'Mikrofon dibisukan' : 'Mikrofon menyala') : 'Nyalakan mikrofon'}
              >
                {micOn && !bisu ? <IconMicOn size={19} /> : <IconMicOff size={19} />}
              </button>

              <button
                className={`wpp-bulat ${deafen ? 'aktif-merah' : ''}`}
                onClick={onToggleDeafen}
                aria-pressed={deafen}
                aria-label={deafen ? 'Batalkan bisukan semua suara' : 'Bisukan semua suara masuk'}
                title={deafen ? 'Sedang membisukan semua suara' : 'Bisukan semua suara'}
              >
                {deafen ? <IconHeadsetOff size={19} /> : <IconHeadsetOn size={19} />}
              </button>

              <button
                className={`wpp-bulat ${setelanSuara ? 'aktif' : ''}`}
                onClick={() => setSetelanSuara((v) => !v)}
                aria-label="Setelan suara"
                aria-expanded={setelanSuara}
                title="Setelan suara"
              >
                <IconGear size={17} />
              </button>

              <button className="wpp-keluar-suara" onClick={onKeluarSuara}>
                <IconPhoneOff size={16} />
                <span className="wpp-keluar-suara-label">Keluar</span>
              </button>
            </div>

            {/* Penunjuk tenaga suara sendiri — cara paling cepat memastikan
                mikrofonnya memang menangkap sesuatu. */}
            {micOn && !bisu && (
              <div className="wpp-level" aria-hidden="true">
                <span className="wpp-level-isi" style={{ width: `${Math.min(100, Math.round(levelSaya * 320))}%` }} />
              </div>
            )}

            {setelanSuara && (
              <div className="wpp-setelan">
                <label className="wpp-setelan-baris">
                  <span>Mikrofon</span>
                  <select
                    className="wpp-select"
                    value={perangkat || ''}
                    onChange={(e) => onGantiMikrofon?.(e.target.value)}
                    disabled={!micOn}
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
          </>
        )}
      </footer>
    </aside>
  );
}
