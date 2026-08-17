import { useState, useEffect, useRef, useCallback } from 'react';
import {
  connectRoom,
  createRoom as apiCreateRoom,
  driftAction,
  playbackRateFor,
  projectPosition,
} from '@soora/core/party';

/** Sesering apa tamu memeriksa selisihnya terhadap tuan rumah. */
const PERIKSA_TIAP_MS = 1000;

/** Berapa lama kecepatan diubah sebelum dikembalikan ke normal. */
const NUDGE_MS = 3000;

/**
 * Nonton bareng untuk halaman tonton.
 *
 * Tuan rumah menyiarkan tiap kali ia menggerakkan pemutar; tamu mengikuti,
 * dengan koreksi yang besarnya menyesuaikan selisih. Kait ini tidak
 * mengendalikan pemutar secara langsung — ia memanggil `playerRef`, sehingga
 * satu-satunya yang tahu cara memutar tetap VideoPlayer.
 */
export default function useWatchParty({ roomId, playerRef, enabled = true }) {
  const [role, setRole] = useState(null);      // 'host' | 'guest' | null
  const [room, setRoom] = useState(null);
  const [peers, setPeers] = useState({ count: 0, names: [] });
  // 'connecting' diturunkan dari adanya roomId, bukan disetel di dalam efek —
  // menyetel keadaan langsung di badan efek memicu render beruntun.
  const [phase, setPhase] = useState(null); // live | reconnecting | ended
  const [notice, setNotice] = useState(null);
  const status = phase ?? (enabled && roomId ? 'connecting' : 'idle');

  // Peramban melarang video mulai sendiri dengan suara. Tamu harus menekan
  // Gabung sekali — ketukan itulah yang memberi izin pemutaran. Tanpa gerbang
  // ini video tamu diam tanpa penjelasan apa pun.
  const [sudahGabung, setSudahGabung] = useState(false);

  const conn = useRef(null);
  const state = useRef(null);       // keadaan terakhir dari tuan rumah
  const nudgeTimer = useRef(null);

  /* ── Sambungan ── */
  useEffect(() => {
    if (!enabled || !roomId) return;

    const c = connectRoom(roomId, {
      welcome: (msg) => {
        setRole(msg.role);
        setRoom(msg.room);
        setPeers(msg.peers || { count: 1, names: [] });
        state.current = msg.state;
        setPhase('live');
        setNotice(null);
      },
      state: (msg) => { state.current = msg; },
      peers: (msg) => setPeers(msg),
      hostAway: () => setNotice('Tuan rumah terputus. Menunggu ia kembali…'),
      reconnecting: () => { setPhase('reconnecting'); setNotice('Sambungan terputus. Mencoba menyambung ulang…'); },
      ended: (reason) => { setPhase('ended'); setNotice(reason || 'Ruang sudah berakhir'); },
      error: (message) => setNotice(message),
    });
    conn.current = c;

    // Membersihkan di sini, bukan di badan efek: keadaan ruang lama tidak
    // boleh tertinggal saat pindah ruang atau keluar.
    return () => { c.close(); conn.current = null; setPhase(null); setNotice(null); };
  }, [roomId, enabled]);

  /* ── Tamu mengikuti tuan rumah ── */
  useEffect(() => {
    if (role !== 'guest' || status !== 'live' || !sudahGabung) return;

    const iv = setInterval(() => {
      const p = playerRef.current;
      const s = state.current;
      const c = conn.current;
      if (!p || !s || !c) return;

      const seharusnya = projectPosition(s, c.serverNow());
      const sekarang = p.getCurrentTime?.() ?? 0;
      const selisih = seharusnya - sekarang;

      // Ikuti dulu keadaan putar/jeda, baru urus posisi.
      const sedangJalan = p.isPlaying?.();
      if (s.playing && !sedangJalan) p.remotePlay?.();
      if (!s.playing && sedangJalan) p.remotePause?.();

      const tindakan = driftAction(selisih);
      if (tindakan === 'seek') {
        p.remoteSeek?.(seharusnya);
        p.setRate?.(1);
      } else if (tindakan === 'ignore') {
        p.setRate?.(1);
      } else {
        // Kejar diam-diam, lalu kembali normal — kecepatan yang dibiarkan
        // berubah terus akan terdengar aneh.
        p.setRate?.(playbackRateFor(tindakan));
        clearTimeout(nudgeTimer.current);
        nudgeTimer.current = setTimeout(() => p.setRate?.(1), NUDGE_MS);
      }
    }, PERIKSA_TIAP_MS);

    return () => { clearInterval(iv); clearTimeout(nudgeTimer.current); };
  }, [role, status, sudahGabung, playerRef]);

  /* ── Tuan rumah menyiarkan ── */
  const siarkan = useCallback((playing, position) => {
    if (role !== 'host') return;
    conn.current?.sendState(!!playing, Number(position) || 0);
  }, [role]);

  // Denyut berkala untuk mengoreksi hanyutan yang tidak memicu peristiwa
  // (memuat penyangga, sistem melambat). Saat dijeda tidak ada yang hanyut,
  // jadi denyutnya dilewati — server sudah menyimpan keadaan terakhir dan
  // mengirimkannya ke siapa pun yang baru bergabung.
  const terakhirDisiarkan = useRef(null);
  useEffect(() => {
    if (role !== 'host' || status !== 'live') return;
    const iv = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      const jalan = p.isPlaying?.();
      const posisi = p.getCurrentTime?.() ?? 0;
      const sama = terakhirDisiarkan.current
        && terakhirDisiarkan.current.jalan === jalan
        && Math.abs(terakhirDisiarkan.current.posisi - posisi) < 0.5;
      if (!jalan && sama) return;
      terakhirDisiarkan.current = { jalan, posisi };
      siarkan(jalan, posisi);
    }, 5000);
    return () => clearInterval(iv);
  }, [role, status, siarkan, playerRef]);

  const gabung = useCallback(() => {
    setSudahGabung(true);
    // Panggilan langsung di dalam penangan klik — inilah gerak pengguna yang
    // membuka izin pemutaran. Menunggu putaran berikutnya sudah terlambat:
    // izin itu hanya berlaku selama penanganan peristiwa.
    const p = playerRef.current;
    const s = state.current;
    const c = conn.current;
    if (p && s && c) {
      p.remoteSeek?.(projectPosition(s, c.serverNow()));
      if (s.playing) p.remotePlay?.();
    }
  }, [playerRef]);

  return {
    role,
    room,
    peers,
    status,
    notice,
    sudahGabung,
    gabung,
    /** Gerbang hanya untuk tamu yang belum menekan Gabung. */
    perluGabung: role === 'guest' && !sudahGabung && status === 'live',
    isGuest: role === 'guest',
    isHost: role === 'host',
    /* Diteruskan ke VideoPlayer sebagai onUserPlay / onUserPause / onUserSeek */
    onUserPlay: useCallback((t) => siarkan(true, t), [siarkan]),
    onUserPause: useCallback((t) => siarkan(false, t), [siarkan]),
    onUserSeek: useCallback((t, playing) => siarkan(playing, t), [siarkan]),
  };
}

export { apiCreateRoom as createRoom };
