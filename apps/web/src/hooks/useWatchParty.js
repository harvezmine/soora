import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  connectRoom,
  createRoom as apiCreateRoom,
  driftAction,
  playbackRateFor,
  projectPosition,
} from '@soora/core/party';
import { createVoice, daftarMikrofon } from '@soora/core/party/voice';
import { tingkatSuara } from '@soora/core/party/audio-tune';

/** Sesering apa tamu memeriksa selisihnya terhadap tuan rumah. */
const PERIKSA_TIAP_MS = 1000;

/** Berapa lama kecepatan diubah sebelum dikembalikan ke normal. */
const NUDGE_MS = 3000;

/**
 * Volume per lawan bicara disimpan lokal, lepas dari sesi apa pun: kalau
 * seseorang selalu pelan, aturannya sebaiknya ikut tiap kali bertemu lagi.
 */
const KUNCI_VOLUME = 'soora_voice_volumes';
const bacaVolumeTersimpan = () => {
  try { return JSON.parse(localStorage.getItem(KUNCI_VOLUME)) || {}; } catch { return {}; }
};
const simpanVolumeTersimpan = (peta) => {
  try { localStorage.setItem(KUNCI_VOLUME, JSON.stringify(peta)); } catch { /* mode privat */ }
};

/**
 * Nonton bareng untuk halaman tonton.
 *
 * Tuan rumah menyiarkan tiap kali ia menggerakkan pemutar; tamu mengikuti,
 * dengan koreksi yang besarnya menyesuaikan selisih. Kait ini tidak
 * mengendalikan pemutar secara langsung — ia memanggil `playerRef`, sehingga
 * satu-satunya yang tahu cara memutar tetap VideoPlayer.
 *
 * Suara punya dua langkah yang sengaja terpisah: bergabung ke kanal (mulai
 * mendengarkan semua orang, otomatis) dan menyalakan mikrofon (mulai
 * berbicara). Bergabung tanpa membuka mikrofon adalah keadaan yang sah dan
 * biasa — sama seperti Discord.
 */
export default function useWatchParty({ roomId, playerRef, enabled = true }) {
  const [role, setRole] = useState(null);      // 'host' | 'guest' | null
  const [room, setRoom] = useState(null);
  const [peers, setPeers] = useState({ count: 0, people: [] });
  const [chat, setChat] = useState([]);

  const [voiceJoined, setVoiceJoined] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [bisu, setBisu] = useState(false);
  const [deafen, setDeafen] = useState(false);
  /**
   * Siapa yang sedang bicara, dari dua sumber yang sengaja dipisah:
   *
   * - `bicaraLokal` diukur sendiri dari aliran audio yang masuk. Cepat (60 ms)
   *   dan gratis, tapi hanya ada untuk orang yang audionya kita terima —
   *   artinya cuma bila kita sendiri ikut kanal suara.
   * - `bicaraJauh` datang dari server. Berlaku untuk semua orang, termasuk
   *   penonton yang tidak ikut kanal suara dan karenanya tidak punya apa pun
   *   untuk diukur.
   *
   * Yang lokal menang bila ada, karena ia lebih dulu tahu.
   */
  const [bicaraLokal, setBicaraLokal] = useState({});
  const [bicaraJauh, setBicaraJauh] = useState({});
  /** tingkat tenaga suara per peserta, 0..TINGKAT_SUARA_MAKS */
  const [tingkat, setTingkat] = useState({});
  /** tenaga suara mikrofon sendiri, 0..1 — untuk penunjuk level saat menguji */
  const [levelSaya, setLevelSaya] = useState(0);
  /** mutu sambungan per lawan: { rtt, jitterMs, latencyMs, lossPct } */
  const [mutu, setMutu] = useState({});
  const [mikrofon, setMikrofon] = useState([]);
  const [perangkat, setPerangkat] = useState(null);
  /** volume per lawan, 0..2 — dimuat dari penyimpanan lokal saat awal */
  const [volumes, setVolumes] = useState(() => bacaVolumeTersimpan());
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
  // Volume tersimpan dibaca oleh pastikanVoice tanpa perlu ikut daftar
  // dependensi — berubah tiap slider digeser, dan itu tidak boleh membuat
  // instans suara dibuat ulang. Disinkronkan lewat efek, bukan ditulis
  // langsung saat render — menulis ref di badan render dilarang React.
  const volumesRef = useRef(volumes);
  useEffect(() => { volumesRef.current = volumes; }, [volumes]);
  // Penanda bicara sendiri yang terakhir dikirim ke server. Disimpan di ref,
  // bukan keadaan: dibaca dari dalam callback yang jalan tiap 60 ms, dan
  // tujuannya justru menekan pengiriman yang tidak berubah.
  const bicaraSayaRef = useRef(false);

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
        // Daftar peserta ikut membawa status bicara terkini. Dipakai untuk
        // menyelaraskan: yang baru masuk perlu tahu siapa yang sedang bicara
        // sekarang, dan status yang tertinggal menyala ikut dibetulkan di sini.
        setBicaraJauh(Object.fromEntries((msg.people || []).map((o) => [o.id, !!o.speaking])));
        // Mesh suara mengikuti daftar peserta: yang baru bergabung disambung
        // untuk didengarkan, yang keluar diputus. Ini terjadi terlepas dari
        // status mikrofon siapa pun.
        voice.current?.selaraskan((msg.people || []).filter((o) => o.voice).map((o) => o.id));
      },
      chat: (m) => setChat((prev) => [...prev.slice(-99), m]),
      speaking: (id, on) => setBicaraJauh((p) => (p[id] === on ? p : { ...p, [id]: on })),
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
      setVoiceJoined(false);
      setMicOn(false);
      setBisu(false);
      setDeafen(false);
      setBicaraLokal({});
      setBicaraJauh({});
      setTingkat({});
      bicaraSayaRef.current = false;
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

  /* Ukuran sendiri menang atas kabar dari server: ia lebih dulu tahu, dan
     tidak menunggu perjalanan jaringan. Kabar server mengisi yang tidak bisa
     kita ukur — orang yang audionya tidak kita terima. */
  const bicara = useMemo(() => {
    const gabung = { ...bicaraJauh };
    for (const [id, aktif] of Object.entries(bicaraLokal)) gabung[id] = aktif;
    return gabung;
  }, [bicaraJauh, bicaraLokal]);

  /* ── Volume film mengalah saat ada yang bicara ──
     Ini yang paling terasa saat nonton bareng: tanpa itu, orang harus
     memilih antara mendengar film atau mendengar temannya. Yang dihitung
     hanya suara ORANG LAIN — suara sendiri tidak boleh meredam film yang
     kita tonton sendiri. Hanya suara yang kita UKUR sendiri yang boleh
     meredam: kabar dari server berlaku juga untuk penonton yang tidak ikut
     kanal suara, dan film mereka tidak boleh ikut mengecil oleh percakapan
     yang tidak mereka dengar. */
  useEffect(() => {
    const adaYangBicara = Object.entries(bicaraLokal).some(([id, aktif]) => aktif && id !== selfId);
    playerRef.current?.setDuck?.(adaYangBicara);
  }, [bicaraLokal, selfId, playerRef]);

  /* ── Obrolan ── */
  const kirimChat = useCallback((text) => {
    const isi = String(text || '').trim();
    if (!isi) return;
    conn.current?.sendChat(isi);
  }, []);

  /** Instans suara, dibuat sekali saat bergabung dan dipakai ulang. */
  const pastikanVoice = useCallback(() => {
    if (voice.current || !selfIdRef.current) return voice.current;
    voice.current = createVoice({
      selfId: selfIdRef.current,
      sendRtc: (to, kind, data) => conn.current?.sendRtc(to, kind, data),
      onLevel: (id, aktif, rms) => {
        setBicaraLokal((p) => (p[id] === aktif ? p : { ...p, [id]: aktif }));
        // Dibulatkan dulu: nilai mentahnya berubah tiap 60 ms, dan menaruh
        // itu di keadaan React berarti merender ulang daftar peserta belasan
        // kali per detik. Kehalusan geraknya ditangani transisi CSS.
        const t = aktif ? tingkatSuara(rms) : 0;
        setTingkat((p) => (p[id] === t ? p : { ...p, [id]: t }));
        if (id === selfIdRef.current) {
          setLevelSaya(rms || 0);
          // Suara sendiri diberitahukan ke server supaya penanda bicara juga
          // terlihat oleh penonton yang tidak ikut kanal suara — mereka tidak
          // menerima audio siapa pun, jadi tidak bisa mengukurnya sendiri.
          if (bicaraSayaRef.current !== aktif) {
            bicaraSayaRef.current = aktif;
            conn.current?.sendSpeaking(aktif);
          }
        }
      },
      onQuality: (id, q) => setMutu((p) => ({ ...p, [id]: q })),
      onError: (m) => setNotice(m),
    });
    // Volume yang sudah tersimpan langsung berlaku untuk lawan yang sudah
    // ada, dan volume baru dari peramban lain menyusul lewat setVolumePeer.
    for (const [id, v] of Object.entries(volumesRef.current)) voice.current.setVolume(id, v);
    return voice.current;
  }, []);

  /* ── Kanal suara: bergabung berarti mendengarkan, otomatis, tanpa mikrofon ── */
  const gabungSuara = useCallback(() => {
    if (!conn.current || !selfIdRef.current) return;
    pastikanVoice();
    setVoiceJoined(true);
    conn.current.sendVoice(true);
  }, [pastikanVoice]);

  const keluarSuara = useCallback(() => {
    voice.current?.tutup();
    voice.current = null;
    setVoiceJoined(false);
    setMicOn(false);
    setBisu(false);
    setDeafen(false);
    // Hanya ukuran sendiri yang dibuang — kabar dari server tetap berlaku,
    // sebab orang lain di kanal suara masih bicara meski kita sudah keluar.
    setBicaraLokal({});
    setTingkat({});
    bicaraSayaRef.current = false;
    setLevelSaya(0);
    setMutu({});
    conn.current?.sendVoice(false);
  }, []);

  /* ── Mikrofon ── */
  const nyalakanMic = useCallback(async () => {
    // Mikrofon butuh kanal suara. Menyalakannya sebelum bergabung akan
    // membuka mikrofon tanpa ada yang mendengarkan — jadi bergabung dulu.
    if (!voiceJoined) { pastikanVoice(); setVoiceJoined(true); conn.current?.sendVoice(true); }
    const v = pastikanVoice();
    if (!v) return;
    try {
      await v.nyalakanMic();
      setMicOn(true);
      // Tekan-untuk-bicara berarti mulai dalam keadaan diam.
      v.setBisu(ptt);
      setBisu(ptt);
      // Menyalakan mikrofon sambil deafen tidak masuk akal — tidak bisa
      // dengar balasan sendiri. Ikuti kebiasaan Discord: batalkan deafen.
      if (v.sedangDeafen) { v.setDeafen(false); setDeafen(false); conn.current?.sendDeafen(false); }
      conn.current?.sendMic(true);
      // Label perangkat baru terbaca setelah izin diberikan, jadi daftarnya
      // diambil di sini, bukan sebelumnya.
      daftarMikrofon().then(setMikrofon);
    } catch {
      // Izin ditolak atau tidak ada mikrofon. Dikatakan, bukan dibiarkan
      // terlihat seperti tombol rusak.
      setNotice('Tidak bisa memakai mikrofon. Periksa izin mikrofon di peramban.');
    }
  }, [voiceJoined, pastikanVoice, ptt]);

  const matikanMic = useCallback(() => {
    // Sengaja TIDAK menutup kanal — mendengarkan tetap berjalan.
    voice.current?.matikanMic();
    setMicOn(false);
    setBisu(false);
    // Server ikut mematikan penanda bicara saat mikrofon mati; penanda lokal
    // disetel ulang supaya pengiriman berikutnya tidak dianggap "tidak
    // berubah" dan ikut terbuang.
    bicaraSayaRef.current = false;
    conn.current?.sendMic(false);
  }, []);

  const toggleMic = useCallback(() => {
    if (micOn) matikanMic(); else nyalakanMic();
  }, [micOn, matikanMic, nyalakanMic]);

  const toggleBisu = useCallback(() => {
    if (!micOn) return; // tidak ada yang dibisukan tanpa mikrofon menyala
    setBisu((b) => {
      voice.current?.setBisu(!b);
      return !b;
    });
  }, [micOn]);

  /* ── Bisukan semua suara masuk ── */
  const toggleDeafen = useCallback(() => {
    if (!voiceJoined) return;
    const v = voice.current;
    const nilai = !deafen;
    v?.setDeafen(nilai);
    setDeafen(nilai);
    // Deafen bisa memaksa mikrofon bisu di dalam voice.js — baca baliknya
    // supaya tombol Bisukan di layar tidak berbohong.
    if (v) setBisu(v.sedangBisu);
    conn.current?.sendDeafen(nilai);
  }, [deafen, voiceJoined]);

  /* Tekan-untuk-bicara. Saat menyala, mikrofon tertutup sampai ditahan. */
  const setModePtt = useCallback((nyala) => {
    setPtt(nyala);
    if (voice.current?.punyaMic) {
      voice.current.setBisu(nyala);
      setBisu(nyala);
    }
  }, []);

  const tahanBicara = useCallback((tahan) => {
    if (!ptt || !voice.current?.punyaMic || deafen) return;
    voice.current.setBisu(!tahan);
    setBisu(!tahan);
  }, [ptt, deafen]);

  const gantiMikrofon = useCallback(async (deviceId) => {
    try {
      await voice.current?.gantiPerangkat(deviceId);
      setPerangkat(deviceId);
    } catch {
      setNotice('Tidak bisa berpindah ke mikrofon itu.');
    }
  }, []);

  /* ── Volume per peserta ── */
  const setVolumePeer = useCallback((id, v) => {
    voice.current?.setVolume(id, v);
    setVolumes((prev) => {
      const next = { ...prev, [id]: v };
      simpanVolumeTersimpan(next);
      return next;
    });
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
    voiceJoined,
    gabungSuara,
    keluarSuara,
    micOn,
    bisu,
    deafen,
    toggleDeafen,
    bicara,
    tingkat,
    volumes,
    setVolumePeer,
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
