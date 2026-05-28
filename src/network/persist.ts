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
  /** Output log vs message editor split: log share of stack (0.2–0.8) */
  centerSplitRatio?: number
  /** TCP client: auto-reconnect after disconnect */
  tcpAutoReconnect?: boolean
  tcpReconnectIntervalMs?: number
  /** 0 = unlimited reconnect attempts */
  tcpReconnectMaxAttempts?: number
  tcpReconnectBackoff?: boolean
  tcpHeartbeatEnabled?: boolean
  tcpHeartbeatIntervalMs?: number
  tcpHeartbeatTimeoutMs?: number
  /** Application heartbeat payload (hex, no spaces required) */
  tcpHeartbeatHex?: string
  /** Enable OS TCP keepalive on the socket */
  tcpTcpKeepalive?: boolean
}

export const CENTER_SPLIT_RATIO_DEFAULT = 0.5
export const CENTER_SPLIT_RATIO_MIN = 0.2
export const CENTER_SPLIT_RATIO_MAX = 0.8
export const CENTER_SPLIT_HANDLE_PX = 6
export const CENTER_SPLIT_LOG_MIN_PX = 120
export const CENTER_SPLIT_EDITOR_MIN_PX = 224

export function clampCenterSplitRatio(r: number): number {
  if (!Number.isFinite(r)) return CENTER_SPLIT_RATIO_DEFAULT
  return Math.min(CENTER_SPLIT_RATIO_MAX, Math.max(CENTER_SPLIT_RATIO_MIN, r))
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
  centerSplitRatio: CENTER_SPLIT_RATIO_DEFAULT,
  tcpAutoReconnect: true,
  tcpReconnectIntervalMs: 3000,
  tcpReconnectMaxAttempts: 0,
  tcpReconnectBackoff: true,
  tcpHeartbeatEnabled: false,
  tcpHeartbeatIntervalMs: 30_000,
  tcpHeartbeatTimeoutMs: 90_000,
  tcpHeartbeatHex: '00',
  tcpTcpKeepalive: false,
}

export function tcpClientLinkInvokeFields(s: PersistedSettings) {
  return {
    autoReconnect: s.tcpAutoReconnect ?? defaultSettings.tcpAutoReconnect,
    reconnectIntervalMs: s.tcpReconnectIntervalMs ?? defaultSettings.tcpReconnectIntervalMs,
    reconnectMaxAttempts: s.tcpReconnectMaxAttempts ?? defaultSettings.tcpReconnectMaxAttempts,
    reconnectBackoff: s.tcpReconnectBackoff ?? defaultSettings.tcpReconnectBackoff,
    heartbeatEnabled: s.tcpHeartbeatEnabled ?? defaultSettings.tcpHeartbeatEnabled,
    heartbeatIntervalMs: s.tcpHeartbeatIntervalMs ?? defaultSettings.tcpHeartbeatIntervalMs,
    heartbeatTimeoutMs: s.tcpHeartbeatTimeoutMs ?? defaultSettings.tcpHeartbeatTimeoutMs,
    heartbeatHex: (s.tcpHeartbeatHex ?? defaultSettings.tcpHeartbeatHex ?? '00').trim(),
    tcpKeepalive: s.tcpTcpKeepalive ?? defaultSettings.tcpTcpKeepalive,
  }
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
