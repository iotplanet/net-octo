import { Button, Input, Label, Text } from '@heroui/react'
import { useMemo, useState } from 'react'
import { useI18n } from '../../i18n'
import { useSessionEditorBridge } from '../../network/sessionEditorBridge'
import { modbusCrcFromHexInput } from '../../tools/modbus'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function ModbusCrcPanel() {
  const { t } = useI18n()
  const { getActiveActions } = useSessionEditorBridge()
  const [hexInput, setHexInput] = useState('01 03 00 00 00 01')
  const [copyHint, setCopyHint] = useState<string | null>(null)
  const [insertHint, setInsertHint] = useState<string | null>(null)

  const result = useMemo(() => modbusCrcFromHexInput(hexInput), [hexInput])

  const errorMessage =
    result && 'error' in result
      ? result.error === 'empty'
        ? t('tools.modbusCrc.errEmpty')
        : result.error === 'odd'
          ? t('tools.modbusCrc.errOdd')
          : t('tools.modbusCrc.errInvalid')
      : null

  const showCopyHint = (ok: boolean) => {
    setCopyHint(ok ? t('tools.modbusCrc.copied') : t('tools.modbusCrc.copyFailed'))
    globalThis.setTimeout(() => setCopyHint(null), 2000)
  }

  const showInsertHint = (msg: string) => {
    setInsertHint(msg)
    globalThis.setTimeout(() => setInsertHint(null), 2500)
  }

  const handleCopyCrc = async () => {
    if (!result || 'error' in result) return
    showCopyHint(await copyText(result.crcLoHi))
  }

  const handleCopyFrame = async () => {
    if (!result || 'error' in result) return
    showCopyHint(await copyText(result.frameHex))
  }

  const handleInsert = (text: string) => {
    const actions = getActiveActions()
    if (!actions) {
      showInsertHint(t('tools.modbusCrc.noActiveTab'))
      return
    }
    actions.appendToEditor(text)
    showInsertHint(t('tools.modbusCrc.inserted'))
  }

  return (
    <div className="flex flex-col gap-4">
      <Text type="body-sm" color="muted" className="leading-relaxed">
        {t('tools.modbusCrc.hint')}
      </Text>
      <div>
        <Label htmlFor="modbus-crc-input" className="mb-1.5 block text-xs font-medium text-zinc-300">
          {t('tools.modbusCrc.inputLabel')}
        </Label>
        <Input
          id="modbus-crc-input"
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          className="font-mono text-xs"
          placeholder="01 03 00 00 00 01"
          aria-invalid={!!errorMessage}
        />
        {errorMessage ? (
          <Text type="body-xs" className="mt-1.5 text-red-400">
            {errorMessage}
          </Text>
        ) : null}
      </div>
      {result && !('error' in result) ? (
        <div className="space-y-3 rounded-xl border border-zinc-800/60 bg-[#27272a]/50 p-3 font-mono text-xs">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-zinc-500">{t('tools.modbusCrc.crcValue')}</span>
            <span className="text-[#5EA2EF]">0x{result.crcHex}</span>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-zinc-500">{t('tools.modbusCrc.crcWire')}</span>
            <span className="text-zinc-100">{result.crcLoHi}</span>
          </div>
          <div>
            <span className="mb-1 block text-zinc-500">{t('tools.modbusCrc.frameWithCrc')}</span>
            <p className="break-all leading-relaxed text-zinc-200">{result.frameHex}</p>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          isDisabled={!result || 'error' in result}
          onPress={() => void handleCopyCrc()}
        >
          {t('tools.modbusCrc.copyCrc')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          isDisabled={!result || 'error' in result}
          onPress={() => void handleCopyFrame()}
        >
          {t('tools.modbusCrc.copyFrame')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          isDisabled={!result || 'error' in result}
          onPress={() => {
            if (result && !('error' in result)) handleInsert(result.crcLoHi)
          }}
        >
          {t('tools.modbusCrc.insertTab')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          isDisabled={!result || 'error' in result}
          className="border-zinc-600"
          onPress={() => {
            if (result && !('error' in result)) handleInsert(result.frameHex)
          }}
        >
          {t('tools.modbusCrc.insertFrameTab')}
        </Button>
      </div>
      {copyHint ? (
        <Text type="body-xs" className="text-[#17c964]">
          {copyHint}
        </Text>
      ) : null}
      {insertHint ? (
        <Text type="body-xs" className={insertHint === t('tools.modbusCrc.inserted') ? 'text-[#17c964]' : 'text-amber-400'}>
          {insertHint}
        </Text>
      ) : null}
    </div>
  )
}
