import { Input } from '@heroui/react'
import type { Translate } from '../i18n'
import {
  formatI18nTemplate,
  linkStatusVisual,
  tcpHeartbeatLabel,
  tcpHeartbeatVisual,
  tcpLinkPhaseLabel,
  type TcpLinkState,
  type TcpLinkUiSettings,
} from './tcpLink'
import { NcCheckboxRow, NcConfigCard, NcFieldLabel } from './sharedUi'
import { NC_INPUT } from './themeClasses'

export function TcpLinkConfigCard({
  idPrefix,
  t,
  sessionRunning,
  settings,
  onChange,
  link,
}: {
  idPrefix: string
  t: Translate
  sessionRunning: boolean
  settings: TcpLinkUiSettings
  onChange: (patch: Partial<TcpLinkUiSettings>) => void
  link: TcpLinkState
}) {
  const phaseVisual = linkStatusVisual({ tcpClientActive: true, phase: link.phase, connected: false })
  const hbVisual = tcpHeartbeatVisual(link.heartbeat)
  const attemptHint =
    link.phase === 'reconnecting' && link.attempt > 0
      ? link.maxAttempts === 0
        ? formatI18nTemplate(t, 'session.tcpLink.attemptUnlimited', { n: String(link.attempt) })
        : formatI18nTemplate(t, 'session.tcpLink.attemptOf', {
            n: String(link.attempt),
            max: String(link.maxAttempts),
          })
      : null
  const retryHint =
    link.phase === 'reconnecting' && link.nextRetryMs > 0
      ? formatI18nTemplate(t, 'session.tcpLink.retryIn', { ms: String(link.nextRetryMs) })
      : null

  return (
    <NcConfigCard title={t('session.tcpLink.title')}>
      <div className="rounded-lg border nc-border bg-[var(--nc-bg-inset)] px-2.5 py-2 font-mono text-[10px] leading-relaxed text-[var(--nc-text-label)]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[var(--nc-text-muted)]">{t('session.tcpLink.status')}</span>
          <span className={phaseVisual.textClass}>{tcpLinkPhaseLabel(t, link.phase)}</span>
        </div>
        {attemptHint ? <div className="mt-0.5 text-[var(--nc-text-muted)]">{attemptHint}</div> : null}
        {retryHint ? <div className="mt-0.5 text-[var(--nc-text-muted)]">{retryHint}</div> : null}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[var(--nc-text-muted)]">{t('session.tcpLink.heartbeat')}</span>
          <span className={hbVisual.textClass}>{tcpHeartbeatLabel(t, link.heartbeat)}</span>
        </div>
      </div>
      <NcCheckboxRow
        checked={settings.autoReconnect}
        onChange={(v) => onChange({ autoReconnect: v })}
        label={t('session.tcpLink.autoReconnect')}
        disabled={sessionRunning}
      />
      {settings.autoReconnect ? (
        <>
          <NcFieldLabel htmlFor={`${idPrefix}-tcp-reint`}>{t('session.tcpLink.reconnectInterval')}</NcFieldLabel>
          <Input
            id={`${idPrefix}-tcp-reint`}
            value={settings.reconnectIntervalMs}
            disabled={sessionRunning}
            onChange={(e) => onChange({ reconnectIntervalMs: e.target.value })}
            variant="secondary"
            className={NC_INPUT}
            inputMode="numeric"
          />
          <NcFieldLabel htmlFor={`${idPrefix}-tcp-remax`}>{t('session.tcpLink.reconnectMax')}</NcFieldLabel>
          <Input
            id={`${idPrefix}-tcp-remax`}
            value={settings.reconnectMaxAttempts}
            disabled={sessionRunning}
            onChange={(e) => onChange({ reconnectMaxAttempts: e.target.value })}
            variant="secondary"
            className={NC_INPUT}
            inputMode="numeric"
            placeholder={t('session.tcpLink.reconnectMaxPlaceholder')}
          />
          <NcCheckboxRow
            checked={settings.reconnectBackoff}
            onChange={(v) => onChange({ reconnectBackoff: v })}
            label={t('session.tcpLink.reconnectBackoff')}
            disabled={sessionRunning}
          />
        </>
      ) : null}
      <NcCheckboxRow
        checked={settings.heartbeatEnabled}
        onChange={(v) => onChange({ heartbeatEnabled: v })}
        label={t('session.tcpLink.heartbeatEnable')}
        disabled={sessionRunning}
      />
      {settings.heartbeatEnabled ? (
        <>
          <NcFieldLabel htmlFor={`${idPrefix}-tcp-hbint`}>{t('session.tcpLink.heartbeatInterval')}</NcFieldLabel>
          <Input
            id={`${idPrefix}-tcp-hbint`}
            value={settings.heartbeatIntervalMs}
            disabled={sessionRunning}
            onChange={(e) => onChange({ heartbeatIntervalMs: e.target.value })}
            variant="secondary"
            className={NC_INPUT}
            inputMode="numeric"
          />
          <NcFieldLabel htmlFor={`${idPrefix}-tcp-hbto`}>{t('session.tcpLink.heartbeatTimeout')}</NcFieldLabel>
          <Input
            id={`${idPrefix}-tcp-hbto`}
            value={settings.heartbeatTimeoutMs}
            disabled={sessionRunning}
            onChange={(e) => onChange({ heartbeatTimeoutMs: e.target.value })}
            variant="secondary"
            className={NC_INPUT}
            inputMode="numeric"
          />
          <NcFieldLabel htmlFor={`${idPrefix}-tcp-hbhex`}>{t('session.tcpLink.heartbeatHex')}</NcFieldLabel>
          <Input
            id={`${idPrefix}-tcp-hbhex`}
            value={settings.heartbeatHex}
            disabled={sessionRunning}
            onChange={(e) => onChange({ heartbeatHex: e.target.value })}
            variant="secondary"
            className={`font-mono ${NC_INPUT}`}
            placeholder="00"
          />
        </>
      ) : null}
      <NcCheckboxRow
        checked={settings.tcpKeepalive}
        onChange={(v) => onChange({ tcpKeepalive: v })}
        label={t('session.tcpLink.tcpKeepalive')}
        disabled={sessionRunning}
      />
    </NcConfigCard>
  )
}
