import { useEffect, useRef } from 'react';
import { getToken, isLoggedIn } from '../utils/userApi';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const INTERVAL = 30 * 1000; // ping every 30s while the tab is visible

/**
 * Tracks active time on Soora. While logged in and the tab is visible, sends a
 * heartbeat every 30s; the backend accumulates elapsed time between beats.
 * Sends one immediately on mount/visibility-regain so "last seen" stays fresh.
 */
export default function useHeartbeat() {
  const timer = useRef(null);

  useEffect(() => {
    const beat = () => {
      if (!isLoggedIn() || document.visibilityState !== 'visible') return;
      fetch(`${API_BASE}/user/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ path: window.location.pathname }),
        keepalive: true,
      }).catch(() => {});
    };

    const start = () => {
      beat();
      clearInterval(timer.current);
      timer.current = setInterval(beat, INTERVAL);
    };
    const stop = () => clearInterval(timer.current);

    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);
}
