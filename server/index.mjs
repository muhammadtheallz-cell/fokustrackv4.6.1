import http from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import webPush from 'web-push'
import { validDeviceId, validInternalPath, validSubscription } from './security.mjs'
import { sameReminderPayload, sameSubscription } from './push-guards.mjs'

const PORT = Number(process.env.PORT || 8787)
const APP_ORIGIN = process.env.APP_ORIGIN || ''
const DATA_FILE = resolve(process.env.DATA_FILE || './data/fokustrack-push.json')
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com'
const MAX_BODY_BYTES = 64 * 1024
const MAX_REMINDERS_PER_DEVICE = 200
const MAX_TIMER_DELAY = 2_147_000_000
const MISSED_GRACE_MS = 10 * 60 * 1000
const MAX_DEVICES = 250
const MAX_RATE_BUCKETS = 5000

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  throw new Error('VAPID_PUBLIC_KEY dan VAPID_PRIVATE_KEY wajib diisi di server/.env.')
}

webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

let database = { devices: Object.create(null) }
const timers = new Map()
const inFlightReminders = new Set()
const rateBuckets = new Map()
let saveQueue = Promise.resolve()

async function loadDatabase() {
  try {
    const parsed = JSON.parse(await readFile(DATA_FILE, 'utf8'))
    const safeDevices = Object.create(null)
    if (parsed && parsed.devices && typeof parsed.devices === 'object' && !Array.isArray(parsed.devices)) {
      for (const [deviceId, device] of Object.entries(parsed.devices)) {
        if (!validDeviceId(deviceId) || !device || typeof device !== 'object' || Array.isArray(device)) continue
        if (!validSubscription(device.subscription) || typeof device.apiToken !== 'string' || device.apiToken.length < 32) continue
        const reminders = Array.isArray(device.reminders) ? device.reminders.slice(0, MAX_REMINDERS_PER_DEVICE) : []
        safeDevices[deviceId] = {
          apiToken: device.apiToken,
          subscription: device.subscription,
          scheduleRevision: Number.isSafeInteger(device.scheduleRevision) && device.scheduleRevision > 0
            ? device.scheduleRevision
            : 0,
          updatedAt: typeof device.updatedAt === 'string' ? device.updatedAt : new Date().toISOString(),
          reminders: reminders.filter((item) => item && typeof item.id === 'string' && item.id.length <= 240 &&
            typeof item.triggerAt === 'string' && Number.isFinite(Date.parse(item.triggerAt)) &&
            typeof item.title === 'string' && item.title.length <= 120 &&
            typeof item.body === 'string' && item.body.length <= 240 && validInternalPath(item.url))
            .map((item) => ({
              id: item.id,
              title: item.title,
              body: item.body,
              triggerAt: item.triggerAt,
              url: item.url,
              silent: item.silent === true,
              sent: item.sent === true,
              sentAt: typeof item.sentAt === 'string' ? item.sentAt : undefined,
              failed: item.failed === true,
              failedAt: typeof item.failedAt === 'string' ? item.failedAt : undefined,
              attempts: Number.isInteger(item.attempts) ? Math.max(0, Math.min(4, item.attempts)) : 0,
            })),
        }
      }
    }
    database = { devices: safeDevices }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

async function saveDatabase() {
  const writeTask = saveQueue.then(async () => {
    await mkdir(dirname(DATA_FILE), { recursive: true })
    const temporary = `${DATA_FILE}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
    await writeFile(temporary, JSON.stringify(database, null, 2), { mode: 0o600 })
    await rename(temporary, DATA_FILE)
  })
  saveQueue = writeTask.catch((error) => {
    console.error('Gagal menyimpan database push:', error?.message || error)
  })
  return writeTask
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(payload))
}

function allowRequest(request, key, limit, windowMs) {
  const now = Date.now()
  const ip = request.socket.remoteAddress || 'unknown'
  const bucketKey = `${ip}:${key}`
  const current = rateBuckets.get(bucketKey)
  if (!current || now - current.startedAt >= windowMs) {
    rateBuckets.set(bucketKey, { startedAt: now, count: 1 })
  } else if (current.count >= limit) {
    return false
  } else {
    current.count += 1
  }

  if (rateBuckets.size > MAX_RATE_BUCKETS) {
    for (const [bucket, value] of rateBuckets) {
      if (now - value.startedAt > 60 * 60 * 1000) rateBuckets.delete(bucket)
      if (rateBuckets.size <= MAX_RATE_BUCKETS) break
    }
  }
  return true
}

function setCors(request, response) {
  const origin = request.headers.origin
  if (APP_ORIGIN && origin === APP_ORIGIN) {
    response.setHeader('Access-Control-Allow-Origin', APP_ORIGIN)
    response.setHeader('Vary', 'Origin')
  } else if (!APP_ORIGIN && !origin) {
    // Same-origin requests do not require CORS headers.
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function originAllowed(request) {
  const origin = request.headers.origin
  return !origin || (Boolean(APP_ORIGIN) && origin === APP_ORIGIN)
}

async function readJson(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request terlalu besar.'), { status: 413 })
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('JSON tidak valid.'), { status: 400 })
  }
}

function timingSafeTokenMatch(candidate, expected) {
  if (typeof candidate !== 'string' || typeof expected !== 'string') return false
  const a = Buffer.from(candidate)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}


function getAuthorizedDevice(request) {
  const authorization = request.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  for (const [deviceId, device] of Object.entries(database.devices)) {
    if (timingSafeTokenMatch(token, device.apiToken)) return { deviceId, device }
  }
  return null
}

function clearDeviceTimers(deviceId) {
  for (const [timerKey, timer] of timers.entries()) {
    if (timerKey.startsWith(`${deviceId}:`)) {
      clearTimeout(timer)
      timers.delete(timerKey)
    }
  }
}

async function deliverReminder(deviceId, reminderId) {
  const sendingKey = `${deviceId}:${reminderId}`
  if (inFlightReminders.has(sendingKey)) return
  const device = database.devices[deviceId]
  const reminder = device?.reminders?.find(
    (item) => item.id === reminderId && !item.sent && !item.failed
  )
  if (!device || !reminder) return

  inFlightReminders.add(sendingKey)
  reminder.sending = true
  const reminderSnapshot = { ...reminder }
  const subscriptionSnapshot = {
    endpoint: device.subscription.endpoint,
    keys: { ...device.subscription.keys },
  }
  const payload = {
    title: reminder.title,
    body: reminder.body,
    url: reminder.url,
    tag: reminder.id,
    silent: Boolean(reminder.silent),
  }

  try {
    try {
      await webPush.sendNotification(device.subscription, JSON.stringify(payload), {
        TTL: 3600,
        urgency: 'high',
      })
    } catch (error) {
      const status = Number(error?.statusCode || 0)
      if (status === 404 || status === 410) {
        const currentDevice = database.devices[deviceId]
        // Do not delete a freshly-registered subscription if an older send failed late.
        if (currentDevice && sameSubscription(currentDevice.subscription, subscriptionSnapshot)) {
          delete database.devices[deviceId]
          clearDeviceTimers(deviceId)
          try { await saveDatabase() } catch (saveError) {
            console.error('Gagal menyimpan penghapusan subscription:', saveError?.message || saveError)
          }
        }
        return
      }

      // A newer sync may have replaced the schedule while this send was in flight.
      const currentReminder = database.devices[deviceId]?.reminders?.find((item) => item.id === reminderId)
      if (!sameReminderPayload(currentReminder, reminderSnapshot)) return
      currentReminder.attempts = Number(currentReminder.attempts || 0) + 1
      currentReminder.lastAttemptAt = new Date().toISOString()
      console.error(`Push reminder ${reminderId} gagal:`, error?.message || error)

      if (currentReminder.attempts < 4) {
        const retryDelay = Math.min(15 * 60_000, 30_000 * (2 ** (currentReminder.attempts - 1)))
        const timer = setTimeout(() => {
          timers.delete(sendingKey)
          void deliverReminder(deviceId, reminderId)
        }, retryDelay)
        timers.set(sendingKey, timer)
      } else {
        currentReminder.failed = true
        currentReminder.failedAt = new Date().toISOString()
      }
      try { await saveDatabase() } catch (saveError) {
        console.error('Gagal menyimpan status retry push:', saveError?.message || saveError)
      }
      return
    }

    // A successful Push send must never enter the retry path merely because the
    // subsequent disk write failed; doing so would cause an avoidable duplicate.
    const currentReminder = database.devices[deviceId]?.reminders?.find((item) => item.id === reminderId)
    if (sameReminderPayload(currentReminder, reminderSnapshot)) {
      currentReminder.sent = true
      currentReminder.sentAt = new Date().toISOString()
      currentReminder.sending = false
      try {
        await saveDatabase()
      } catch (saveError) {
        console.error('Push terkirim, tetapi status terkirim belum tersimpan ke disk:', saveError?.message || saveError)
      }
    }
  } finally {
    inFlightReminders.delete(sendingKey)
    const currentReminder = database.devices[deviceId]?.reminders?.find((item) => item.id === reminderId)
    if (sameReminderPayload(currentReminder, reminderSnapshot)) currentReminder.sending = false
  }
}

function scheduleReminder(deviceId, reminder) {
  if (reminder.sent || reminder.failed) return
  const key = `${deviceId}:${reminder.id}`
  const dueAt = Date.parse(reminder.triggerAt)
  if (!Number.isFinite(dueAt)) return

  const remaining = dueAt - Date.now()
  if (remaining <= 0) {
    if (remaining >= -MISSED_GRACE_MS) {
      void deliverReminder(deviceId, reminder.id)
    } else {
      reminder.sent = true
      reminder.sentAt = new Date().toISOString()
      void saveDatabase()
    }
    return
  }

  const timer = setTimeout(() => {
    timers.delete(key)
    if (Date.now() < dueAt) {
      scheduleReminder(deviceId, reminder)
    } else {
      void deliverReminder(deviceId, reminder.id)
    }
  }, Math.min(remaining, MAX_TIMER_DELAY))
  timers.set(key, timer)
}

function scheduleDevice(deviceId) {
  clearDeviceTimers(deviceId)
  const device = database.devices[deviceId]
  if (!device) return
  for (const reminder of device.reminders || []) scheduleReminder(deviceId, reminder)
}

async function sendImmediateTest(device) {
  await webPush.sendNotification(
    device.subscription,
    JSON.stringify({
      title: 'Tes Push FokusTrack v4.6.0',
      body: 'Push server berhasil mengirim notifikasi ke perangkat ini.',
      url: '/?tab=calendar',
      tag: `fokustrack-test-${Date.now()}`,
    }),
    { TTL: 300, urgency: 'high' }
  )
}

const server = http.createServer(async (request, response) => {
  setCors(request, response)

  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }

  if (!originAllowed(request)) {
    sendJson(response, 403, { error: 'Origin tidak diizinkan.' })
    return
  }

  let url
  try {
    url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  } catch {
    sendJson(response, 400, { error: 'URL request tidak valid.' })
    return
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { ok: true, service: 'fokustrack-push', version: '4.6.0' })
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/push/register') {
    if (!allowRequest(request, 'register', 30, 60 * 60 * 1000)) {
      sendJson(response, 429, { error: 'Terlalu banyak permintaan pendaftaran. Coba lagi nanti.' })
      return
    }
    try {
      const body = await readJson(request)
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        sendJson(response, 400, { error: 'Body request harus berupa objek JSON.' })
        return
      }
      const deviceId = String(body.deviceId || '')
      if (!validDeviceId(deviceId) || !validSubscription(body.subscription)) {
        sendJson(response, 400, { error: 'Device ID atau PushSubscription tidak valid.' })
        return
      }

      const existing = database.devices[deviceId]
      if (!existing && Object.keys(database.devices).length >= MAX_DEVICES) {
        sendJson(response, 503, { error: 'Kapasitas perangkat push penuh.' })
        return
      }
      const bearer = (request.headers.authorization || '').replace(/^Bearer /, '')
      const bearerMatches = Boolean(existing && timingSafeTokenMatch(bearer, existing.apiToken))
      // Allow token recovery only when the browser still presents the exact saved
      // Push endpoint. A guessed device ID alone must not rotate another device's token.
      const sameSubscription = Boolean(
        existing && body.subscription.endpoint === existing.subscription?.endpoint
      )
      if (existing && !bearerMatches && !sameSubscription) {
        sendJson(response, 409, { error: 'Perangkat sudah terdaftar. Token atau subscription lama diperlukan.' })
        return
      }
      const apiToken = existing
        ? existing.apiToken
        : randomBytes(32).toString('base64url')

      database.devices[deviceId] = {
        apiToken,
        subscription: body.subscription,
        reminders: existing?.reminders || [],
        scheduleRevision: Number(existing?.scheduleRevision || 0),
        updatedAt: new Date().toISOString(),
      }
      await saveDatabase()
      scheduleDevice(deviceId)
      sendJson(response, 200, { apiToken })
    } catch (error) {
      sendJson(response, error?.status || 500, { error: error?.message || 'Gagal mendaftarkan perangkat.' })
    }
    return
  }

  const authorized = getAuthorizedDevice(request)
  if (!authorized) {
    if (url.pathname.startsWith('/api/push/')) {
      sendJson(response, 401, { error: 'Perangkat belum terautentikasi.' })
      return
    }
  }

  if (authorized && request.method === 'PUT' && url.pathname === '/api/push/reminders' &&
    !allowRequest(request, 'reminders', 120, 10 * 60 * 1000)) {
    sendJson(response, 429, { error: 'Sinkronisasi terlalu sering. Coba lagi sebentar.' })
    return
  }
  if (authorized && request.method === 'POST' && url.pathname === '/api/push/test' &&
    !allowRequest(request, 'test', 10, 5 * 60 * 1000)) {
    sendJson(response, 429, { error: 'Tes notifikasi terlalu sering. Coba lagi nanti.' })
    return
  }

  if (request.method === 'PUT' && url.pathname === '/api/push/reminders' && authorized) {
    try {
      const body = await readJson(request)
      if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.reminders) ||
        body.reminders.length > MAX_REMINDERS_PER_DEVICE) {
        sendJson(response, 400, { error: `Body tidak valid; maksimal ${MAX_REMINDERS_PER_DEVICE} pengingat per perangkat.` })
        return
      }

      if (!Number.isSafeInteger(body.revision) || body.revision <= 0) {
        sendJson(response, 400, { error: 'Revision sinkronisasi tidak valid.' })
        return
      }
      const revision = body.revision
      const currentRevision = Number(authorized.device.scheduleRevision || 0)
      if (revision <= currentRevision) {
        sendJson(response, 409, { error: 'Sinkronisasi duplikat atau usang diabaikan.', currentRevision })
        return
      }

      const previousReminders = new Map(
        (authorized.device.reminders || []).map((reminder) => [reminder.id, reminder])
      )
      const uniqueReminders = new Map()
      for (const item of body.reminders) {
        const at = Date.parse(item?.triggerAt)
        const valid = Boolean(
          item && typeof item === 'object' && !Array.isArray(item) &&
          typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 240 &&
          typeof item.title === 'string' && item.title.trim().length > 0 && item.title.length <= 120 &&
          typeof item.body === 'string' && item.body.length <= 240 &&
          validInternalPath(item.url) && Number.isFinite(at) && at > Date.now()
        )
        if (!valid) {
          sendJson(response, 400, { error: 'Salah satu data pengingat tidak valid.' })
          return
        }
        uniqueReminders.set(item.id, item)
      }

      const reminders = Array.from(uniqueReminders.values()).map((item) => {
        const previous = previousReminders.get(item.id)
        return {
          id: item.id,
          title: item.title.trim(),
          body: item.body,
          triggerAt: new Date(item.triggerAt).toISOString(),
          url: item.url,
          silent: item.silent === true,
          sent: Boolean(previous?.sent),
          sentAt: previous?.sentAt,
          failed: Boolean(previous?.failed),
          failedAt: previous?.failedAt,
          attempts: Number(previous?.attempts || 0),
        }
      })

      const previousList = authorized.device.reminders
      const previousRevision = currentRevision
      authorized.device.reminders = reminders
      authorized.device.scheduleRevision = revision
      authorized.device.updatedAt = new Date().toISOString()
      try {
        await saveDatabase()
      } catch (saveError) {
        authorized.device.reminders = previousList || []
        authorized.device.scheduleRevision = previousRevision
        sendJson(response, 500, { error: 'Gagal menyimpan jadwal push.' })
        return
      }
      scheduleDevice(authorized.deviceId)
      sendJson(response, 200, { ok: true, scheduled: reminders.length, revision })
    } catch (error) {
      sendJson(response, error?.status || 500, { error: error?.message || 'Gagal menyimpan pengingat.' })
    }
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/push/test' && authorized) {
    try {
      await sendImmediateTest(authorized.device)
      sendJson(response, 200, { ok: true })
    } catch (error) {
      const status = Number(error?.statusCode || 500)
      sendJson(response, status, { error: 'Push test gagal dikirim.' })
    }
    return
  }

  if (url.pathname.startsWith('/api/')) {
    sendJson(response, 404, { error: 'Endpoint tidak ditemukan.' })
    return
  }

  sendJson(response, 404, { error: 'Not found.' })
})

await loadDatabase()
for (const deviceId of Object.keys(database.devices)) scheduleDevice(deviceId)
server.listen(PORT, () => {
  console.log(`FokusTrack Push Server v4.6.0 aktif pada port ${PORT}`)
  console.log(`Origin PWA: ${APP_ORIGIN || '(APP_ORIGIN belum diatur; browser cross-origin akan ditolak)'}`)
})

async function shutdown() {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  await saveQueue
  server.close(() => process.exit(0))
}
process.on('SIGINT', () => { void shutdown() })
process.on('SIGTERM', () => { void shutdown() })
