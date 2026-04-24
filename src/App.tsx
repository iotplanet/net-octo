import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useState } from 'react'
import { I18nProvider } from './i18n'
import NetOctoApp from './network/NetOctoApp'
import { SettingsWindowPage } from './SettingsWindowPage'
import { SETTINGS_WEBVIEW_LABEL } from './settingsWindowLabel'

function readWebviewLabel(): string {
  try {
    return getCurrentWebviewWindow().label
  } catch {
    return 'main'
  }
}

export default function App() {
  const [webviewLabel] = useState(readWebviewLabel)
  const isSettingsWindow = webviewLabel === SETTINGS_WEBVIEW_LABEL

  return (
    <div className="min-h-screen text-foreground">
      <I18nProvider>
        {isSettingsWindow ? <SettingsWindowPage /> : <NetOctoApp />}
      </I18nProvider>
    </div>
  )
}
