const DEVICE_ID_PATTERN = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|device-[a-z0-9-]{8,120})$/i

export function validDeviceId(value) {
  return typeof value === 'string' && DEVICE_ID_PATTERN.test(value)
}

export function validInternalPath(value) {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return false
  }
  try {
    const parsed = new URL(value, 'https://fokustrack.invalid')
    return parsed.origin === 'https://fokustrack.invalid'
  } catch {
    return false
  }
}

export function validPushEndpoint(value) {
  if (typeof value !== 'string' || value.length > 4096) return false
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false
    const host = url.hostname.toLowerCase()
    return (
      host === 'fcm.googleapis.com' ||
      host === 'updates.push.services.mozilla.com' ||
      host.endsWith('.push.services.mozilla.com') ||
      host === 'web.push.apple.com' ||
      host.endsWith('.push.apple.com') ||
      host === 'notify.windows.com' ||
      host.endsWith('.notify.windows.com')
    )
  } catch {
    return false
  }
}

export function validSubscription(subscription) {
  const p256dh = subscription?.keys?.p256dh
  const auth = subscription?.keys?.auth
  return Boolean(
    subscription &&
    typeof subscription.endpoint === 'string' &&
    validPushEndpoint(subscription.endpoint) &&
    typeof p256dh === 'string' && /^[a-zA-Z0-9_-]{40,200}$/.test(p256dh) &&
    typeof auth === 'string' && /^[a-zA-Z0-9_-]{16,100}$/.test(auth)
  )
}
