export type PresentationBridgeEngine = 'dotnet_agent' | 'legacy_powershell'

export interface PresentationCapabilities {
  eventDriven: boolean
  next: boolean
  previous: boolean
  gotoSlide: boolean
  slideExport: boolean
  binaryFrame: boolean
  speakerNotes: boolean
  nextSlidePrefetch: boolean
  animationAwareness: 'none' | 'partial' | 'full'
}

export interface PresentationBridgeStatus {
  active: boolean
  connected: boolean
  engine: PresentationBridgeEngine
  provider?: string
  platform?: string
  agentVersion?: string
  message: string
  deckName?: string
  slideIndex?: number
  totalSlides?: number
  latencyMs?: number
  cacheHit?: boolean
  updatedAt: number
}

export interface AgentJsonMessage {
  protocolVersion?: number
  messageType?: string
  sessionId?: string
  sequence?: number
  [key: string]: unknown
}

export interface PresentationCommand {
  commandId: string
  type: 'NEXT' | 'PREV' | 'GOTO' | 'GET_STATE' | 'PING' | 'SHUTDOWN'
  issuedAt: number
  expiresAt: number
  slideIndex?: number
}
