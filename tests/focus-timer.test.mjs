import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getCustomDurationMinutes,
  formatFocusDurationLabel,
  formatFocusClock,
  MIN_FOCUS_MINUTES,
  MAX_FOCUS_MINUTES,
  getRemainingFocusSeconds,
  getElapsedFocusMinutes,
} from '../src/utils/focusTimer.js'

test('custom duration accepts the minimum and maximum supported lengths', () => {
  assert.equal(getCustomDurationMinutes(0, 1), MIN_FOCUS_MINUTES)
  assert.equal(getCustomDurationMinutes(12, 0), MAX_FOCUS_MINUTES)
  assert.equal(getCustomDurationMinutes(1, 30), 90)
})

test('custom duration rejects empty, negative, fractional, and out-of-range values', () => {
  assert.equal(getCustomDurationMinutes(0, 0), null)
  assert.equal(getCustomDurationMinutes(-1, 30), null)
  assert.equal(getCustomDurationMinutes(1, 60), null)
  assert.equal(getCustomDurationMinutes(12, 1), null)
  assert.equal(getCustomDurationMinutes(0.5, 30), null)
  assert.equal(getCustomDurationMinutes(1, 2.5), null)
})

test('duration labels are readable for minutes and hours', () => {
  assert.equal(formatFocusDurationLabel(25), '25 mnt')
  assert.equal(formatFocusDurationLabel(60), '1 jam')
  assert.equal(formatFocusDurationLabel(90), '1 jam 30 mnt')
  assert.equal(formatFocusDurationLabel(720), '12 jam')
})

test('clock formatting switches to HH:MM:SS at one hour', () => {
  assert.equal(formatFocusClock(59), '00:59')
  assert.equal(formatFocusClock(1500), '25:00')
  assert.equal(formatFocusClock(3600), '01:00:00')
  assert.equal(formatFocusClock(5400), '01:30:00')
  assert.equal(formatFocusClock(3599, true), '00:59:59')
  assert.equal(formatFocusClock(43200), '12:00:00')
})

test('remaining time is derived from the absolute deadline and never goes negative', () => {
  assert.equal(getRemainingFocusSeconds(10_000, 8_500), 2)
  assert.equal(getRemainingFocusSeconds(10_000, 10_000), 0)
  assert.equal(getRemainingFocusSeconds(9_000, 10_000), 0)
  assert.equal(getRemainingFocusSeconds(Number.NaN, 10_000), 0)
})

test('manual completion counts only whole minutes actually elapsed', () => {
  assert.equal(getElapsedFocusMinutes(25 * 60, 24 * 60 + 1), 0)
  assert.equal(getElapsedFocusMinutes(25 * 60, 24 * 60), 1)
  assert.equal(getElapsedFocusMinutes(25 * 60, 10 * 60), 15)
  assert.equal(getElapsedFocusMinutes(25 * 60, -5), 25)
  assert.equal(getElapsedFocusMinutes(25 * 60, 30 * 60), 0)
})
