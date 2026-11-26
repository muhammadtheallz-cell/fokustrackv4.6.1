import test from 'node:test'
import assert from 'node:assert/strict'
import { removeAlarmFromQueue } from '../src/utils/alarmQueue.js'

const queue = [
  { activity: { id: 'first' }, triggerKey: 'first' },
  { activity: { id: 'second' }, triggerKey: 'second' },
  { activity: { id: 'third' }, triggerKey: 'third' },
]

test('marking current activity complete removes only that alarm and keeps following alarms', () => {
  const result = removeAlarmFromQueue(queue, 'first', true)
  assert.deepEqual(result.map((alarm) => alarm.activity.id), ['second', 'third'])
})

test('dismissing or snoozing current alarm advances exactly one queue item', () => {
  assert.deepEqual(removeAlarmFromQueue(queue, 'first', false).map((alarm) => alarm.activity.id), ['second', 'third'])
})

test('empty alarm queue stays empty', () => {
  assert.deepEqual(removeAlarmFromQueue([], 'first', false), [])
})
