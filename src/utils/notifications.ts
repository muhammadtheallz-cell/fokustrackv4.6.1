export type BrowserNotificationStatus = 'granted' | 'denied' | 'default' | 'unsupported'

export function getNotificationPermissionStatus(): BrowserNotificationStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationStatus> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

export async function sendSystemNotification(
  title: string,
  body: string,
  tag?: string,
  silent = false
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission !== 'granted') return false

  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body,
    icon: '/icons/fokustrack-192.png',
    badge: '/icons/fokustrack-192.png',
    tag: tag || `fokustrack-${Date.now()}`,
    renotify: true,
    requireInteraction: true,
    silent,
    vibrate: silent ? [] : [300, 120, 300, 120, 450],
    data: { url: '/?tab=calendar' },
  }

  // On mobile, notifications should be created by the active Service Worker.
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      if (registration?.active) {
        await registration.showNotification(title, options)
        return true
      }
    } catch {
      // Continue to the Notification constructor fallback below.
    }
  }

  // Fallback for desktop browsers without Service Worker support.
  try {
    const notification = new Notification(title, options)
    notification.onclick = () => {
      window.focus()
      window.location.assign('/?tab=calendar')
      notification.close()
    }
    return true
  } catch {
    return false
  }
}
