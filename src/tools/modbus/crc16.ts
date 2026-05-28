import { compactHexUpper } from '../../network/hexInput'

/** Modbus RTU CRC-16 (polynomial 0xA001, init 0xFFFF). */
export function modbusCrc16(bytes: Uint8Array): number {
  let crc = 0xffff
  for (const b of bytes) {
    crc ^= b
    for (let i = 0; i < 8; i++) {
      if (crc & 1) crc = (crc >> 1) ^ 0xa001
      else crc >>= 1
    }
  }
  return crc & 0xffff
}

export function formatCrcLoHi(crc: number): string {
  const lo = (crc & 0xff).toString(16).padStart(2, '0').toUpperCase()
  const hi = ((crc >> 8) & 0xff).toString(16).padStart(2, '0').toUpperCase()
  return `${lo} ${hi}`
}

export function parseHexToBytes(hex: string): { bytes: Uint8Array } | { error: 'empty' | 'odd' | 'invalid' } {
  const compact = compactHexUpper(hex)
  if (compact.length === 0) return { error: 'empty' }
  if (compact.length % 2 !== 0) return { error: 'odd' }
  const bytes = new Uint8Array(compact.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    const pair = compact.slice(i * 2, i * 2 + 2)
    const n = Number.parseInt(pair, 16)
    if (Number.isNaN(n)) return { error: 'invalid' }
    bytes[i] = n
  }
  return { bytes }
}

export interface ModbusCrcResult {
  crc: number
  crcHex: string
  crcLoHi: string
  frameHex: string
}

export function modbusCrcFromHexInput(hex: string): ModbusCrcResult | { error: 'empty' | 'odd' | 'invalid' } {
  const parsed = parseHexToBytes(hex)
  if ('error' in parsed) return parsed
  const crc = modbusCrc16(parsed.bytes)
  const crcLoHi = formatCrcLoHi(crc)
  const frameCompact = compactHexUpper(hex)
  const crcCompact = crcLoHi.replace(/\s+/g, '')
  const frameHex = normalizeSpacedHex(frameCompact + crcCompact)
  return {
    crc,
    crcHex: crc.toString(16).padStart(4, '0').toUpperCase(),
    crcLoHi,
    frameHex,
  }
}

function normalizeSpacedHex(compact: string): string {
  const pairs: string[] = []
  for (let i = 0; i < compact.length; i += 2) {
    pairs.push(compact.slice(i, i + 2))
  }
  return pairs.join(' ')
}
