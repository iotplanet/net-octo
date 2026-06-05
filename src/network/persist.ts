export type SessionMode = 'tcp_server' | 'tcp_client' | 'udp_server' | 'udp_client'

export type UdpTargetKind = 'unicast' | 'multicast' | 'broadcast'

export type SendEncoding = 'ascii' | 'hex' | 'utf8'
export type RecvEncoding = 'ascii' | 'hex' | 'utf8'

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
  recvEncoding?: RecvEncoding
  sendEncoding?: SendEncoding
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
  /** Enable TLS for TCP sessions */
  tcpUseTls?: boolean
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
  recvEncoding: 'ascii',
  sendEncoding: 'ascii',
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
  tcpUseTls: false,
}

export function loadSettings(tabId: string): PersistedSettings {
  try {
    let raw = localStorage.getItem(storageKey(tabId))
    if (!raw) {
      const legacyRaw = localStorage.getItem(legacyStorageKey(tabId))
      if (legacyRaw) {
        try {
          localStorage.setItem(storageKey(tabId), legacyRaw)
          raw = legacyRaw
        } catch {
          /* quota or storage error — legacy key preserved for next attempt */
          return { ...defaultSettings }
        }
        try {
          localStorage.removeItem(legacyStorageKey(tabId))
        } catch {
          /* legacy key cleanup is best-effort; data already migrated */
        }
      }
    }
    if (!raw) return { ...defaultSettings }
    const o = JSON.parse(raw) as Partial<PersistedSettings>
    if (o.recvEncoding == null && o.recvAscii !== undefined) {
      o.recvEncoding = o.recvAscii ? 'ascii' : 'hex'
    }
    if (o.sendEncoding == null && o.sendAscii !== undefined) {
      o.sendEncoding = o.sendAscii ? 'ascii' : 'hex'
    }
    return { ...defaultSettings, ...o }
  } catch {
    return { ...defaultSettings }
  }
}

export function effectiveRecvEncoding(s: PersistedSettings): RecvEncoding {
  return s.recvEncoding ?? (s.recvAscii ? 'ascii' : 'hex')
}

export function effectiveSendEncoding(s: PersistedSettings): SendEncoding {
  return s.sendEncoding ?? (s.sendAscii ? 'ascii' : 'hex')
}

export function recvIsAscii(e: RecvEncoding): boolean {
  return e === 'ascii'
}

export function recvIsHex(e: RecvEncoding): boolean {
  return e === 'hex'
}

export function recvIsUtf8(e: RecvEncoding): boolean {
  return e === 'utf8'
}

export function sendIsAscii(e: SendEncoding): boolean {
  return e === 'ascii'
}

export function sendIsHex(e: SendEncoding): boolean {
  return e === 'hex'
}

export function sendIsUtf8(e: SendEncoding): boolean {
  return e === 'utf8'
}

export function saveSettings(tabId: string, s: PersistedSettings) {
  try {
    localStorage.setItem(storageKey(tabId), JSON.stringify(s))
  } catch {
    /* ignore quota */
  }
}
