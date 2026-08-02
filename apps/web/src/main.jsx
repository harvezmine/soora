import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { configureCore } from '@soora/core'
import { webCoreConfig } from '@soora/core-web'
import App from './App.jsx'
import { register as registerSW } from './swRegister.js'

// Injeksi adapter browser ke @soora/core. Harus dijalankan sebelum request
// pertama dibuat — core memakai default in-memory sampai baris ini berjalan.
// Nilai apiBase identik dengan yang dipakai src/api.js sebelum ekstraksi.
configureCore(webCoreConfig(import.meta.env.VITE_API_URL || '/api'))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register service worker for PWA offline support & caching
registerSW({
  onUpdate: (registration) => {
    // Auto-activate the new service worker immediately
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    // Reload once the new SW takes control
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  },
})
