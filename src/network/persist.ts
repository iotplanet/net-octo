export type SessionMode = 'tcp_server' | 'tcp_client' | 'udp_server' | 'udp_client'

export type UdpTargetKind = 'unicast' | 'multicast' | 'broadcast'

export interface SendPreset {
  id: string
  /** Short label shown like `### title` in the UI */
  title: string
  body: string
}

const SETTINGS_STORAGE_PREFIX = 'netocto.settings.v1.'
const LEGACY_SETTINGS_PREFIX = 'networkcat.settings.v1.'

function storageKey(tabId: string): string {
  return `${SETTINGS_STORAGE_PREFIX}${tabId}`
}

function legacyStorageKey(tabId: string): string {
  return `${LEGACY_SETTINGS_PREFIX}${tabId}`
}

export interface PersistedSettings {
  mode: SessionMode
  bind: string
  port: string
  remoteHost: string
  remotePort: string
  recvAscii: boolean
  sendAscii: boolean
  parseEscapes: boolean
  loopSend: boolean
  loopMs: string
  showAsLog: boolean
  wrapRecv: boolean
  hideRecv: boolean
  autoScroll: boolean
  /** UDP client only: target profile for send/receive setup */
  udpTargetKind?: UdpTargetKind
  /** Multicast addresses as `ip:port` (same port for all) */
  udpMulticastGroups?: string[]
  /** Named outbound payloads; each can be sent with its own button */
  sendPresets?: SendPreset[]
  /** Preset `id` used when loop send is enabled */
  loopPresetId?: string
}

export const defaultSettings: PersistedSettings = {
  mode: 'tcp_server',
  bind: '0.0.0.0',
  port: '8080',
  remoteHost: '127.0.0.1',
  remotePort: '8080',
  udpTargetKind: 'unicast',
  udpMulticastGroups: [],
  recvAscii: true,
  sendAscii: true,
  parseEscapes: true,
  loopSend: false,
  loopMs: '2000',
  showAsLog: true,
  wrapRecv: false,
  hideRecv: false,
  autoScroll: true,
  sendPresets: [{ id: 'preset-1', title: '', body: '' }],
  loopPresetId: 'preset-1',
}

export function loadSettings(tabId: string): PersistedSettings {
  try {
    let raw = localStorage.getItem(storageKey(tabId))
    if (!raw) {
      raw = localStorage.getItem(legacyStorageKey(tabId))
      if (raw) {
        try {
          localStorage.setItem(storageKey(tabId), raw)
          localStorage.removeItem(legacyStorageKey(tabId))
        } catch {
          /* ignore */
        }
      }
    }
    if (!raw) return { ...defaultSettings }
    const o = JSON.parse(raw) as Partial<PersistedSettings>
    return { ...defaultSettings, ...o }
  } catch {
    return { ...defaultSettings }
  }
}

export function saveSettings(tabId: string, s: PersistedSettings) {
  try {
    localStorage.setItem(storageKey(tabId), JSON.stringify(s))
  } catch {
    /* ignore quota */
  }
}
