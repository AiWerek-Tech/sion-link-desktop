import { app, BrowserWindow, ipcMain, globalShortcut, nativeTheme } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { spawn } from 'child_process'
import { randomBytes } from 'crypto'

let mainWindow: BrowserWindow | null = null
let isOnConnectionScreen = true
let connectedOrigin: string | null = null
let startupNotice: string | null = null
let presentationBridgeTimer: NodeJS.Timeout | null = null
let presentationBridgeBusy = false
let presentationBridgeLastKey = ''
let presentationBridgeConfig: {
  ip: string
  port: number
  deviceId: string
  pairingSecret: string
  requestId: string | null
  bridgeToken: string | null
} | null = null
const configPath = path.join(app.getPath('userData'), 'connection-config.json')
const historyPath = path.join(app.getPath('userData'), 'connection-history.json')
const bridgeIdentityPath = path.join(app.getPath('userData'), 'powerpoint-bridge-identity.json')

interface SavedConfig {
  ip: string
  port: number
  code: string
  remember: boolean
}

interface HistoryEntry {
  ip: string
  port: number
  role: string
  label: string
  timestamp: number
}

interface PresentationBridgeStatus {
  active: boolean
  connected: boolean
  message: string
  slideIndex?: number
  totalSlides?: number
  updatedAt: number
}

function getPresentationBridgeIdentity(): { deviceId: string; pairingSecret: string } {
  try {
    const saved = JSON.parse(fs.readFileSync(bridgeIdentityPath, 'utf-8')) as Record<string, unknown>
    if (/^[a-zA-Z0-9_-]{8,96}$/.test(String(saved.deviceId)) && /^[a-fA-F0-9]{32,128}$/.test(String(saved.pairingSecret))) {
      return { deviceId: String(saved.deviceId), pairingSecret: String(saved.pairingSecret) }
    }
  } catch {}
  const identity = {
    deviceId: `sion-link-${randomBytes(12).toString('hex')}`,
    pairingSecret: randomBytes(32).toString('hex')
  }
  fs.writeFileSync(bridgeIdentityPath, JSON.stringify(identity, null, 2), 'utf-8')
  return identity
}

let presentationBridgeStatus: PresentationBridgeStatus = {
  active: false,
  connected: false,
  message: 'Bridge belum aktif',
  updatedAt: Date.now()
}

function emitBridgeStatus(patch: Partial<PresentationBridgeStatus>): void {
  presentationBridgeStatus = { ...presentationBridgeStatus, ...patch, updatedAt: Date.now() }
  mainWindow?.webContents.send('presentation-bridge:status', presentationBridgeStatus)
}

function runPowerShellJson(script: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-OutputFormat', 'Text', '-EncodedCommand', encoded], { windowsHide: true })
    let output = ''
    let error = ''
    const timer = setTimeout(() => child.kill(), 10_000)
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (error += chunk.toString()))
    child.once('error', reject)
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error(error.trim() || 'PowerPoint tidak merespons'))
      try { resolve(JSON.parse(output.trim()) as Record<string, unknown>) } catch { reject(new Error('Respons PowerPoint tidak valid')) }
    })
  })
}

function friendlyPowerPointError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/GetActiveObject|0x800401e3|operation unavailable/i.test(message)) return 'PowerPoint belum terbuka. Buka file lalu jalankan Slide Show.'
  if (/SlideShowWindows|Jalankan Slide Show/i.test(message)) return 'File terdeteksi, tetapi Slide Show belum berjalan. Tekan F5 di PowerPoint.'
  if (/PowerPoint tidak merespons/i.test(message)) return 'PowerPoint tidak merespons. Tutup dialog PowerPoint yang masih terbuka lalu coba lagi.'
  const clean = message.replace(/#< CLIXML[\s\S]*/i, '').trim()
  if (/null-valued|CurrentShowPosition|Slides\.Item/i.test(message)) return 'Slide Show berubah atau belum siap. Jalankan kembali Slide Show lalu coba lagi.'
  return clean || 'Bridge gagal menyinkronkan PowerPoint.'
}

async function ensurePresentationBridgeApproval(): Promise<boolean> {
  if (!presentationBridgeConfig) return false
  const config = presentationBridgeConfig
  const base = `http://${config.ip}:${config.port}`
  if (!config.requestId) {
    const response = await fetch(`${base}/api/powerpoint-bridge/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: config.deviceId,
        pairingSecret: config.pairingSecret,
        deviceName: os.hostname(),
        deckName: 'PowerPoint Presentation'
      }),
      signal: AbortSignal.timeout(5000)
    })
    if (!response.ok) throw new Error(`SION Media menolak permintaan (HTTP ${response.status})`)
    const body = await response.json() as { requestId?: string; bridgeToken?: string }
    config.requestId = body.requestId ?? null
    config.bridgeToken = body.bridgeToken ?? null
  }
  if (!config.bridgeToken && config.requestId) {
    const query = new URLSearchParams({ requestId: config.requestId, deviceId: config.deviceId, pairingSecret: config.pairingSecret })
    const response = await fetch(`${base}/api/powerpoint-bridge/request?${query}`, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error(response.status === 404 ? 'Permintaan persetujuan sudah kedaluwarsa. Mulai ulang bridge.' : `Gagal memeriksa persetujuan (HTTP ${response.status})`)
    const body = await response.json() as { status?: string; bridgeToken?: string }
    if (body.status === 'rejected') throw new Error('Permintaan ditolak oleh operator SION Media.')
    config.bridgeToken = body.bridgeToken ?? null
  }
  if (!config.bridgeToken) {
    emitBridgeStatus({ active: true, connected: false, message: 'Menunggu persetujuan operator di panel PPT SION Media...' })
    return false
  }
  return true
}

async function pollPresentationBridge(): Promise<boolean> {
  if (!presentationBridgeConfig || presentationBridgeBusy) return false
  presentationBridgeBusy = true
  let connected = false
  try {
    if (!(await ensurePresentationBridgeApproval())) return false
    const framePath = path.join(app.getPath('temp'), 'sion-link-powerpoint-current.png')
    const nextFramePath = path.join(app.getPath('temp'), 'sion-link-powerpoint-next.png')
    const escapedFrame = framePath.replace(/'/g, "''")
    const escapedNextFrame = nextFramePath.replace(/'/g, "''")
    const script = `$ErrorActionPreference='Stop'; $ppt=[Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application'); if($ppt.SlideShowWindows.Count -lt 1){throw 'Jalankan Slide Show PowerPoint terlebih dahulu.'}; $view=$ppt.SlideShowWindows.Item(1).View; $deck=$view.Presentation; $slide=$view.Slide; if($null -eq $slide){throw 'Slide Show belum siap.'}; $idx=[int]$slide.SlideIndex; $title=''; try{$title=$slide.Shapes.Title.TextFrame.TextRange.Text}catch{}; $notes=@(); foreach($shape in $slide.NotesPage.Shapes){try{if($shape.HasTextFrame -and $shape.TextFrame.HasText){$value=[string]$shape.TextFrame.TextRange.Text; if($value.Trim()){$notes += $value}}}catch{}}; if(Test-Path '${escapedFrame}'){Remove-Item -LiteralPath '${escapedFrame}' -Force}; $slide.Export('${escapedFrame}','PNG',1920,1080); $nextPath=''; $nextTitle=''; if($idx -lt [int]$deck.Slides.Count){$next=$deck.Slides.Item($idx+1); if(Test-Path '${escapedNextFrame}'){Remove-Item -LiteralPath '${escapedNextFrame}' -Force}; $next.Export('${escapedNextFrame}','PNG',1920,1080); $nextPath='${escapedNextFrame}'; try{$nextTitle=$next.Shapes.Title.TextFrame.TextRange.Text}catch{}}; @{slideIndex=($idx-1);totalSlides=[int]$deck.Slides.Count;title=[string]$title;notes=($notes -join [Environment]::NewLine);framePath='${escapedFrame}';nextFramePath=[string]$nextPath;nextTitle=[string]$nextTitle;deck=[string]$deck.Name}|ConvertTo-Json -Compress`
    const state = await runPowerShellJson(script)
    const key = `${state.deck}:${state.slideIndex}`
    if (key !== presentationBridgeLastKey) {
      const imageDataUrl = `data:image/png;base64,${fs.readFileSync(String(state.framePath)).toString('base64')}`
      const nextImageDataUrl = state.nextFramePath && fs.existsSync(String(state.nextFramePath))
        ? `data:image/png;base64,${fs.readFileSync(String(state.nextFramePath)).toString('base64')}`
        : null
      const base = `http://${presentationBridgeConfig.ip}:${presentationBridgeConfig.port}`
      const response = await fetch(`${base}/api/presentation-source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bridgeToken: presentationBridgeConfig.bridgeToken,
          deviceId: presentationBridgeConfig.deviceId,
          deckName: String(state.deck || 'PowerPoint Presentation'),
          imageDataUrl,
          nextImageDataUrl,
          nextTitle: String(state.nextTitle || ''),
          title: String(state.title || state.deck || 'PowerPoint Live'),
          notes: String(state.notes || ''),
          slideIndex: Number(state.slideIndex),
          totalSlides: Number(state.totalSlides)
        }),
        signal: AbortSignal.timeout(15_000)
      })
      if (response.status === 401) {
        presentationBridgeConfig.bridgeToken = null
        presentationBridgeConfig.requestId = null
        throw new Error('Persetujuan berakhir. Permintaan baru akan dikirim otomatis.')
      }
      if (!response.ok) throw new Error(`SION Media menolak sumber (HTTP ${response.status})`)
      presentationBridgeLastKey = key
    }
    emitBridgeStatus({ active: true, connected: true, message: 'PowerPoint terhubung dan sinkron', slideIndex: Number(state.slideIndex), totalSlides: Number(state.totalSlides) })
    connected = true
  } catch (error) {
    emitBridgeStatus({ active: true, connected: false, message: friendlyPowerPointError(error) })
  } finally {
    presentationBridgeBusy = false
  }
  return connected
}

function stopPresentationBridge(): PresentationBridgeStatus {
  if (presentationBridgeTimer) clearInterval(presentationBridgeTimer)
  presentationBridgeTimer = null
  presentationBridgeConfig = null
  presentationBridgeLastKey = ''
  emitBridgeStatus({ active: false, connected: false, message: 'Bridge dihentikan', slideIndex: undefined, totalSlides: undefined })
  return presentationBridgeStatus
}

// ── Config persistence ──
function getSavedConfig(): SavedConfig | null {
  try {
    if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  } catch {}
  return null
}

function saveConfig(config: SavedConfig): void {
  try { fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8') } catch {}
}

function clearConfig(): void {
  try { if (fs.existsSync(configPath)) fs.unlinkSync(configPath) } catch {}
}

// ── History ──
function getHistory(): HistoryEntry[] {
  try {
    if (fs.existsSync(historyPath)) return JSON.parse(fs.readFileSync(historyPath, 'utf-8'))
  } catch {}
  return []
}

function addHistory(entry: HistoryEntry): void {
  try {
    let list = getHistory()
    // Remove duplicate by ip+port
    list = list.filter(h => !(h.ip === entry.ip && h.port === entry.port))
    list.unshift(entry)
    if (list.length > 5) list = list.slice(0, 5)
    fs.writeFileSync(historyPath, JSON.stringify(list, null, 2), 'utf-8')
  } catch {}
}

function clearHistory(): void {
  try { if (fs.existsSync(historyPath)) fs.unlinkSync(historyPath) } catch {}
}

// ── Network discovery ──
function getLocalSubnet(): string | null {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    const addrs = interfaces[name]
    if (!addrs) continue
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal && addr.address.startsWith('192.168.')) {
        return addr.address
      }
    }
  }
  // Fallback to any non-internal IPv4
  for (const name of Object.keys(interfaces)) {
    const addrs = interfaces[name]
    if (!addrs) continue
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address
      }
    }
  }
  return null
}

function getLocalIpv4Addresses(): string[] {
  const addresses: string[] = []
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const address of entries || []) {
      if (address.family === 'IPv4' && !address.internal && !address.address.startsWith('169.254.')) {
        addresses.push(address.address)
      }
    }
  }
  return Array.from(new Set(addresses)).slice(0, 3)
}

interface DiscoveredServer {
  ip: string
  port: number
  name: string
  version: string
}

async function probeSionServer(ip: string, port: number): Promise<DiscoveredServer | null> {
  try {
    const response = await fetch(`http://${ip}:${port}/api/discovery`, {
      signal: AbortSignal.timeout(450)
    })
    if (!response.ok) return null
    const body = (await response.json()) as Record<string, unknown>
    if (body.ok !== true || body.service !== 'sion-media') return null
    return {
      ip,
      port: Number(body.port) || port,
      name: String(body.name || 'SION Media'),
      version: String(body.version || '')
    }
  } catch {
    return null
  }
}

async function scanNetwork(preferredPort?: number): Promise<DiscoveredServer[]> {
  const localAddresses = getLocalIpv4Addresses()
  if (localAddresses.length === 0) return []
  const found: DiscoveredServer[] = []
  const savedPort = getSavedConfig()?.port
  const ports = Array.from(
    new Set([preferredPort, savedPort, 41732, 55082].filter((value): value is number => Boolean(value)))
  )

  // Scan in batches of 25 for speed
  const allIps: string[] = []
  for (const localIp of localAddresses) {
    const parts = localIp.split('.')
    const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`
    for (let i = 1; i <= 254; i++) allIps.push(`${subnet}.${i}`)
  }
  const uniqueIps = Array.from(new Set(allIps))

  const batchSize = 30
  for (let i = 0; i < uniqueIps.length; i += batchSize) {
    const batch = uniqueIps.slice(i, i + batchSize)
    const results = await Promise.all(
      batch.map(async (ip) => {
        const candidates = await Promise.all(ports.map((candidatePort) => probeSionServer(ip, candidatePort)))
        return candidates.find((candidate): candidate is DiscoveredServer => candidate !== null) ?? null
      })
    )
    for (const discovered of results) {
      if (discovered && !found.some((item) => item.ip === discovered.ip && item.port === discovered.port)) {
        found.push(discovered)
      }
    }
    // Notify progress
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scan-progress', {
        scanned: Math.min(i + batchSize, uniqueIps.length),
        total: uniqueIps.length,
        found: found.length
      })
    }
  }

  return found
}

// ── Window ──
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 720,
    minHeight: 620,
    title: 'SION Link',
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#8b92a5',
      height: 40
    },
    backgroundColor: '#0c0d11',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  nativeTheme.themeSource = 'dark'

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (isOnConnectionScreen || !connectedOrigin) return
    try {
      if (new URL(targetUrl).origin === connectedOrigin) return
    } catch {}
    event.preventDefault()
  })
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _description, validatedUrl, isMainFrame) => {
    if (!isMainFrame || isOnConnectionScreen || !/^https?:\/\//i.test(validatedUrl)) return
    startupNotice = `Koneksi ke SION Media terputus (kode ${errorCode}). Server akan dicari kembali.`
    loadConnectionScreen()
  })
  loadConnectionScreen()

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (isOnConnectionScreen) return
    if (input.type !== 'keyDown') return
    if (input.key === 'Escape' || (input.control && input.shift && input.key.toLowerCase() === 'd')) {
      loadConnectionScreen()
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

function loadConnectionScreen(): void {
  if (!mainWindow) return
  isOnConnectionScreen = true
  connectedOrigin = null
  mainWindow.setMinimumSize(720, 620)
  const [w] = mainWindow.getSize()
  if (w < 900) { mainWindow.setSize(1080, 760, true); mainWindow.center() }
  mainWindow.setMenuBarVisibility(false)
  mainWindow.loadFile(path.join(__dirname, '../src/renderer/index.html'))
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => globalShortcut.unregisterAll())

// ── IPC Handlers ──
ipcMain.handle('get-saved-config', () => getSavedConfig())
ipcMain.handle('clear-saved-config', () => { clearConfig(); return true })
ipcMain.handle('get-app-version', () => app.getVersion())
ipcMain.handle('get-history', () => getHistory())
ipcMain.handle('clear-history', () => { clearHistory(); return true })
ipcMain.handle('get-local-ip', () => getLocalSubnet())
ipcMain.handle('get-startup-notice', () => {
  const notice = startupNotice
  startupNotice = null
  return notice
})

ipcMain.handle('scan-network', async (_event, port?: number) => {
  return scanNetwork(port)
})

ipcMain.handle('presentation-bridge:status', () => presentationBridgeStatus)
ipcMain.handle('presentation-bridge:stop', () => stopPresentationBridge())
ipcMain.handle('presentation-bridge:start', async (_event, data: { ip: string; port: number }) => {
  if (!data || !/^([a-zA-Z0-9.-]+)$/.test(data.ip) || !Number.isInteger(data.port) || data.port < 1 || data.port > 65535) {
    return { ok: false, error: 'Konfigurasi bridge tidak valid.' }
  }
  try {
    const discovery = await fetch(`http://${data.ip}:${data.port}/api/discovery`, { signal: AbortSignal.timeout(5000) })
    if (!discovery.ok) return { ok: false, error: `SION Media menolak koneksi (HTTP ${discovery.status}).` }
    const body = await discovery.json() as { capabilities?: string[] }
    if (!body.capabilities?.includes('powerpoint-bridge-approval')) return { ok: false, error: 'Versi SION Media ini belum mendukung persetujuan PowerPoint Bridge.' }
  } catch {
    return { ok: false, error: 'SION Media tidak dapat dijangkau. Pastikan server aktif dan berada di LAN yang sama.' }
  }
  stopPresentationBridge()
  presentationBridgeConfig = { ...data, ...getPresentationBridgeIdentity(), requestId: null, bridgeToken: null }
  emitBridgeStatus({ active: true, connected: false, message: 'Mengirim permintaan akses ke operator...' })
  await pollPresentationBridge()
  presentationBridgeTimer = setInterval(() => void pollPresentationBridge(), 1000)
  return { ok: true, status: presentationBridgeStatus }
})

ipcMain.handle('connect', async (_event, data: SavedConfig) => {
  const { ip, port, code, remember } = data
  const base = `http://${ip}:${port}`

  try {
    const res = await fetch(`${base}/api/session?code=${encodeURIComponent(code)}`, {
      signal: AbortSignal.timeout(5000)
    })

    if (!res.ok) {
      const msgs: Record<number, string> = {
        401: 'Kode akses tidak valid.',
        403: 'Role ini sedang dinonaktifkan oleh operator.',
        429: 'Terlalu banyak percobaan. Tunggu beberapa saat.'
      }
      return { ok: false, error: msgs[res.status] || `Server: HTTP ${res.status}` }
    }

    const body = (await res.json()) as Record<string, unknown>
    if (!body?.ok) return { ok: false, error: (body?.error as string) || 'Autentikasi gagal.' }

    if (remember) saveConfig({ ip, port, code, remember })
    else clearConfig()

    // Save to history
    addHistory({
      ip, port,
      role: (body.role as string) || 'unknown',
      label: (body.label as string) || 'Unknown Role',
      timestamp: Date.now()
    })

    if (mainWindow) {
      isOnConnectionScreen = false
      connectedOrigin = base
      mainWindow.setMinimumSize(800, 600)
      mainWindow.setSize(1200, 800, true)
      mainWindow.center()
      mainWindow.loadURL(`${base}${body.path}?code=${encodeURIComponent(code)}`)
    }
    return { ok: true, role: body.role, label: body.label }
  } catch (err: unknown) {
    const msg = err instanceof Error && err.name === 'TimeoutError'
      ? 'Timeout — server tidak merespon dalam 5 detik.'
      : 'Gagal terhubung. Pastikan IP/Port benar dan satu jaringan WiFi.'
    return { ok: false, error: msg }
  }
})
