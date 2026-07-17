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
    const startedAt = Date.now()
    let lastError: Error | null = null
    while (Date.now() - startedAt < 10000) {
      try {
        await this.connectOnce()
        return
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
    }
    throw new Error(`Gagal menghubungkan SION Presentation Agent: ${lastError?.message ?? 'Agent tidak merespons.'}`)
  }

  private async connectOnce(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection(getCurrentUserPipePath())
      let settled = false
      const fail = (error: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket.destroy()
        reject(error)
      }
      const timer = setTimeout(() => {
        fail(new Error('Timeout menghubungkan SION Presentation Agent.'))
      }, 1500)
      socket.once('connect', () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.socket = socket
        socket.on('close', () => this.emit('disconnect'))
        resolve()
      })
      socket.once('error', fail)
      socket.on('data', (chunk) => this.onData(chunk))
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
