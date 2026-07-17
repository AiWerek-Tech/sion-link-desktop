import { app } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

export class PowerPointAgentManager {
  private child: ChildProcess | null = null

  get executablePath(): string {
    const exe = process.platform === 'win32' ? 'Sion.PowerPoint.Agent.exe' : 'Sion.PowerPoint.Agent'
    const publishParts = ['bin', 'Release', 'net8.0-windows', 'win-x64', 'publish', exe]
    const explicit = process.env.SION_PRESENTATION_AGENT_PATH
    const candidates = [
      explicit,
      path.join(process.resourcesPath, 'powerpoint-agent', exe),
      path.resolve(app.getAppPath(), '..', 'sion-powerpoint-agent', ...publishParts),
      path.resolve(app.getAppPath(), '..', '..', 'sion-powerpoint-agent', ...publishParts),
      path.resolve(process.cwd(), '..', 'sion-powerpoint-agent', ...publishParts),
      path.resolve(__dirname, '..', '..', '..', 'sion-powerpoint-agent', ...publishParts)
    ].filter((candidate): candidate is string => Boolean(candidate))
    const found = candidates.find((candidate) => fs.existsSync(candidate))
    return found ?? candidates[candidates.length - 1]
  }

  start(): void {
    if (process.platform !== 'win32') throw new Error('Presentation Agent untuk Microsoft PowerPoint hanya tersedia di Windows.')
    if (this.child && !this.child.killed) return
    const exe = this.executablePath
    if (!fs.existsSync(exe)) {
      throw new Error([
        `SION Presentation Agent belum ditemukan: ${exe}`,
        'Jalankan npm run agent:publish dari folder sion-link-desktop, atau set SION_PRESENTATION_AGENT_PATH ke file Agent.'
      ].join(' '))
    }
    this.child = spawn(exe, [], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    this.child.stderr?.on('data', (chunk) => console.warn('[PresentationAgent]', chunk.toString().trim()))
    this.child.stdout?.on('data', (chunk) => console.info('[PresentationAgent]', chunk.toString().trim()))
    this.child.once('exit', () => {
      this.child = null
    })
  }

  stop(): void {
    if (!this.child) return
    this.child.kill()
    this.child = null
  }
}
