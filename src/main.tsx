import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppErrorBoundary } from './components/common/AppErrorBoundary'
import { reloadForNewVersion } from './lib/lazyRetry'
import { registerSW } from 'virtual:pwa-register'

// Vite raises this when a lazily loaded file can't be fetched (an old cached build after an update).
window.addEventListener('vite:preloadError', (e) => {
  if (reloadForNewVersion()) e.preventDefault()
})

// Installed apps used to keep an old copy for days. Look for a new version on open, whenever the app comes back to the
// foreground, and every half hour; when one is found it takes over and the page reloads itself.
registerSW({
  immediate: true,
  onRegistered(registration) {
    if (!registration) return
    const check = () => void registration.update().catch(() => {})
    window.setInterval(check, 30 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) check()
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
