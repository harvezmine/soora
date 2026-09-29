import { useGoogleLogin } from '../hooks/useGoogleLogin';

export default function GoogleSignInButton({ onToken, disabled = false }) {
  const { buttonRef, status, retry } = useGoogleLogin(onToken);

  return (
    <div className="auth-google-signin" aria-busy={disabled || status === 'loading'}>
      <div className="auth-google-button" ref={buttonRef} inert={disabled} />
      {status === 'loading' && <span role="status">Memuat login Google…</span>}
      {status === 'error' && (
        <div className="auth-google-error" role="alert">
          <span>Login Google belum bisa dimuat.</span>
          <button type="button" onClick={retry} disabled={disabled}>Coba lagi</button>
        </div>
      )}
    </div>
  );
}
