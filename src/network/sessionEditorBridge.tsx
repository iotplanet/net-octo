import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react'

export interface SessionEditorActions {
  /** Append spaced HEX (or raw fragment in ASCII mode) to the active message editor. */
  appendToEditor: (fragment: string) => void
}

interface SessionEditorBridgeValue {
  activeTabId: string
  register: (sessionId: string, actions: SessionEditorActions) => void
  unregister: (sessionId: string) => void
  getActiveActions: () => SessionEditorActions | null
}

const SessionEditorBridgeContext = createContext<SessionEditorBridgeValue | null>(null)

export function SessionEditorBridgeProvider({
  activeTabId,
  children,
}: {
  activeTabId: string
  children: ReactNode
}) {
  const handlersRef = useRef<Map<string, SessionEditorActions>>(new Map())

  const register = useCallback((sessionId: string, actions: SessionEditorActions) => {
    handlersRef.current.set(sessionId, actions)
  }, [])

  const unregister = useCallback((sessionId: string) => {
    handlersRef.current.delete(sessionId)
  }, [])

  const getActiveActions = useCallback(() => {
    return handlersRef.current.get(activeTabId) ?? null
  }, [activeTabId])

  const value = useMemo(
    () => ({ activeTabId, register, unregister, getActiveActions }),
    [activeTabId, register, unregister, getActiveActions],
  )

  return <SessionEditorBridgeContext.Provider value={value}>{children}</SessionEditorBridgeContext.Provider>
}

export function useSessionEditorBridge(): SessionEditorBridgeValue {
  const ctx = useContext(SessionEditorBridgeContext)
  if (!ctx) throw new Error('useSessionEditorBridge must be used within SessionEditorBridgeProvider')
  return ctx
}
