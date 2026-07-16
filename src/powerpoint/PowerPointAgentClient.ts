import * as net from 'net'
import { execFileSync } from 'child_process'
import { EventEmitter } from 'events'
import { encodeAgentFrame, tryDecodeAgentFrames } from './PowerPointBridgeProtocol'
import type { AgentJsonMessage } from './types'

export class PowerPointAgentClient extends EventEmitter {
  private socket: net.Socket | null = null
  private pendingFrameMeta: AgentJsonMessage | null = null
  private buffer = Buffer.alloc(0)

  async connect(): Promise<void> {
    if (this.socket && !this.socket.destroyed) return
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection(getCurrentUserPipePath())
      const timer = setTimeout(() => {
        socket.destroy()
        reject(new Error('Timeout menghubungkan SION Presentation Agent.'))
      }, 6000)
      socket.once('connect', () => {
        clearTimeout(timer)
        this.socket = socket
        resolve()
      })
      socket.once('error', reject)
      socket.on('data', (chunk) => this.onData(chunk))
      socket.on('close', () => this.emit('disconnect'))
    })
  }

  sendCommand(command: Record<string, unknown>): void {
    this.socket?.write(encodeAgentFrame(1, Buffer.from(JSON.stringify(command), 'utf-8')))
  }

  disconnect(): void {
    this.socket?.destroy()
    this.socket = null
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]) as Buffer<ArrayBuffer>
    const decoded = tryDecodeAgentFrames(this.buffer)
    this.buffer = decoded.rest as Buffer<ArrayBuffer>
    for (const frame of decoded.frames) {
      if (frame.type === 1) {
        const message = JSON.parse(frame.payload.toString('utf-8')) as AgentJsonMessage
        if (message.messageType === 'FRAME_META') this.pendingFrameMeta = message
        this.emit('message', message)
      } else if (frame.type === 2) {
        this.emit('frame', this.pendingFrameMeta, frame.payload)
        this.pendingFrameMeta = null
      }
    }
  }
}

export function getCurrentUserPipePath(): string {
  let identity = process.env.USERNAME || 'user'
  try {
    const output = execFileSync('whoami', ['/user', '/fo', 'csv', '/nh'], {
      windowsHide: true,
      encoding: 'utf-8'
    }).trim()
    const parts = output.split('","').map((part) => part.replace(/^"|"$/g, ''))
    identity = parts[1] || identity
  } catch {}
  const safe = identity.replace(/[^a-zA-Z0-9_-]/g, '-')
  return `\\\\.\\pipe\\sion-presentation-agent-v1-${safe}`
}
