import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
  // Halaman ini juga dibuka dari iPhone lewat tautan yang dibagikan. Menawarkan
  // APK di sana hanya membuang waktu orang, jadi katakan terus terang.
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  return (
    <div className="download-page">
      <div className="download-hero">
        <div className="download-hero-glow" aria-hidden="true" />

        <div className="download-hero-inner">
          <div className="download-mark" aria-hidden="true">
            <img src="/logo-wordmark.png" alt="Soora" className="download-mark-img" width="1024" height="430" />
          </div>

          <h1 className="download-title">
            Soora untuk <span className="download-title-accent">Android</span>
          </h1>
          <p className="download-lead">
            Pemutar native, audio jalan terus saat aplikasi ditutup, mode layar kecil, dan katalog
            yang tetap terbuka saat tidak ada internet.
          </p>

          <div className="download-action">
            {state === 'loading' && (
              <div className="download-skeleton" role="status" aria-label="Memeriksa versi terbaru">
                <span className="download-skeleton-bar" />
              </div>
            )}

            {state === 'error' && (
              <div className="download-note download-note-warn" role="alert">
                <strong>Gagal memeriksa versi.</strong>
                <p>
                  Server versi sedang tidak menjawab. Muat ulang halaman ini beberapa saat lagi —
                  soora.fun sendiri tetap bisa dipakai penuh lewat peramban.
                </p>
              </div>
            )}

            {state === 'ready' && !info?.apkUrl && (
              <div className="download-note" role="status">
                <strong>Belum tersedia untuk diunduh.</strong>
                <p>
                  Aplikasinya masih dalam pengujian. Sementara ini, soora.fun sudah bisa dipakai
                  penuh lewat peramban.
                </p>
              </div>
            )}

            {available && (
              <>
                <a className="download-btn" href={info.apkUrl} rel="noopener">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Unduh APK
                </a>
                <p className="download-meta">
                  {info.versionName ? `Versi ${info.versionName}` : 'Versi terbaru'}
                  {' · Android 7.0 ke atas · gratis'}
                </p>
              </>
            )}

            {isIOS && (
              <p className="download-meta download-meta-ios">
                Kamu membuka ini dari iPhone. Aplikasi Soora hanya ada untuk Android — di iPhone,
                tambahkan soora.fun ke Layar Utama lewat tombol Bagikan.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="download-body">
        <ul className="download-features">
          <Feature title="Pemutar native" body="Bukan pemutar di dalam peramban. Lebih ringan, lebih jarang tersendat, dan bisa gambar-dalam-gambar." />
          <Feature title="Lanjut di latar belakang" body="Audio tetap jalan saat aplikasi ditutup atau layar dimatikan, dengan kontrol di notifikasi." />
          <Feature title="Buka tanpa internet" body="Katalog yang sudah pernah dibuka tersimpan di perangkat dan tetap bisa dilihat saat sinyal hilang." />
          <Feature title="Baca manga" body="Pembaca gulir vertikal untuk manga maupun webtoon, dengan pilihan bahasa Indonesia atau Inggris." />
        </ul>

        {available && info.changelog ? (
          <section className="download-section">
            <h2>Yang baru</h2>
            <p>{info.changelog}</p>
          </section>
        ) : null}

        {available && (
          <section className="download-section">
            <h2>Cara memasang</h2>
            <ol className="download-steps">
              <li>Ketuk tombol unduh di atas.</li>
              <li>
                Buka berkas yang terunduh. Android akan meminta izin memasang dari sumber tidak
                dikenal — itu normal untuk aplikasi di luar Play Store.
              </li>
              <li>Izinkan, lalu ketuk Pasang.</li>
            </ol>
            <p className="download-muted">
              Sudah pernah memasang versi lama? Cukup pasang yang baru di atasnya — data dan daftar
              tontonanmu tetap tersimpan.
            </p>
          </section>
        )}

        <p className="download-muted download-footnote">
          Aplikasi ini tidak tersedia di Play Store dan hanya bisa diunduh dari halaman ini.{' '}
          <Link to="/">Kembali ke beranda</Link>
        </p>
      </div>
    </div>
  );
}

function Feature({ title, body }) {
  return (
    <li className="download-feature">
      <h3>{title}</h3>
      <p>{body}</p>
    </li>
  );
}
