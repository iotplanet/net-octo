import { useCallback, useSyncExternalStore } from 'react'
import {
  applyThemeToDocument,
  readStoredTheme,
  THEME_BG,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from './theme/document'

const THEME_KEY = THEME_STORAGE_KEY

function writeTheme(t: ThemeMode) {
  try {
    localStorage.setItem(THEME_KEY, t)
  } catch {
    /* ignore */
  }
  applyThemeToDocument(t)
  void syncNativeWindowBackground(t)
}

let currentTheme = readStoredTheme()
applyThemeToDocument(currentTheme)

const listeners = new Set<() => void>()

let storageBound = false

function onStorageSync(e: StorageEvent) {
  if (e.key !== THEME_KEY) return
  const next = readStoredTheme()
  if (next === currentTheme) return
  currentTheme = next
  applyThemeToDocument(next)
  void syncNativeWindowBackground(next)
  notify()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  if (!storageBound && typeof window !== 'undefined') {
    window.addEventListener('storage', onStorageSync)
    storageBound = true
  }
  return () => {
    listeners.delete(cb)
  }
}

function getSnapshot(): ThemeMode {
  return currentTheme
}

function notify() {
  listeners.forEach((cb) => cb())
}

function syncNativeWindowBackground(t: ThemeMode) {
  if (typeof window === 'undefined') return
  const color = THEME_BG[t]
  void import('@tauri-apps/api/webviewWindow')
    .then(({ getCurrentWebviewWindow }) => getCurrentWebviewWindow().setBackgroundColor(color))
    .catch(() => {
      /* not in Tauri */
    })
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot)

  const setTheme = useCallback((t: ThemeMode) => {
    currentTheme = t
    writeTheme(t)
    notify()
  }, [])

  return { theme, setTheme } as const
}

/** @deprecated use applyThemeToDocument from theme/document */
export function initTheme(): void {
  applyThemeToDocument(readStoredTheme())
}

export { THEME_STORAGE_KEY } from './theme/document'
