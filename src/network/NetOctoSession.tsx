import {
  Button,
  Card,
  Checkbox,
  Chip,
  Input,
  Label,
  ListBox,
  Select,
  Separator,
  Surface,
  Text,
  TextArea,
} from '@heroui/react'
import { invoke } from '@tauri-apps/api/core'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { Antenna, ArrowRight, Download, Eraser, Play, Plus, Radio, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n, type Translate } from '../i18n'
import {
  defaultSettings,
  loadSettings,
  type PersistedSettings,
  type SendPreset,
  type SessionMode,
  type UdpTargetKind,
  saveSettings,
} from './persist'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'

interface LogLine {
  ts: string
  line: string
  kind: string
}

interface ClientInfo {
  id: number
  peer: string
}

interface Stats {
  rx_pkts: number
  tx_pkts: number
  rx_bytes: number
  tx_bytes: number
}

const BIND_PRESETS = ['0.0.0.0', '127.0.0.1', '::']

/** HeroUI Select 下拉与列表（与触发器等宽、可滚动） */
const LB_POPOVER = 'min-w-[var(--trigger-width)]'
const LB_LIST = 'max-h-52 overflow-y-auto p-1 outline-none sm:max-h-60'

function newSendPresetId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `p-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeSendPresetsFromPersist(p: PersistedSettings): { presets: SendPreset[]; loopId: string } {
  const raw = p.sendPresets
  let presets: SendPreset[]
  if (raw && Array.isArray(raw) && raw.length > 0) {
    presets = raw.map((r, i) => ({
      id: typeof r.id === 'string' && r.id ? r.id : `preset-${i}`,
      title: typeof r.title === 'string' ? r.title : '',
      body: typeof r.body === 'string' ? r.body : '',
    }))
  } else {
    const id = newSendPresetId()
    presets = [{ id, title: '', body: '' }]
  }
  const loopId =
    typeof p.loopPresetId === 'string' && presets.some((x) => x.id === p.loopPresetId)
      ? p.loopPresetId
      : presets[0]!.id
  return { presets, loopId }
}

function kindClass(kind: string): string {
  switch (kind) {
    case 'server':
      return 'text-secondary'
    case 'send':
      return 'text-primary'
    case 'send-data':
      return 'text-default-700'
    case 'recv':
      return 'text-success'
    case 'error':
      return 'text-danger'
    default:
      return 'text-default-500'
  }
}

function formatSessionTabTitle(mode: SessionMode, running: boolean, localPort: string, idleLabel: string): string {
  const prefix =
    mode === 'tcp_server'
      ? 'TCP-S'
      : mode === 'tcp_client'
        ? 'TCP-C'
        : mode === 'udp_server'
          ? 'UDP-S'
          : 'UDP-C'
  return running ? `${prefix} :${localPort}` : `${prefix} (${idleLabel})`
}

function NcConfigCard({
  title,
  children,
  footer,
}: {
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <Card
      variant="secondary"
      className="shrink-0 overflow-hidden rounded-xl border border-divider/60 bg-content2/45 shadow-sm ring-1 ring-default-950/[0.03] dark:bg-content2/25 dark:ring-white/[0.06]"
    >
      <Card.Header className="border-b border-divider/50 bg-default-100/25 px-2 py-1.5 sm:px-2.5 sm:py-2 dark:bg-default-100/10">
        <Card.Title className="text-[10px] font-semibold uppercase tracking-wider text-default-400 sm:text-[11px]">
          {title}
        </Card.Title>
      </Card.Header>
      <Card.Content className="flex flex-col gap-2 px-2 pb-2.5 pt-2 sm:gap-2 sm:px-2.5 sm:pb-3 sm:pt-2.5">{children}</Card.Content>
      {footer ? (
        <Card.Footer className="border-t border-divider/50 bg-default-100/20 px-2 pb-2.5 pt-1.5 sm:px-2.5 sm:pb-3 dark:bg-default-100/5">
          {footer}
        </Card.Footer>
      ) : null}
    </Card>
  )
}

function NcEncodingToggle({
  ascii,
  onAscii,
  onHex,
}: {
  ascii: boolean
  onAscii: () => void
  onHex: () => void
}) {
  return (
    <div className="flex rounded-lg border border-divider/50 bg-default-100/40 p-0.5 dark:bg-default-100/15">
      <Button
        size="sm"
        variant={ascii ? 'primary' : 'ghost'}
        className="min-h-7 min-w-0 flex-1 rounded-md text-[11px] font-medium"
        onPress={onAscii}
      >
        ASCII
      </Button>
      <Button
        size="sm"
        variant={ascii ? 'ghost' : 'primary'}
        className="min-h-7 min-w-0 flex-1 rounded-md text-[11px] font-medium"
        onPress={onHex}
      >
        HEX
      </Button>
    </div>
  )
}

function NcFieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className="mb-0.5 block text-[10px] font-medium text-default-400 sm:text-[11px]">
      {children}
    </Label>
  )
}

function splitHostPortLast(s: string): { host: string; port: string } {
  const i = s.lastIndexOf(':')
  if (i <= 0) return { host: s, port: '' }
  return { host: s.slice(0, i), port: s.slice(i + 1) }
}

function NcUdpTargetCard({
  idPrefix,
  t,
  sessionRunning,
  kind,
  onKind,
  remoteHost,
  remotePort,
  onWireChange,
  groups,
  onGroupsChange,
}: {
  idPrefix: string
  t: Translate
  sessionRunning: boolean
  kind: UdpTargetKind
  onKind: (k: UdpTargetKind) => void
  remoteHost: string
  remotePort: string
  onWireChange: (wire: string) => void
  groups: string[]
  onGroupsChange: (next: string[]) => void
}) {
  const wire = `${remoteHost}:${remotePort}`
  const hint =
    kind === 'unicast'
      ? t('session.udpTargetUnicastHint')
      : kind === 'multicast'
        ? t('session.udpTargetMulticastHint')
        : t('session.udpTargetBroadcastHint')
  const nonEmptyGroups = groups.filter((g) => g.trim().length > 0)

  return (
    <Card className="relative overflow-visible rounded-2xl border border-divider/60 bg-content2/40 shadow-sm dark:bg-content2/20">
      <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2">
        <Chip
          size="sm"
          variant="soft"
          className="pointer-events-auto border border-default-300/60 bg-content1 shadow-sm"
        >
          <Chip.Label className="text-[10px] font-semibold uppercase tracking-wide text-default-500">
            {t('session.udpTargetTitle')}
          </Chip.Label>
        </Chip>
      </div>
      <Card.Content className="flex flex-col gap-3 px-2.5 pb-3 pt-4 sm:px-3 sm:pb-3.5">
        <div className="flex justify-center rounded-full border border-divider/50 bg-default-100/35 p-0.5 dark:bg-default-100/15">
          <Button
            isIconOnly
            size="sm"
            variant={kind === 'unicast' ? 'primary' : 'ghost'}
            className="h-8 w-10 min-w-10 rounded-full"
            isDisabled={sessionRunning}
            aria-label={t('session.udpTargetUnicastHint')}
            onPress={() => onKind('unicast')}
          >
            <ArrowRight size={16} strokeWidth={2.25} />
          </Button>
          <Button
            isIconOnly
            size="sm"
            variant={kind === 'multicast' ? 'primary' : 'ghost'}
            className="h-8 w-10 min-w-10 rounded-full"
            isDisabled={sessionRunning}
            aria-label={t('session.udpTargetMulticastHint')}
            onPress={() => onKind('multicast')}
          >
            <Radio size={16} strokeWidth={2.25} />
          </Button>
          <Button
            isIconOnly
            size="sm"
            variant={kind === 'broadcast' ? 'primary' : 'ghost'}
            className="h-8 w-10 min-w-10 rounded-full"
            isDisabled={sessionRunning}
            aria-label={t('session.udpTargetBroadcastHint')}
            onPress={() => onKind('broadcast')}
          >
            <Antenna size={16} strokeWidth={2.25} />
          </Button>
        </div>
        <Text size="xs" variant="muted" className="text-center leading-snug">
          {hint}
        </Text>
        {kind === 'multicast' ? (
          <>
            <div className="flex items-center justify-between gap-2 text-[11px] text-default-500">
              <span>{t('session.udpMulticastGroups')}</span>
              <span className="font-mono tabular-nums text-default-400">{nonEmptyGroups.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {groups.map((g, idx) => (
                <div key={`mg-${idPrefix}-${idx}`} className="flex items-center gap-1.5">
                  <Input
                    value={g}
                    disabled={sessionRunning}
                    onChange={(e) => {
                      const next = groups.slice()
                      next[idx] = e.target.value
                      onGroupsChange(next)
                    }}
                    variant="secondary"
                    placeholder={t('session.udpMulticastGroupPlaceholder')}
                    className="min-h-8 flex-1 font-mono text-xs"
                    aria-label={t('session.udpMulticastGroupPlaceholder')}
                  />
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    isDisabled={sessionRunning}
                    aria-label={t('session.udpMulticastRemove')}
                    className="shrink-0 text-default-400"
                    onPress={() => onGroupsChange(groups.filter((_, i) => i !== idx))}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              fullWidth
              variant="outline"
              size="sm"
              isDisabled={sessionRunning}
              className="border-dashed border-default-400/60 text-default-600"
              onPress={() => onGroupsChange([...groups, ''])}
            >
              <Plus size={14} className="mr-1 shrink-0" />
              {t('session.udpMulticastAdd')}
            </Button>
          </>
        ) : (
          <>
            <NcFieldLabel htmlFor={`${idPrefix}-udp-wire`}>
              {kind === 'broadcast' ? t('session.udpTargetBroadcastLabel') : t('session.udpTargetEndpoint')}
            </NcFieldLabel>
            <Input
              id={`${idPrefix}-udp-wire`}
              value={wire}
              disabled={sessionRunning}
              onChange={(e) => onWireChange(e.target.value)}
              variant="secondary"
              className="min-h-9 font-mono text-xs"
            />
          </>
        )}
      </Card.Content>
    </Card>
  )
}

function NcCheckboxRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <Checkbox isSelected={checked} onChange={onChange} className="mt-1">
      <div className="flex items-start gap-2">
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Content className="text-[11px] leading-snug text-default-500">{label}</Checkbox.Content>
      </div>
    </Checkbox>
  )
}

export interface NetOctoSessionProps {
  sessionId: string
  webviewLabel: string
  active: boolean
  onTabMeta?: (id: string, meta: { running: boolean; tabTitle: string }) => void
}

export function NetOctoSession({ sessionId, webviewLabel, active, onTabMeta }: NetOctoSessionProps) {
  const { t } = useI18n()
  const idPrefix = useMemo(() => sessionId.replace(/[^a-zA-Z0-9_-]/g, '_'), [sessionId])
  const persisted = useRef(loadSettings(sessionId))
  const [mode, setMode] = useState<SessionMode>(persisted.current.mode)
  const [bind, setBind] = useState(persisted.current.bind)
  const [port, setPort] = useState(persisted.current.port)
  const [remoteHost, setRemoteHost] = useState(persisted.current.remoteHost)
  const [remotePort, setRemotePort] = useState(persisted.current.remotePort)
  const [udpTargetKind, setUdpTargetKind] = useState<UdpTargetKind>(persisted.current.udpTargetKind ?? 'unicast')
  const [udpMulticastGroups, setUdpMulticastGroups] = useState<string[]>(() =>
    persisted.current.udpMulticastGroups?.length ? [...persisted.current.udpMulticastGroups] : [],
  )
  const [recvAscii, setRecvAscii] = useState(persisted.current.recvAscii)
  const [showAsLog, setShowAsLog] = useState(persisted.current.showAsLog)
  const [wrapRecv, setWrapRecv] = useState(persisted.current.wrapRecv)
  const [hideRecv, setHideRecv] = useState(persisted.current.hideRecv)
  const [autoScroll, setAutoScroll] = useState(persisted.current.autoScroll)

  const [sendAscii, setSendAscii] = useState(persisted.current.sendAscii)
  const [parseEscapes, setParseEscapes] = useState(persisted.current.parseEscapes)
  const [loopSend, setLoopSend] = useState(persisted.current.loopSend)
  const [loopMs, setLoopMs] = useState(persisted.current.loopMs)

  const [lines, setLines] = useState<LogLine[]>([])
  const [clients, setClients] = useState<ClientInfo[]>([])
  const [stats, setStats] = useState<Stats>({
    rx_pkts: 0,
    tx_pkts: 0,
    rx_bytes: 0,
    tx_bytes: 0,
  })
  const [sendTarget, setSendTarget] = useState('all')
  const sendInit = useMemo(() => normalizeSendPresetsFromPersist(persisted.current), [])
  const [sendPresets, setSendPresets] = useState<SendPreset[]>(sendInit.presets)
  const [loopPresetId, setLoopPresetId] = useState(sendInit.loopId)
  const [err, setErr] = useState<string | null>(null)
  const [sessionRunning, setSessionRunning] = useState(false)
  const [activeMode, setActiveMode] = useState<SessionMode | 'idle'>('idle')

  const logRef = useRef<HTMLDivElement>(null)
  const loopRef = useRef<number | null>(null)
  const fileImportRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<number | null>(null)

  const sendRef = useRef({
    sendTarget,
    sendPresets,
    loopPresetId,
    sendAscii,
    parseEscapes,
  })
  sendRef.current = { sendTarget, sendPresets, loopPresetId, sendAscii, parseEscapes }

  const appendLine = useCallback((l: LogLine) => {
    setLines((prev) => {
      if (!showAsLog && l.kind === 'recv') return prev
      const next = [...prev, l]
      return next.length > 5000 ? next.slice(-4000) : next
    })
  }, [showAsLog])

  useEffect(() => {
    const s: PersistedSettings = {
      mode,
      bind,
      port,
      remoteHost,
      remotePort,
      udpTargetKind,
      udpMulticastGroups,
      recvAscii,
      sendAscii,
      parseEscapes,
      loopSend,
      loopMs,
      showAsLog,
      wrapRecv,
      hideRecv,
      autoScroll,
      sendPresets,
      loopPresetId,
    }
    if (saveTimer.current) globalThis.clearTimeout(saveTimer.current)
    saveTimer.current = globalThis.setTimeout(() => saveSettings(sessionId, s), 400)
    return () => {
      if (saveTimer.current) globalThis.clearTimeout(saveTimer.current)
    }
  }, [
    sessionId,
    mode,
    bind,
    port,
    remoteHost,
    remotePort,
    udpTargetKind,
    udpMulticastGroups,
    recvAscii,
    sendAscii,
    parseEscapes,
    loopSend,
    loopMs,
    showAsLog,
    wrapRecv,
    hideRecv,
    autoScroll,
    sendPresets,
    loopPresetId,
  ])

  useEffect(() => {
    if (!sendPresets.some((p) => p.id === loopPresetId)) {
      setLoopPresetId(sendPresets[0]?.id ?? '')
    }
  }, [sendPresets, loopPresetId])

  useEffect(() => {
    const dead = { v: false }
    const unlisteners: UnlistenFn[] = []
    const w = getCurrentWebviewWindow()
    ;(async () => {
      const u1 = await w.listen<{
        sessionId: string
        ts: string
        line: string
        kind: string
      }>('nc-log', (e) => {
        if (e.payload.sessionId !== sessionId) return
        appendLine({ ts: e.payload.ts, line: e.payload.line, kind: e.payload.kind })
      })
      if (dead.v) {
        u1()
        return
      }
      unlisteners.push(u1)
      const u2 = await w.listen<{ sessionId: string; clients: ClientInfo[] }>('nc-clients', (e) => {
        if (e.payload.sessionId !== sessionId) return
        setClients(e.payload.clients)
      })
      if (dead.v) {
        u2()
        return
      }
      unlisteners.push(u2)
      const u3 = await w.listen<{
        sessionId: string
        rxPkts: number
        txPkts: number
        rxBytes: number
        txBytes: number
      }>('nc-stats', (e) => {
        if (e.payload.sessionId !== sessionId) return
        setStats({
          rx_pkts: e.payload.rxPkts,
          tx_pkts: e.payload.txPkts,
          rx_bytes: e.payload.rxBytes,
          tx_bytes: e.payload.txBytes,
        })
      })
      if (dead.v) {
        u3()
        return
      }
      unlisteners.push(u3)
      const u4 = await w.listen<{
        sessionId: string
        running: boolean
        addr: string
        mode?: string
      }>('nc-server', (e) => {
        if (e.payload.sessionId !== sessionId) return
        setSessionRunning(e.payload.running)
        const m = e.payload.mode
        if (m === 'tcp_server' || m === 'tcp_client' || m === 'udp_server' || m === 'udp_client') {
          setActiveMode(m)
        } else if (!e.payload.running) {
          setActiveMode('idle')
        }
      })
      if (dead.v) {
        u4()
        return
      }
      unlisteners.push(u4)
    })()
    return () => {
      dead.v = true
      unlisteners.forEach((f) => f())
    }
  }, [appendLine, sessionId])

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [lines, autoScroll])

  useEffect(() => {
    if (sendTarget === 'all') return
    if (!clients.some((c) => String(c.id) === sendTarget)) setSendTarget('all')
  }, [clients, sendTarget])

  const tabMode = sessionRunning && activeMode !== 'idle' ? activeMode : mode
  const tabTitle = formatSessionTabTitle(tabMode, sessionRunning, port, t('session.tabIdle'))
  useEffect(() => {
    onTabMeta?.(sessionId, { running: sessionRunning, tabTitle })
  }, [sessionId, onTabMeta, sessionRunning, tabTitle])

  const canSendLoop = sessionRunning && (clients.length > 0 || mode === 'udp_client')

  useEffect(() => {
    if (!loopSend || !canSendLoop) {
      if (loopRef.current) {
        globalThis.clearInterval(loopRef.current)
        loopRef.current = null
      }
      return
    }
    const ms = Math.max(50, Number.parseInt(loopMs, 10) || 2000)
    loopRef.current = globalThis.setInterval(() => {
      const r = sendRef.current
      const body =
        r.sendPresets.find((p) => p.id === r.loopPresetId)?.body ?? r.sendPresets[0]?.body ?? ''
      void invoke('nc_send', {
        payload: {
          sessionId,
          webviewLabel,
          target: r.sendTarget,
          data: body,
          sendHex: !r.sendAscii,
          parseEscapes: r.sendAscii && r.parseEscapes,
        },
      }).catch((e) => setErr(String(e)))
    }, ms)
    return () => {
      if (loopRef.current) globalThis.clearInterval(loopRef.current)
      loopRef.current = null
    }
  }, [loopSend, loopMs, canSendLoop, sessionId, webviewLabel])

  const startSession = async () => {
    setErr(null)
    const recvHex = !recvAscii
    const base = { sessionId, webviewLabel }
    try {
      if (mode === 'tcp_server') {
        const p = Number.parseInt(port, 10)
        if (Number.isNaN(p) || p < 1 || p > 65535) {
          setErr(t('err.portRange'))
          return
        }
        await invoke('nc_start_session', {
          params: { ...base, mode: 'tcp_server', bind, port: p, recvHex },
        })
      } else if (mode === 'tcp_client') {
        const p = Number.parseInt(port, 10)
        if (Number.isNaN(p) || p < 1 || p > 65535) {
          setErr(t('err.portRange'))
          return
        }
        await invoke('nc_start_session', {
          params: { ...base, mode: 'tcp_client', host: remoteHost, port: p, recvHex },
        })
      } else if (mode === 'udp_server') {
        const p = Number.parseInt(port, 10)
        if (Number.isNaN(p) || p < 1 || p > 65535) {
          setErr(t('err.portRange'))
          return
        }
        await invoke('nc_start_session', {
          params: { ...base, mode: 'udp_server', bind, port: p, recvHex },
        })
      } else {
        const mgs = udpMulticastGroups.map((x) => x.trim()).filter((x) => x.length > 0)
        if (udpTargetKind === 'multicast' && mgs.length === 0) {
          setErr(t('err.udpMulticastEmpty'))
          return
        }
        if (udpTargetKind === 'multicast' && mgs.length > 0) {
          const ports = new Set<number>()
          for (const g of mgs) {
            const i = g.lastIndexOf(':')
            const p = Number.parseInt(g.slice(i + 1), 10)
            if (Number.isNaN(p) || p < 1 || p > 65535) {
              setErr(t('err.udpEndpointInvalid'))
              return
            }
            ports.add(p)
          }
          if (ports.size !== 1) {
            setErr(t('err.udpMulticastPortMismatch'))
            return
          }
        }
        const rp = Number.parseInt(remotePort, 10)
        if (udpTargetKind !== 'multicast') {
          if (!remoteHost.trim() || Number.isNaN(rp) || rp < 1 || rp > 65535) {
            setErr(t('err.udpEndpointInvalid'))
            return
          }
        }
        await invoke('nc_start_session', {
          params: {
            ...base,
            mode: 'udp_client',
            remoteHost: udpTargetKind === 'multicast' ? '0.0.0.0' : remoteHost,
            remotePort: udpTargetKind === 'multicast' ? 1 : rp,
            recvHex,
            targetKind: udpTargetKind,
            multicastGroups: mgs,
          },
        })
      }
    } catch (e) {
      setErr(String(e))
    }
  }

  const stopSession = async () => {
    setErr(null)
    try {
      await invoke('nc_stop_session', { sessionId, webviewLabel })
    } catch (e) {
      setErr(String(e))
    }
  }

  const sendPresetById = useCallback(
    async (presetId: string) => {
      setErr(null)
      const data = sendPresets.find((p) => p.id === presetId)?.body ?? ''
      if (!data && sendAscii) {
        setErr(t('err.sendEmpty'))
        return
      }
      try {
        await invoke('nc_send', {
          payload: {
            sessionId,
            webviewLabel,
            target: sendTarget,
            data,
            sendHex: !sendAscii,
            parseEscapes: sendAscii && parseEscapes,
          },
        })
      } catch (e) {
        setErr(String(e))
      }
    },
    [sendPresets, sendAscii, sessionId, webviewLabel, sendTarget, parseEscapes, t],
  )

  const disconnect = async () => {
    setErr(null)
    try {
      await invoke('nc_disconnect', {
        payload: {
          sessionId,
          webviewLabel,
          target: sendTarget === 'all' ? 'all' : String(sendTarget),
        },
      })
    } catch (e) {
      setErr(String(e))
    }
  }

  const resetStats = async () => {
    setErr(null)
    try {
      await invoke('nc_reset_stats', { sessionId, webviewLabel })
    } catch (e) {
      setErr(String(e))
    }
  }

  const clearLog = () => setLines([])

  const exportLog = () => {
    const blob = new Blob([JSON.stringify(lines, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `netocto-${sessionId}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const onImportFile: React.ChangeEventHandler<HTMLInputElement> = (ev) => {
    const f = ev.target.files?.[0]
    ev.target.value = ''
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '')
        const data = JSON.parse(text) as unknown
        if (!Array.isArray(data)) {
          setErr(t('err.importNotArray'))
          return
        }
        const parsed: LogLine[] = []
        for (const row of data) {
          if (
            row &&
            typeof row === 'object' &&
            'ts' in row &&
            'line' in row &&
            'kind' in row &&
            typeof (row as LogLine).ts === 'string' &&
            typeof (row as LogLine).line === 'string' &&
            typeof (row as LogLine).kind === 'string'
          ) {
            parsed.push(row as LogLine)
          }
        }
        if (parsed.length === 0) {
          setErr(t('err.importNoRecords'))
          return
        }
        setLines(parsed)
        setErr(null)
      } catch {
        setErr(t('err.importJsonFail'))
      }
    }
    reader.readAsText(f)
  }

  const logAddr =
    mode === 'tcp_client'
      ? `${remoteHost}:${port}`
      : mode === 'udp_client'
        ? udpTargetKind === 'multicast'
          ? `MC×${udpMulticastGroups.filter((g) => g.trim()).length || 0}`
          : `${remoteHost}:${remotePort}`
        : sessionRunning
          ? `${bind}:${port}`
          : '—'

  const showLocalBind = mode === 'tcp_server' || mode === 'udp_server'
  const showLocalPort = mode === 'tcp_server' || mode === 'udp_server' || mode === 'tcp_client'
  const showTcpRemoteHost = mode === 'tcp_client'

  // UDP 服务端需至少一个对端；TCP 会话由后端 clients map 校验，避免仅因前端未收到 nc-clients 而长期禁用 Send
  const canSendFinal =
    sessionRunning &&
    (tabMode === 'udp_client' ||
      (tabMode === 'udp_server' && clients.length > 0) ||
      tabMode === 'tcp_server' ||
      tabMode === 'tcp_client')

  const resetUiDefaults = () => {
    const d = { ...defaultSettings }
    setMode(d.mode)
    setBind(d.bind)
    setPort(d.port)
    setRemoteHost(d.remoteHost)
    setRemotePort(d.remotePort)
    setUdpTargetKind(d.udpTargetKind ?? 'unicast')
    setUdpMulticastGroups(d.udpMulticastGroups?.length ? [...d.udpMulticastGroups] : [])
    setRecvAscii(d.recvAscii)
    setSendAscii(d.sendAscii)
    setParseEscapes(d.parseEscapes)
    setLoopSend(d.loopSend)
    setLoopMs(d.loopMs)
    setShowAsLog(d.showAsLog)
    setWrapRecv(d.wrapRecv)
    setHideRecv(d.hideRecv)
    setAutoScroll(d.autoScroll)
    const sp = normalizeSendPresetsFromPersist(d)
    setSendPresets(sp.presets)
    setLoopPresetId(sp.loopId)
    saveSettings(sessionId, d)
  }

  return (
    <div className={active ? 'flex min-h-0 flex-1 flex-col' : 'hidden min-h-0 flex-1 flex-col'}>
      <Surface
        variant="default"
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-divider bg-content1 shadow-sm"
      >
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[18.5rem] shrink-0 flex-col border-r border-divider/80 bg-gradient-to-b from-default-100/30 to-content2/20 px-1 py-1.5 text-xs sm:w-[20.5rem] sm:px-1.5 sm:py-2">
            <Card
              variant="default"
              className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-divider/70 bg-content1 shadow-md ring-1 ring-default-950/[0.04] dark:ring-white/[0.08]"
            >
              <Card.Content className="nc-aside-scroll flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-2 sm:gap-3 sm:p-2.5">
            <NcConfigCard
              title={t('session.cardSession')}
              footer={
                sessionRunning ? (
                  <Button fullWidth variant="danger" size="sm" onPress={() => void stopSession()}>
                    {t('session.btnStop')}
                  </Button>
                ) : (
                  <Button fullWidth variant="primary" size="sm" onPress={() => void startSession()}>
                    {t('session.btnStart')}
                  </Button>
                )
              }
            >
            <NcFieldLabel htmlFor={`${idPrefix}-nc-mode`}>{t('session.fieldMode')}</NcFieldLabel>
            <Select
              fullWidth
              variant="secondary"
              selectedKey={mode}
              onSelectionChange={(k) => {
                if (k != null) setMode(k as SessionMode)
              }}
              isDisabled={sessionRunning}
              className="mb-1.5"
            >
              <Select.Trigger id={`${idPrefix}-nc-mode`} className="min-h-8 w-full text-xs sm:min-h-9">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover placement="bottom start" className={LB_POPOVER}>
                <ListBox className={LB_LIST}>
                  <ListBox.Item id="tcp_server" textValue={t('mode.tcpServer')} className="text-xs">
                    {t('mode.tcpServer')}
                  </ListBox.Item>
                  <ListBox.Item id="tcp_client" textValue={t('mode.tcpClient')} className="text-xs">
                    {t('mode.tcpClient')}
                  </ListBox.Item>
                  <ListBox.Item id="udp_server" textValue={t('mode.udpServer')} className="text-xs">
                    {t('mode.udpServer')}
                  </ListBox.Item>
                  <ListBox.Item id="udp_client" textValue={t('mode.udpClient')} className="text-xs">
                    {t('mode.udpClient')}
                  </ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>

            {showTcpRemoteHost ? (
              <>
                <NcFieldLabel htmlFor={`${idPrefix}-nc-rhost`}>{t('session.fieldRemoteHost')}</NcFieldLabel>
                <Input
                  id={`${idPrefix}-nc-rhost`}
                  value={remoteHost}
                  disabled={sessionRunning}
                  onChange={(e) => setRemoteHost(e.target.value)}
                  variant="secondary"
                  className="mb-1.5 min-h-8 font-mono text-xs"
                />
              </>
            ) : null}

            {showLocalBind ? (
              <>
                <NcFieldLabel htmlFor={`${idPrefix}-nc-bind`}>{t('session.fieldBind')}</NcFieldLabel>
                <Select
                  fullWidth
                  variant="secondary"
                  selectedKey={bind}
                  onSelectionChange={(k) => {
                    if (k != null) setBind(String(k))
                  }}
                  isDisabled={sessionRunning}
                  className="mb-1.5"
                >
                  <Select.Trigger id={`${idPrefix}-nc-bind`} className="min-h-8 w-full font-mono text-xs sm:min-h-9">
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover placement="bottom start" className={LB_POPOVER}>
                    <ListBox className={LB_LIST}>
                      {BIND_PRESETS.map((b) => (
                        <ListBox.Item key={b} id={b} textValue={b} className="font-mono text-xs">
                          {b}
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </>
            ) : null}

            {showLocalPort ? (
              <>
                <NcFieldLabel htmlFor={`${idPrefix}-nc-port`}>
                  {mode === 'tcp_client' ? t('session.fieldLocalPortClient') : t('session.fieldLocalPort')}
                </NcFieldLabel>
                <Input
                  id={`${idPrefix}-nc-port`}
                  value={port}
                  disabled={sessionRunning}
                  onChange={(e) => setPort(e.target.value)}
                  variant="secondary"
                  className="mb-1.5 min-h-8 font-mono text-xs"
                />
              </>
            ) : null}

            </NcConfigCard>

            {mode === 'udp_client' ? (
              <NcUdpTargetCard
                idPrefix={idPrefix}
                t={t}
                sessionRunning={sessionRunning}
                kind={udpTargetKind}
                onKind={setUdpTargetKind}
                remoteHost={remoteHost}
                remotePort={remotePort}
                onWireChange={(v) => {
                  const { host, port } = splitHostPortLast(v)
                  setRemoteHost(host)
                  setRemotePort(port)
                }}
                groups={udpMulticastGroups}
                onGroupsChange={setUdpMulticastGroups}
              />
            ) : null}

            <NcConfigCard title={t('session.cardRx')}>
            <NcEncodingToggle ascii={recvAscii} onAscii={() => setRecvAscii(true)} onHex={() => setRecvAscii(false)} />
            <NcCheckboxRow checked={showAsLog} onChange={setShowAsLog} label={t('session.recvShowLog')} />
            <NcCheckboxRow checked={wrapRecv} onChange={setWrapRecv} label={t('session.recvWrap')} />
            <NcCheckboxRow checked={hideRecv} onChange={setHideRecv} label={t('session.recvHide')} />
            <NcCheckboxRow checked={autoScroll} onChange={setAutoScroll} label={t('session.recvScroll')} />
            </NcConfigCard>

            <NcConfigCard title={t('session.cardTx')}>
            <NcEncodingToggle ascii={sendAscii} onAscii={() => setSendAscii(true)} onHex={() => setSendAscii(false)} />
            <NcCheckboxRow checked={parseEscapes} onChange={setParseEscapes} label={t('session.sendParseEscapes')} />
            <NcCheckboxRow checked={loopSend} onChange={setLoopSend} label={t('session.sendLoop')} />
            <div className="mt-1 flex flex-wrap items-end gap-2">
              <div className="min-w-0 w-full flex-1 sm:min-w-[10rem] sm:max-w-[14rem]">
                <NcFieldLabel htmlFor={`${idPrefix}-loop-preset`}>{t('session.loopPreset')}</NcFieldLabel>
                <Select
                  fullWidth
                  variant="secondary"
                  selectedKey={loopPresetId}
                  onSelectionChange={(k) => {
                    if (k != null) setLoopPresetId(String(k))
                  }}
                  isDisabled={!loopSend}
                  className="text-xs"
                >
                  <Select.Trigger id={`${idPrefix}-loop-preset`} className="min-h-8 w-full font-mono text-xs sm:min-h-9">
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover placement="bottom start" className={LB_POPOVER}>
                    <ListBox className={LB_LIST} aria-label={t('session.loopPreset')}>
                      {sendPresets.map((sp, i) => (
                        <ListBox.Item
                          key={sp.id}
                          id={sp.id}
                          textValue={sp.title.trim() || `#${i + 1}`}
                          className="font-mono text-xs"
                        >
                          {sp.title.trim() || `#${i + 1}`}
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>
              <Input
                value={loopMs}
                onChange={(e) => setLoopMs(e.target.value)}
                disabled={!loopSend}
                variant="secondary"
                className="h-8 w-16 shrink-0 text-right font-mono text-xs"
                aria-label={t('session.loopMsAria')}
              />
              <span className="shrink-0 pb-2 text-default-500 sm:pb-0">ms</span>
            </div>
            </NcConfigCard>
              </Card.Content>
            </Card>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
            <Card className="flex min-h-0 flex-1 flex-col rounded-none border-0 bg-transparent shadow-none">
              <Card.Header className="flex min-h-9 shrink-0 flex-row flex-wrap items-center gap-x-2 gap-y-1 border-b border-divider bg-content1 px-2 py-1 sm:min-h-10 sm:px-3 sm:py-1.5">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Text size="sm" className="shrink-0 font-semibold text-default-700">
                    {t('session.output')}
                  </Text>
                  <Separator orientation="vertical" className="hidden h-4 self-center sm:block" />
                  <Text
                    size="sm"
                    variant="muted"
                    className="min-w-0 truncate font-mono text-[11px] text-default-500"
                    title={logAddr}
                  >
                    {logAddr}
                  </Text>
                </div>
                <span className="flex shrink-0 items-center gap-0.5 border-default-200 sm:border-l sm:pl-2">
                  <Button isIconOnly size="sm" variant="ghost" aria-label={t('session.exportLog')} onPress={exportLog} className="text-default-400">
                    <Download size={15} />
                  </Button>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    aria-label={t('session.importLog')}
                    onPress={() => fileImportRef.current?.click()}
                    className="text-default-400"
                  >
                    <Upload size={15} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-7 px-1.5 text-[10px] text-default-400"
                    aria-label={t('session.defaultsAria')}
                    onPress={resetUiDefaults}
                  >
                    {t('session.defaults')}
                  </Button>
                  <span
                    className={`ml-0.5 h-1.5 w-1.5 shrink-0 rounded-full sm:ml-1 sm:h-2 sm:w-2 ${sessionRunning ? 'bg-success shadow-sm shadow-success/30' : 'bg-default-400'}`}
                  />
                  <span className={sessionRunning ? 'font-mono text-[10px] font-medium text-success sm:text-xs' : 'font-mono text-[10px] text-default-600 sm:text-xs'}>
                    {sessionRunning ? 'RUN' : 'OFF'}
                  </span>
                </span>
              </Card.Header>
              <div
                ref={logRef}
                className={`nc-selectable nc-scroll min-h-0 flex-1 overflow-auto border-l-2 border-l-default-200 bg-default-50/80 px-2 py-2 pl-2.5 font-mono text-xs leading-5 text-default-700 selection:bg-primary/15 sm:px-3 sm:py-2.5 sm:pl-3 ${
                  wrapRecv ? 'whitespace-pre-wrap' : 'whitespace-pre'
                }`}
              >
                {lines.map((l, i) => {
                  if (hideRecv && l.kind === 'recv') return null
                  return (
                    <div
                      key={`${l.ts}-${i}-${l.kind}`}
                      className="mb-0.5 rounded-sm border border-transparent px-0.5 hover:border-divider hover:bg-default-100/60"
                    >
                      <span className="text-default-400">[{l.ts}]</span>{' '}
                      <span className={kindClass(l.kind)}>{l.line}</span>
                    </div>
                  )
                })}
              </div>
            </Card>

            <Separator className="bg-divider" />

            <div className="flex shrink-0 flex-col gap-2 border-t border-divider bg-content1 p-2 sm:gap-2.5 sm:p-3">
            <div className="flex flex-wrap items-end gap-2 text-xs">
              <div className="min-w-0 max-w-[min(100%,14rem)] flex-1 sm:max-w-none">
                <NcFieldLabel htmlFor={`${idPrefix}-tx-target`}>{t('session.fieldTarget')}</NcFieldLabel>
                <Select
                  fullWidth
                  variant="secondary"
                  aria-label={t('session.sendTarget')}
                  selectedKey={sendTarget}
                  onSelectionChange={(k) => {
                    if (k != null) setSendTarget(String(k))
                  }}
                  className="text-xs"
                >
                  <Select.Trigger id={`${idPrefix}-tx-target`} className="min-h-8 w-full font-mono text-xs sm:min-h-9">
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover placement="bottom start" className={LB_POPOVER}>
                    <ListBox className={LB_LIST}>
                      <ListBox.Item
                        id="all"
                        textValue={`${t('session.allTargets')} (${clients.length})`}
                        className="text-xs"
                      >
                        {t('session.allTargets')} ({clients.length})
                      </ListBox.Item>
                      {clients.map((c) => (
                        <ListBox.Item
                          key={c.id}
                          id={String(c.id)}
                          textValue={`#${c.id} ${c.peer}`}
                          className="text-xs"
                        >
                          #{c.id} {c.peer}
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>
              <Button
                size="sm"
                variant="outline"
                isDisabled={!sessionRunning}
                onPress={() => void disconnect()}
                className="shrink-0"
              >
                {t('session.disconnect')}
              </Button>
              <Button isIconOnly size="sm" variant="ghost" aria-label={t('session.clearLog')} onPress={clearLog} className="text-default-400">
                <Eraser size={16} />
              </Button>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label={t('session.clearPresetBodies')}
                onPress={() => setSendPresets((ps) => ps.map((p) => ({ ...p, body: '' })))}
                className="text-default-400"
              >
                <Trash2 size={16} />
              </Button>
            </div>
            <div className="flex min-h-0 flex-col gap-2">
              <NcFieldLabel htmlFor={`${idPrefix}-preset-0`}>{t('session.sendPresetsSection')}</NcFieldLabel>
              <div className="nc-scroll flex max-h-[min(42vh,24rem)] flex-col gap-2.5 overflow-y-auto pr-0.5">
                {sendPresets.map((p, i) => (
                  <div
                    key={p.id}
                    className="flex gap-2 rounded-lg border border-divider/70 bg-default-50/60 p-2 dark:bg-default-100/10"
                  >
                    <Button
                      isIconOnly
                      variant="ghost"
                      size="sm"
                      isDisabled={!canSendFinal}
                      aria-label={t('session.playSend')}
                      className="mt-0.5 h-9 w-9 shrink-0 text-success hover:bg-success/15"
                      onPress={() => void sendPresetById(p.id)}
                    >
                      <Play size={18} strokeWidth={2.25} className="translate-x-px" />
                    </Button>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="shrink-0 select-none font-mono text-xs text-warning-600/90 dark:text-warning-400/90">
                          ###
                        </span>
                        <Input
                          value={p.title}
                          disabled={sessionRunning}
                          onChange={(e) => {
                            const v = e.target.value
                            setSendPresets((ps) => ps.map((x) => (x.id === p.id ? { ...x, title: v } : x)))
                          }}
                          variant="secondary"
                          placeholder={t('session.presetTitlePlaceholder')}
                          className="min-h-8 flex-1 border-transparent bg-transparent font-mono text-xs text-warning-700/95 dark:text-warning-300/90"
                        />
                        {sendPresets.length > 1 ? (
                          <Button
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            isDisabled={sessionRunning}
                            aria-label={t('session.removePreset')}
                            className="shrink-0 text-default-400 hover:text-danger"
                            onPress={() =>
                              setSendPresets((ps) => {
                                if (ps.length <= 1) return ps
                                return ps.filter((x) => x.id !== p.id)
                              })
                            }
                          >
                            <Trash2 size={14} />
                          </Button>
                        ) : null}
                      </div>
                      <TextArea
                        id={i === 0 ? `${idPrefix}-preset-0` : undefined}
                        value={p.body}
                        disabled={sessionRunning}
                        onChange={(e) => {
                          const v = e.target.value
                          setSendPresets((ps) => ps.map((x) => (x.id === p.id ? { ...x, body: v } : x)))
                        }}
                        variant="secondary"
                        className="nc-selectable min-h-[4.5rem] resize-y font-mono text-xs leading-relaxed"
                        placeholder={t('session.payloadPlaceholder')}
                      />
                    </div>
                  </div>
                ))}
                <Button
                  fullWidth
                  variant="outline"
                  size="sm"
                  isDisabled={sessionRunning}
                  className="border-dashed border-default-400/50 text-default-600"
                  onPress={() =>
                    setSendPresets((ps) => [...ps, { id: newSendPresetId(), title: '', body: '' }])
                  }
                >
                  <Plus size={14} className="mr-1 shrink-0" />
                  {t('session.addPreset')}
                </Button>
              </div>
            </div>
            {err ? (
              <Text size="sm" variant="danger">
                {err}
              </Text>
            ) : null}
            <div className="flex flex-col gap-2 border-t border-divider bg-default-100/30 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[10px] text-default-600 tabular-nums sm:flex sm:flex-wrap sm:text-[11px]">
                <span>
                  <span className="text-default-400">rx_pkt</span> {stats.rx_pkts}
                </span>
                <span>
                  <span className="text-default-400">tx_pkt</span> {stats.tx_pkts}
                </span>
                <span>
                  <span className="text-default-400">rx_byte</span> {stats.rx_bytes}
                </span>
                <span>
                  <span className="text-default-400">tx_byte</span> {stats.tx_bytes}
                </span>
              </div>
              <Button size="sm" variant="ghost" className="min-h-7 self-start font-mono text-[10px] text-default-500 sm:self-auto sm:text-[11px]" onPress={() => void resetStats()}>
                {t('session.resetStats')}
              </Button>
            </div>
            </div>
          </div>
        </div>
      </Surface>
      <input ref={fileImportRef} type="file" accept=".json,application/json" className="hidden" onChange={onImportFile} />
    </div>
  )
}

