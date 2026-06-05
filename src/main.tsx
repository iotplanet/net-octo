import { applyThemeToDocument, readStoredTheme } from './theme/document'
import { revealShellAfterPaint, revealShellNow } from './theme/shell'
import './styles/globals.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// CSS may override surfaces; re-apply stored theme immediately after globals load.
applyThemeToDocument(readStoredTheme())

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('#root not found')
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// First paint with correct theme, then show #root and Tauri window.
revealShellAfterPaint()

// Fallback if rAF is delayed (e.g. hidden tab) or show() was blocked earlier
globalThis.setTimeout(() => {
  if (!document.documentElement.classList.contains('nc-app-ready')) {
    revealShellNow()
  }
}, 120)
