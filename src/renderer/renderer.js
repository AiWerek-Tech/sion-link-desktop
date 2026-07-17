// ═══════════════════════════════════════════════
// SION Link Desktop — Connection Screen v2
// Tabs · Scanner · History · Status Bar
// ═══════════════════════════════════════════════

const $ = (id) => document.getElementById(id)

// ── DOM refs ──
const form = $('connect-form')
const ipInput = $('ip')
const portInput = $('port')
const codeInput = $('code')
const rememberToggle = $('remember')
const errorBanner = $('error-banner')
const submitBtn = $('submit-btn')
const clearBtn = $('clear-btn')
const versionLabel = $('version-label')
const overlay = $('overlay')
const overlayTitle = $('overlay-title')
const overlaySubtitle = $('overlay-subtitle')
const overlayCancel = $('overlay-cancel')
const statusDot = $('status-dot')
const statusText = $('status-text')
const bridgeBtn = $('bridge-btn')
const bridgeStatus = $('bridge-status')
const bridgeDiagnosticsDetail = $('bridge-diagnostics-detail')
const bridgeMainBadge = $('bridge-main-badge')
const bridgeEngineBadge = $('bridge-engine-badge')
const bridgeDeckTitle = $('bridge-deck-title')
const bridgeSlideSummary = $('bridge-slide-summary')
const bridgeSyncState = $('bridge-sync-state')
const bridgeLatencyState = $('bridge-latency-state')
const bridgeCacheState = $('bridge-cache-state')
const bridgePreviewText = $('bridge-preview-text')
const bridgePreviewImage = $('bridge-preview-image')
const bridgeRecoveryCard = $('bridge-recovery-card')
const bridgeEngineInputs = () => Array.from(document.querySelectorAll('input[name="bridge-engine"]'))
const detectedServer = $('detected-server')
const detectedName = $('detected-name')
const detectedAddress = $('detected-address')

// Scan
const localIpEl = $('local-ip')
const scanBtn = $('scan-btn')
const scanBtnText = $('scan-btn-text')
const scanFill = $('scan-fill')
const scanStatus = $('scan-status')
const scanResults = $('scan-results')
const scanEmpty = $('scan-empty')
const radarWidget = $('radar-widget')

// History
const historyList = $('history-list')
const historyEmpty = $('history-empty')
const clearHistoryBtn = $('clear-history-btn')

// ── State ──
let userInteracted = false
let autoTimer = null
let countdown = 0
let busy = false
let isScanning = false
let removeScanListener = null

// ── API ──
const api = window.sionLink || {
  getSavedConfig: async () => { try { return JSON.parse(localStorage.getItem('sl') || 'null') } catch { return null } },
  connect: async (d) => { await new Promise(r => setTimeout(r, 1200)); return { ok: false, error: 'Mode simulasi.' } },
  clearSavedConfig: async () => { localStorage.removeItem('sl'); return true },
  getAppVersion: async () => '0.5.0-beta.1',
  getHistory: async () => [],
  clearHistory: async () => true,
  getLocalIp: async () => '192.168.1.x',
  getStartupNotice: async () => null,
  scanNetwork: async () => [],
  onScanProgress: () => () => {},
  startPresentationBridge: async () => ({ ok: false, error: 'Mode simulasi.' }),
  stopPresentationBridge: async () => ({ active: false }),
  getPresentationDiagnostics: async () => null,
  onPresentationBridgeStatus: () => () => {}
}

let bridgeActive = false
api.onPresentationBridgeStatus?.((status) => {
  bridgeActive = status.active === true
  updateBridgeStatusCenter(status)
  bridgeBtn.querySelector('.btn-connect__text').textContent = bridgeActive ? 'Hentikan PowerPoint Bridge' : 'Mulai PowerPoint Bridge'
  bridgeStatus.textContent = status.slideIndex >= 0 ? `${status.message} · Slide ${status.slideIndex + 1}/${status.totalSlides}` : status.message
  bridgeStatus.classList.toggle('is-connected', status.connected === true)
  bridgeStatus.classList.toggle('is-waiting', status.active === true && status.connected !== true)
  setStatus(status.connected ? 'connected' : status.active ? 'connecting' : 'ready', status.message)

  const tPptText = $('titlebar-ppt-text')
  const tPptBtn = $('action-ppt-status')
  if (tPptText) {
    if (bridgeActive) {
      tPptText.textContent = status.connected ? 'PPT ON' : 'PPT WAIT'
      if (tPptBtn) tPptBtn.style.color = status.connected ? '#10b981' : '#f59e0b'
    } else {
      tPptText.textContent = 'PPT OFF'
      if (tPptBtn) tPptBtn.style.color = ''
    }
  }
})

function setBridgeStep(name, state) {
  const node = document.querySelector(`.bridge-step[data-step="${name}"]`)
  if (!node) return
  node.classList.remove('is-complete', 'is-current', 'is-warning', 'is-failed', 'is-disabled')
  node.classList.add(`is-${state}`)
}

function updateBridgeStatusCenter(status = {}) {
  const active = status.active === true
  const connected = status.connected === true
  const engine = status.engine === 'legacy_powershell' ? 'Legacy PowerShell' : 'Modern .NET Agent'
  const message = status.message || 'Bridge belum aktif.'
  const slideIndex = Number(status.slideIndex ?? -1)
  const totalSlides = Number(status.totalSlides ?? 0)
  const isWaitingApproval = /persetujuan|approval|operator/i.test(message)
  const isPowerPointProblem = /PowerPoint|Slide Show|F5/i.test(message) && !connected

  if (bridgeEngineBadge) bridgeEngineBadge.textContent = engine
  if (bridgeMainBadge) {
    bridgeMainBadge.className = `bridge-badge ${connected ? 'bridge-badge--sync' : active ? 'bridge-badge--waiting' : 'bridge-badge--idle'}`
    bridgeMainBadge.innerHTML = `<i></i> ${connected ? 'Sinkron' : active ? 'Menunggu' : 'Belum aktif'}`
  }

  setBridgeStep('agent', active || connected ? 'complete' : 'current')
  setBridgeStep('powerpoint', connected ? 'complete' : isPowerPointProblem ? 'warning' : active ? 'current' : 'disabled')
  setBridgeStep('slideshow', connected ? 'complete' : isPowerPointProblem ? 'warning' : active ? 'current' : 'disabled')
  setBridgeStep('media', active || connected ? 'complete' : 'current')
  setBridgeStep('approval', connected ? 'complete' : isWaitingApproval ? 'current' : active ? 'current' : 'disabled')
  setBridgeStep('sync', connected ? 'complete' : active ? 'current' : 'disabled')

  if (bridgeDeckTitle) bridgeDeckTitle.textContent = connected ? 'PowerPoint Live' : active ? 'Menunggu sinkronisasi' : 'Menunggu PowerPoint'
  if (bridgeSlideSummary) {
    bridgeSlideSummary.textContent =
      slideIndex >= 0 && totalSlides > 0
        ? `Slide ${slideIndex + 1} dari ${totalSlides}`
        : message
  }
  if (bridgePreviewText) bridgePreviewText.textContent = slideIndex >= 0 ? `Slide ${slideIndex + 1}/${totalSlides || '?'}` : 'Belum ada slide aktif'
  if (bridgePreviewImage) {
    const previewFrame = typeof status.previewDataUrl === 'string' && status.previewDataUrl.startsWith('data:image/')
      ? status.previewDataUrl
      : ''
    const previewShell = bridgePreviewImage.closest('.bridge-live-card__preview')
    if (previewFrame) {
      bridgePreviewImage.src = previewFrame
      previewShell?.classList.add('has-image')
    } else if (!connected) {
      bridgePreviewImage.removeAttribute('src')
      previewShell?.classList.remove('has-image')
    }
  }
  if (bridgeSyncState) bridgeSyncState.textContent = connected ? 'Sinkron real-time' : active ? 'Menyambungkan' : 'Belum sinkron'
  if (bridgeLatencyState) bridgeLatencyState.textContent = status.latencyMs ? `${status.latencyMs} ms` : 'Latency —'
  if (bridgeCacheState) bridgeCacheState.textContent = status.cacheHit === true ? 'Cache siap' : 'Cache —'

  if (bridgeRecoveryCard) {
    const title = bridgeRecoveryCard.querySelector('strong')
    const body = bridgeRecoveryCard.querySelector('span')
    if (connected) {
      bridgeRecoveryCard.className = 'bridge-recovery-card is-ok'
      if (title) title.textContent = 'Sinkronisasi aktif'
      if (body) body.textContent = 'Slide PowerPoint sedang dikirim ke SION Media. Operator tetap mengontrol Preview dan Live.'
    } else if (active) {
      bridgeRecoveryCard.className = isPowerPointProblem ? 'bridge-recovery-card is-warning' : 'bridge-recovery-card'
      if (title) title.textContent = isPowerPointProblem ? 'PowerPoint perlu perhatian' : 'Menunggu koneksi selesai'
      if (body) body.textContent = message
    } else {
      bridgeRecoveryCard.className = 'bridge-recovery-card'
      if (title) title.textContent = 'Siap memulai bridge'
      if (body) body.textContent = 'Pilih server SION Media di tab Koneksi, buka Slide Show PowerPoint, lalu tekan Mulai.'
    }
  }
}

bridgeBtn.addEventListener('click', async () => {
  hideError()
  if (bridgeActive) {
    await api.stopPresentationBridge()
    return
  }
  const ip = ipInput.value.trim()
  const port = parseInt(portInput.value.trim(), 10)
  if (!ip || !Number.isInteger(port)) {
    showError('Pilih server SION Media atau isi IP dan port sebelum memulai bridge.')
    return
  }
  const selectedEngine = bridgeEngineInputs().find((input) => input.checked)?.value || 'dotnet_agent'
  const result = await api.startPresentationBridge({ ip, port, engine: selectedEngine })
  if (!result?.ok) showError(result?.error || 'Bridge gagal dimulai.')
})

// ══════════════════════════════════
// TABS
// ══════════════════════════════════
async function refreshPresentationDiagnostics() {
  if (!bridgeDiagnosticsDetail) return
  try {
    const diagnostics = await api.getPresentationDiagnostics?.()
    if (!diagnostics) {
      bridgeDiagnosticsDetail.textContent = 'Diagnostics tidak tersedia.'
      return
    }
    const officeArch = diagnostics.inferredOfficeArchitecture || 'unknown'
    const version = diagnostics.powerPointVersion ? ` · PowerPoint ${diagnostics.powerPointVersion}` : ''
    const pptPath = diagnostics.powerPointPath ? ` · ${diagnostics.powerPointPath}` : ''
    bridgeDiagnosticsDetail.textContent = `OS ${diagnostics.osArchitecture || '-'} · App ${diagnostics.appArchitecture || '-'} · Office ${officeArch}${version}${pptPath}`
    bridgeDiagnosticsDetail.classList.toggle('is-warning', officeArch === 'x86')
    if (officeArch === 'x86') {
      bridgeDiagnosticsDetail.textContent += ' · Microsoft Office 32-bit terdeteksi. Dukungan tersedia secara desain tetapi belum tervalidasi penuh pada beta ini.'
    }
  } catch {
    bridgeDiagnosticsDetail.textContent = 'Diagnostics Office belum dapat dibaca.'
  }
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'))
    tab.classList.add('active')
    $(`tab-${target}`).classList.add('active')

    // Lazy load
    if (target === 'history') loadHistory()
    if (target === 'bridge') refreshPresentationDiagnostics()
    if (target === 'scan') {
      loadLocalIp()
      if (!isScanning) {
        setTimeout(() => scanBtn.click(), 50)
      }
    }
  })
})

// ══════════════════════════════════
// INIT
// ══════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  refreshPresentationDiagnostics()
  try {
    const notice = await api.getStartupNotice()
    if (notice) showError(notice)
  } catch {}
  try {
    const v = await api.getAppVersion()
    if (v) versionLabel.textContent = `v${v}`
  } catch {}

  try {
    const s = await api.getSavedConfig()
    if (s) {
      ipInput.value = s.ip || ''
      portInput.value = s.port || '41732'
      codeInput.value = s.code || ''
      rememberToggle.checked = s.remember !== false
      clearBtn.classList.add('is-visible')

      if (s.remember && s.ip && s.code) startAutoConnect(s)
    }
  } catch {}

  discoverAutomatically()
})

async function discoverAutomatically() {
  setStatus('scanning', 'Mencari SION Media secara otomatis...')
  try {
    const preferredPort = parseInt(portInput.value, 10) || 41732
    const servers = await api.scanNetwork(preferredPort)
    if (!servers?.length) {
      setStatus('ready', 'Siap · masukkan alamat atau buka Cari Server')
      return
    }
    const server = servers[0]
    detectedName.textContent = servers.length === 1 ? `${server.name || 'SION Media'} ditemukan` : `${servers.length} server SION Media ditemukan`
    detectedAddress.textContent = `${server.ip}:${server.port}${server.version ? ` · v${server.version}` : ''}`
    detectedServer.hidden = false
    detectedServer.dataset.ip = server.ip
    detectedServer.dataset.port = String(server.port)
    if (!ipInput.value.trim() || !userInteracted) {
      ipInput.value = server.ip
      portInput.value = String(server.port)
    }
    setStatus('ready', 'SION Media ditemukan · masukkan kode akses')
  } catch {
    setStatus('ready', 'Siap untuk koneksi manual')
  }
}

detectedServer.addEventListener('click', () => {
  ipInput.value = detectedServer.dataset.ip || ''
  portInput.value = detectedServer.dataset.port || '41732'
  codeInput.focus()
})

document.querySelectorAll('[data-open-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    const tabName = button.dataset.openTab
    document.querySelector(`.tab[data-tab="${tabName}"]`)?.click()
  })
})

ipInput.addEventListener('paste', (event) => {
  const text = event.clipboardData?.getData('text')?.trim()
  if (!text || !/^https?:\/\//i.test(text)) return
  try {
    const url = new URL(text)
    event.preventDefault()
    ipInput.value = url.hostname
    portInput.value = url.port || '41732'
    const pastedCode = url.searchParams.get('code') || url.searchParams.get('token')
    if (pastedCode) codeInput.value = pastedCode.toUpperCase()
    setStatus('ready', 'Link SION berhasil dibaca')
  } catch {}
})

// ══════════════════════════════════
// AUTO-CONNECT
// ══════════════════════════════════
function startAutoConnect(cfg) {
  countdown = 3
  showOverlay('Koneksi Otomatis', `Menghubungkan dalam ${countdown} detik...`, true)
  const tick = () => {
    countdown--
    if (countdown > 0) {
      overlaySubtitle.textContent = `Menghubungkan dalam ${countdown} detik...`
      autoTimer = setTimeout(tick, 1000)
    } else {
      overlaySubtitle.textContent = 'Memulai koneksi...'
      overlayCancel.style.display = 'none'
      doConnect(cfg)
    }
  }
  autoTimer = setTimeout(tick, 1000)
}

function stopAutoConnect() {
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null }
  hideOverlay()
}

const onInteract = () => {
  userInteracted = true
  if (autoTimer) stopAutoConnect()
}
;[ipInput, portInput, codeInput].forEach(el => el.addEventListener('input', onInteract))
rememberToggle.addEventListener('change', onInteract)
overlayCancel.addEventListener('click', (e) => { e.preventDefault(); stopAutoConnect() })

// ══════════════════════════════════
// CLEAR SAVED
// ══════════════════════════════════
clearBtn.addEventListener('click', async () => {
  try { await api.clearSavedConfig() } catch {}
  ipInput.value = ''; portInput.value = '41732'; codeInput.value = ''
  rememberToggle.checked = true
  clearBtn.classList.remove('is-visible')
  hideError()
})

// ══════════════════════════════════
// FORM SUBMIT
// ══════════════════════════════════
form.addEventListener('submit', async (e) => {
  e.preventDefault()
  if (busy) return
  stopAutoConnect(); hideError(); clearFieldErrors()

  const ip = ipInput.value.trim()
  const portStr = portInput.value.trim()
  const code = codeInput.value.trim().toUpperCase()
  const remember = rememberToggle.checked

  const errs = []
  if (!ip) { errs.push('IP harus diisi.'); ipInput.classList.add('has-error') }
  const port = parseInt(portStr, 10)
  if (!portStr || isNaN(port) || port < 1 || port > 65535) { errs.push('Port 1–65535.'); portInput.classList.add('has-error') }
  if (!code) { errs.push('Kode harus diisi.'); codeInput.classList.add('has-error') }

  if (errs.length) { showError(errs.join(' ')); return }
  await doConnect({ ip, port, code, remember })
})

// ══════════════════════════════════
// CONNECTION
// ══════════════════════════════════
async function doConnect(cfg) {
  busy = true
  setBtnLoading(true)
  hideError()
  setStatus('connecting', `Menghubungkan ke ${cfg.ip}...`)
  showOverlay('Menghubungkan...', `${cfg.ip}:${cfg.port}`, false)

  try {
    const r = await api.connect(cfg)
    if (r?.ok) {
      setStatus('connected', `Terhubung sebagai ${r.label || r.role}`)
      overlayTitle.textContent = 'Terhubung!'
      overlaySubtitle.textContent = r.label ? `Membuka ${r.label}...` : 'Memuat...'
    } else {
      hideOverlay(); setBtnLoading(false)
      setStatus('error', 'Gagal terhubung')
      showError(r?.error || 'Gagal terhubung.')
    }
  } catch {
    hideOverlay(); setBtnLoading(false)
    setStatus('error', 'Galat koneksi')
    showError('Galat tidak terduga.')
  } finally { busy = false }
}

// ══════════════════════════════════
// NETWORK SCANNER
// ══════════════════════════════════
async function loadLocalIp() {
  try {
    const ip = await api.getLocalIp()
    localIpEl.textContent = ip || 'Tidak terdeteksi'
  } catch {
    localIpEl.textContent = 'Error'
  }
}

scanBtn.addEventListener('click', async () => {
  if (isScanning) return
  isScanning = true
  scanBtn.classList.add('is-scanning')
  scanBtn.disabled = true
  scanBtnText.textContent = 'Scanning...'
  scanEmpty.style.display = 'none'
  if (radarWidget) radarWidget.classList.add('is-active')
  scanFill.style.width = '0%'
  scanStatus.textContent = 'Memindai jaringan lokal...'
  setStatus('scanning', 'Memindai jaringan...')

  // Clear old results (except empty state)
  scanResults.querySelectorAll('.server-card').forEach(c => c.remove())

  // Listen to progress
  if (removeScanListener) removeScanListener()
  removeScanListener = api.onScanProgress((data) => {
    const pct = Math.round((data.scanned / data.total) * 100)
    scanFill.style.width = `${pct}%`
    scanStatus.textContent = `${data.scanned}/${data.total} IP diperiksa — ${data.found} server ditemukan`
  })

  try {
    const port = parseInt(portInput.value.trim(), 10) || 41732
    const servers = await api.scanNetwork(port)

    if (servers.length === 0) {
      scanEmpty.style.display = ''
      scanEmpty.querySelector('p').textContent = 'Tidak ada server SION Media yang ditemukan di jaringan ini.'
    } else {
      servers.forEach((s, i) => {
        const card = createServerCard(s, i)
        scanResults.appendChild(card)
      })
    }
    scanFill.style.width = '100%'
    scanStatus.textContent = `Selesai — ${servers.length} server ditemukan`
    setStatus('ready', `Scan selesai: ${servers.length} server`)
  } catch (err) {
    scanStatus.textContent = 'Gagal memindai jaringan.'
    setStatus('error', 'Scan gagal')
  } finally {
    isScanning = false
    scanBtn.classList.remove('is-scanning')
    scanBtn.disabled = false
    scanBtnText.textContent = 'Scan Ulang'
    if (radarWidget) radarWidget.classList.remove('is-active')
    if (removeScanListener) { removeScanListener(); removeScanListener = null }
  }
})

function createServerCard(server, index) {
  const { ip, port } = server
  const card = document.createElement('div')
  card.className = 'server-card'
  card.style.animationDelay = `${index * 60}ms`
  card.innerHTML = `
    <span class="card-dot card-dot--online"></span>
    <div class="card-info">
      <div class="card-info__ip">${server.name || 'SION Media'}</div>
      <div class="card-info__meta">${ip}:${port}${server.version ? ` · v${server.version}` : ''}</div>
    </div>
    <span class="card-badge card-badge--port">:${port}</span>
    <span class="card-arrow">→</span>
  `
  card.addEventListener('click', () => {
    ipInput.value = ip
    portInput.value = String(port)
    // Switch to connect tab
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'))
    document.querySelector('[data-tab="connect"]').classList.add('active')
    $('tab-connect').classList.add('active')
    codeInput.focus()
  })
  return card
}

// ══════════════════════════════════
// HISTORY
// ══════════════════════════════════
async function loadHistory() {
  try {
    const list = await api.getHistory()

    // Clear old cards
    historyList.querySelectorAll('.history-card').forEach(c => c.remove())

    if (!list || list.length === 0) {
      historyEmpty.style.display = ''
      clearHistoryBtn.classList.remove('is-visible')
    } else {
      historyEmpty.style.display = 'none'
      clearHistoryBtn.classList.add('is-visible')

      list.forEach((entry, i) => {
        const card = createHistoryCard(entry, i)
        historyList.insertBefore(card, clearHistoryBtn)
      })
    }
  } catch {}
}

function createHistoryCard(entry, index) {
  const card = document.createElement('div')
  card.className = 'history-card'
  card.style.animationDelay = `${index * 40}ms`

  const ago = timeAgo(entry.timestamp)
  card.innerHTML = `
    <div class="card-info">
      <div class="card-info__ip">${entry.ip}:${entry.port}</div>
      <div class="card-info__meta">${ago}</div>
    </div>
    <span class="card-badge card-badge--role">${entry.label || entry.role}</span>
    <span class="card-arrow">→</span>
  `
  card.addEventListener('click', () => {
    ipInput.value = entry.ip
    portInput.value = String(entry.port)
    // Switch to connect tab
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'))
    document.querySelector('[data-tab="connect"]').classList.add('active')
    $('tab-connect').classList.add('active')
    codeInput.focus()
  })
  return card
}

function timeAgo(ts) {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Baru saja'
  if (mins < 60) return `${mins} menit lalu`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} jam lalu`
  const days = Math.floor(hrs / 24)
  return `${days} hari lalu`
}

clearHistoryBtn.addEventListener('click', async () => {
  try { await api.clearHistory() } catch {}
  historyList.querySelectorAll('.history-card').forEach(c => c.remove())
  historyEmpty.style.display = ''
  clearHistoryBtn.classList.remove('is-visible')
})

// ══════════════════════════════════
// STATUS BAR
// ══════════════════════════════════
function setStatus(state, text) {
  statusDot.className = 'status-dot'
  const tConnDot = $('titlebar-conn-dot')
  const tConnText = $('titlebar-conn-text')
  
  if (state === 'connected' || state === 'ready') {
    statusDot.classList.add('online')
    if (tConnDot) { tConnDot.className = 'action-dot action-dot--online' }
    if (tConnText) { tConnText.textContent = state === 'connected' ? 'Connected' : 'Ready' }
  } else if (state === 'scanning' || state === 'connecting') {
    statusDot.classList.add('scanning')
    if (tConnDot) { tConnDot.className = 'action-dot action-dot--scanning' }
    if (tConnText) { tConnText.textContent = state === 'scanning' ? 'Scanning...' : 'Connecting...' }
  } else {
    if (tConnDot) { tConnDot.className = 'action-dot action-dot--offline' }
    if (tConnText) { tConnText.textContent = 'Disconnected' }
  }
  statusText.textContent = text
}

// ══════════════════════════════════
// UI HELPERS
// ══════════════════════════════════
function showError(msg) { errorBanner.textContent = msg; errorBanner.classList.add('is-visible') }
function hideError() {
  errorBanner.classList.remove('is-visible')
  setTimeout(() => { if (!errorBanner.classList.contains('is-visible')) errorBanner.textContent = '' }, 400)
}
function clearFieldErrors() { [ipInput, portInput, codeInput].forEach(el => el.classList.remove('has-error')) }
;[ipInput, portInput, codeInput].forEach(el => el.addEventListener('input', () => el.classList.remove('has-error')))

function setBtnLoading(on) { submitBtn.classList.toggle('is-loading', on); submitBtn.disabled = on }

function showOverlay(title, sub, cancelable) {
  overlayTitle.textContent = title; overlaySubtitle.textContent = sub
  overlayCancel.style.display = cancelable ? '' : 'none'
  overlay.classList.add('is-visible'); overlay.setAttribute('aria-hidden', 'false')
}
function hideOverlay() { overlay.classList.remove('is-visible'); overlay.setAttribute('aria-hidden', 'true') }

// ══════════════════════════════════
// TITLEBAR ACTIONS
// ══════════════════════════════════
if ($('action-ppt-status')) {
  $('action-ppt-status').addEventListener('click', () => {
    const tabBridge = document.querySelector('[data-tab="bridge"]')
    if (tabBridge) tabBridge.click()
  })
}

if ($('action-conn-status')) {
  $('action-conn-status').addEventListener('click', () => {
    const tabConnect = document.querySelector('[data-tab="connect"]')
    if (tabConnect) tabConnect.click()
  })
}

if ($('action-settings')) {
  $('action-settings').addEventListener('click', () => {
    const tabConnect = document.querySelector('[data-tab="connect"]')
    if (tabConnect) {
      tabConnect.click()
      setTimeout(() => ipInput.focus(), 150)
    }
  })
}
