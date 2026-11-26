import type { ActivityItem } from '../types'
import { parseActivityDateTime, subtractMinutes } from './date'

export type BackgroundPushStatus =
  | 'ready'
  | 'not-configured'
  | 'not-enabled'
  | 'unsupported'
  | 'permission-required'
  | 'error'

const DEVICE_ID_KEY = 'fokustrack-push-device-v4'
const API_TOKEN_KEY = 'fokustrack-push-token-v4'
const SCHEDULE_REVISION_KEY = 'fokustrack-push-revision-v1'
const API_URL = import.meta.env.VITE_PUSH_API_URL?.replace(/\/$/, '')
const VAPID_PUBLIC_KEY = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY
const REQUEST_TIMEOUT_MS = 15_000

let activeReminderSync: AbortController | null = null
let lastIssuedRevision = 0

function isSecureApiUrl(): boolean {
  if (!API_URL) return false
  try {
    const url = new URL(API_URL)
    return url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

function getDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY)
  if (existing && /^[a-zA-Z0-9_-]{8,120}$/.test(existing)) return existing

  const generated = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`
  localStorage.setItem(DEVICE_ID_KEY, generated)
  return generated
}

function getApiToken(): string | null {
  try {
    return localStorage.getItem(API_TOKEN_KEY)
  } catch {
    return null
  }
}

function decodeBase64Url(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  // Return a concrete ArrayBuffer rather than Uint8Array<ArrayBufferLike>.
  // The DOM Push API expects BufferSource backed by an ArrayBuffer, and newer
  // TypeScript DOM declarations correctly reject a potentially shared buffer.
  const output = new Uint8Array(new ArrayBuffer(raw.length))
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index)
  return output.buffer
}

function nextScheduleRevision(): number {
  let stored = 0
  try {
    stored = Number(localStorage.getItem(SCHEDULE_REVISION_KEY) || 0)
  } catch {
    // A time-derived revision still provides ordering if storage is unavailable.
  }
  const revision = Math.max(Date.now(), Number.isSafeInteger(stored) ? stored + 1 : 0, lastIssuedRevision + 1)
  lastIssuedRevision = revision
  try {
    localStorage.setItem(SCHEDULE_REVISION_KEY, String(revision))
  } catch {
    // The current request can still proceed with its in-memory revision.
  }
  return revision
}

export function getInitialBackgroundPushStatus(): BackgroundPushStatus {
  if (!isSecureApiUrl() || !VAPID_PUBLIC_KEY) return 'not-configured'
  try {
    return localStorage.getItem(API_TOKEN_KEY) ? 'ready' : 'not-enabled'
  } catch {
    return 'not-enabled'
  }
}

export async function registerBackgroundPush(): Promise<BackgroundPushStatus> {
  if (!isSecureApiUrl() || !VAPID_PUBLIC_KEY) return 'not-configured'
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  if (!('Notification' in window) || Notification.permission !== 'granted') return 'permission-required'

  try {
    const existingRegistration = await navigator.serviceWorker.getRegistration()
    if (!existingRegistration) return 'unsupported'
    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeBase64Url(VAPID_PUBLIC_KEY),
      })
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const existingToken = getApiToken()
    if (existingToken) headers.Authorization = `Bearer ${existingToken}`

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(`${API_URL}/api/push/register`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ deviceId: getDeviceId(), subscription: subscription.toJSON() }),
        signal: controller.signal,
      })
    } finally {
      window.clearTimeout(timeout)
    }
    if (!response.ok) return 'error'

    const payload = (await response.json()) as { apiToken?: string }
    if (typeof payload.apiToken !== 'string' || payload.apiToken.length < 32) return 'error'
    localStorage.setItem(API_TOKEN_KEY, payload.apiToken)
    return 'ready'
  } catch {
    return 'error'
  }
}

export async function syncBackgroundReminders(activities: ActivityItem[]): Promise<void> {
  if (!isSecureApiUrl()) throw new Error('URL push server tidak tersedia atau tidak aman.')
  const token = getApiToken()
  if (!token) throw new Error('Perangkat belum terdaftar ke layanan push.')

  const now = Date.now()
  const reminders = activities
    .filter((activity) => activity.reminderEnabled && !activity.completed)
    .flatMap((activity) => {
      const triggerDate = activity.snoozedUntil
        ? new Date(activity.snoozedUntil)
        : subtractMinutes(
            parseActivityDateTime(activity.date, activity.startTime),
            activity.reminderMinutesBefore
          )
      if (!Number.isFinite(triggerDate.getTime()) || triggerDate.getTime() <= now) return []
      return [{
        id: `${activity.id}|${triggerDate.toISOString()}`,
        title: `Pengingat: ${activity.title}`.slice(0, 120),
        body: `${activity.startTime}–${activity.endTime} · ${activity.category}`.slice(0, 240),
        triggerAt: triggerDate.toISOString(),
        url: '/?tab=calendar',
        silent: activity.reminderMode === 'silent',
      }]
    })

  // Abort an obsolete request and attach a monotonic revision so the server also
  // rejects stale requests that reached it before the abort took effect.
  activeReminderSync?.abort()
  const controller = new AbortController()
  activeReminderSync = controller
  const revision = nextScheduleRevision()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${API_URL}/api/push/reminders`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ revision, reminders }),
      signal: controller.signal,
    })
    if (response.status === 409) return // A newer schedule is already stored by the server.
    if (!response.ok) throw new Error(`Push schedule gagal disinkronkan (${response.status}).`)
  } catch (error) {
    if (controller.signal.aborted) return
    throw error
  } finally {
    window.clearTimeout(timeout)
    if (activeReminderSync === controller) activeReminderSync = null
  }
}

export async function sendBackgroundPushTest(): Promise<boolean> {
  if (!isSecureApiUrl()) return false
  const token = getApiToken()
  if (!token) return false
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${API_URL}/api/push/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
    return response.ok
  } catch {
    return false
  } finally {
    window.clearTimeout(timeout)
  }
}
