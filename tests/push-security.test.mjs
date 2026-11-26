import test from 'node:test'
import assert from 'node:assert/strict'
import { validDeviceId, validInternalPath, validPushEndpoint, validSubscription } from '../server/security.mjs'

test('accepts browser-generated device ids but rejects reserved object keys', () => {
  assert.equal(validDeviceId('f3e1c3e2-9a77-4fb3-86f0-02fd1a4bdcf1'), true)
  assert.equal(validDeviceId('device-1732620000-random123'), true)
  assert.equal(validDeviceId('__proto__'), false)
  assert.equal(validDeviceId('constructor'), false)
  assert.equal(validDeviceId('../etc/passwd'), false)
})

test('only accepts same-origin relative notification click paths', () => {
  assert.equal(validInternalPath('/?tab=calendar'), true)
  assert.equal(validInternalPath('/?tab=focus#timer'), true)
  assert.equal(validInternalPath('//evil.example/path'), false)
  assert.equal(validInternalPath('/\\\\evil.example/path'), false)
  assert.equal(validInternalPath('https://evil.example'), false)
})

test('push endpoints are HTTPS and restricted to known browser push providers', () => {
  assert.equal(validPushEndpoint('https://fcm.googleapis.com/fcm/send/example'), true)
  assert.equal(validPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/example'), true)
  assert.equal(validPushEndpoint('https://web.push.apple.com/example'), true)
  assert.equal(validPushEndpoint('https://wns2.notify.windows.com/w/?token=example'), true)
  assert.equal(validPushEndpoint('http://fcm.googleapis.com/fcm/send/example'), false)
  assert.equal(validPushEndpoint('https://127.0.0.1/admin'), false)
  assert.equal(validPushEndpoint('https://attacker.example/push'), false)
})

test('subscription keys must have expected base64url shape', () => {
  assert.equal(validSubscription({
    endpoint: 'https://fcm.googleapis.com/fcm/send/example',
    keys: { p256dh: 'A'.repeat(65), auth: 'B'.repeat(24) },
  }), true)
  assert.equal(validSubscription({
    endpoint: 'https://attacker.example/push',
    keys: { p256dh: 'A'.repeat(65), auth: 'B'.repeat(24) },
  }), false)
})
