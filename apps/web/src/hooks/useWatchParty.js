import { useState, useEffect, useRef, useCallback } from 'react';
import {
  connectRoom,
  createRoom as apiCreateRoom,
  driftAction,
  playbackRateFor,
  projectPosition,
} from '@soora/core/party';
import { createVoice, daftarMikrofon } from '@soora/core/party/voice';

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
  const [peers, setPeers] = useState({ count: 0, people: [] });
  const [chat, setChat] = useState([]);
  const [micOn, setMicOn] = useState(false);
  const [bisu, setBisu] = useState(false);
  /** id peserta yang sedang terdengar bicara */
  const [bicara, setBicara] = useState({});
  /** tenaga suara mikrofon sendiri, 0..1 — untuk penunjuk level saat menguji */
  const [levelSaya, setLevelSaya] = useState(0);
  /** mutu sambungan per lawan: { rtt, lossPct } */
  const [mutu, setMutu] = useState({});
  const [mikrofon, setMikrofon] = useState([]);
  const [perangkat, setPerangkat] = useState(null);
  /** tekan-untuk-bicara: mikrofon terbuka hanya selama tombol ditahan */
  const [ptt, setPtt] = useState(false);
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
  const voice = useRef(null);
  // Dibaca saat render untuk menandai "kamu", jadi disimpan sebagai keadaan.
  // Salinan ref-nya dipakai di dalam callback yang tidak boleh ikut berubah
  // identitas tiap kali keadaan ini berganti.
  const [selfId, setSelfId] = useState(null);
  const selfIdRef = useRef(null);
  const state = useRef(null);       // keadaan terakhir dari tuan rumah
  const nudgeTimer = useRef(null);

  /* ── Sambungan ── */
  useEffect(() => {
    if (!enabled || !roomId) return;

    const c = connectRoom(roomId, {
      welcome: (msg) => {
        setRole(msg.role);
        setRoom(msg.room);
        setPeers(msg.peers || { count: 1, people: [] });
        setChat(msg.chat || []);
        selfIdRef.current = msg.selfId || null;
        setSelfId(msg.selfId || null);
        state.current = msg.state;
        setPhase('live');
        setNotice(null);
      },
      state: (msg) => { state.current = msg; },
      peers: (msg) => {
        setPeers(msg);
        // Mesh suara mengikuti daftar peserta: yang baru menyalakan mikrofon
        // disambung, yang mematikannya diputus.
        voice.current?.selaraskan((msg.people || []).filter((o) => o.voice).map((o) => o.id));
      },
      chat: (m) => setChat((prev) => [...prev.slice(-99), m]),
      rtc: (m) => voice.current?.terima(m),
      peerLeft: (id) => voice.current?.putus(id),
      hostAway: () => setNotice('Tuan rumah terputus. Menunggu ia kembali…'),
      reconnecting: () => { setPhase('reconnecting'); setNotice('Sambungan terputus. Mencoba menyambung ulang…'); },
      ended: (reason) => { setPhase('ended'); setNotice(reason || 'Ruang sudah berakhir'); },
      error: (message) => setNotice(message),
    });
    conn.current = c;

    // Membersihkan di sini, bukan di badan efek: keadaan ruang lama tidak
    // boleh tertinggal saat pindah ruang atau keluar.
    return () => {
      voice.current?.tutup();
      voice.current = null;
      c.close();
      conn.current = null;
      setPhase(null);
      setNotice(null);
      setChat([]);
      setMicOn(false);
      setBicara({});
      setSelfId(null);
      selfIdRef.current = null;
    };
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

  /* ── Volume film mengalah saat ada yang bicara ──
     Ini yang paling terasa saat nonton bareng: tanpa itu, orang harus
     memilih antara mendengar film atau mendengar temannya. Yang dihitung
     hanya suara ORANG LAIN — suara sendiri tidak boleh meredam film yang
     kita tonton sendiri. */
  useEffect(() => {
    const adaYangBicara = Object.entries(bicara).some(([id, aktif]) => aktif && id !== selfId);
    playerRef.current?.setDuck?.(adaYangBicara);
  }, [bicara, selfId, playerRef]);

  /* ── Obrolan ── */
  const kirimChat = useCallback((text) => {
    const isi = String(text || '').trim();
    if (!isi) return;
    conn.current?.sendChat(isi);
  }, []);

  /* ── Mikrofon ── */
  const nyalakanMic = useCallback(async () => {
    if (!conn.current || !selfIdRef.current) return;
    if (!voice.current) {
      voice.current = createVoice({
        selfId: selfIdRef.current,
        sendRtc: (to, kind, data) => conn.current?.sendRtc(to, kind, data),
        onLevel: (id, aktif, rms) => {
          setBicara((p) => (p[id] === aktif ? p : { ...p, [id]: aktif }));
          if (id === selfIdRef.current) setLevelSaya(rms || 0);
        },
        onQuality: (id, q) => setMutu((p) => ({ ...p, [id]: q })),
        onError: (m) => setNotice(m),
      });
    }
    try {
      await voice.current.nyalakan();
      setMicOn(true);
      // Tekan-untuk-bicara berarti mulai dalam keadaan diam.
      voice.current.setBisu(ptt);
      setBisu(ptt);
      conn.current.sendVoice(true);
      // Label perangkat baru terbaca setelah izin diberikan, jadi daftarnya
      // diambil di sini, bukan sebelumnya.
      daftarMikrofon().then(setMikrofon);
    } catch {
      // Izin ditolak atau tidak ada mikrofon. Dikatakan, bukan dibiarkan
      // terlihat seperti tombol rusak.
      setNotice('Tidak bisa memakai mikrofon. Periksa izin mikrofon di peramban.');
    }
  }, [ptt]);

  const matikanMic = useCallback(() => {
    voice.current?.matikan();
    setMicOn(false);
    setBisu(false);
    conn.current?.sendVoice(false);
  }, []);

  const toggleMic = useCallback(() => {
    if (micOn) matikanMic(); else nyalakanMic();
  }, [micOn, matikanMic, nyalakanMic]);

  const toggleBisu = useCallback(() => {
    setBisu((b) => {
      voice.current?.setBisu(!b);
      return !b;
    });
  }, []);

  /* Tekan-untuk-bicara. Saat menyala, mikrofon tertutup sampai ditahan. */
  const setModePtt = useCallback((nyala) => {
    setPtt(nyala);
    if (voice.current?.punyaMic) {
      voice.current.setBisu(nyala);
      setBisu(nyala);
    }
  }, []);

  const tahanBicara = useCallback((tahan) => {
    if (!ptt || !voice.current?.punyaMic) return;
    voice.current.setBisu(!tahan);
    setBisu(!tahan);
  }, [ptt]);

  const gantiMikrofon = useCallback(async (deviceId) => {
    try {
      await voice.current?.gantiPerangkat(deviceId);
      setPerangkat(deviceId);
    } catch {
      setNotice('Tidak bisa berpindah ke mikrofon itu.');
    }
  }, []);

  return {
    role,
    room,
    peers,
    chat,
    levelSaya,
    mutu,
    mikrofon,
    perangkat,
    gantiMikrofon,
    ptt,
    setModePtt,
    tahanBicara,
    kirimChat,
    micOn,
    bisu,
    bicara,
    toggleMic,
    toggleBisu,
    selfId,
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
