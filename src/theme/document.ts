/** Theme tokens and DOM application — keep in sync with public/boot-theme.js */

export const THEME_STORAGE_KEY = 'netocto.theme'

export type ThemeMode = 'dark' | 'light'

export const THEME_BG: Record<ThemeMode, string> = {
  dark: '#0a0a0b',
  light: '#fafafa',
}

export const THEME_FG: Record<ThemeMode, string> = {
  dark: '#f4f4f5',
  light: '#18181b',
}

export function readStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* ignore */
  }
  return 'dark'
}

export function applyThemeToDocument(theme: ThemeMode): void {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.style.colorScheme = theme
  root.style.backgroundColor = THEME_BG[theme]
  root.style.color = THEME_FG[theme]
  document.body.style.backgroundColor = THEME_BG[theme]
  document.body.style.color = THEME_FG[theme]
  const appRoot = document.getElementById('root')
  if (appRoot) {
    appRoot.style.backgroundColor = THEME_BG[theme]
    appRoot.style.color = THEME_FG[theme]
  }
}

/** Reveal UI after theme + global CSS are applied (pairs with index.html anti-FOUC). */
export function revealAppShell(): void {
  document.documentElement.classList.add('nc-app-ready')
}
