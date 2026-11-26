export const MIN_FOCUS_MINUTES = 1
export const MAX_FOCUS_MINUTES = 12 * 60

/** Convert a valid custom hours/minutes pair into total minutes. */
export function getCustomDurationMinutes(hours, minutes) {
  const safeHours = Number(hours)
  const safeMinutes = Number(minutes)

  if (!Number.isInteger(safeHours) || !Number.isInteger(safeMinutes)) return null
  if (safeHours < 0 || safeHours > 12 || safeMinutes < 0 || safeMinutes > 59) return null

  const totalMinutes = safeHours * 60 + safeMinutes
  return totalMinutes >= MIN_FOCUS_MINUTES && totalMinutes <= MAX_FOCUS_MINUTES
    ? totalMinutes
    : null
}

/** Format a duration for labels such as "1 jam 30 mnt". */
export function formatFocusDurationLabel(value) {
  const numeric = Number(value)
  const totalMinutes = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours > 0 && minutes > 0) return `${hours} jam ${minutes} mnt`
  if (hours > 0) return `${hours} jam`
  return `${minutes} mnt`
}

/** Format remaining seconds as MM:SS, or HH:MM:SS for hour-long sessions. */
export function formatFocusClock(value, forceHours = false) {
  const numeric = Number(value)
  const totalSeconds = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)

  if (hours > 0 || forceHours) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${String(totalMinutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** Calculate remaining whole seconds from an absolute deadline. */
export function getRemainingFocusSeconds(endAt, now = Date.now()) {
  const deadline = Number(endAt)
  const currentTime = Number(now)
  if (!Number.isFinite(deadline) || !Number.isFinite(currentTime)) return 0
  return Math.max(0, Math.ceil((deadline - currentTime) / 1000))
}

/** Count only whole minutes actually completed by a manually ended session. */
export function getElapsedFocusMinutes(totalSeconds, remainingSeconds) {
  const total = Number(totalSeconds)
  const remaining = Number(remainingSeconds)
  if (!Number.isFinite(total) || !Number.isFinite(remaining) || total <= 0) return 0
  const safeTotal = Math.floor(total)
  const safeRemaining = Math.min(safeTotal, Math.max(0, Math.ceil(remaining)))
  return Math.max(0, Math.floor((safeTotal - safeRemaining) / 60))
}
