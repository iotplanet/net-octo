import { Button, Header, Modal, Radio, RadioGroup, Separator, Surface, Text, useOverlayState } from '@heroui/react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { Plus, Settings, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { openNativeSettingsWindow } from '../openNativeSettingsWindow'
import { useI18n, type Locale } from '../i18n'
import { NetOctoSession } from './NetOctoSession'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'

interface TabDef {
  id: string
}

export default function NetOctoApp() {
  const { t, locale, setLocale } = useI18n()
  const settingsModal = useOverlayState()
  const inTauri = useMemo(() => isTauri(), [])

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

  const [tabs, setTabs] = useState<TabDef[]>([{ id: 'main' }])
  const [activeTabId, setActiveTabId] = useState('main')
  const [tabMeta, setTabMeta] = useState<Record<string, { running: boolean; tabTitle: string }>>({})

  const updateMeta = useCallback((id: string, meta: { running: boolean; tabTitle: string }) => {
    setTabMeta((prev) => {
      const cur = prev[id]
      if (cur?.running === meta.running && cur?.tabTitle === meta.tabTitle) return prev
      return { ...prev, [id]: meta }
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
    if (activeTabId === id) {
      const nextId = nextList[Math.max(0, idx - 1)]?.id ?? nextList[0]?.id
      if (nextId) setActiveTabId(nextId)
    }
  }

  const displayTitle = (id: string) => tabMeta[id]?.tabTitle ?? (id === 'main' ? t('app.mainTab') : id.slice(0, 12))

  return (
    <div className="nc-root flex h-dvh min-h-0 flex-col bg-background text-foreground">
      <Surface
        variant="default"
        className="flex shrink-0 flex-col border-b border-divider bg-content1 shadow-sm"
      >
        <Header className="flex h-10 items-center justify-between gap-3 border-b border-divider/60 px-3 py-0 sm:h-11 sm:px-4">
          <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
            <Text className="truncate text-sm font-semibold leading-none tracking-tight sm:text-base">
              NetOcto
            </Text>
            <Text
              size="xs"
              variant="muted"
              className="max-w-full truncate font-mono text-[10px] text-default-500 sm:max-w-[14rem] sm:rounded-md sm:border sm:border-default-200 sm:bg-default-100 sm:px-2 sm:py-0.5"
              title={t('app.webviewTitle')}
            >
              {webviewLabel}
            </Text>
          </div>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label={t('app.settings')}
            className="shrink-0 text-default-500"
            onPress={() => void openSettings()}
          >
            <Settings size={16} />
          </Button>
        </Header>

        <div className="flex min-h-9 items-center gap-1.5 overflow-x-auto border-b border-transparent px-2 py-1 sm:px-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {tabs.map((tab) => {
              const active = tab.id === activeTabId
              const running = tabMeta[tab.id]?.running ?? false
              return (
                <div
                  key={tab.id}
                  className={`flex max-w-[14rem] shrink-0 items-stretch overflow-hidden rounded-md border transition-colors ${
                    active
                      ? 'border-primary/50 bg-primary/10 shadow-sm'
                      : 'border-transparent bg-default-100/70 hover:border-default-200 hover:bg-default-100'
                  }`}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-7 min-w-0 max-w-[11rem] flex-1 justify-start gap-2 rounded-none px-2 font-medium sm:h-8 sm:max-w-[12rem] sm:px-2.5 ${
                      active ? 'text-foreground' : 'text-default-600'
                    }`}
                    onPress={() => setActiveTabId(tab.id)}
                  >
                    <span
                      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full sm:h-2 sm:w-2 ${
                        running ? 'bg-success shadow-sm' : 'bg-default-400'
                      }`}
                    />
                    <span className="truncate font-mono text-[11px] tracking-tight sm:text-xs">{displayTitle(tab.id)}</span>
                  </Button>
                  {tabs.length > 1 ? (
                    <>
                      <Separator orientation="vertical" className="h-auto min-h-0 self-stretch bg-divider" />
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 min-w-7 shrink-0 rounded-none text-default-500 hover:text-danger sm:h-8 sm:w-8 sm:min-w-8"
                        aria-label={t('app.closeTab')}
                        onPress={() => void closeTab(tab.id)}
                      >
                        <X size={13} strokeWidth={2.5} />
                      </Button>
                    </>
                  ) : null}
                </div>
              )
            })}
          </div>
          <Button
            isIconOnly
            size="sm"
            variant="secondary"
            className="shrink-0"
            aria-label={t('app.newTab')}
            onPress={addTab}
          >
            <Plus size={16} />
          </Button>
        </div>
      </Surface>

      <div className="flex min-h-0 flex-1 flex-col bg-default-50/40 p-2 sm:bg-default-50/50 sm:p-2.5">
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
          <Modal.Backdrop />
          <Modal.Container size="sm" placement="center" scroll="inside">
            <Modal.Dialog className="max-w-md">
              <Modal.Header>
                <Modal.Heading>{t('settings.title')}</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-3">
                <Text size="sm" variant="muted">
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
        </Modal>
      )}
    </div>
  )
}
