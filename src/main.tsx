import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { installClickSounds } from './sound'
// After a deploy, an old page can ask for a code file that no longer exists → reload once to get the new version.
window.addEventListener('vite:preloadError', (e) => {
  if (sessionStorage.getItem('jf-chunk-reload')) return
  sessionStorage.setItem('jf-chunk-reload', '1'); e.preventDefault(); location.reload()
})
window.addEventListener('load', () => setTimeout(() => sessionStorage.removeItem('jf-chunk-reload'), 10000))

installClickSounds()

// 20 Nov: the old 'photos' cache could keep a failed photo for 45 days. Photos now live in photos-own / photos-web.
if ('caches' in window) caches.delete('photos').catch(() => {})

// Offline app updates: when a new version has been downloaded in the background, switch to it
// the next time the app comes back to the screen (never mid-tap, so nobody loses what they were typing).
if ('serviceWorker' in navigator) {
  let updated = false
  navigator.serviceWorker.addEventListener('controllerchange', () => { updated = true })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {})
      if (updated) location.reload()
    }
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
