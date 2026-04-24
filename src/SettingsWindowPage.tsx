import { Button, Radio, RadioGroup, Text } from '@heroui/react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useI18n, type Locale } from './i18n'

export function SettingsWindowPage() {
  const { t, locale, setLocale } = useI18n()

  return (
    <div className="flex min-h-dvh flex-col gap-4 bg-background p-4 text-foreground">
      <Text className="text-lg font-semibold">{t('settings.title')}</Text>
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
      <div className="mt-auto flex justify-end pt-2">
        <Button
          variant="primary"
          size="sm"
          onPress={() => {
            void getCurrentWebviewWindow()
              .close()
              .catch((e) => {
                console.error('close settings window', e)
              })
          }}
        >
          {t('settings.done')}
        </Button>
      </div>
    </div>
  )
}
