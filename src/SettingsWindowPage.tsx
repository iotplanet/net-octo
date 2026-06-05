import { Button, Radio, RadioGroup, Text } from '@heroui/react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useI18n, type Locale } from './i18n'
import { useTheme } from './useTheme'

export function SettingsWindowPage() {
  const { t, locale, setLocale } = useI18n()
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex min-h-dvh flex-col gap-4 bg-[var(--nc-bg-primary)] p-4 text-[var(--nc-text-primary)]">
      <Text type="body" weight="semibold" className="text-base">
        {t('settings.title')}
      </Text>
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
      <div className="mt-2 border-t nc-border pt-3">
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
