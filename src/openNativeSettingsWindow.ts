import { isTauri } from '@tauri-apps/api/core'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { SETTINGS_WEBVIEW_LABEL } from './settingsWindowLabel'

export type OpenNativeSettingsResult = 'opened' | 'focused' | 'unsupported'

export async function openNativeSettingsWindow(windowTitle: string): Promise<OpenNativeSettingsResult> {
  if (!isTauri()) return 'unsupported'
  const existing = await WebviewWindow.getByLabel(SETTINGS_WEBVIEW_LABEL)
  if (existing) {
    await existing.show()
    await existing.setFocus()
    return 'focused'
  }
  const loc = globalThis.location
  const url = `${loc.origin}${loc.pathname}${loc.search}`
  const w = new WebviewWindow(SETTINGS_WEBVIEW_LABEL, {
    url,
    title: windowTitle,
    width: 400,
    height: 280,
    center: true,
    resizable: true,
    focus: true,
  })
  void w.once('tauri://error', (e) => {
    console.error('settings webview', e)
  })
  return 'opened'
}
