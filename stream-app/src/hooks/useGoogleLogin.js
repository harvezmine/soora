import { useEffect, useRef, useState, useCallback } from 'react';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
// Google Client ID is public (not a secret). Fallback constant so prod works
// even without the Vercel env var set (repo .env is gitignored).
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
  || '1046486298812-a3oh36rdeicvjmdr7l38ia174264iq1g.apps.googleusercontent.com';

let gisPromise = null;
function loadGIS() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google script'));
    document.head.appendChild(s);
  });
  return gisPromise;
}

/**
 * Google Identity Services login.
 * onToken(idToken) is called with the Google ID token after the user signs in.
 * Returns { trigger, ready }. trigger() opens the Google account chooser popup.
 */
export function useGoogleLogin(onToken) {
  const [ready, setReady] = useState(false);
  const cbRef = useRef(onToken);
  cbRef.current = onToken;

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadGIS().then(() => {
      if (cancelled || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (resp) => { if (resp?.credential) cbRef.current?.(resp.credential); },
        ux_mode: 'popup',
        auto_select: false,
      });
      setReady(true);
    }).catch(() => { /* button stays disabled */ });
    return () => { cancelled = true; };
  }, []);

  const trigger = useCallback(() => {
    if (!window.google?.accounts?.id) return;
    // Render an invisible button and click it — most reliable popup trigger
    // (One Tap prompt can be suppressed by the browser).
    let holder = document.getElementById('gis-hidden-btn');
    if (!holder) {
      holder = document.createElement('div');
      holder.id = 'gis-hidden-btn';
      holder.style.cssText = 'position:fixed;opacity:0;pointer-events:none;z-index:-1;top:-1000px;left:-1000px';
      document.body.appendChild(holder);
    }
    holder.innerHTML = '';
    window.google.accounts.id.renderButton(holder, { type: 'standard', size: 'large' });
    const realBtn = holder.querySelector('div[role=button]') || holder.querySelector('div');
    if (realBtn) realBtn.click();
    else window.google.accounts.id.prompt(); // fallback to One Tap
  }, []);

  return { trigger, ready };
}
