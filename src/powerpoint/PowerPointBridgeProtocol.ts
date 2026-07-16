import { randomBytes } from 'crypto'

export const PROTOCOL_VERSION = 1

export function nowMs(): number {
  return Date.now()
}

export function createCommand(type: 'NEXT' | 'PREV' | 'GOTO' | 'GET_STATE' | 'PING' | 'SHUTDOWN', slideIndex?: number): Record<string, unknown> {
  const issuedAt = nowMs()
  return {
    protocolVersion: PROTOCOL_VERSION,
    messageType: 'COMMAND',
    sessionId: 'sion-link',
    commandId: randomBytes(12).toString('hex'),
    type,
    issuedAt,
    expiresAt: issuedAt + 3000,
    slideIndex
  }
}

export function encodeAgentFrame(type: 1 | 2, payload: Buffer): Buffer {
  const header = Buffer.alloc(5)
  header[0] = type
  header.writeInt32BE(payload.length, 1)
  return Buffer.concat([header, payload])
}

export function tryDecodeAgentFrames(buffer: Buffer): { frames: Array<{ type: number; payload: Buffer }>; rest: Buffer } {
  const frames: Array<{ type: number; payload: Buffer }> = []
  let offset = 0
  while (buffer.length - offset >= 5) {
    const type = buffer[offset]
    const length = buffer.readInt32BE(offset + 1)
    if (length < 0 || length > 32 * 1024 * 1024) throw new Error('Agent frame terlalu besar.')
    if (buffer.length - offset - 5 < length) break
    frames.push({ type, payload: buffer.subarray(offset + 5, offset + 5 + length) })
    offset += 5 + length
  }
  return { frames, rest: buffer.subarray(offset) }
}
