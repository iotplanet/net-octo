import type { MessageId } from '../i18n'
import type { Translate } from '../i18n'
import { defaultSettings, type PersistedSettings } from './persist'

export type TcpLinkPhase = 'idle' | 'connected' | 'reconnecting' | 'disconnected' | 'failed' | 'stopped'
export type TcpHeartbeatState = 'off' | 'ok' | 'waiting' | 'timeout'

export interface TcpLinkState {
  phase: TcpLinkPhase
  attempt: number
  maxAttempts: number
  nextRetryMs: number
  heartbeat: TcpHeartbeatState
}

export const TCP_LINK_IDLE: TcpLinkState = {
  phase: 'idle',
  attempt: 0,
  maxAttempts: 0,
  nextRetryMs: 0,
  heartbeat: 'off',
}

/** TCP client link options as edited in the sidebar (numeric fields as strings). */
export interface TcpLinkUiSettings {
  autoReconnect: boolean
  reconnectIntervalMs: string
  reconnectMaxAttempts: string
  reconnectBackoff: boolean
  heartbeatEnabled: boolean
  heartbeatIntervalMs: string
  heartbeatTimeoutMs: string
  heartbeatHex: string
  tcpKeepalive: boolean
}

export function tcpLinkFromPersist(p: Partial<PersistedSettings>): TcpLinkUiSettings {
  const d = defaultSettings
  return {
    autoReconnect: p.tcpAutoReconnect ?? d.tcpAutoReconnect ?? true,
    reconnectIntervalMs: String(p.tcpReconnectIntervalMs ?? d.tcpReconnectIntervalMs ?? 3000),
    reconnectMaxAttempts: String(p.tcpReconnectMaxAttempts ?? d.tcpReconnectMaxAttempts ?? 0),
    reconnectBackoff: p.tcpReconnectBackoff ?? d.tcpReconnectBackoff ?? true,
    heartbeatEnabled: p.tcpHeartbeatEnabled ?? d.tcpHeartbeatEnabled ?? false,
    heartbeatIntervalMs: String(p.tcpHeartbeatIntervalMs ?? d.tcpHeartbeatIntervalMs ?? 30_000),
    heartbeatTimeoutMs: String(p.tcpHeartbeatTimeoutMs ?? d.tcpHeartbeatTimeoutMs ?? 90_000),
    heartbeatHex: p.tcpHeartbeatHex ?? d.tcpHeartbeatHex ?? '00',
    tcpKeepalive: p.tcpTcpKeepalive ?? d.tcpTcpKeepalive ?? false,
  }
}

export function tcpLinkToPersistSlice(ui: TcpLinkUiSettings): Pick<
  PersistedSettings,
  | 'tcpAutoReconnect'
  | 'tcpReconnectIntervalMs'
  | 'tcpReconnectMaxAttempts'
  | 'tcpReconnectBackoff'
  | 'tcpHeartbeatEnabled'
  | 'tcpHeartbeatIntervalMs'
  | 'tcpHeartbeatTimeoutMs'
  | 'tcpHeartbeatHex'
  | 'tcpTcpKeepalive'
> {
  const d = defaultSettings
  return {
    tcpAutoReconnect: ui.autoReconnect,
    tcpReconnectIntervalMs: parseMs(ui.reconnectIntervalMs, d.tcpReconnectIntervalMs ?? 3000),
    tcpReconnectMaxAttempts: parseIntOr(ui.reconnectMaxAttempts, d.tcpReconnectMaxAttempts ?? 0),
    tcpReconnectBackoff: ui.reconnectBackoff,
    tcpHeartbeatEnabled: ui.heartbeatEnabled,
    tcpHeartbeatIntervalMs: parseMs(ui.heartbeatIntervalMs, d.tcpHeartbeatIntervalMs ?? 30_000),
    tcpHeartbeatTimeoutMs: parseMs(ui.heartbeatTimeoutMs, d.tcpHeartbeatTimeoutMs ?? 90_000),
    tcpHeartbeatHex: ui.heartbeatHex.trim(),
    tcpTcpKeepalive: ui.tcpKeepalive,
  }
}

/** Backend invoke payload (camelCase keys). */
export function tcpClientLinkInvokeFields(ui: TcpLinkUiSettings) {
  const slice = tcpLinkToPersistSlice(ui)
  return {
    autoReconnect: slice.tcpAutoReconnect,
    reconnectIntervalMs: slice.tcpReconnectIntervalMs,
    reconnectMaxAttempts: slice.tcpReconnectMaxAttempts,
    reconnectBackoff: slice.tcpReconnectBackoff,
    heartbeatEnabled: slice.tcpHeartbeatEnabled,
    heartbeatIntervalMs: slice.tcpHeartbeatIntervalMs,
    heartbeatTimeoutMs: slice.tcpHeartbeatTimeoutMs,
    heartbeatHex: slice.tcpHeartbeatHex ?? '00',
    tcpKeepalive: slice.tcpTcpKeepalive,
  }
}

export function parseNcTcpLinkPayload(payload: {
  phase: string
  attempt: number
  maxAttempts: number
  nextRetryMs: number
  heartbeat: string
}): TcpLinkState {
  return {
    phase: payload.phase as TcpLinkPhase,
    attempt: payload.attempt,
    maxAttempts: payload.maxAttempts,
    nextRetryMs: payload.nextRetryMs,
    heartbeat: payload.heartbeat as TcpHeartbeatState,
  }
}

const PHASE_MSG: Record<TcpLinkPhase, MessageId> = {
  idle: 'session.tcpLink.idle',
  connected: 'session.tcpLink.connected',
  reconnecting: 'session.tcpLink.reconnecting',
  disconnected: 'session.tcpLink.disconnected',
  failed: 'session.tcpLink.failed',
  stopped: 'session.tcpLink.stopped',
}

const HB_MSG: Record<TcpHeartbeatState, MessageId> = {
  off: 'session.tcpLink.hbOff',
  ok: 'session.tcpLink.hbOk',
  waiting: 'session.tcpLink.hbWaiting',
  timeout: 'session.tcpLink.hbTimeout',
}

export function tcpLinkPhaseLabel(t: Translate, phase: TcpLinkPhase): string {
  return t(PHASE_MSG[phase] ?? PHASE_MSG.idle)
}

export function tcpHeartbeatLabel(t: Translate, hb: TcpHeartbeatState): string {
  return t(HB_MSG[hb] ?? HB_MSG.off)
}

export function formatI18nTemplate(t: Translate, id: MessageId, vars: Record<string, string>): string {
  let s = t(id)
  for (const [key, value] of Object.entries(vars)) {
    s = s.split(`{${key}}`).join(value)
  }
  return s
}

type LinkTone = 'ok' | 'warn' | 'err' | 'muted'

const TONE_TEXT: Record<LinkTone, string> = {
  ok: 'text-[var(--nc-status-ok)]',
  warn: 'text-[var(--nc-status-warn)]',
  err: 'text-[var(--nc-status-err)]',
  muted: 'text-[var(--nc-text-muted)]',
}

const TONE_DOT: Record<LinkTone, string> = {
  ok: 'bg-[var(--nc-status-ok)] shadow-[0_0_6px_color-mix(in_srgb,var(--nc-status-ok)_60%,transparent)]',
  warn: 'bg-[var(--nc-status-warn)] shadow-[0_0_6px_color-mix(in_srgb,var(--nc-status-warn)_50%,transparent)]',
  err: 'bg-[var(--nc-status-err)]',
  muted: 'bg-[var(--nc-text-faint)]',
}

function phaseTone(phase: TcpLinkPhase): LinkTone {
  switch (phase) {
    case 'connected':
      return 'ok'
    case 'reconnecting':
      return 'warn'
    case 'failed':
      return 'err'
    default:
      return 'muted'
  }
}

function heartbeatTone(hb: TcpHeartbeatState): LinkTone {
  switch (hb) {
    case 'ok':
      return 'ok'
    case 'waiting':
      return 'warn'
    case 'timeout':
      return 'err'
    default:
      return 'muted'
  }
}

export function linkStatusVisual(opts: {
  tcpClientActive: boolean
  phase: TcpLinkPhase
  connected: boolean
}) {
  const tone: LinkTone = opts.tcpClientActive ? phaseTone(opts.phase) : opts.connected ? 'ok' : 'muted'
  return { textClass: TONE_TEXT[tone], dotClass: TONE_DOT[tone], tone }
}

export function tcpHeartbeatVisual(hb: TcpHeartbeatState) {
  const tone = heartbeatTone(hb)
  return { textClass: TONE_TEXT[tone], tone }
}

export function isTcpClientLinkUp(
  sessionRunning: boolean,
  phase: TcpLinkPhase,
  clientsCount: number,
): boolean {
  if (!sessionRunning) return false
  if (phase === 'connected') return true
  return clientsCount > 0 && phase !== 'failed' && phase !== 'stopped'
}

function parseMs(raw: string, fallback: number): number {
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function parseIntOr(raw: string, fallback: number): number {
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}
