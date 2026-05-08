/** Contiguous hex digits only (0-9, A-F), uppercased. Ignores spaces and other characters. */
export function compactHexUpper(raw: string): string {
  let out = ''
  for (const c of raw) {
    if (c >= '0' && c <= '9') out += c
    else if (c >= 'a' && c <= 'f') out += c.toUpperCase()
    else if (c >= 'A' && c <= 'F') out += c
  }
  return out
}

/** Uppercase hex, strip invalid characters, insert a single space between each byte (pair of nibbles). */
export function normalizeHexInput(raw: string): string {
  const digits = compactHexUpper(raw)
  const pairs: string[] = []
  for (let i = 0; i < digits.length; i += 2) {
    pairs.push(digits.slice(i, i + 2))
  }
  return pairs.join(' ')
}

/**
 * HEX 报文编辑器展示：整行 `//` 注释（trim 后以 // 开头）原样保留；
 * 其余行对首个 `//` 之前的片段做 {@link normalizeHexInput}，后缀从 `//` 起保留（与发送时取 hex 片段一致）。
 */
export function formatHexEditorBody(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map((line) => formatHexEditorLine(line))
    .join('\n')
}

function formatHexEditorLine(line: string): string {
  const t = line.trim()
  if (t.startsWith('//')) return line
  const idx = line.indexOf('//')
  if (idx === -1) return normalizeHexInput(line)
  const head = line.slice(0, idx).trimEnd()
  const tail = line.slice(idx)
  const norm = normalizeHexInput(head)
  if (!norm) return head.trim().length > 0 ? line : tail
  return `${norm} ${tail}`
}

/** True when the string contains at least one full byte of hex and no dangling nibble. */
export function isCompleteHexPayload(formattedOrRaw: string): boolean {
  const h = compactHexUpper(formattedOrRaw)
  return h.length > 0 && h.length % 2 === 0
}

/** Drop empty lines and lines whose trimmed content starts with `//` (full-line comments). */
export function stripFullLineSlashComments(raw: string): string {
  return raw
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim()
      return t.length > 0 && !t.startsWith('//')
    })
    .join('\n')
}

/** ASCII send: remove full-line `//` comments, trim trailing whitespace. */
export function extractAsciiPayloadFromEditor(raw: string): string {
  return stripFullLineSlashComments(raw).trimEnd()
}

/**
 * HEX send: skip full-line `//` comments; on other lines take text before `//`, join fragments,
 * then apply {@link normalizeHexInput} (uppercase + byte spacing).
 */
export function extractHexPayloadFromEditor(raw: string): string {
  const chunks: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('//')) continue
    const before = line.split('//')[0] ?? line
    const code = before.trim()
    if (code) chunks.push(code)
  }
  return normalizeHexInput(chunks.join(' '))
}
