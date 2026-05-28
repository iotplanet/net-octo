import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useMemo, useRef } from 'react'
import {
  CENTER_SPLIT_EDITOR_MIN_PX,
  CENTER_SPLIT_HANDLE_PX,
  CENTER_SPLIT_LOG_MIN_PX,
  CENTER_SPLIT_RATIO_DEFAULT,
  CENTER_SPLIT_RATIO_MAX,
  CENTER_SPLIT_RATIO_MIN,
  clampCenterSplitRatio,
} from './persist'

function splitPaneFlexStyles(ratio: number): { logPaneStyle: CSSProperties; editorPaneStyle: CSSProperties } {
  const logFlex = clampCenterSplitRatio(ratio)
  const editorFlex = 1 - logFlex
  return {
    logPaneStyle: { flex: `${logFlex} 1 0`, minHeight: CENTER_SPLIT_LOG_MIN_PX },
    editorPaneStyle: { flex: `${editorFlex} 1 0`, minHeight: CENTER_SPLIT_EDITOR_MIN_PX },
  }
}

export function useVerticalSplitDrag(ratio: number, onRatioChange: (r: number) => void) {
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const setRatioFromClientY = useCallback(
    (clientY: number) => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const avail = rect.height - CENTER_SPLIT_HANDLE_PX
      if (avail < CENTER_SPLIT_LOG_MIN_PX + CENTER_SPLIT_EDITOR_MIN_PX) return
      const y = Math.min(
        Math.max(clientY - rect.top, CENTER_SPLIT_LOG_MIN_PX),
        avail - CENTER_SPLIT_EDITOR_MIN_PX,
      )
      onRatioChange(clampCenterSplitRatio(y / avail))
    },
    [onRatioChange],
  )

  const onSeparatorPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      draggingRef.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      setRatioFromClientY(e.clientY)
    },
    [setRatioFromClientY],
  )

  const onSeparatorPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current || !e.currentTarget.hasPointerCapture(e.pointerId)) return
      setRatioFromClientY(e.clientY)
    },
    [setRatioFromClientY],
  )

  const onSeparatorPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }, [])

  const onSeparatorDoubleClick = useCallback(() => {
    onRatioChange(CENTER_SPLIT_RATIO_DEFAULT)
  }, [onRatioChange])

  const onSeparatorKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 0.1 : 0.05
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        onRatioChange(clampCenterSplitRatio(ratio - step))
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        onRatioChange(clampCenterSplitRatio(ratio + step))
      } else if (e.key === 'Home') {
        e.preventDefault()
        onRatioChange(CENTER_SPLIT_RATIO_DEFAULT)
      }
    },
    [onRatioChange, ratio],
  )

  const { logPaneStyle, editorPaneStyle } = useMemo(() => splitPaneFlexStyles(ratio), [ratio])

  const separatorProps = useMemo(
    () => ({
      role: 'separator' as const,
      'aria-orientation': 'horizontal' as const,
      'aria-valuenow': Math.round(ratio * 100),
      'aria-valuemin': Math.round(CENTER_SPLIT_RATIO_MIN * 100),
      'aria-valuemax': Math.round(CENTER_SPLIT_RATIO_MAX * 100),
      tabIndex: 0,
      className:
        'group relative z-10 flex shrink-0 touch-none cursor-ns-resize select-none items-center justify-center bg-transparent',
      style: { height: CENTER_SPLIT_HANDLE_PX },
      onPointerDown: onSeparatorPointerDown,
      onPointerMove: onSeparatorPointerMove,
      onPointerUp: onSeparatorPointerUp,
      onPointerCancel: onSeparatorPointerUp,
      onDoubleClick: onSeparatorDoubleClick,
      onKeyDown: onSeparatorKeyDown,
    }),
    [
      ratio,
      onSeparatorPointerDown,
      onSeparatorPointerMove,
      onSeparatorPointerUp,
      onSeparatorDoubleClick,
      onSeparatorKeyDown,
    ],
  )

  return { containerRef, logPaneStyle, editorPaneStyle, separatorProps }
}
