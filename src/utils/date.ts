export function toDateKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatLongDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export function formatShortDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  if (!y || !m || !d) return dateKey
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(y, m - 1, d))
}

export function formatMonthYear(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export function getGreeting(hour: number = new Date().getHours()): string {
  if (hour < 11) return 'Selamat pagi'
  if (hour < 15) return 'Selamat siang'
  if (hour < 18) return 'Selamat sore'
  return 'Selamat malam'
}

export function getLastNDaysKeys(n: number): string[] {
  const result: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    result.push(toDateKey(d))
  }
  return result
}

export function parseActivityDateTime(dateKey: string, timeStr: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  return new Date(y || 1970, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0)
}

export function subtractMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() - minutes * 60_000)
}

export function formatTimeHHMM(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export function formatRelativeTime(target: Date, now: Date = new Date()): string {
  const diffMs = target.getTime() - now.getTime()
  const diffMins = Math.round(diffMs / 60_000)
  if (diffMins <= 0 && diffMins >= -5) return 'Sekarang'
  if (diffMins < -5) return 'Sudah lewat'
  if (diffMins < 60) return `Dalam ${diffMins} mnt`
  const hours = Math.floor(diffMins / 60)
  const remMins = diffMins % 60
  return remMins > 0 ? `Dalam ${hours} jam ${remMins} mnt` : `Dalam ${hours} jam`
}
