import { useEffect, useState } from 'react';
import { useSEO } from '../utils/seo';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * Halaman unduh APK.
 *
 * Data versinya diambil dari `/app/version` — endpoint yang sama yang dipakai
 * APK untuk memeriksa pembaruan. Jadi merilis versi baru cukup mengubah
 * environment di server; halaman ini dan banner di dalam app langsung ikut,
 * tanpa deploy ulang web.
 */
export default function Download() {
  const [info, setInfo] = useState(null);
  const [state, setState] = useState('loading');

  useSEO({
    title: 'Unduh Aplikasi Soora',
    description:
      'Unduh aplikasi Android Soora — nonton anime, film, dan baca manga dengan pemutar native, tonton di latar belakang, dan katalog yang bisa dibuka offline.',
    canonical: 'https://soora.fun/download',
  });

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/app/version`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('gagal'))))
      .then((d) => {
        if (!alive) return;
        setInfo(d);
        setState('ready');
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, []);

  const available = state === 'ready' && info?.apkUrl;

  return (
    <div className="download-page">
      <div className="download-card">
        <h1>Aplikasi Soora untuk Android</h1>
        <p className="download-lead">
          Versi aplikasi memberi hal yang tidak bisa dilakukan situs: pemutar native, audio jalan
          terus saat aplikasi ditutup, mode layar kecil, dan katalog yang tetap terbuka saat tidak
          ada internet.
        </p>

        {state === 'loading' && <p className="download-muted">Memeriksa versi terbaru…</p>}

        {state === 'error' && (
          <p className="download-muted">
            Gagal memeriksa versi. Coba muat ulang halaman ini beberapa saat lagi.
          </p>
        )}

        {state === 'ready' && !info?.apkUrl && (
          <div className="download-soon">
            <strong>Belum tersedia untuk diunduh.</strong>
            <p>
              Aplikasinya masih dalam pengujian. Sementara ini, soora.fun sudah bisa dipakai penuh
              lewat peramban.
            </p>
          </div>
        )}

        {available && (
          <>
            <a className="download-btn" href={info.apkUrl} rel="noopener">
              Unduh APK
              {info.versionName ? <span> · versi {info.versionName}</span> : null}
            </a>

            {info.changelog ? (
              <div className="download-changelog">
                <h2>Yang baru</h2>
                <p>{info.changelog}</p>
              </div>
            ) : null}

            <div className="download-help">
              <h2>Cara memasang</h2>
              <ol>
                <li>Ketuk tombol unduh di atas.</li>
                <li>
                  Buka berkas yang terunduh. Android akan meminta izin memasang dari sumber tidak
                  dikenal — itu normal untuk aplikasi di luar Play Store.
                </li>
                <li>Izinkan, lalu ketuk Pasang.</li>
              </ol>
              <p className="download-muted">
                Sudah pernah memasang versi lama? Cukup pasang yang baru di atasnya — data dan
                daftar tontonanmu tetap tersimpan.
              </p>
            </div>
          </>
        )}

        <p className="download-muted download-note">
          Aplikasi ini tidak tersedia di Play Store dan hanya bisa diunduh dari halaman ini.
        </p>
      </div>
    </div>
  );
}
