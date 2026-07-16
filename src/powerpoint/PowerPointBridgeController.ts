import * as os from 'os'
import { PowerPointAgentManager } from './PowerPointAgentManager'
import { PowerPointAgentClient } from './PowerPointAgentClient'
import { PowerPointFrameRouter } from './PowerPointFrameRouter'
import { createCommand } from './PowerPointBridgeProtocol'
import type { AgentJsonMessage, PresentationBridgeStatus } from './types'

export class PowerPointBridgeController {
  private readonly manager = new PowerPointAgentManager()
  private readonly agent = new PowerPointAgentClient()
  private readonly router = new PowerPointFrameRouter((message) => {
    if (message.messageType !== 'COMMAND') return
    const type = String(message.type ?? '')
    if (type === 'NEXT' || type === 'PREV' || type === 'GOTO') {
      this.agent.sendCommand({
        protocolVersion: 1,
        messageType: 'COMMAND',
        sessionId: String(message.sessionId ?? 'sion-media'),
        commandId: String(message.commandId ?? `${Date.now()}`),
        type,
        issuedAt: Number(message.issuedAt ?? Date.now()),
        expiresAt: Number(message.expiresAt ?? Date.now() + 3000),
        slideIndex: typeof message.slideIndex === 'number' ? message.slideIndex : undefined
      })
    }
  })
  private status: PresentationBridgeStatus = {
    active: false,
    connected: false,
    engine: 'dotnet_agent',
    message: 'Presentation Bridge belum aktif',
    updatedAt: Date.now()
  }

  constructor(private readonly emitStatus: (status: PresentationBridgeStatus) => void) {
    this.agent.on('message', (message: AgentJsonMessage) => {
      this.handleAgentMessage(message)
      this.router.sendJson(message)
    })
    this.agent.on('frame', (meta: AgentJsonMessage | null, bytes: Buffer) => {
      if (meta) this.router.sendJson(meta)
      this.router.sendBinary(bytes)
    })
    this.agent.on('disconnect', () => this.patch({ connected: false, message: 'Presentation Agent terputus. Mencoba sambung ulang...' }))
  }

  async start(config: { ip: string; port: number; deviceId: string; bridgeToken: string }): Promise<PresentationBridgeStatus> {
    this.patch({ active: true, connected: false, message: 'Menjalankan SION Presentation Agent...' })
    this.manager.start()
    await this.agent.connect()
    await this.router.connect(config.ip, config.port, config.bridgeToken, config.deviceId)
    this.patch({ active: true, connected: true, message: 'Sinkronisasi presentasi real-time aktif' })
    return this.status
  }

  stop(): PresentationBridgeStatus {
    this.agent.disconnect()
    this.router.close()
    this.manager.stop()
    this.patch({ active: false, connected: false, message: 'Presentation Bridge dihentikan' })
    return this.status
  }

  sendCommand(type: 'NEXT' | 'PREV' | 'GOTO', slideIndex?: number): void {
    this.agent.sendCommand(createCommand(type, slideIndex))
  }

  private handleAgentMessage(message: AgentJsonMessage): void {
    if (message.messageType === 'HELLO') {
      this.patch({
        provider: String(message.provider ?? 'microsoft-powerpoint'),
        platform: String(message.platform ?? process.platform),
        agentVersion: String(message.agentVersion ?? ''),
        message: `Presentation Agent aktif di ${os.hostname()}`
      })
    }
    if (message.messageType === 'SLIDE_STATE_CHANGED') {
      this.patch({
        deckName: String(message.deckName ?? ''),
        slideIndex: Number(message.slideIndex ?? -1),
        totalSlides: Number(message.slideCount ?? 0),
        message: 'Slide terdeteksi; frame sedang disiapkan'
      })
    }
    if (message.messageType === 'FRAME_META') {
      this.patch({
        cacheHit: message.cacheHit === true,
        latencyMs: Date.now() - Number(message.capturedAt ?? Date.now()),
        message: message.cacheHit ? 'Frame dari cache terkirim' : 'Frame baru terkirim'
      })
    }
    if (message.messageType === 'ERROR') {
      this.patch({ connected: false, message: String(message.message ?? 'Presentation Bridge error') })
    }
  }

  private patch(patch: Partial<PresentationBridgeStatus>): void {
    this.status = { ...this.status, ...patch, engine: 'dotnet_agent', updatedAt: Date.now() }
    this.emitStatus(this.status)
  }
}
