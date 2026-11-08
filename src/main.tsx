import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { installClickSounds } from './sound'

installClickSounds()

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
