import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useGoogleSignIn, authWithPassword } from '../../lib/auth';
import { AuthShell } from '../../components/AuthShell';
import { AuthForm } from '../../components/AuthForm';

/**
 * Layar daftar.
 *
 * Struktur dan rangkanya sama persis dengan layar masuk — hanya kolom nama,
 * label tombol, dan tautan silangnya yang berbeda.
 */
export default function RegisterScreen() {
  const router = useRouter();
  const { signIn, busy: googleBusy, error: googleError, user, ready } = useGoogleSignIn();
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');

  useEffect(() => {
    if (user) router.back();
  }, [user, router]);

  const daftar = async (v: { email: string; password: string; name?: string }) => {
    setSibuk(true);
    setGalat('');
    try {
      await authWithPassword('register', v);
      router.back();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : String(e));
    } finally {
      setSibuk(false);
    }
  };

  return (
    <AuthShell
      judul={'Buat akun\nSoora.'}
      sub="Daftar Saya, antrean tonton nanti, dan riwayat tersimpan di akunmu — bisa dibuka dari ponsel maupun soora.fun."
      onGoogle={() => void signIn()}
      googleSiap={ready}
      googleSibuk={googleBusy}
      galat={galat || googleError || undefined}
      tautanTeks="Sudah punya akun? Masuk"
      tautanAksi={() => router.replace('/(auth)/login' as never)}
    >
      <AuthForm mode="register" sibuk={sibuk} onKirim={(v) => void daftar(v)} />
    </AuthShell>
  );
}
