import { useState, useEffect, useRef, useCallback } from 'react';
import { apiGetAvatars, apiSetAvatar, apiUploadAvatar } from '@soora/core/user';

/** Sejalan dengan batas di backend (services/avatars.ts). */
const MAKS_BYTE = 2 * 1024 * 1024;
const JENIS_DITERIMA = ['image/png', 'image/jpeg', 'image/webp'];

const IconUnggah = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 9 5-5 5 5M12 4v12" />
  </svg>
);

const IconCentang = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
    strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/**
 * Pemilih foto profil: avatar bawaan Soora, atau unggahan sendiri.
 *
 * Unggahan dipratinjau dalam lingkaran lebih dulu — itu bentuk yang akan
 * dilihat orang lain, jadi pemotongannya harus terlihat sebelum dikirim,
 * bukan sesudah.
 */
export default function AvatarPicker({ avatarSaatIni, onGanti, onTutup }) {
  const [tab, setTab] = useState('bawaan');
  const [bawaan, setBawaan] = useState(null); // null = belum dimuat
  const [sibuk, setSibuk] = useState(null);
  const [galat, setGalat] = useState(null);
  const [pratinjau, setPratinjau] = useState(null); // { url, file }
  const [seret, setSeret] = useState(false);
  const berkasRef = useRef(null);

  useEffect(() => {
    apiGetAvatars().then(setBawaan).catch(() => setBawaan([]));
  }, []);

  // URL objek pratinjau dilepas saat berganti, kalau tidak ia menahan
  // berkasnya di memori sampai tab ditutup.
  useEffect(() => () => { if (pratinjau?.url) URL.revokeObjectURL(pratinjau.url); }, [pratinjau]);

  const pakaiBawaan = useCallback(async (url) => {
    setSibuk(url); setGalat(null);
    try {
      const user = await apiSetAvatar(url);
      if (user) onGanti(user); else setGalat('Gagal mengganti foto profil.');
    } finally { setSibuk(null); }
  }, [onGanti]);

  const pilihBerkas = useCallback((file) => {
    setGalat(null);
    if (!file) return;
    if (!JENIS_DITERIMA.includes(file.type)) {
      setGalat('Hanya PNG, JPG, atau WebP yang bisa dipakai.');
      return;
    }
    if (file.size > MAKS_BYTE) {
      setGalat(`Gambarnya ${(file.size / 1024 / 1024).toFixed(1)} MB — maksimal 2 MB.`);
      return;
    }
    if (pratinjau?.url) URL.revokeObjectURL(pratinjau.url);
    setPratinjau({ url: URL.createObjectURL(file), file });
  }, [pratinjau]);

  const kirimUnggahan = useCallback(async () => {
    if (!pratinjau) return;
    setSibuk('unggah'); setGalat(null);
    try {
      const user = await apiUploadAvatar(pratinjau.file);
      if (user) { onGanti(user); setPratinjau(null); }
      else setGalat('Gagal mengunggah. Coba lagi.');
    } catch (e) {
      setGalat(e.message || 'Gagal mengunggah.');
    } finally { setSibuk(null); }
  }, [pratinjau, onGanti]);

  return (
    <section className="avp" aria-label="Pilih foto profil">
      <header className="avp-head">
        <h2 className="avp-judul">Foto profil</h2>
        <button className="avp-x" onClick={onTutup} aria-label="Tutup">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="17" height="17">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div className="avp-tabs" role="tablist">
        <button
          className={`avp-tab ${tab === 'bawaan' ? 'aktif' : ''}`}
          onClick={() => setTab('bawaan')}
          role="tab" aria-selected={tab === 'bawaan'}
        >
          Pilihan Soora
        </button>
        <button
          className={`avp-tab ${tab === 'unggah' ? 'aktif' : ''}`}
          onClick={() => setTab('unggah')}
          role="tab" aria-selected={tab === 'unggah'}
        >
          Unggah sendiri
        </button>
      </div>

      {galat && <p className="avp-galat" role="status">{galat}</p>}

      {tab === 'bawaan' && (
        bawaan === null ? (
          <div className="avp-grid">
            {[0, 1, 2, 3, 4].map((i) => <div className="avp-opsi skel-shimmer" key={i} />)}
          </div>
        ) : bawaan.length === 0 ? (
          <p className="avp-kosong">Belum ada foto profil bawaan.</p>
        ) : (
          <div className="avp-grid">
            {bawaan.map((url) => {
              const terpilih = avatarSaatIni === url;
              return (
                <button
                  key={url}
                  className={`avp-opsi ${terpilih ? 'terpilih' : ''}`}
                  onClick={() => pakaiBawaan(url)}
                  disabled={!!sibuk}
                  aria-pressed={terpilih}
                  aria-label={terpilih ? 'Foto profil sekarang' : 'Pakai foto ini'}
                >
                  <img src={url} alt="" loading="lazy" />
                  {terpilih && <span className="avp-centang" aria-hidden="true"><IconCentang /></span>}
                  {sibuk === url && <span className="avp-memuat" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )
      )}

      {tab === 'unggah' && (
        <div className="avp-unggah">
          {pratinjau ? (
            <>
              {/* Pratinjau dalam lingkaran: itu bentuk yang dilihat orang lain */}
              <div className="avp-pratinjau">
                <img src={pratinjau.url} alt="Pratinjau foto profil" />
              </div>
              <p className="avp-nama-berkas">{pratinjau.file.name}</p>
              <div className="avp-unggah-aksi">
                <button
                  className="avp-btn-quiet"
                  onClick={() => setPratinjau(null)}
                  disabled={sibuk === 'unggah'}
                >
                  Ganti gambar
                </button>
                <button
                  className="avp-btn"
                  onClick={kirimUnggahan}
                  disabled={sibuk === 'unggah'}
                >
                  {sibuk === 'unggah' ? 'Mengunggah...' : 'Pakai foto ini'}
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                className={`avp-drop ${seret ? 'seret' : ''}`}
                onClick={() => berkasRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setSeret(true); }}
                onDragLeave={() => setSeret(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setSeret(false);
                  pilihBerkas(e.dataTransfer.files?.[0]);
                }}
              >
                <span className="avp-drop-ikon"><IconUnggah /></span>
                <span className="avp-drop-judul">Pilih gambar</span>
                <span className="avp-drop-sub">Seret ke sini, atau ketuk untuk memilih</span>
              </button>
              <p className="avp-syarat">PNG, JPG, atau WebP · maksimal 2 MB · sebaiknya persegi</p>
            </>
          )}

          <input
            ref={berkasRef}
            type="file"
            accept={JENIS_DITERIMA.join(',')}
            className="avp-input-berkas"
            onChange={(e) => { pilihBerkas(e.target.files?.[0]); e.target.value = ''; }}
          />
        </div>
      )}
    </section>
  );
}
