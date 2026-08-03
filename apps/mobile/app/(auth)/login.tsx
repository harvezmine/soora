import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useGoogleSignIn, authWithPassword } from '../../lib/auth';
import { isGoogleLoginConfigured } from '../../lib/config';
import { AuthShell } from '../../components/AuthShell';
import { AuthForm } from '../../components/AuthForm';

/**
 * Layar masuk.
 *
 * Rangka, gradien, dan tombol Google dipakai bersama dengan layar daftar lewat
 * AuthShell. Dua layar autentikasi yang tampak berbeda membuat orang ragu
 * apakah masih berada di aplikasi yang sama.
 */
export default function LoginScreen() {
  const router = useRouter();
  const { signIn, busy: googleBusy, error: googleError, user, ready } = useGoogleSignIn();
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');
  const googleAda = isGoogleLoginConfigured();

  // Tutup layar begitu penukaran token berhasil.
  useEffect(() => {
    if (user) router.back();
  }, [user, router]);

  const masuk = async (v: { email: string; password: string }) => {
    setSibuk(true);
    setGalat('');
    try {
      await authWithPassword('login', v);
      router.back();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : String(e));
    } finally {
      setSibuk(false);
    }
  };

  return (
    <AuthShell
      judul={'Selamat datang\nkembali.'}
      sub="Daftar Saya dan riwayat tontonan tersinkron lewat akun yang sama dengan di soora.fun."
      onGoogle={() => void signIn()}
      // Tombol Google sengaja tidak disembunyikan saat belum dikonfigurasi:
      // tombol yang hilang tanpa penjelasan lebih membingungkan daripada tombol
      // mati yang disertai alasannya.
      googleSiap={ready && googleAda}
      googleSibuk={googleBusy}
      galat={
        galat ||
        googleError ||
        (!googleAda
          ? 'Login Google belum dikonfigurasi: OAuth client Android di Google Cloud Console belum diisi.'
          : undefined)
      }
      tautanTeks="Belum punya akun? Daftar"
      tautanAksi={() => router.replace('/(auth)/register' as never)}
    >
      <AuthForm mode="login" sibuk={sibuk} onKirim={(v) => void masuk(v)} />
    </AuthShell>
  );
}
