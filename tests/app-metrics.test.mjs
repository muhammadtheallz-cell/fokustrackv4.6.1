import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregateTransactionsForDays, calculateConsistency, localDateKey } from '../src/utils/appMetrics.js'

test('consistency uses actual local completion date instead of scheduled activity date', () => {
  const completedAt = new Date(2026, 10, 26, 0, 15)
  const scheduledDate = new Date(2026, 10, 25, 18, 0)
  const activities = [{
    completed: true,
    date: localDateKey(scheduledDate),
    completedAt: completedAt.toISOString(),
  }]
  const now = new Date(2026, 10, 26, 12, 0)
  const result = calculateConsistency([], activities, undefined, now)
  assert.equal(result.hasStartedConsistency, true)
  assert.equal(result.streakCount, 1)
})

test('today without completion preserves yesterday streak, but a gap breaks it', () => {
  const now = new Date(2026, 10, 26, 12)
  const sessions = [{ minutes: 30, completedAt: new Date(2026, 10, 25, 18).toISOString() }]
  assert.equal(calculateConsistency(sessions, [], undefined, now).streakCount, 1)
  const olderOnly = [{ minutes: 30, completedAt: new Date(2026, 10, 24, 18).toISOString() }]
  assert.equal(calculateConsistency(olderOnly, [], undefined, now).streakCount, 0)
})

test('reset marker excludes sessions at or before the reset time', () => {
  const sessions = [
    { minutes: 30, completedAt: '2026-11-26T08:00:00+07:00' },
    { minutes: 20, completedAt: '2026-11-26T09:00:00+07:00' },
  ]
  const result = calculateConsistency(sessions, [], '2026-11-26T08:30:00+07:00', new Date('2026-11-26T12:00:00+07:00'))
  assert.equal(result.streakCount, 1)
})

test('streaks longer than one year are not artificially capped at 365 days', () => {
  const sessions = []
  const today = new Date(2026, 10, 26, 12)
  for (let offset = 0; offset < 400; offset += 1) {
    const date = new Date(2026, 10, 26 - offset, 12)
    sessions.push({ minutes: 1, completedAt: date.toISOString() })
  }
  assert.equal(calculateConsistency(sessions, [], undefined, today).streakCount, 400)
})

test('finance chart aggregation scans transactions once and keeps zero days at zero', () => {
  const result = aggregateTransactionsForDays([
    { date: '2026-11-26', amount: 10_000, type: 'income' },
    { date: '2026-11-26', amount: 4_000, type: 'expense' },
    { date: '2026-11-25', amount: 3_000, type: 'expense' },
  ], ['2026-11-25', '2026-11-26'])
  assert.deepEqual(result.daily.map(({ income, expense }) => [income, expense]), [[0, 3000], [10000, 4000]])
  assert.equal(result.maxVal, 10000)
})

test('local date keys preserve the calendar date without UTC conversion', () => {
  assert.equal(localDateKey(new Date(2026, 10, 26, 0, 1)), '2026-11-26')
})
