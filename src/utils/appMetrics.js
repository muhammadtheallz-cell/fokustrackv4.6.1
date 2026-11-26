/** Build an Indonesian local-date key without converting through UTC. */
export function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Calculate consistency from actual completion dates (not scheduled dates).
 * A streak remains alive during the current day if yesterday was active.
 */
export function calculateConsistency(focusSessions, activities, streakResetAt, now = new Date()) {
  const resetAt = streakResetAt ? Date.parse(streakResetAt) : null
  const hasReset = Number.isFinite(resetAt)
  const activeDates = new Set()

  for (const session of focusSessions || []) {
    const completedAt = Date.parse(session?.completedAt || '')
    const dateKey = Number.isFinite(completedAt)
      ? localDateKey(new Date(completedAt))
      : typeof session?.date === 'string' ? session.date : null
    if (Number(session?.minutes) > 0 && dateKey && (!hasReset || completedAt > resetAt)) {
      activeDates.add(dateKey)
    }
  }

  for (const activity of activities || []) {
    if (!activity?.completed) continue
    const completedAt = Date.parse(activity.completedAt || '')
    const dateKey = Number.isFinite(completedAt)
      ? localDateKey(new Date(completedAt))
      : typeof activity.date === 'string' ? activity.date : null
    const isAfterReset = !hasReset || (Number.isFinite(completedAt) && completedAt > resetAt)
    if (dateKey && isAfterReset) activeDates.add(dateKey)
  }

  const today = localDateKey(now)
  if (!today) return { hasStartedConsistency: activeDates.size > 0, streakCount: 0 }

  let streakCount = 0
  const startOffset = activeDates.has(today) ? 0 : 1
  for (let offset = startOffset; offset <= activeDates.size; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
    const key = localDateKey(date)
    if (key && activeDates.has(key)) streakCount += 1
    else break
  }

  return {
    hasStartedConsistency: activeDates.size > 0,
    streakCount,
  }
}

/** Aggregate the selected days in one pass instead of scanning all transactions 7 times. */
export function aggregateTransactionsForDays(transactions, dayKeys) {
  const days = new Map(dayKeys.map((key) => [key, { dayKey: key, label: key.slice(8, 10), income: 0, expense: 0 }]))
  for (const transaction of transactions || []) {
    const row = days.get(transaction?.date)
    if (!row || !Number.isFinite(transaction?.amount) || transaction.amount < 0) continue
    if (transaction.type === 'income') row.income += transaction.amount
    else if (transaction.type === 'expense') row.expense += transaction.amount
  }
  const daily = dayKeys.map((key) => days.get(key))
  const maxVal = Math.max(10_000, ...daily.map((day) => Math.max(day.income, day.expense)))
  return { daily, maxVal }
}
