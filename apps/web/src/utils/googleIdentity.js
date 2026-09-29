const GIS_SRC = 'https://accounts.google.com/gsi/client';
const LOAD_TIMEOUT = 15000;
let gisPromise;

// Share one script request across mounts, but allow a retry after a failed load.
export function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (gisPromise) return gisPromise;

  gisPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const finish = (error) => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (error) {
        script.remove();
        reject(error);
      } else {
        resolve(window.google.accounts.id);
      }
    };
    const timer = setTimeout(() => finish(new Error('Google sign-in timed out')), LOAD_TIMEOUT);
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => finish(window.google?.accounts?.id ? null : new Error('Google sign-in unavailable'));
    script.onerror = () => finish(new Error('Failed to load Google sign-in'));
    document.head.appendChild(script);
  }).catch((error) => {
    gisPromise = null;
    throw error;
  });
  return gisPromise;
}
