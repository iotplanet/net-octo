import {
  Button,
  Card,
  Chip,
  Input,
  ListBox,
  Select,
  Text,
} from '@heroui/react'
import { invoke } from '@tauri-apps/api/core'
import type { UnlistenFn } from '@tauri-apps/api/event'
import {
  Antenna,
  ArrowRight,
  Download,
  FileArchive,
  Filter,
  History,
  Play,
  Plus,
  Radio,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n, type Translate } from '../i18n'
import {
  clampCenterSplitRatio,
  defaultSettings,
  effectiveRecvEncoding,
  effectiveSendEncoding,
  loadSettings,
  type PersistedSettings,
  type RecvEncoding,
  recvIsAscii,
  recvIsUtf8,
  type SendEncoding,
  type SendPreset,
  sendIsAscii,
  sendIsHex,
  sendIsUtf8,
  type SessionMode,
  type UdpTargetKind,
  saveSettings,
} from './persist'
import { TcpLinkConfigCard } from './TcpLinkConfigCard'
import { NcCheckboxRow, NcConfigCard, NcFieldLabel } from './sharedUi'
import {
  isTcpClientLinkUp,
  linkStatusVisual,
  parseNcTcpLinkPayload,
  TCP_LINK_IDLE,
  tcpClientLinkInvokeFields,
  tcpHeartbeatLabel,
  tcpHeartbeatVisual,
  tcpLinkFromPersist,
  tcpLinkPhaseLabel,
  tcpLinkToPersistSlice,
  type TcpLinkState,
} from './tcpLink'
import { useVerticalSplitDrag } from './useVerticalSplit'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import {
  compactHexUpper,
  decodeUtf8FromHex,
  encodeUtf8ToHex,
  extractAsciiPayloadFromEditor,
  extractHexPayloadFromEditor,
  extractUtf8PayloadFromEditor,
  formatHexEditorBody,
  isCompleteHexPayload,
} from './hexInput'
import { expandVariables, getVarCounter, resetVarCounter } from './varSub'
import { exportPcap } from './pcap'
import { useSessionEditorBridge } from './sessionEditorBridge'
import {
  EDITOR_COMMENT_CLASS,
  EDITOR_PAYLOAD_CLASS,
  LB_LIST,
  LB_POPOVER,
  NC_INPUT,
  NC_SELECT_TRIGGER,
  NC_SELECT_TRIGGER_SM,
} from './themeClasses'

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

function useInterfaces() {
  const [ifaces, setIfaces] = useState<string[]>([])
  useEffect(() => {
    invoke<string[]>('nc_list_interfaces').then(setIfaces).catch(() => {})
  }, [])
  return ifaces
}

/** 报文编辑器：仅行首（可含前导空白）的 // 起为注释；发送剥离仍以 hexInput 为准 */
function messageEditorLineHighlight(line: string): ReactNode {
  const leading = /^\s*/.exec(line)?.[0] ?? ''
  const afterLeading = line.slice(leading.length)
  if (!afterLeading.startsWith('//')) {
    return <span className={EDITOR_PAYLOAD_CLASS}>{line}</span>
  }
  return (
    <>
      <span className={EDITOR_PAYLOAD_CLASS}>{leading}</span>
      <span className={EDITOR_COMMENT_CLASS}>{afterLeading}</span>
    </>
  )
}

function messageEditorHighlightTree(text: string): ReactNode {
  if (text.length === 0) return null
  const lines = text.split('\n')
  let offset = 0
  return lines.map((line, i) => {
    const key = `hl-${offset}`
    const node = (
      <Fragment key={key}>
        {i > 0 ? '\n' : null}
        {messageEditorLineHighlight(line)}
      </Fragment>
    )
    offset += line.length + (i < lines.length - 1 ? 1 : 0)
    return node
  })
}
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

function logBadgeForKind(kind: string): { label: string; className: string } {
  switch (kind) {
    case 'recv':
      return {
        label: 'RX',
        className: 'text-[#17c964] bg-[#17c964]/10 border border-[#17c964]/20',
      }
    case 'send':
    case 'send-data':
      return {
        label: 'TX',
        className: 'text-[#5EA2EF] bg-[#006FEE]/10 border border-[#006FEE]/20',
      }
    case 'server':
      return { label: 'SRV', className: 'text-violet-300 bg-violet-500/10 border border-violet-500/25' }
    case 'error':
      return { label: 'ERR', className: 'text-red-400 bg-red-500/10 border border-red-500/25' }
    case 'info':
      return { label: 'INF', className: 'text-sky-300 bg-sky-500/10 border border-sky-500/25' }
    default:
      return { label: 'LOG', className: 'text-[var(--nc-text-label)] bg-[var(--nc-bg-elevated)] border border-[rgb(var(--nc-border-default)/0.5)]' }
  }
}

function highlightMatches(text: string, search: string): ReactNode {
  if (!search) return text
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === search.toLowerCase()
          ? <mark key={i} className="nc-highlight-match rounded-sm px-0.5">{part}</mark>
          : part
      )}
    </>
  )
}

function formatSessionTabTitle(
  mode: SessionMode,
  running: boolean,
  localPort: string,
  idleLabel: string,
  reconnectingLabel?: string,
): string {
  const prefix =
    mode === 'tcp_server'
      ? 'TCP-S'
      : mode === 'tcp_client'
        ? 'TCP-C'
        : mode === 'udp_server'
          ? 'UDP-S'
          : 'UDP-C'
  if (reconnectingLabel) return `${prefix} (${reconnectingLabel})`
  return running ? `${prefix} :${localPort}` : `${prefix} (${idleLabel})`
}

function encodingButton(label: string, active: boolean, onClick: () => void, compact?: boolean) {
  return (
    <button
      type="button"
      className={`${compact ? 'rounded px-2 py-0.5 text-[10px]' : 'flex-1 rounded-md py-1 text-xs'} font-medium transition-all ${
        active ? 'nc-encoding-btn-active' : 'nc-encoding-btn'
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function NcEncodingToggle({
  encoding,
  onChange,
  compact,
}: {
  encoding: SendEncoding | RecvEncoding
  onChange: (e: SendEncoding | RecvEncoding) => void
  compact?: boolean
}) {
  return (
    <div className={`nc-encoding-toggle flex ${compact ? '' : 'w-full'} ${compact ? '' : 'shadow-inner'}`}>
      {encodingButton('ASCII', encoding === 'ascii', () => onChange('ascii'), compact)}
      {encodingButton('HEX', encoding === 'hex', () => onChange('hex'), compact)}
      {encodingButton('UTF-8', encoding === 'utf8', () => onChange('utf8'), compact)}
    </div>
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
    <Card className="relative overflow-visible rounded-xl border nc-border bg-[var(--nc-bg-surface)] text-[var(--nc-text-primary)] shadow-sm">
      <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2">
        <Chip
          size="sm"
          variant="soft"
          className="pointer-events-auto border border-[rgb(var(--nc-border-default)/0.6)] bg-[var(--nc-bg-elevated)] shadow-sm"
        >
          <Chip.Label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--nc-text-label)]">
            {t('session.udpTargetTitle')}
          </Chip.Label>
        </Chip>
      </div>
      <Card.Content className="flex flex-col gap-3 px-2.5 pb-3 pt-4 sm:px-3 sm:pb-3.5">
        <div className="flex justify-center rounded-full border border-[rgb(var(--nc-border-default)/0.4)] bg-[var(--nc-bg-elevated)] p-0.5">
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
        <Text type="body-xs" className="text-center leading-snug text-[var(--nc-text-muted)]">
          {hint}
        </Text>
        {kind === 'multicast' ? (
          <>
            <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--nc-text-muted)]">
              <span>{t('session.udpMulticastGroups')}</span>
              <span className="font-mono tabular-nums text-[var(--nc-text-label)]">{nonEmptyGroups.length}</span>
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
                    className={`min-h-8 flex-1 ${NC_INPUT}`}
                    aria-label={t('session.udpMulticastGroupPlaceholder')}
                  />
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    isDisabled={sessionRunning}
                    aria-label={t('session.udpMulticastRemove')}
                    className="shrink-0 text-[var(--nc-text-muted)] hover:text-red-400"
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
              className="border-dashed border-[rgb(var(--nc-border-default)/0.65)] text-[var(--nc-text-body)] hover:bg-[var(--nc-bg-elevated)]"
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
              className={NC_INPUT}
            />
          </>
        )}
      </Card.Content>
    </Card>
  )
}

export interface NetOctoSessionProps {
  sessionId: string
  webviewLabel: string
  active: boolean
  onTabMeta?: (id: string, meta: { running: boolean; tabTitle: string; hasUnread?: boolean }) => void
}

interface SendHistoryItem {
  id: string
  ts: string
  mode: 'HEX' | 'ASCII' | 'UTF-8'
  preview: string
  payload: string
}

export function NetOctoSession({ sessionId, webviewLabel, active, onTabMeta }: NetOctoSessionProps) {
  const { t } = useI18n()
  const { register, unregister } = useSessionEditorBridge()
  const idPrefix = useMemo(() => sessionId.replace(/[^a-zA-Z0-9_-]/g, '_'), [sessionId])
  const persisted = useRef(loadSettings(sessionId))
  const interfaces = useInterfaces()
  const bindOptions = useMemo(() => {
    const seen = new Set(BIND_PRESETS)
    const extras = interfaces.filter((ip) => !seen.has(ip))
    return [...BIND_PRESETS, ...extras]
  }, [interfaces])
  const [mode, setMode] = useState<SessionMode>(persisted.current.mode)
  const [bind, setBind] = useState(persisted.current.bind)
  const [port, setPort] = useState(persisted.current.port)
  const [remoteHost, setRemoteHost] = useState(persisted.current.remoteHost)
  const [remotePort, setRemotePort] = useState(persisted.current.remotePort)
  const [udpTargetKind, setUdpTargetKind] = useState<UdpTargetKind>(persisted.current.udpTargetKind ?? 'unicast')
  const [udpMulticastGroups, setUdpMulticastGroups] = useState<string[]>(() =>
    persisted.current.udpMulticastGroups?.length ? [...persisted.current.udpMulticastGroups] : [],
  )
  const [, bumpCounter] = useState(0)
  const [recvEncoding, setRecvEncoding] = useState<RecvEncoding>(() => effectiveRecvEncoding(persisted.current))
  const [showAsLog, setShowAsLog] = useState(persisted.current.showAsLog)
  const [wrapRecv, setWrapRecv] = useState(persisted.current.wrapRecv)
  const [hideRecv, setHideRecv] = useState(persisted.current.hideRecv)
  const [autoScroll, setAutoScroll] = useState(persisted.current.autoScroll)
  const [centerSplitRatio, setCenterSplitRatio] = useState(() =>
    clampCenterSplitRatio(persisted.current.centerSplitRatio ?? defaultSettings.centerSplitRatio ?? 0.5),
  )

  const { containerRef: centerSplitRef, logPaneStyle, editorPaneStyle, separatorProps } = useVerticalSplitDrag(
    centerSplitRatio,
    setCenterSplitRatio,
  )

  const [sendEncoding, setSendEncoding] = useState<SendEncoding>(() => effectiveSendEncoding(persisted.current))
  const [parseEscapes, setParseEscapes] = useState(persisted.current.parseEscapes)
  const [loopSend, setLoopSend] = useState(persisted.current.loopSend)
  const [loopMs, setLoopMs] = useState(persisted.current.loopMs)

  const [tcpUseTls, setTcpUseTls] = useState(persisted.current.tcpUseTls ?? false)
  const [tcpLinkUi, setTcpLinkUi] = useState(() => tcpLinkFromPersist(persisted.current))
  const [tcpLink, setTcpLink] = useState<TcpLinkState>(TCP_LINK_IDLE)
  const patchTcpLinkUi = useCallback(
    (patch: Partial<typeof tcpLinkUi>) => setTcpLinkUi((s) => ({ ...s, ...patch })),
    [],
  )

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

  const [sendHistory, setSendHistory] = useState<SendHistoryItem[]>([])
  const [showSendHistory, setShowSendHistory] = useState(false)
  const [logSearch, setLogSearch] = useState('')
  const [logSearchVisible, setLogSearchVisible] = useState(false)
  const logSearchInputRef = useRef<HTMLInputElement>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; line: LogLine } | null>(null)

  const logRef = useRef<HTMLDivElement>(null)
  const loopRef = useRef<number | null>(null)
  const fileImportRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const lineGutterInnerRef = useRef<HTMLDivElement>(null)
  const editorHighlightInnerRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<number | null>(null)

  const sendRef = useRef({
    sendTarget,
    sendPresets,
    loopPresetId,
    sendEncoding,
    parseEscapes,
  })
  sendRef.current = { sendTarget, sendPresets, loopPresetId, sendEncoding, parseEscapes }

  const recvRef = useRef(recvEncoding)
  recvRef.current = recvEncoding
  const hasUnread = useRef(false)
  const activeRef = useRef(active)
  activeRef.current = active

  const loopPresetBody = useMemo(
    () => sendPresets.find((p) => p.id === loopPresetId)?.body ?? '',
    [sendPresets, loopPresetId],
  )

  const editorLineCount = useMemo(() => Math.max(1, (loopPresetBody.match(/\n/g)?.length ?? 0) + 1), [loopPresetBody])
  const editorLineNumbers = useMemo(
    () => Array.from({ length: Math.max(8, editorLineCount) }, (_, i) => i + 1),
    [editorLineCount],
  )

  const editorHighlightTree = useMemo(() => messageEditorHighlightTree(loopPresetBody), [loopPresetBody])

  const filteredLines = useMemo(() => {
    if (!logSearch) return null
    const q = logSearch.toLowerCase()
    return lines.filter((l) => l.line.toLowerCase().includes(q))
  }, [lines, logSearch])

  const appendToEditor = useCallback(
    (fragment: string) => {
      setSendPresets((ps) =>
        ps.map((p) => {
          if (p.id !== loopPresetId) return p
          const prev = p.body
          const trimmed = fragment.trim()
          if (!trimmed) return p
          const needsSep = prev.length > 0 && !/\s$/.test(prev)
          const merged = needsSep ? `${prev} ${trimmed}` : `${prev}${trimmed}`
          return {
            ...p,
            body: sendIsAscii(sendEncoding) ? merged : formatHexEditorBody(merged),
          }
        }),
      )
    },
    [loopPresetId, sendEncoding],
  )

  useEffect(() => {
    if (!active) return
    register(sessionId, { appendToEditor })
    return () => unregister(sessionId)
  }, [active, sessionId, register, unregister, appendToEditor])

  const appendLine = useCallback((l: LogLine) => {
    if (!activeRef.current) hasUnread.current = true
    setLines((prev) => {
      if (!showAsLog && l.kind === 'recv') return prev
      const line = (recvIsUtf8(recvRef.current) && l.kind === 'recv')
        ? decodeUtf8FromHex(l.line)
        : l.line
      const next = [...prev, { ...l, line }]
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
      recvEncoding,
      sendEncoding,
      recvAscii: recvIsAscii(recvEncoding),
      sendAscii: sendIsAscii(sendEncoding),
      parseEscapes,
      loopSend,
      loopMs,
      showAsLog,
      wrapRecv,
      hideRecv,
      autoScroll,
      sendPresets,
      loopPresetId,
      centerSplitRatio,
      tcpUseTls,
      ...tcpLinkToPersistSlice(tcpLinkUi),
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
    recvEncoding,
    sendEncoding,
    parseEscapes,
    loopSend,
    loopMs,
    showAsLog,
    wrapRecv,
    hideRecv,
    autoScroll,
    sendPresets,
    loopPresetId,
    centerSplitRatio,
    tcpUseTls,
    tcpLinkUi,
  ])

  useEffect(() => {
    if (!sendPresets.some((p) => p.id === loopPresetId)) {
      setLoopPresetId(sendPresets[0]?.id ?? '')
    }
  }, [sendPresets, loopPresetId])

  useEffect(() => {
    if (sendIsHex(sendEncoding)) {
      setSendPresets((ps) =>
        ps.map((p) =>
          p.id === loopPresetId ? { ...p, body: formatHexEditorBody(p.body) } : p,
        ),
      )
    }
  }, [sendEncoding, loopPresetId])

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
        if (!e.payload.running) {
          setClients([])
          setActiveMode('idle')
          setTcpLink(TCP_LINK_IDLE)
          return
        }
        const m = e.payload.mode
        if (m === 'tcp_server' || m === 'tcp_client' || m === 'udp_server' || m === 'udp_client') {
          setActiveMode(m)
        }
      })
      if (dead.v) {
        u4()
        return
      }
      unlisteners.push(u4)
      const u5 = await w.listen<{
        sessionId: string
        phase: string
        attempt: number
        maxAttempts: number
        nextRetryMs: number
        heartbeat: string
      }>('nc-tcp-link', (e) => {
        if (e.payload.sessionId !== sessionId) return
        setTcpLink(parseNcTcpLinkPayload(e.payload))
      })
      if (dead.v) {
        u5()
        return
      }
      unlisteners.push(u5)
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

  const showAllSendTargets = mode === 'tcp_server' || mode === 'udp_server'

  useEffect(() => {
    if (mode === 'tcp_client') {
      if (clients.length === 0) {
        if (sendTarget !== '') setSendTarget('')
        return
      }
      const firstId = String(clients[0].id)
      if (sendTarget === 'all' || !clients.some((c) => String(c.id) === sendTarget)) {
        setSendTarget(firstId)
      }
      return
    }
    if (sendTarget === 'all') return
    if (!clients.some((c) => String(c.id) === sendTarget)) setSendTarget('all')
  }, [mode, clients, sendTarget])

  const tabMode = sessionRunning && activeMode !== 'idle' ? activeMode : mode
  const tcpClientActive = tabMode === 'tcp_client' && sessionRunning
  const tcpReconnecting = tcpClientActive && tcpLink.phase === 'reconnecting'
  const sessionConnected =
    sessionRunning &&
    (tabMode !== 'tcp_client' || isTcpClientLinkUp(sessionRunning, tcpLink.phase, clients.length))
  const tabTitle = formatSessionTabTitle(
    tabMode,
    sessionConnected,
    port,
    tcpClientActive && clients.length === 0 && !tcpReconnecting
      ? t('session.tabDisconnected')
      : t('session.tabIdle'),
    tcpReconnecting ? t('session.tabReconnecting') : undefined,
  )
  const linkVisual = linkStatusVisual({
    tcpClientActive,
    phase: tcpLink.phase,
    connected: sessionConnected,
  })
  const linkStatusLabel = tcpClientActive
    ? tcpLinkPhaseLabel(t, tcpLink.phase)
    : sessionConnected
      ? 'CONNECTED'
      : 'DISCONNECTED'
  const hbVisual = tcpHeartbeatVisual(tcpLink.heartbeat)
  const tabRunning = sessionRunning && (tabMode !== 'tcp_client' || sessionConnected || tcpReconnecting)
  useEffect(() => {
    onTabMeta?.(sessionId, { running: tabRunning, tabTitle, hasUnread: hasUnread.current })
  }, [sessionId, onTabMeta, tabRunning, tabTitle])

  useEffect(() => {
    if (active) hasUnread.current = false
  }, [active])

  const canSendLoop = sessionRunning && (mode === 'udp_client' || clients.length > 0)

  const sendTargetForInvoke =
    mode === 'tcp_client' && clients.length > 0 ? String(clients[0].id) : sendTarget

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
      const raw =
        r.sendPresets.find((p) => p.id === r.loopPresetId)?.body ?? r.sendPresets[0]?.body ?? ''
      const expanded = expandVariables(raw)
      let data: string
      let sendHex: boolean
      if (sendIsUtf8(r.sendEncoding)) {
        data = encodeUtf8ToHex(extractUtf8PayloadFromEditor(expanded))
        if (!data) return
        sendHex = true
      } else if (sendIsAscii(r.sendEncoding)) {
        data = extractAsciiPayloadFromEditor(expanded)
        if (!data) return
        sendHex = false
      } else {
        data = extractHexPayloadFromEditor(expanded)
        const hex = compactHexUpper(data)
        if (hex.length === 0 || hex.length % 2 !== 0) return
        sendHex = true
      }
      void invoke('nc_send', {
        sessionId,
        webviewLabel,
        target: mode === 'tcp_client' && clients.length > 0 ? String(clients[0].id) : r.sendTarget,
        data,
        sendHex,
        parseEscapes: sendIsAscii(r.sendEncoding) && r.parseEscapes,
      }).then(() => bumpCounter((n) => n + 1)).catch((e) => setErr(String(e)))
    }, ms)
    return () => {
      if (loopRef.current) globalThis.clearInterval(loopRef.current)
      loopRef.current = null
    }
  }, [loopSend, loopMs, canSendLoop, sessionId, webviewLabel, mode, clients.length])

  const startSession = async () => {
    setErr(null)
    const recvHex = !recvIsAscii(recvEncoding)
    const base = { sessionId, webviewLabel }
    try {
      if (mode === 'tcp_server') {
        const p = Number.parseInt(port, 10)
        if (Number.isNaN(p) || p < 1 || p > 65535) {
          setErr(t('err.portRange'))
          return
        }
        await invoke('nc_start_session', {
          params: { ...base, mode: 'tcp_server', bind, port: p, recvHex, useTls: tcpUseTls },
        })
      } else if (mode === 'tcp_client') {
        const p = Number.parseInt(port, 10)
        if (Number.isNaN(p) || p < 1 || p > 65535) {
          setErr(t('err.portRange'))
          return
        }
        await invoke('nc_start_session', {
          params: {
            ...base,
            mode: 'tcp_client',
            host: remoteHost,
            port: p,
            recvHex,
            useTls: tcpUseTls,
            ...tcpClientLinkInvokeFields(tcpLinkUi),
          },
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

  const invokeSendPayload = useCallback(
    async (rawFragment: string) => {
      setErr(null)
      const expanded = expandVariables(rawFragment)
      let data: string
      let sendHex: boolean
      if (sendIsUtf8(sendEncoding)) {
        const text = extractUtf8PayloadFromEditor(expanded)
        if (!text) { setErr(t('err.sendEmpty')); return }
        data = encodeUtf8ToHex(text)
        sendHex = true
      } else if (sendIsAscii(sendEncoding)) {
        data = extractAsciiPayloadFromEditor(expanded)
        if (!data) { setErr(t('err.sendEmpty')); return }
        sendHex = false
      } else {
        data = extractHexPayloadFromEditor(expanded)
        const hex = compactHexUpper(data)
        if (hex.length === 0) { setErr(t('err.sendEmpty')); return }
        if (!isCompleteHexPayload(data)) { setErr(t('err.hexIncomplete')); return }
        sendHex = true
      }
      try {
        await invoke('nc_send', {
          sessionId,
          webviewLabel,
          target: sendTargetForInvoke,
          data,
          sendHex,
          parseEscapes: sendIsAscii(sendEncoding) && parseEscapes,
        })
        const now = new Date()
        const ts = now.toLocaleTimeString(undefined, { hour12: false })
        const oneLine = data.replace(/\r?\n/g, ' ')
        const preview = oneLine.length > 56 ? `${oneLine.slice(0, 53)}…` : oneLine
        const modeLabel = sendIsUtf8(sendEncoding) ? 'UTF-8' : sendIsAscii(sendEncoding) ? 'ASCII' : 'HEX'
        setSendHistory((prev) => {
          const item: SendHistoryItem = {
            id: globalThis.crypto?.randomUUID?.() ?? `h-${Date.now()}`,
            ts,
            mode: modeLabel,
            preview,
            payload: data,
          }
          return [item, ...prev].slice(0, 80)
        })
        bumpCounter((n) => n + 1)
      } catch (e) {
        setErr(String(e))
      }
    },
    [sendEncoding, parseEscapes, sessionId, webviewLabel, sendTargetForInvoke, t],
  )

  const sendPresetById = useCallback(
    async (presetId: string) => {
      const raw = sendPresets.find((p) => p.id === presetId)?.body ?? ''
      await invokeSendPayload(raw)
    },
    [sendPresets, invokeSendPayload],
  )

  const sendEditorSelectionOrDocument = useCallback(async () => {
    const el = editorRef.current
    if (el && el.selectionStart !== el.selectionEnd) {
      await invokeSendPayload(el.value.slice(el.selectionStart, el.selectionEnd))
    } else {
      await invokeSendPayload(el?.value ?? loopPresetBody)
    }
  }, [invokeSendPayload, loopPresetBody])

  const insertHistoryPayload = useCallback(
    (payload: string) => {
      const el = editorRef.current
      const merge = (prev: string) => {
        const next = el
          ? prev.slice(0, el.selectionStart) + payload + prev.slice(el.selectionEnd)
          : (prev ? `${prev}\n` : '') + payload
        return sendIsAscii(sendEncoding) ? next : formatHexEditorBody(next)
      }
      if (!el) {
        setSendPresets((ps) =>
          ps.map((p) => (p.id === loopPresetId ? { ...p, body: merge(p.body) } : p)),
        )
        return
      }
      const start = el.selectionStart
      setSendPresets((ps) =>
        ps.map((p) => (p.id === loopPresetId ? { ...p, body: merge(p.body) } : p)),
      )
      requestAnimationFrame(() => {
        const ta = editorRef.current
        if (!ta) return
        ta.focus()
        const pos = start + payload.length
        ta.setSelectionRange(pos, pos)
      })
    },
    [loopPresetId, sendEncoding],
  )

  const disconnect = async () => {
    setErr(null)
    try {
      await invoke('nc_disconnect', {
        payload: {
          sessionId,
          webviewLabel,
          target: sendTargetForInvoke === 'all' ? 'all' : String(sendTargetForInvoke),
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

  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'f') {
        e.preventDefault()
        setLogSearchVisible(true)
        requestAnimationFrame(() => logSearchInputRef.current?.focus())
        return
      }
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (mod && e.key === 'Enter') {
        e.preventDefault()
        void sendEditorSelectionOrDocument()
      } else if (mod && e.key === 'l') {
        e.preventDefault()
        clearLog()
      }
    }
    const clickHandler = () => setCtxMenu(null)
    window.addEventListener('keydown', handler)
    window.addEventListener('click', clickHandler)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('click', clickHandler)
    }
  }, [active, sendEditorSelectionOrDocument])

  const exportLog = () => {
    const blob = new Blob([JSON.stringify(lines, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `netocto-${sessionId}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPcapFile = () => {
    const isUdp = mode === 'udp_server' || mode === 'udp_client'
    const blob = exportPcap(lines, isUdp)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `netocto-${sessionId}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.pcap`
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
      (tabMode === 'tcp_client' && clients.length > 0))

  const resetUiDefaults = () => {
    const d = { ...defaultSettings }
    setMode(d.mode)
    setBind(d.bind)
    setPort(d.port)
    setRemoteHost(d.remoteHost)
    setRemotePort(d.remotePort)
    setUdpTargetKind(d.udpTargetKind ?? 'unicast')
    setUdpMulticastGroups(d.udpMulticastGroups?.length ? [...d.udpMulticastGroups] : [])
    setRecvEncoding(effectiveRecvEncoding(d))
    setSendEncoding(effectiveSendEncoding(d))
    setParseEscapes(d.parseEscapes)
    setLoopSend(d.loopSend)
    setLoopMs(d.loopMs)
    setShowAsLog(d.showAsLog)
    setWrapRecv(d.wrapRecv)
    setHideRecv(d.hideRecv)
    setAutoScroll(d.autoScroll)
    setCenterSplitRatio(clampCenterSplitRatio(d.centerSplitRatio ?? defaultSettings.centerSplitRatio ?? 0.5))
    setTcpUseTls(d.tcpUseTls ?? false)
    setTcpLinkUi(tcpLinkFromPersist(d))
    setTcpLink(TCP_LINK_IDLE)
    const sp = normalizeSendPresetsFromPersist(d)
    setSendPresets(sp.presets)
    setLoopPresetId(sp.loopId)
    saveSettings(sessionId, d)
  }

  return (
    <div className={active ? 'flex min-h-0 flex-1 flex-col' : 'hidden min-h-0 flex-1 flex-col'}>
      <div className="flex min-h-0 flex-1 flex-row overflow-hidden bg-[var(--nc-bg-primary)]">
          <aside className="flex w-72 shrink-0 flex-col space-y-4 overflow-y-auto border-r nc-border bg-[var(--nc-bg-primary)] p-3 text-xs custom-scrollbar">
            <div className="flex min-h-0 flex-1 flex-col gap-3">
            <NcConfigCard
              title={t('session.cardSession')}
              footer={
                sessionRunning ? (
                  <Button
                    fullWidth
                    variant="danger"
                    size="sm"
                    className="min-h-0 bg-red-600/90 py-2 text-xs font-medium text-white hover:bg-red-600"
                    onPress={() => void stopSession()}
                  >
                    {t('session.btnStop')}
                  </Button>
                ) : (
                  <Button
                    fullWidth
                    variant="primary"
                    size="sm"
                    className="flex min-h-0 items-center justify-center gap-1.5 bg-[#006FEE] py-2 text-xs font-medium text-white hover:bg-[#005bc4]"
                    onPress={() => void startSession()}
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    {t('session.btnStart')}
                  </Button>
                )
              }
            >
            <NcFieldLabel htmlFor={`${idPrefix}-nc-mode`}>{t('session.fieldMode')}</NcFieldLabel>
            <Select
              fullWidth
              variant="secondary"
              isDisabled={sessionRunning}
              className="mb-1.5"
              value={mode}
              onChange={(k) => {
                if (k == null) return
                const v = String(k)
                if (
                  v === 'tcp_server' ||
                  v === 'tcp_client' ||
                  v === 'udp_server' ||
                  v === 'udp_client'
                ) {
                  setMode(v)
                }
              }}
            >
              <Select.Trigger id={`${idPrefix}-nc-mode`} className={`mb-0 ${NC_SELECT_TRIGGER}`}>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover placement="bottom start" className={LB_POPOVER}>
                <ListBox className={LB_LIST}>
                  <ListBox.Item id="tcp_server" textValue={t('mode.tcpServer')} className="text-xs text-[var(--nc-text-primary)]">
                    {t('mode.tcpServer')}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="tcp_client" textValue={t('mode.tcpClient')} className="text-xs text-[var(--nc-text-primary)]">
                    {t('mode.tcpClient')}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="udp_server" textValue={t('mode.udpServer')} className="text-xs text-[var(--nc-text-primary)]">
                    {t('mode.udpServer')}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="udp_client" textValue={t('mode.udpClient')} className="text-xs text-[var(--nc-text-primary)]">
                    {t('mode.udpClient')}
                    <ListBox.ItemIndicator />
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
                  className={`mb-1.5 ${NC_INPUT}`}
                />
              </>
            ) : null}

            {showLocalBind ? (
              <>
                <NcFieldLabel htmlFor={`${idPrefix}-nc-bind`}>{t('session.fieldBind')}</NcFieldLabel>
                <Select
                  fullWidth
                  variant="secondary"
                  value={bind}
                  onChange={(k) => {
                    if (k != null) setBind(String(k))
                  }}
                  isDisabled={sessionRunning}
                  className="mb-1.5"
                >
                  <Select.Trigger id={`${idPrefix}-nc-bind`} className={`mb-0 ${NC_SELECT_TRIGGER}`}>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover placement="bottom start" className={LB_POPOVER}>
                    <ListBox className={LB_LIST}>
                      {bindOptions.map((b) => (
                        <ListBox.Item key={b} id={b} textValue={b} className="font-mono text-xs text-[var(--nc-text-primary)]">
                          {b}
                          <ListBox.ItemIndicator />
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
                  className={`mb-1.5 ${NC_INPUT}`}
                />
              </>
            ) : null}

            {(mode === 'tcp_server' || mode === 'tcp_client') ? (
              <NcCheckboxRow
                checked={tcpUseTls}
                onChange={setTcpUseTls}
                label={t('session.tcpUseTls')}
                disabled={sessionRunning}
              />
            ) : null}

            </NcConfigCard>

            {mode === 'tcp_client' ? (
              <TcpLinkConfigCard
                idPrefix={idPrefix}
                t={t}
                sessionRunning={sessionRunning}
                settings={tcpLinkUi}
                onChange={patchTcpLinkUi}
                link={tcpLink}
              />
            ) : null}

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
            <NcEncodingToggle encoding={recvEncoding} onChange={(e) => setRecvEncoding(e as RecvEncoding)} />
            <NcCheckboxRow checked={showAsLog} onChange={setShowAsLog} label={t('session.recvShowLog')} />
            <NcCheckboxRow checked={wrapRecv} onChange={setWrapRecv} label={t('session.recvWrap')} />
            <NcCheckboxRow checked={hideRecv} onChange={setHideRecv} label={t('session.recvHide')} />
            <NcCheckboxRow checked={autoScroll} onChange={setAutoScroll} label={t('session.recvScroll')} />
            </NcConfigCard>

            <NcConfigCard title={t('session.cardTx')}>
            <NcCheckboxRow checked={parseEscapes} onChange={setParseEscapes} label={t('session.sendParseEscapes')} />
            <NcCheckboxRow checked={loopSend} onChange={setLoopSend} label={t('session.sendLoop')} />
            <div className="mt-1 flex flex-wrap items-end gap-2">
              <div className="min-w-0 w-full flex-1 sm:min-w-[10rem] sm:max-w-[14rem]">
                <NcFieldLabel htmlFor={`${idPrefix}-loop-preset`}>{t('session.loopPreset')}</NcFieldLabel>
                <Select
                  fullWidth
                  variant="secondary"
                  value={loopPresetId}
                  onChange={(k) => {
                    if (k != null) setLoopPresetId(String(k))
                  }}
                  className="text-xs"
                >
                  <Select.Trigger id={`${idPrefix}-loop-preset`} className={NC_SELECT_TRIGGER}>
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
                          className="font-mono text-xs text-[var(--nc-text-primary)]"
                        >
                          {sp.title.trim() || `#${i + 1}`}
                          <ListBox.ItemIndicator />
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
                className={`h-8 w-16 shrink-0 text-right ${NC_INPUT}`}
                aria-label={t('session.loopMsAria')}
              />
              <span className="shrink-0 pb-2 text-[var(--nc-text-muted)] sm:pb-0">ms</span>
            </div>
            <p className="mt-1 text-[10px] leading-snug text-[var(--nc-text-muted)]">{t('session.loopPresetEditorHint')}</p>
            <p className="mt-1 text-[10px] leading-snug text-[var(--nc-text-muted)]">{t('session.varSubHint')}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-mono text-[10px] text-[var(--nc-text-label)]">
                {t('session.counter')} = <span className="text-[var(--nc-text-body)]">{getVarCounter()}</span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-0 px-1.5 py-0 text-[9px] text-[var(--nc-text-label)] hover:text-[var(--nc-text-body)] data-[hover=true]:bg-[var(--nc-bg-elevated)]"
                onPress={() => { resetVarCounter(); bumpCounter((n) => n + 1) }}
              >
                {t('session.resetCounter')}
              </Button>
            </div>
            <div className="custom-scrollbar mt-2 max-h-36 space-y-1 overflow-y-auto pr-0.5">
              {sendPresets.map((p) => (
                <div
                  key={p.id}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('input,button')) return
                    setLoopPresetId(p.id)
                  }}
                  className={`flex cursor-pointer items-center gap-1 rounded-lg border p-1.5 ${
                    p.id === loopPresetId ? 'border-[#006FEE]/40 bg-[#006FEE]/10' : 'nc-border bg-[var(--nc-bg-elevated)]/80'
                  }`}
                >
                  <Button
                    isIconOnly
                    variant="ghost"
                    size="sm"
                    isDisabled={!canSendFinal}
                    aria-label={t('session.playSend')}
                    className="h-7 w-7 shrink-0 text-[#17c964] data-[hover=true]:bg-[#17c964]/15"
                    onPress={() => void sendPresetById(p.id)}
                  >
                    <Play size={14} strokeWidth={2.25} className="translate-x-px" />
                  </Button>
                  <Input
                    value={p.title}
                    onChange={(e) => {
                      const v = e.target.value
                      setSendPresets((ps) => ps.map((x) => (x.id === p.id ? { ...x, title: v } : x)))
                    }}
                    variant="secondary"
                    placeholder={t('session.presetTitlePlaceholder')}
                    aria-label={t('session.presetTitlePlaceholder')}
                    className="h-7 min-h-7 min-w-0 flex-1 border-[rgb(var(--nc-border-default)/0.5)] bg-[var(--nc-bg-primary)]/40 py-0 font-mono text-[10px] text-[var(--nc-text-body)] sm:text-[11px]"
                  />
                  {sendPresets.length > 1 ? (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      aria-label={t('session.removePreset')}
                      className="h-7 w-7 shrink-0 text-[var(--nc-text-muted)] hover:text-red-400"
                      onPress={() =>
                        setSendPresets((ps) => {
                          if (ps.length <= 1) return ps
                          return ps.filter((x) => x.id !== p.id)
                        })
                      }
                    >
                      <Trash2 size={13} />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            <Button
              fullWidth
              variant="outline"
              size="sm"
              className="mt-1 border-dashed border-[rgb(var(--nc-border-default)/0.65)] text-xs text-[var(--nc-text-body)]"
              onPress={() =>
                setSendPresets((ps) => [...ps, { id: newSendPresetId(), title: '', body: '' }])
              }
            >
              <Plus size={13} className="mr-1 shrink-0" />
              {t('session.addPreset')}
            </Button>
            </NcConfigCard>
            </div>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 bg-[var(--nc-bg-primary)] p-3">
            {active ? (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 rounded-xl border nc-border bg-[var(--nc-bg-surface)] p-1 shadow-sm">
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={t('session.exportLog')}
                  onPress={exportLog}
                  className="min-h-0 min-w-0 p-1.5 text-[var(--nc-text-label)] hover:text-[var(--nc-text-primary)] data-[hover=true]:bg-[var(--nc-bg-elevated)]"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={t('session.exportPcap')}
                  onPress={exportPcapFile}
                  className="min-h-0 min-w-0 p-1.5 text-[var(--nc-text-label)] hover:text-[var(--nc-text-primary)] data-[hover=true]:bg-[var(--nc-bg-elevated)]"
                >
                  <FileArchive className="h-3.5 w-3.5" />
                </Button>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={t('session.importLog')}
                  onPress={() => fileImportRef.current?.click()}
                  className="min-h-0 min-w-0 p-1.5 text-[var(--nc-text-label)] hover:text-[var(--nc-text-primary)] data-[hover=true]:bg-[var(--nc-bg-elevated)]"
                >
                  <Upload className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-0 px-2 py-1 text-[10px] text-[var(--nc-text-label)] hover:text-[var(--nc-text-primary)] data-[hover=true]:bg-[var(--nc-bg-elevated)]"
                  aria-label={t('session.defaultsAria')}
                  onPress={resetUiDefaults}
                >
                  {t('session.defaults')}
                </Button>
              </div>
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              <div ref={centerSplitRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div
                style={logPaneStyle}
                className="flex min-h-0 flex-col overflow-hidden"
              >
              <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border nc-border bg-[var(--nc-bg-surface)] shadow-lg">
                <div className="sticky top-0 z-10 flex flex-shrink-0 items-center justify-between border-b nc-border bg-[var(--nc-bg-surface)]/95 px-3 py-2 backdrop-blur-md">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="shrink-0 text-xs font-semibold text-[var(--nc-text-primary)]">{t('session.output')}</span>
                    <span className="shrink-0 rounded-full bg-[var(--nc-bg-elevated)] px-1.5 py-0.5 text-[9px] font-bold tabular-nums tracking-wide text-[var(--nc-text-label)]">
                      {lines.length}
                    </span>
                    <span className="min-w-0 truncate font-mono text-[10px] text-[var(--nc-text-muted)]" title={logAddr}>
                      {logAddr}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      aria-label={logSearchVisible ? t('session.logSearchClose') : 'Filter'}
                      onPress={() => {
                        setLogSearchVisible((v) => {
                          if (v) setLogSearch('')
                          return !v
                        })
                        if (!logSearchVisible) {
                          requestAnimationFrame(() => logSearchInputRef.current?.focus())
                        }
                      }}
                      className={`min-h-0 min-w-0 p-1 data-[hover=true]:bg-[var(--nc-bg-elevated)] ${
                        logSearchVisible ? 'text-[#5EA2EF]' : 'text-[var(--nc-text-label)] hover:text-[var(--nc-text-body)]'
                      }`}
                    >
                      <Filter className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      aria-label={t('session.clearLog')}
                      onPress={clearLog}
                      className="min-h-0 min-w-0 p-1 text-[var(--nc-text-label)] hover:text-red-400 data-[hover=true]:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {logSearchVisible ? (
                  <div className="flex shrink-0 items-center gap-1.5 border-b nc-border bg-[var(--nc-bg-surface)]/90 px-3 py-1.5">
                    <input
                      ref={logSearchInputRef}
                      type="text"
                      value={logSearch}
                      onChange={(e) => setLogSearch(e.target.value)}
                      placeholder={t('session.logSearchPlaceholder')}
                      className="min-w-0 flex-1 rounded-md border border-[rgb(var(--nc-border-default)/0.5)] bg-[var(--nc-bg-primary)] px-2 py-1 font-mono text-xs text-[var(--nc-text-primary)] outline-none placeholder:text-[var(--nc-text-muted)] focus:border-[#006FEE]/50"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setLogSearchVisible(false)
                          setLogSearch('')
                        }
                      }}
                    />
                    {logSearch ? (
                      <span className="shrink-0 font-mono text-[9px] tabular-nums text-[var(--nc-text-muted)]">
                        {filteredLines?.length ?? 0}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <div
                  ref={logRef}
                  className={`nc-selectable custom-scrollbar min-h-0 flex-1 space-y-0.5 overflow-x-hidden overflow-y-auto p-1.5 ${
                    wrapRecv ? 'break-words' : 'break-all'
                  }`}
                >
                  {(logSearch ? (filteredLines ?? []) : lines).map((l, i) => {
                    if (hideRecv && l.kind === 'recv') return null
                    const badge = logBadgeForKind(l.kind)
                    const lineTone =
                      l.kind === 'recv' ? 'text-[var(--nc-text-body)]' : l.kind === 'send' || l.kind === 'send-data' ? 'text-[#5EA2EF]' : 'text-[var(--nc-text-body)]'
                    return (
                      <div
                        key={`${l.ts}-${i}-${l.kind}`}
                        className="group flex cursor-default gap-2 rounded-lg border border-transparent p-2 transition-colors hover:nc-border hover:bg-[var(--nc-bg-elevated)]/50"
                        onDoubleClick={() => {
                          void navigator.clipboard.writeText(l.line)
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setCtxMenu({ x: e.clientX, y: e.clientY, line: l })
                        }}
                      >
                        <div
                          className={`mt-0.5 flex-shrink-0 self-start rounded px-1.5 py-0.5 text-[9px] font-bold ${badge.className}`}
                        >
                          {badge.label}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-[10px] font-medium text-[var(--nc-text-muted)]">{l.ts}</span>
                          </div>
                          <div className={`font-mono text-xs leading-relaxed ${lineTone}`}>
                            {logSearch ? highlightMatches(l.line, logSearch) : l.line}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {logSearch && filteredLines?.length === 0 ? (
                    <p className="py-6 text-center text-xs text-[var(--nc-text-muted)]">{t('session.logSearchNoMatches')}</p>
                  ) : null}
                </div>
              </div>
              </div>

              <div
                {...separatorProps}
                aria-label={t('session.splitResize')}
                title={t('session.splitResizeHint')}
              >
                <div className="mx-3 flex h-full min-w-0 flex-1 items-center justify-center rounded-sm border-y border-transparent transition-colors group-hover:border-[rgb(var(--nc-border-default)/0.5)] group-hover:bg-[color-mix(in_srgb,var(--nc-bg-elevated)_70%,transparent)] group-active:border-[#006FEE]/35 group-active:bg-[#006FEE]/10">
                  <div className="h-0.5 w-12 shrink-0 rounded-full bg-[var(--nc-bg-input-hover)] transition-colors group-hover:bg-[var(--nc-text-faint)] group-active:bg-[#006FEE]/70" />
                </div>
              </div>

              <div
                style={editorPaneStyle}
                className="flex min-h-0 flex-col overflow-hidden"
              >
            <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border nc-border bg-[var(--nc-bg-surface)] shadow-lg">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b nc-border bg-[var(--nc-bg-surface)]/95 px-3 py-2 backdrop-blur-md">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                  <span className="text-xs font-semibold text-[var(--nc-text-primary)]">{t('session.messageEditor')}</span>
                  <NcEncodingToggle
                    compact
                    encoding={sendEncoding}
                    onChange={(e) => setSendEncoding(e as SendEncoding)}
                  />
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="sm"
                    variant={showSendHistory ? 'secondary' : 'ghost'}
                    className={`flex min-h-0 items-center gap-1 px-2 py-1 text-[10px] font-medium ${
                      showSendHistory ? 'bg-[var(--nc-bg-input-hover)] text-[var(--nc-text-primary)]' : 'text-[var(--nc-text-body)] data-[hover=true]:bg-[var(--nc-bg-elevated)]'
                    }`}
                    onPress={() => setShowSendHistory((v) => !v)}
                  >
                    <History className="h-3.5 w-3.5 shrink-0 opacity-90" />
                    <span className="hidden sm:inline">{t('session.sendHistory')}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    isDisabled={!canSendFinal || sendPresets.length === 0}
                    className="flex min-h-0 shrink-0 items-center gap-1 bg-[#006FEE] px-3 py-1 text-[10px] font-medium text-white hover:bg-[#005bc4]"
                    aria-label={t('session.sendSelected')}
                    onPress={() => void sendEditorSelectionOrDocument()}
                  >
                    <Play className="h-3 w-3 fill-current" />
                    <span className="hidden sm:inline">{t('session.sendSelected')}</span>
                  </Button>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-end gap-1.5 border-b nc-border bg-[var(--nc-bg-surface)]/90 px-3 py-2">
                <div className="min-w-0 max-w-[min(100%,14rem)] flex-1 sm:max-w-none">
                  <NcFieldLabel htmlFor={`${idPrefix}-tx-target`}>
                    {mode === 'tcp_client' ? t('session.fieldServerLink') : t('session.fieldTarget')}
                  </NcFieldLabel>
                  <Select
                    fullWidth
                    variant="secondary"
                    aria-label={t('session.sendTarget')}
                    value={sendTarget}
                    isDisabled={mode === 'tcp_client' && clients.length === 0}
                    onChange={(k) => {
                      if (k != null) setSendTarget(String(k))
                    }}
                    className="text-xs"
                  >
                    <Select.Trigger id={`${idPrefix}-tx-target`} className={NC_SELECT_TRIGGER_SM}>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover placement="bottom start" className={LB_POPOVER}>
                      <ListBox className={LB_LIST}>
                        {showAllSendTargets ? (
                          <ListBox.Item
                            id="all"
                            textValue={`${t('session.allTargets')} (${clients.length})`}
                            className="text-xs text-[var(--nc-text-primary)]"
                          >
                            {t('session.allTargets')} ({clients.length})
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ) : null}
                        {clients.map((c) => (
                          <ListBox.Item
                            key={c.id}
                            id={String(c.id)}
                            textValue={`#${c.id} ${c.peer}`}
                            className="text-xs text-[var(--nc-text-primary)]"
                          >
                            #{c.id} {c.peer}
                            <ListBox.ItemIndicator />
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
                  className="min-h-7 shrink-0 border-[rgb(var(--nc-border-default)/0.65)] text-[11px] text-[var(--nc-text-body)] sm:min-h-8"
                >
                  {t('session.disconnect')}
                </Button>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={t('session.clearEditorBody')}
                  onPress={() =>
                    setSendPresets((ps) =>
                      ps.map((p) => (p.id === loopPresetId ? { ...p, body: '' } : p)),
                    )
                  }
                  className="h-7 w-7 min-w-7 shrink-0 text-[var(--nc-text-label)] data-[hover=true]:bg-[var(--nc-bg-elevated)] sm:h-8 sm:w-8 sm:min-w-8"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
              <div className="relative flex min-h-0 flex-1 flex-row overflow-hidden">
                <div className="pointer-events-none w-9 shrink-0 overflow-hidden border-r nc-border bg-[var(--nc-bg-surface)] py-3">
                  <div
                    ref={lineGutterInnerRef}
                    className="text-center font-mono text-[10px] leading-[1.375rem] text-[var(--nc-text-faint)] select-none will-change-transform"
                  >
                    {editorLineNumbers.map((n) => (
                      <div key={n} className="h-[1.375rem] shrink-0">
                        {n}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                  <pre
                    className="pointer-events-none absolute inset-0 z-0 m-0 overflow-hidden border-0 bg-transparent px-3 py-3 font-mono text-xs leading-[1.375rem] whitespace-pre-wrap break-words"
                    aria-hidden
                  >
                    <div ref={editorHighlightInnerRef} className="will-change-transform">
                      {editorHighlightTree}
                    </div>
                  </pre>
                  <textarea
                    ref={editorRef}
                    id={`${idPrefix}-message-editor`}
                    spellCheck={false}
                    value={loopPresetBody}
                    onChange={(e) => {
                      let v = e.target.value
                      if (sendIsHex(sendEncoding)) v = formatHexEditorBody(v)
                      setSendPresets((ps) =>
                        ps.map((p) => (p.id === loopPresetId ? { ...p, body: v } : p)),
                      )
                    }}
                    onScroll={(e) => {
                      const st = e.currentTarget.scrollTop
                      const lineInner = lineGutterInnerRef.current
                      if (lineInner) lineInner.style.transform = `translateY(-${st}px)`
                      const hiInner = editorHighlightInnerRef.current
                      if (hiInner) hiInner.style.transform = `translateY(-${st}px)`
                    }}
                    className="nc-selectable custom-scrollbar absolute inset-0 z-10 box-border resize-none overflow-auto border-0 bg-transparent px-3 py-3 font-mono text-xs leading-[1.375rem] text-transparent caret-zinc-200 outline-none ring-0 placeholder:text-[var(--nc-text-faint)] selection:bg-[#006FEE]/25 focus:outline-none"
                    style={{ WebkitTextFillColor: 'transparent' }}
                    placeholder={
                      sendIsUtf8(sendEncoding) ? t('session.payloadPlaceholderUtf8') : sendIsAscii(sendEncoding) ? t('session.payloadPlaceholder') : t('session.payloadPlaceholderHex')
                    }
                  />
                </div>
                {showSendHistory ? (
                  <div className="absolute inset-y-0 right-0 z-20 flex w-[min(100%,17rem)] flex-col border-l nc-border bg-[var(--nc-bg-inset)] shadow-2xl sm:w-64">
                    <div className="flex shrink-0 items-center justify-between gap-2 border-b nc-border px-2.5 py-2">
                      <span className="truncate text-[11px] font-semibold text-[var(--nc-text-body)]">
                        {t('session.historyPanelTitle')}
                      </span>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        aria-label={t('session.closeHistoryPanel')}
                        className="h-7 w-7 shrink-0 text-[var(--nc-text-label)]"
                        onPress={() => setShowSendHistory(false)}
                      >
                        <X size={16} />
                      </Button>
                    </div>
                    <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
                      {sendHistory.length === 0 ? (
                        <p className="px-3 py-4 text-center text-[11px] text-[var(--nc-text-muted)]">{t('session.historyEmpty')}</p>
                      ) : (
                        sendHistory.map((h) => (
                          <div
                            key={h.id}
                            className="border-b border-[rgb(var(--nc-border-default)/0.5)] px-2.5 py-2 last:border-b-0"
                          >
                            <div className="mb-1 flex items-center justify-between gap-2 text-[9px] text-[var(--nc-text-muted)]">
                              <span>{h.ts}</span>
                              <span className="shrink-0 font-mono text-[var(--nc-text-label)]">{h.mode}</span>
                            </div>
                            <p className="mb-2 line-clamp-3 break-all font-mono text-[10px] leading-snug text-[var(--nc-text-body)]">
                              {h.preview}
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 min-h-0 w-full border-[rgb(var(--nc-border-default)/0.65)] text-[10px] text-[var(--nc-text-body)]"
                              onPress={() => insertHistoryPayload(h.payload)}
                            >
                              {t('session.insertFromHistory')}
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
              {err ? (
                <Text type="body-sm" className="shrink-0 border-t nc-border bg-[var(--nc-bg-surface)] px-3 py-1.5 text-red-400">
                  {err}
                </Text>
              ) : null}
            </div>
              </div>
              </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border nc-border bg-[var(--nc-bg-surface)] px-3 py-1.5 shadow-sm">
              <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] font-medium text-[var(--nc-text-label)]">
                <span className="flex items-center gap-1">
                  TX_BYT <span className="text-[var(--nc-text-body)]">{stats.tx_bytes}</span>
                </span>
                <span className="flex items-center gap-1">
                  TX_PKT <span className="text-[var(--nc-text-body)]">{stats.tx_pkts}</span>
                </span>
                <span className="flex items-center gap-1">
                  RX_BYT <span className="text-[var(--nc-text-body)]">{stats.rx_bytes}</span>
                </span>
                <span className="flex items-center gap-1">
                  RX_PKT <span className="text-[var(--nc-text-body)]">{stats.rx_pkts}</span>
                </span>
                {tcpClientActive && tcpLinkUi.heartbeatEnabled ? (
                  <span className="flex items-center gap-1 text-[var(--nc-text-muted)]">
                    HB
                    <span className={hbVisual.textClass}>{tcpHeartbeatLabel(t, tcpLink.heartbeat)}</span>
                  </span>
                ) : null}
                <span className={`ml-1 flex items-center gap-1 ${linkVisual.textClass}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${linkVisual.dotClass}`} />
                  {linkStatusLabel}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-0 px-2 py-0 font-mono text-[9px] font-bold tracking-wider text-[var(--nc-text-muted)] hover:text-[var(--nc-text-body)] data-[hover=true]:bg-transparent"
                onPress={() => void resetStats()}
              >
                {t('session.resetStats')}
              </Button>
            </div>
            </div>
          </div>
        </div>
      {ctxMenu ? (
        <div
          className="fixed z-50 min-w-[10rem] rounded-lg border border-[rgb(var(--nc-border-default)/0.6)] bg-[var(--nc-bg-surface)] py-1 shadow-2xl"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseLeave={() => setCtxMenu(null)}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--nc-text-body)] hover:bg-[var(--nc-bg-elevated)]"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => { void navigator.clipboard.writeText(ctxMenu.line.line); setCtxMenu(null) }}
          >
            {t('session.ctxCopyPayload')}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--nc-text-body)] hover:bg-[var(--nc-bg-elevated)]"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => { insertHistoryPayload(ctxMenu.line.line); setCtxMenu(null) }}
          >
            {t('session.ctxInsertEditor')}
          </button>
        </div>
      ) : null}
      <input ref={fileImportRef} type="file" accept=".json,application/json" className="hidden" onChange={onImportFile} />
    </div>
  )
}

