import { Checkbox, Label } from '@heroui/react'
import type { ReactNode } from 'react'

export function NcFieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <Label
      htmlFor={htmlFor}
      className="mb-1 block text-[10px] font-medium text-[var(--nc-text-label)] sm:text-[10px]"
    >
      {children}
    </Label>
  )
}

export function NcCheckboxRow({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <Checkbox isSelected={checked} isDisabled={disabled} onChange={onChange} className="mt-0 p-0">
      {({ isSelected }) => (
        <div className="flex items-start gap-2">
          <Checkbox.Control
            className={
              isSelected
                ? 'mt-0.5 box-border size-4 shrink-0 rounded border border-[var(--nc-accent)] bg-[var(--nc-accent)] text-white shadow-none'
                : 'mt-0.5 box-border size-4 shrink-0 rounded border border-[var(--nc-text-faint)] bg-[var(--nc-bg-primary)] text-[var(--nc-text-muted)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
            }
          >
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Checkbox.Content className="text-xs leading-snug text-[var(--nc-text-body)]">{label}</Checkbox.Content>
        </div>
      )}
    </Checkbox>
  )
}

export function NcConfigCard({
  title,
  children,
  footer,
}: {
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="nc-config-card">
      <div className="nc-config-card-title">{title}</div>
      <div className="space-y-2">{children}</div>
      {footer ? <div className="nc-config-card-footer">{footer}</div> : null}
    </div>
  )
}
