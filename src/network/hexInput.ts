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

/** True when the string contains at least one full byte of hex and no dangling nibble. */
export function isCompleteHexPayload(formattedOrRaw: string): boolean {
  const h = compactHexUpper(formattedOrRaw)
  return h.length > 0 && h.length % 2 === 0
}
