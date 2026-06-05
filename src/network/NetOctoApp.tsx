import { Button, Modal, Radio, RadioGroup, Text, useOverlayState } from '@heroui/react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { Plus, Settings, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { openNativeSettingsWindow } from '../openNativeSettingsWindow'
import { useI18n, type Locale } from '../i18n'
import { ToolsModalTrigger } from '../components/tools/ToolsModal'
import { NetOctoSession } from './NetOctoSession'
import { SessionEditorBridgeProvider } from './sessionEditorBridge'
import { loadWorkspace, saveWorkspace } from './tabsPersist'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useTheme } from '../useTheme'

interface TabDef {
  id: string
}

function workspaceFromState(
  tabs: TabDef[],
  activeTabId: string,
  customNames: Record<string, string>,
) {
  return {
    tabIds: tabs.map((t) => t.id),
    activeTabId,
    customNames,
  }
}

export default function NetOctoApp() {
  const { t, locale, setLocale } = useI18n()
  const { theme, setTheme } = useTheme()
  const settingsModal = useOverlayState()
  const inTauri = useMemo(() => isTauri(), [])
  const initialWorkspace = useMemo(() => loadWorkspace(), [])

  const openSettings = useCallback(async () => {
    const r = await openNativeSettingsWindow(t('settings.title'))
    if (r === 'unsupported') settingsModal.open()
  }, [t, settingsModal])

  const webviewLabel = useMemo(() => {
    try {
      return getCurrentWebviewWindow().label
    } catch {
      return 'main'
    }
  }, [])

  const [tabs, setTabs] = useState<TabDef[]>(() => initialWorkspace.tabIds.map((id) => ({ id })))
  const [activeTabId, setActiveTabId] = useState(initialWorkspace.activeTabId)
  const [customNames, setCustomNames] = useState<Record<string, string>>(() => ({ ...initialWorkspace.customNames }))
  const [tabMeta, setTabMeta] = useState<Record<string, { running: boolean; tabTitle: string; hasUnread?: boolean }>>({})
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    saveWorkspace(workspaceFromState(tabs, activeTabId, customNames))
  }, [tabs, activeTabId, customNames])

  const kbRef = useRef({ tabs, activeTabId, tabMeta, webviewLabel })
  kbRef.current = { tabs, activeTabId, tabMeta, webviewLabel }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (mod && e.key === 'n') {
        e.preventDefault()
        const id = `tab-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`
        setTabs((prev) => [...prev, { id }])
        setActiveTabId(id)
      } else if (mod && e.key === 'w') {
        const { tabs: curTabs, activeTabId: curActive, webviewLabel: wl, tabMeta: tm } = kbRef.current
        if (curTabs.length <= 1) return
        e.preventDefault()
        if (tm[curActive]?.running) {
          void invoke('nc_stop_session', { sessionId: curActive, webviewLabel: wl }).catch(() => {})
        }
        const idx = curTabs.findIndex((x) => x.id === curActive)
        const nextList = curTabs.filter((x) => x.id !== curActive)
        setTabs(nextList)
        setTabMeta((m) => {
          const { [curActive]: _, ...rest } = m
          return rest
        })
        setCustomNames((m) => {
          if (!(curActive in m)) return m
          const { [curActive]: _, ...rest } = m
          return rest
        })
        if (renamingTabId === curActive) setRenamingTabId(null)
        const nextId = nextList[Math.max(0, idx - 1)]?.id ?? nextList[0]?.id
        if (nextId) setActiveTabId(nextId)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [renamingTabId])

  useEffect(() => {
    if (renamingTabId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingTabId])

  const updateMeta = useCallback((id: string, meta: { running: boolean; tabTitle: string; hasUnread?: boolean }) => {
    setTabMeta((prev) => {
      const cur = prev[id]
      const unread = meta.hasUnread ?? cur?.hasUnread ?? false
      if (cur?.running === meta.running && cur?.tabTitle === meta.tabTitle && cur?.hasUnread === unread) return prev
      return { ...prev, [id]: { running: meta.running, tabTitle: meta.tabTitle, hasUnread: unread } }
    })
  }, [])

  const addTab = () => {
    const id = `tab-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`
    setTabs((prev) => [...prev, { id }])
    setActiveTabId(id)
  }

  const closeTab = async (id: string) => {
    if (tabs.length <= 1) return
    if (tabMeta[id]?.running) {
      try {
        await invoke('nc_stop_session', { sessionId: id, webviewLabel })
      } catch {
        /* still close tab */
      }
    }
    const idx = tabs.findIndex((x) => x.id === id)
    const nextList = tabs.filter((x) => x.id !== id)
    setTabs(nextList)
    setTabMeta((m) => {
      const { [id]: _, ...rest } = m
      return rest
    })
    setCustomNames((m) => {
      if (!(id in m)) return m
      const { [id]: _, ...rest } = m
      return rest
    })
    if (renamingTabId === id) setRenamingTabId(null)
    if (activeTabId === id) {
      const nextId = nextList[Math.max(0, idx - 1)]?.id ?? nextList[0]?.id
      if (nextId) setActiveTabId(nextId)
    }
  }

  const autoTitle = (id: string) => tabMeta[id]?.tabTitle ?? (id === 'main' ? t('app.mainTab') : id.slice(0, 12))

  const displayTitle = (id: string) => customNames[id] ?? autoTitle(id)

  const startRename = (id: string) => {
    setRenamingTabId(id)
    setRenameDraft(customNames[id] ?? autoTitle(id))
  }

  const commitRename = (id: string) => {
    const trimmed = renameDraft.trim()
    setCustomNames((prev) => {
      const next = { ...prev }
      if (!trimmed || trimmed === autoTitle(id)) {
        delete next[id]
      } else {
        next[id] = trimmed
      }
      return next
    })
    setRenamingTabId(null)
  }

  const cancelRename = () => {
    setRenamingTabId(null)
  }

  return (
    <SessionEditorBridgeProvider activeTabId={activeTabId}>
    <div className="nc-workspace nc-root flex h-dvh min-h-0 flex-col bg-[var(--nc-bg-primary)] font-sans text-[var(--nc-text-primary)] antialiased selection:bg-[var(--nc-selection)]">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b nc-border bg-[var(--nc-bg-primary)] px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-xl border nc-border bg-[var(--nc-bg-surface)] p-1 shadow-sm custom-scrollbar"
            onContextMenu={(e) => e.preventDefault()}
          >
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId
              const running = tabMeta[tab.id]?.running ?? false
              const isRenaming = renamingTabId === tab.id
              return (
                <div
                  key={tab.id}
                  role="tab"
                  tabIndex={0}
                  aria-selected={isActive}
                  className={`nc-tab max-w-[14rem] ${isActive ? 'nc-tab-active' : ''}`}
                  onClick={() => {
                    if (!isRenaming) setActiveTabId(tab.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      if (!isRenaming) setActiveTabId(tab.id)
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.preventDefault()
                    startRename(tab.id)
                  }}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full shadow-sm ${
                      running
                        ? 'bg-[var(--nc-status-ok)] shadow-[color-mix(in_srgb,var(--nc-status-ok)_40%,transparent)]'
                        : tabMeta[tab.id]?.hasUnread
                          ? 'bg-[var(--nc-status-warn)] shadow-[color-mix(in_srgb,var(--nc-status-warn)_40%,transparent)]'
                          : 'bg-[var(--nc-text-faint)]'
                    }`}
                  />
                  {isRenaming ? (
                    <input
                      ref={renameInputRef}
                      type="text"
                      value={renameDraft}
                      aria-label={t('app.renameTab')}
                      className="min-w-0 max-w-[9rem] flex-1 rounded border border-[rgb(var(--nc-border-default)/0.7)] bg-[var(--nc-bg-primary)] px-1 py-0 font-mono text-xs text-[var(--nc-text-primary)] outline-none focus:border-[var(--nc-accent)]"
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          commitRename(tab.id)
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          cancelRename()
                        }
                      }}
                      onBlur={() => commitRename(tab.id)}
                    />
                  ) : (
                    <span
                      className="min-w-0 truncate font-mono tracking-tight"
                      title={t('app.renameTabHint')}
                    >
                      {displayTitle(tab.id)}
                    </span>
                  )}
                  {tabs.length > 1 ? (
                    <button
                      type="button"
                      className="-mr-0.5 ml-0.5 rounded p-0.5 text-[var(--nc-text-muted)] transition-colors hover:bg-[var(--nc-bg-input-hover)] hover:text-[var(--nc-status-err)]"
                      aria-label={t('app.closeTab')}
                      onClick={(e) => {
                        e.stopPropagation()
                        void closeTab(tab.id)
                      }}
                    >
                      <X className="h-2.5 w-2.5" strokeWidth={2.5} />
                    </button>
                  ) : null}
                </div>
              )
            })}
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label={t('app.newTab')}
              className="ml-0.5 h-auto min-w-0 shrink-0 px-2 py-1.5 text-[var(--nc-text-label)] hover:text-white data-[hover=true]:bg-[var(--nc-bg-elevated)]/50"
              onPress={addTab}
            >
              <Plus size={14} />
            </Button>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Text
            type="body-xs"
            truncate
            className="hidden max-w-[12rem] font-mono text-[10px] text-[var(--nc-text-muted)] sm:block"
            title={t('app.webviewTitle')}
          >
            {webviewLabel}
          </Text>
          <ToolsModalTrigger />
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={t('app.settings')}
            className="nc-chrome-btn"
            onPress={() => void openSettings()}
          >
            <Settings size={14} />
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tabs.map((tab) => (
          <NetOctoSession
            key={tab.id}
            sessionId={tab.id}
            webviewLabel={webviewLabel}
            active={tab.id === activeTabId}
            onTabMeta={updateMeta}
          />
        ))}
      </div>
      {inTauri ? null : (
        <Modal state={settingsModal}>
          <Modal.Backdrop>
            <Modal.Container size="sm" placement="center" scroll="inside">
              <Modal.Dialog className="max-w-md">
                <Modal.Header>
                  <Modal.Heading>{t('settings.title')}</Modal.Heading>
                </Modal.Header>
                <Modal.Body className="flex flex-col gap-3">
                  <Text type="body-sm" color="muted">
                    {t('settings.language')}
                  </Text>
                  <RadioGroup
                    value={locale}
                    onChange={(v) => setLocale(v as Locale)}
                    className="flex flex-col gap-2"
                    aria-label={t('settings.language')}
                  >
                    <Radio value="zh" className="items-start gap-2">
                      <Radio.Control>
                        <Radio.Indicator />
                      </Radio.Control>
                      <Radio.Content className="text-sm">{t('settings.langZh')}</Radio.Content>
                    </Radio>
                    <Radio value="en" className="items-start gap-2">
                      <Radio.Control>
                        <Radio.Indicator />
                      </Radio.Control>
                      <Radio.Content className="text-sm">{t('settings.langEn')}</Radio.Content>
                    </Radio>
                  </RadioGroup>
                  <div className="mt-1 border-t nc-border pt-3">
                    <Text type="body-sm" color="muted">
                      {t('settings.theme')}
                    </Text>
                    <RadioGroup
                      value={theme}
                      onChange={(v) => setTheme(v as 'dark' | 'light')}
                      className="mt-1 flex flex-col gap-2"
                      aria-label={t('settings.theme')}
                    >
                      <Radio value="dark" className="items-start gap-2">
                        <Radio.Control>
                          <Radio.Indicator />
                        </Radio.Control>
                        <Radio.Content className="flex items-center gap-2 text-sm">
                          <span className="nc-theme-swatch-dark" />
                          {t('settings.themeDark')}
                        </Radio.Content>
                      </Radio>
                      <Radio value="light" className="items-start gap-2">
                        <Radio.Control>
                          <Radio.Indicator />
                        </Radio.Control>
                        <Radio.Content className="flex items-center gap-2 text-sm">
                          <span className="nc-theme-swatch-light" />
                          {t('settings.themeLight')}
                        </Radio.Content>
                      </Radio>
                    </RadioGroup>
                  </div>
                </Modal.Body>
                <Modal.Footer className="justify-end gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    slot="close"
                    onPress={() => {
                      settingsModal.setOpen(false)
                    }}
                  >
                    {t('settings.done')}
                  </Button>
                </Modal.Footer>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      )}
    </div>
    </SessionEditorBridgeProvider>
  )
}
