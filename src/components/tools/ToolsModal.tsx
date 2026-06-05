import { Button, Modal, Text, useOverlayState } from '@heroui/react'
import { Wrench } from 'lucide-react'
import { ModbusCrcPanel } from './ModbusCrcPanel'
import { useI18n } from '../../i18n'
import { NC_CHROME_BTN } from '../../network/themeClasses'

export function ToolsModalTrigger({ className }: { className?: string }) {
  const { t } = useI18n()
  const toolsModal = useOverlayState()

  return (
    <>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label={t('app.tools')}
        className={className ?? NC_CHROME_BTN}
        onPress={() => toolsModal.open()}
      >
        <Wrench size={14} />
      </Button>
      <Modal state={toolsModal}>
        <Modal.Backdrop>
          <Modal.Container size="md" placement="center" scroll="inside">
            <Modal.Dialog className="max-w-lg bg-[var(--nc-bg-surface)] text-[var(--nc-text-primary)]">
              <Modal.Header>
                <Modal.Heading>{t('tools.title')}</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-2">
                <Text type="body-xs" className="font-semibold uppercase tracking-wider text-[var(--nc-text-muted)]">
                  {t('tools.modbusSection')}
                </Text>
                <ModbusCrcPanel />
              </Modal.Body>
              <Modal.Footer className="justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  slot="close"
                  onPress={() => {
                    toolsModal.setOpen(false)
                  }}
                >
                  {t('settings.done')}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  )
}
