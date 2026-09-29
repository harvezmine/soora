import { useEffect, useRef, useState } from 'react';
import { loadGoogleIdentity } from '../utils/googleIdentity';

// OAuth client IDs are public. Keep the existing production fallback.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
  || '1046486298812-a3oh36rdeicvjmdr7l38ia174264iq1g.apps.googleusercontent.com';

/** Render Google's actual button: its popup requires a direct user click. */
export function useGoogleLogin(onToken) {
  const buttonRef = useRef(null);
  const cbRef = useRef(onToken);
  const [status, setStatus] = useState('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { cbRef.current = onToken; }, [onToken]);

  useEffect(() => {
    const holder = buttonRef.current;
    if (!holder) return;
    let cancelled = false;
    let observer;

    loadGoogleIdentity().then((googleId) => {
      if (cancelled) return;
      googleId.initialize({
        client_id: CLIENT_ID,
        callback: (resp) => {
          if (!cancelled && resp?.credential) cbRef.current?.(resp.credential);
        },
        ux_mode: 'popup',
        auto_select: false,
      });

      let previousWidth;
      const render = () => {
        if (cancelled) return;
        const width = Math.min(400, Math.floor(holder.getBoundingClientRect().width));
        if (width <= 0 || width === previousWidth) return;
        previousWidth = width;
        try {
          holder.replaceChildren();
          googleId.renderButton(holder, {
            type: 'standard', theme: 'filled_black', size: 'large',
            text: 'continue_with', shape: 'pill', locale: 'id', width,
          });
          setStatus('ready');
        } catch {
          setStatus('error');
        }
      };
      render();
      observer = new ResizeObserver(render);
      observer.observe(holder);
    }).catch(() => { if (!cancelled) setStatus('error'); });

    return () => {
      cancelled = true;
      observer?.disconnect();
      holder.replaceChildren();
    };
  }, [attempt]);

  const retry = () => {
    setStatus('loading');
    setAttempt((value) => value + 1);
  };

  return { buttonRef, status, retry };
}
