interface LogLine {
  ts: string
  line: string
  kind: string
}

function writeU32(buf: number[], v: number) {
  buf.push((v >>> 0) & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
}

function writeU16(buf: number[], v: number) {
  buf.push((v >>> 0) & 0xff, (v >>> 8) & 0xff)
}

function pcapGlobalHeader(): number[] {
  const h: number[] = []
  writeU32(h, 0xa1b2c3d4) // magic
  writeU16(h, 2)           // version major
  writeU16(h, 4)           // version minor
  writeU32(h, 0)           // thiszone
  writeU32(h, 0)           // sigfigs
  writeU32(h, 65535)       // snaplen
  writeU32(h, 1)           // network (Ethernet)
  return h
}

function fakeEthIpTcpHeader(payloadLen: number): number[] {
  const h: number[] = []
  // Ethernet II (14 bytes)
  for (let i = 0; i < 12; i++) h.push(0)       // dst + src MAC
  writeU16(h, 0x0800)                             // EtherType: IPv4
  // IPv4 (20 bytes)
  h.push(0x45)                                    // version=4, IHL=5
  h.push(0)                                       // DSCP/ECN
  const ipTotalLen = 20 + 20 + payloadLen         // IP + TCP + payload
  writeU16(h, ipTotalLen)
  writeU16(h, 0)                                  // ID
  writeU16(h, 0x4000)                             // flags + frag
  h.push(64)                                      // TTL
  h.push(6)                                       // protocol: TCP
  writeU16(h, 0)                                  // header checksum (0)
  for (let i = 0; i < 4; i++) h.push(127)         // src: 127.0.0.x
  h[h.length - 4] = 1
  for (let i = 0; i < 4; i++) h.push(127)         // dst: 127.0.0.x
  h[h.length - 4] = 2
  // TCP (20 bytes, minimal)
  writeU16(h, 8080)                               // src port
  writeU16(h, 8080)                               // dst port
  writeU32(h, 0)                                  // seq
  writeU32(h, 0)                                  // ack
  h.push(0x50)                                    // data offset=5, flags=0
  h.push(0)                                       // window
  writeU16(h, 0)                                  // checksum
  writeU16(h, 0)                                  // urgent
  return h
}

function fakeEthIpUdpHeader(payloadLen: number): number[] {
  const h: number[] = []
  for (let i = 0; i < 12; i++) h.push(0)
  writeU16(h, 0x0800)
  // IPv4
  h.push(0x45)
  h.push(0)
  const ipTotalLen = 20 + 8 + payloadLen
  writeU16(h, ipTotalLen)
  writeU16(h, 0)
  writeU16(h, 0x4000)
  h.push(64)
  h.push(17)                                      // protocol: UDP
  writeU16(h, 0)
  for (let i = 0; i < 4; i++) h.push(127)
  h[h.length - 4] = 1
  for (let i = 0; i < 4; i++) h.push(127)
  h[h.length - 4] = 2
  // UDP (8 bytes)
  writeU16(h, 8080)
  writeU16(h, 8080)
  writeU16(h, 8 + payloadLen)                     // UDP length
  writeU16(h, 0)                                  // checksum
  return h
}

function encodePayloadBytes(line: string): number[] {
  const bytes: number[] = []
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i)
    if (c <= 0xff) {
      bytes.push(c)
    } else {
      // UTF-8 encode
      if (c < 0x800) {
        bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
      } else {
        bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
      }
    }
  }
  return bytes
}

function writePcapPacket(buf: number[], tsSeconds: number, tsUsec: number, data: number[]) {
  writeU32(buf, tsSeconds)
  writeU32(buf, tsUsec)
  writeU32(buf, data.length)
  writeU32(buf, data.length)
  for (const b of data) buf.push(b)
}

export function exportPcap(lines: LogLine[], isUdp: boolean): Blob {
  const buf = pcapGlobalHeader()

  for (const l of lines) {
    if (l.kind !== 'recv' && l.kind !== 'send' && l.kind !== 'send-data') continue
    const payload = encodePayloadBytes(l.line)
    if (payload.length === 0) continue

    const header = isUdp ? fakeEthIpUdpHeader(payload.length) : fakeEthIpTcpHeader(payload.length)
    const frame = [...header, ...payload]

    // Parse timestamp from log line (format: "HH:MM:SS.mmm" or ISO)
    let sec = 0, usec = 0
    try {
      const d = new Date(l.ts)
      if (!isNaN(d.getTime())) {
        sec = Math.floor(d.getTime() / 1000)
        usec = (d.getTime() % 1000) * 1000
      }
    } catch { /* use 0 */ }

    writePcapPacket(buf, sec, usec, frame)
  }

  return new Blob([new Uint8Array(buf)], { type: 'application/vnd.tcpdump.pcap' })
}
