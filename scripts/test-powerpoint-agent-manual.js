/* eslint-disable no-console */
const fs = require('fs')
const net = require('net')
const path = require('path')
const { execFileSync, spawn } = require('child_process')
const { randomBytes } = require('crypto')

const root = path.resolve(__dirname, '..', '..')
const publishExe = path.join(root, 'sion-powerpoint-agent', 'bin', 'Release', 'net8.0-windows', 'win-x64', 'publish', 'Sion.PowerPoint.Agent.exe')
function getCurrentUserPipePath() {
  let identity = process.env.USERNAME || 'user'
  try {
    const output = execFileSync('whoami', ['/user', '/fo', 'csv', '/nh'], { windowsHide: true, encoding: 'utf8' }).trim()
    const parts = output.split('","').map((part) => part.replace(/^"|"$/g, ''))
    identity = parts[1] || identity
  } catch {}
  return `\\\\.\\pipe\\sion-presentation-agent-v1-${identity.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}
const pipeName = getCurrentUserPipePath()
const timeoutMs = Number(process.env.SION_AGENT_MANUAL_TIMEOUT_MS || 45000)
const plan = process.env.SION_AGENT_MANUAL_PLAN || 'smoke'
const benchmarkIterations = Number(process.env.SION_AGENT_BENCHMARK_ITERATIONS || 30)
const soakCommands = Number(process.env.SION_AGENT_SOAK_COMMANDS || 500)

function now() {
  return Date.now()
}

function encodeJson(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8')
  const header = Buffer.alloc(5)
  header[0] = 1
  header.writeInt32BE(payload.length, 1)
  return Buffer.concat([header, payload])
}

function decodeFrames(buffer) {
  const frames = []
  let offset = 0
  while (buffer.length - offset >= 5) {
    const type = buffer[offset]
    const length = buffer.readInt32BE(offset + 1)
    if (length < 0 || length > 32 * 1024 * 1024) throw new Error(`Invalid frame length ${length}`)
    if (buffer.length - offset - 5 < length) break
    frames.push({ type, payload: buffer.subarray(offset + 5, offset + 5 + length) })
    offset += 5 + length
  }
  return { frames, rest: buffer.subarray(offset) }
}

function percentile(values, p) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function getProcessStats(pid) {
  if (!pid) return null
  try {
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `$p=Get-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue; if($p){[pscustomobject]@{Pid=$p.Id;WorkingSetMB=[math]::Round($p.WorkingSet64/1MB,2);PrivateMemoryMB=[math]::Round($p.PrivateMemorySize64/1MB,2);HandleCount=$p.HandleCount}|ConvertTo-Json -Compress}`
      ],
      { windowsHide: true, encoding: 'utf8' }
    ).trim()
    return output ? JSON.parse(output) : null
  } catch {
    return null
  }
}

function getPowerPointStats() {
  try {
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        'Get-Process POWERPNT -ErrorAction SilentlyContinue | Select-Object -First 1 Id,@{n="WorkingSetMB";e={[math]::Round($_.WorkingSet64/1MB,2)}},@{n="PrivateMemoryMB";e={[math]::Round($_.PrivateMemorySize64/1MB,2)}},HandleCount | ConvertTo-Json -Compress'
      ],
      { windowsHide: true, encoding: 'utf8' }
    ).trim()
    return output ? JSON.parse(output) : null
  } catch {
    return null
  }
}

function collectRuntimeSample(commandNumber, agentPid, metrics) {
  const recentCommands = metrics.commandLatencies.slice(-50)
  const recentFrames = metrics.frameLatencies.slice(-50)
  return {
    commandNumber,
    agent: getProcessStats(agentPid),
    harness: getProcessStats(process.pid),
    powerPoint: getPowerPointStats(),
    binaryFrameCount: metrics.binaryFrameCount(),
    frameMetaCount: metrics.frameMetaCount(),
    commandFailureCount: metrics.commandFailureCount(),
    staleFrameCount: metrics.staleFrameCount(),
    commandLatencyMs: {
      p50: percentile(recentCommands, 50),
      p95: percentile(recentCommands, 95),
      max: recentCommands.length ? Math.max(...recentCommands) : null
    },
    frameLatencyMs: {
      p50: percentile(recentFrames, 50),
      p95: percentile(recentFrames, 95),
      max: recentFrames.length ? Math.max(...recentFrames) : null
    }
  }
}

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('Manual PowerPoint Agent test only runs on Windows.')
  }
  if (!fs.existsSync(publishExe)) {
    throw new Error(`Agent executable not found. Run npm run agent:publish first. Missing: ${publishExe}`)
  }

  const agent = spawn(publishExe, [], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  agent.stderr.on('data', (chunk) => process.stderr.write(`[agent] ${chunk}`))
  agent.stdout.on('data', (chunk) => process.stdout.write(`[agent] ${chunk}`))
  process.on('exit', () => agent.kill())
  let socket

  const globalTimer = setTimeout(() => {
    console.error(JSON.stringify({ ok: false, reason: 'HARNESS_TIMEOUT', timeoutMs }, null, 2))
    try { socket?.destroy() } catch {}
    try { agent.kill() } catch {}
    process.exit(3)
  }, timeoutMs + 15000)

  await sleep(800)
  socket = net.createConnection(pipeName)
  let buffer = Buffer.alloc(0)
  const messages = []
  const frameLatencies = []
  const commandLatencies = []
  let latestFrameMeta = null
  let binaryFrameCount = 0
  let staleFrameCount = 0
  let lastSequence = -1

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    const decoded = decodeFrames(buffer)
    buffer = decoded.rest
    for (const frame of decoded.frames) {
      if (frame.type === 1) {
        const message = JSON.parse(frame.payload.toString('utf8'))
        messages.push({ at: now(), message })
        if (message.messageType === 'FRAME_META') {
          latestFrameMeta = message
          if (message.sequence < lastSequence) staleFrameCount += 1
          lastSequence = Math.max(lastSequence, Number(message.sequence || 0))
          if (message.capturedAt) frameLatencies.push(now() - Number(message.capturedAt))
        }
      } else if (frame.type === 2) {
        binaryFrameCount += 1
      }
    }
  })

  await new Promise((resolve, reject) => {
    socket.setTimeout(8000, () => reject(new Error(`Timeout connecting to ${pipeName}`)))
    socket.once('connect', resolve)
    socket.once('error', reject)
  })
  socket.setTimeout(0)

  const started = now()
  while (now() - started < timeoutMs) {
    const state = messages.find((entry) => entry.message.messageType === 'SLIDE_STATE_CHANGED')
    const error = messages.find((entry) => entry.message.messageType === 'ERROR')
    if (state) break
    if (error && /not running|not found|PowerPoint/i.test(String(error.message.message || error.message.code))) break
    await sleep(250)
  }

  const slideState = messages.find((entry) => entry.message.messageType === 'SLIDE_STATE_CHANGED')
  if (!slideState) {
    const errors = messages.filter((entry) => entry.message.messageType === 'ERROR').map((entry) => entry.message)
    console.log(JSON.stringify({ ok: false, reason: 'NO_REAL_SLIDESHOW_DETECTED', errors, messages: messages.map((m) => m.message.messageType) }, null, 2))
    socket.destroy()
    agent.kill()
    process.exitCode = 2
    return
  }

  const makeCommandPlan = () => {
    if (plan === 'benchmark') {
      return [
        ...Array.from({ length: benchmarkIterations }, () => 'NEXT'),
        ...Array.from({ length: benchmarkIterations }, () => 'PREV')
      ]
    }
    if (plan === 'soak') {
      const commands = []
      let direction = 'NEXT'
      let simulatedIndex = Number(slideState.message.slideIndex || 1)
      const slideCount = Math.max(1, Number(slideState.message.slideCount || 1))
      while (commands.length < soakCommands) {
        if (simulatedIndex >= slideCount) direction = 'PREV'
        if (simulatedIndex <= 1) direction = 'NEXT'
        commands.push(direction)
        simulatedIndex += direction === 'NEXT' ? 1 : -1
      }
      return commands
    }
    return ['NEXT', 'PREV']
  }

  const commandPlan = makeCommandPlan()

  const commandFailures = []
  const soakSamples = []
  for (const [index, type] of commandPlan.entries()) {
    const issuedAt = now()
    const commandId = randomBytes(12).toString('hex')
    socket.write(encodeJson({
      protocolVersion: 1,
      messageType: 'COMMAND',
      sessionId: 'manual-harness',
      commandId,
      type,
      issuedAt,
      expiresAt: issuedAt + 3000
    }))
    const deadline = now() + 5000
    while (now() < deadline) {
      const ack = messages.find((entry) => entry.message.messageType === 'COMMAND_ACK' && entry.message.commandId === commandId && ['EXECUTED', 'FAILED', 'EXPIRED', 'DUPLICATE'].includes(entry.message.status))
      if (ack) {
        commandLatencies.push(now() - issuedAt)
        if (ack.message.status !== 'EXECUTED') commandFailures.push(ack.message)
        break
      }
      await sleep(50)
    }
    if (plan === 'soak' && (index + 1) % 50 === 0) {
      soakSamples.push(
        collectRuntimeSample(index + 1, agent.pid, {
          commandLatencies,
          frameLatencies,
          binaryFrameCount: () => binaryFrameCount,
          frameMetaCount: () =>
            messages.filter((entry) => entry.message.messageType === 'FRAME_META').length,
          commandFailureCount: () => commandFailures.length,
          staleFrameCount: () => staleFrameCount
        })
      )
    }
    await sleep(plan === 'benchmark' ? 80 : plan === 'soak' ? 20 : 0)
  }

  await sleep(plan === 'benchmark' || plan === 'soak' ? 3000 : 1200)
  const frameMetaMessages = messages.filter((entry) => entry.message.messageType === 'FRAME_META').map((entry) => entry.message)
  const cacheHits = frameMetaMessages.filter((message) => message.cacheHit === true).length
  const report = {
    ok: true,
    plan,
    deckName: slideState.message.deckName,
    slideIndex: slideState.message.slideIndex,
    slideCount: slideState.message.slideCount,
    binaryFrameCount,
    frameMetaCount: frameMetaMessages.length,
    cacheHitRate: frameMetaMessages.length ? cacheHits / frameMetaMessages.length : 0,
    latestFrameMeta,
    staleFrameCount,
    frameLatencyMs: {
      p50: percentile(frameLatencies, 50),
      p95: percentile(frameLatencies, 95),
      max: frameLatencies.length ? Math.max(...frameLatencies) : null
    },
    commandLatencyMs: {
      p50: percentile(commandLatencies, 50),
      p95: percentile(commandLatencies, 95),
      max: commandLatencies.length ? Math.max(...commandLatencies) : null
    },
    commandFailures,
    reconnectCount: messages.filter((entry) => entry.message.messageType === 'SESSION_RESET').length,
    soakSamples,
    commandAckCount: messages.filter((entry) => entry.message.messageType === 'COMMAND_ACK').length,
    commandAck: plan === 'soak'
      ? []
      : messages.filter((entry) => entry.message.messageType === 'COMMAND_ACK').map((entry) => entry.message),
    messageTypes: messages.map((entry) => entry.message.messageType)
  }
  console.log(JSON.stringify(report, null, 2))
  socket.destroy()
  agent.kill()
  clearTimeout(globalTimer)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
