/**
 * Synchronous theme boot — must run before Vite client / app bundle.
 * Keep storage key and colors in sync with src/theme/document.ts
 */
;(function () {
  var KEY = 'netocto.theme'
  var PALETTE = {
    dark: { bg: '#0a0a0b', fg: '#f4f4f5' },
    light: { bg: '#fafafa', fg: '#18181b' },
  }
  var theme = 'dark'
  try {
    var stored = localStorage.getItem(KEY)
    if (stored === 'light' || stored === 'dark') theme = stored
  } catch (e) {}

  var p = PALETTE[theme]
  var root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.style.colorScheme = theme
  root.style.backgroundColor = p.bg
  root.style.color = p.fg

  function paintSurface(el) {
    if (!el) return
    el.style.backgroundColor = p.bg
    el.style.color = p.fg
  }

  paintSurface(document.body)
  paintSurface(document.getElementById('root'))
})()
