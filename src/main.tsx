import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/theme.css'
import './styles/app.css'
import './i18n'
import App from './App.tsx'

// Recover links served the app shell by an older service worker as well.
// Keep the origin, query and fragment; only collapse duplicate path slashes.
const target = new URL(window.location.href)
const normalizedPath = target.pathname.replace(/\/{2,}/g, '/')
if (target.pathname !== normalizedPath) {
  target.pathname = normalizedPath
  window.location.replace(target.href)
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
