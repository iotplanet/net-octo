import { invoke, isTauri } from '@tauri-apps/api/core'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { revealAppShell } from './document'

/**
 * Show the current webview after themed first paint.
 * Prefer Rust `nc_shell_ready` (ACL `core:window:allow-show`); fall back to JS API.
 */
export async function showTauriWindowIfNeeded(): Promise<void> {
  if (!isTauri()) return
  const label = getCurrentWebviewWindow().label
  try {
    await invoke('nc_shell_ready', { webviewLabel: label })
    return
  } catch (err) {
    console.warn('[netocto] nc_shell_ready failed, trying show()', err)
  }
  try {
    await getCurrentWebviewWindow().show()
  } catch (err) {
    console.warn('[netocto] window.show failed', err)
  }
}

/** Reveal #root and show window after two animation frames (post-layout paint). */
export function revealShellAfterPaint(): void {
  const reveal = () => {
    revealAppShell()
    void showTauriWindowIfNeeded()
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(reveal)
  })
}

export function revealShellNow(): void {
  revealAppShell()
  void showTauriWindowIfNeeded()
}
