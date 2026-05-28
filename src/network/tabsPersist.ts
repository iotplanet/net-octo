const WORKSPACE_STORAGE_KEY = 'netocto.workspace.v1'

export interface PersistedWorkspace {
  tabIds: string[]
  activeTabId: string
  /** User-defined tab labels; empty string clears the override */
  customNames: Record<string, string>
}

const defaultWorkspace = (): PersistedWorkspace => ({
  tabIds: ['main'],
  activeTabId: 'main',
  customNames: {},
})

function normalizeWorkspace(raw: unknown): PersistedWorkspace {
  const base = defaultWorkspace()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Partial<PersistedWorkspace>
  const tabIds = Array.isArray(o.tabIds)
    ? o.tabIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : base.tabIds
  if (tabIds.length === 0) return base
  const activeTabId =
    typeof o.activeTabId === 'string' && tabIds.includes(o.activeTabId) ? o.activeTabId : tabIds[0]!
  const customNames: Record<string, string> = {}
  if (o.customNames && typeof o.customNames === 'object') {
    for (const [k, v] of Object.entries(o.customNames)) {
      if (typeof v === 'string' && v.trim()) customNames[k] = v.trim()
    }
  }
  return { tabIds, activeTabId, customNames }
}

export function loadWorkspace(): PersistedWorkspace {
  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY)
    if (!raw) return defaultWorkspace()
    return normalizeWorkspace(JSON.parse(raw))
  } catch {
    return defaultWorkspace()
  }
}

export function saveWorkspace(workspace: PersistedWorkspace) {
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace))
  } catch {
    /* ignore quota */
  }
}
