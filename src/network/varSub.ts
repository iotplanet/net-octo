let varCounter = 0

export function resetVarCounter(): void {
  varCounter = 0
}

export function getVarCounter(): number {
  return varCounter
}

/**
 * Expand `${variable}` patterns in a payload string.
 * Supported variables:
 *   ${timestamp}   — ISO 8601 timestamp (UTC)
 *   ${counter}     — auto-incrementing integer (shared across all tabs)
 *   ${random:N}    — N random hex bytes (e.g. ${random:4} → 8 hex chars)
 */
export function expandVariables(payload: string): string {
  return payload.replace(/\$\{(\w+)(?::(\d+))?\}/g, (_match, name: string, arg?: string) => {
    switch (name) {
      case 'timestamp':
        return new Date().toISOString()
      case 'counter': {
        varCounter += 1
        return String(varCounter)
      }
      case 'random': {
        const n = Math.max(1, Math.min(256, Number(arg) || 4))
        const bytes = new Uint8Array(n)
        globalThis.crypto?.getRandomValues(bytes)
        return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
      }
      default:
        return `\${${name}${arg ? `:${arg}` : ''}}`
    }
  })
}
