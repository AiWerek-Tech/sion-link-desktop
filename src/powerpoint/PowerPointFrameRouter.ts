import * as net from 'net'
import { createHash, randomBytes } from 'crypto'
import type { AgentJsonMessage } from './types'

function encodeWsFrame(opcode: number, payload: Buffer): Buffer {
  const length = payload.length
  let header: Buffer
  if (length < 126) {
    header = Buffer.alloc(2)
    header[1] = 0x80 | length
  } else if (length <= 0xffff) {
    header = Buffer.alloc(4)
    header[1] = 0x80 | 126
    header.writeUInt16BE(length, 2)
  } else {
    header = Buffer.alloc(10)
    header[1] = 0x80 | 127
    header.writeBigUInt64BE(BigInt(length), 2)
  }
  header[0] = 0x80 | opcode
  const mask = randomBytes(4)
  const masked = Buffer.alloc(payload.length)
  for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4]
  return Buffer.concat([header, mask, masked])
}

export class PowerPointFrameRouter {
  private socket: net.Socket | null = null
  private incoming = Buffer.alloc(0)
  constructor(private readonly onMessage?: (message: Record<string, unknown>) => void) {}

  async connect(ip: string, port: number, token: string, deviceId: string): Promise<void> {
    const key = randomBytes(16).toString('base64')
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host: ip, port })
      const timer = setTimeout(() => {
        socket.destroy()
        reject(new Error('Timeout membuka WebSocket Presentation Bridge.'))
      }, 5000)
      socket.once('connect', () => {
        socket.write([
          'GET /api/presentation-bridge/ws HTTP/1.1',
          `Host: ${ip}:${port}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${key}`,
          'Sec-WebSocket-Version: 13',
          `X-SION-Bridge-Token: ${token}`,
          `X-SION-Device-Id: ${deviceId}`,
          '\r\n'
        ].join('\r\n'))
      })
      socket.once('data', (data) => {
        const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
        if (!data.toString('utf-8').includes('101') || !data.toString('utf-8').includes(accept)) {
          socket.destroy()
          reject(new Error('SION Media menolak WebSocket Presentation Bridge.'))
          return
        }
        clearTimeout(timer)
        this.socket = socket
        socket.on('data', (chunk) => this.onData(chunk))
        resolve()
      })
      socket.once('error', reject)
    })
  }

  sendJson(message: AgentJsonMessage): void {
    this.socket?.write(encodeWsFrame(1, Buffer.from(JSON.stringify(message), 'utf-8')))
  }

  sendBinary(bytes: Buffer): void {
    this.socket?.write(encodeWsFrame(2, bytes))
  }

  close(): void {
    this.socket?.destroy()
    this.socket = null
  }

  private onData(chunk: Buffer): void {
    this.incoming = Buffer.concat([this.incoming, chunk])
    while (this.incoming.length >= 2) {
      const opcode = this.incoming[0] & 0x0f
      let length = this.incoming[1] & 0x7f
      let offset = 2
      if (length === 126) {
        if (this.incoming.length < 4) return
        length = this.incoming.readUInt16BE(2)
        offset = 4
      } else if (length === 127) {
        if (this.incoming.length < 10) return
        const big = this.incoming.readBigUInt64BE(2)
        if (big > BigInt(32 * 1024 * 1024)) throw new Error('WebSocket frame terlalu besar.')
        length = Number(big)
        offset = 10
      }
      const masked = (this.incoming[1] & 0x80) !== 0
      let mask: Buffer | null = null
      if (masked) {
        if (this.incoming.length < offset + 4) return
        mask = this.incoming.subarray(offset, offset + 4)
        offset += 4
      }
      if (this.incoming.length < offset + length) return
      const payload = Buffer.from(this.incoming.subarray(offset, offset + length))
      this.incoming = this.incoming.subarray(offset + length)
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4]
      if (opcode === 1) {
        try { this.onMessage?.(JSON.parse(payload.toString('utf-8')) as Record<string, unknown>) } catch {}
      }
    }
  }
}
