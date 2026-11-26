import test from 'node:test'
import assert from 'node:assert/strict'
import { sameReminderPayload, sameSubscription } from '../server/push-guards.mjs'

const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/device',
  keys: { p256dh: 'public-key', auth: 'auth-key' },
}

const reminder = {
  id: 'activity-1|2026-11-26T10:00:00.000Z',
  triggerAt: '2026-11-26T10:00:00.000Z',
  title: 'Pengingat',
  body: 'Mulai kegiatan',
  url: '/?tab=calendar',
  silent: false,
}

test('a failed old subscription cannot remove a newly registered endpoint or key pair', () => {
  assert.equal(sameSubscription(subscription, { ...subscription }), true)
  assert.equal(sameSubscription(subscription, { ...subscription, endpoint: 'https://fcm.googleapis.com/fcm/send/new' }), false)
  assert.equal(sameSubscription(subscription, { ...subscription, keys: { ...subscription.keys, auth: 'new-auth' } }), false)
})

test('an in-flight delivery cannot mark a changed reminder schedule as sent', () => {
  assert.equal(sameReminderPayload(reminder, { ...reminder }), true)
  assert.equal(sameReminderPayload(reminder, { ...reminder, triggerAt: '2026-11-26T11:00:00.000Z' }), false)
  assert.equal(sameReminderPayload(reminder, { ...reminder, title: 'Judul baru' }), false)
})
