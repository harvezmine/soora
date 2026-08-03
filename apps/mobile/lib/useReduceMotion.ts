import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Apakah user meminta pengurangan gerak di setelan sistem.
 *
 * Wajib dihormati: sebagian orang mengalami mual atau pusing karena animasi
 * yang menggeser layar. Android mengekspos ini lewat "Remove animations" di
 * Aksesibilitas.
 *
 * Nilai awal `false`, bukan `true`. Pembacaannya asinkron, dan menganggap
 * "kurangi gerak" selama beberapa milidetik pertama membuat animasi masuk
 * pertama kali selalu terlewat bagi semua orang.
 */
export function useReduceMotion(): boolean {
  const [kurangi, setKurangi] = useState(false);

  useEffect(() => {
    let hidup = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (hidup) setKurangi(Boolean(v));
      })
      .catch(() => {
        // Sebagian perangkat tidak mengekspos setelan ini; anggap normal.
      });

    const langganan = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) =>
      setKurangi(Boolean(v))
    );

    return () => {
      hidup = false;
      langganan.remove();
    };
  }, []);

  return kurangi;
}
