import { useEffect, useState } from 'react';

const KUNCI = 'soora_splash_seen';
const TAHAN_MS = 1100;
const PUDAR_MS = 520;

/**
 * Layar pembuka saat situs dibuka.
 *
 * Hanya sekali per sesi peramban, disimpan di sessionStorage. Menampilkannya
 * di setiap navigasi akan menghalangi orang yang cuma berpindah halaman, dan
 * memakai localStorage berarti pengunjung berulang tidak pernah melihatnya
 * lagi — sesi adalah pertengahan yang tepat.
 *
 * Ikut menghormati prefers-reduced-motion: animasi masuk dimatikan lewat CSS,
 * dan durasinya dipangkas di sini supaya tidak sekadar menjadi jeda kosong.
 */
export default function SplashIntro() {
  const [tahap, setTahap] = useState(() => {
    if (typeof window === 'undefined') return 'selesai';
    try {
      return sessionStorage.getItem(KUNCI) ? 'selesai' : 'tampil';
    } catch {
      // Safari mode privat melempar saat sessionStorage disentuh.
      return 'tampil';
    }
  });

  useEffect(() => {
    if (tahap !== 'tampil') return;

    const kurang = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const tahan = kurang ? 350 : TAHAN_MS;

    const t1 = setTimeout(() => setTahap('pudar'), tahan);
    const t2 = setTimeout(() => {
      setTahap('selesai');
      try {
        sessionStorage.setItem(KUNCI, '1');
      } catch {
        /* mode privat — cukup tidak diingat */
      }
    }, tahan + PUDAR_MS);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [tahap]);

  if (tahap === 'selesai') return null;

  return (
    <div className={`splash-intro ${tahap === 'pudar' ? 'splash-intro-out' : ''}`} aria-hidden="true">
      <div className="splash-intro-glow" />
      <img
        src="/logo-wordmark.png"
        alt=""
        className="splash-intro-logo"
        width="1024"
        height="430"
        fetchPriority="high"
      />
    </div>
  );
}
