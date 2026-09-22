import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatAlert, inMaintenance, shouldSendDown, shouldSendUp } from './alerts.ts'

const T0 = 1_790_000_000 // an incident's first failed check

test('no DOWN mail on the first failed check — one slow probe never pages', () => {
  assert.equal(shouldSendDown(T0, T0), false)
})

test('DOWN mail on the second consecutive failed check, allowing ±30 s of cron drift', () => {
  assert.equal(shouldSendDown(T0, T0 + 60), true)
  assert.equal(shouldSendDown(T0, T0 + 31), true)
  assert.equal(shouldSendDown(T0, T0 + 89), true)
})

test('DOWN mail is sent once per outage, not every minute it lasts', () => {
  const ticks = Array.from({ length: 30 }, (_, i) => T0 + i * 60)
  assert.equal(ticks.filter((now) => shouldSendDown(T0, now)).length, 1)
})

test('RECOVERED mail only follows an outage that was long enough to have paged', () => {
  assert.equal(shouldSendUp(T0, T0 + 60), false) // recovered on the next check: nobody was paged
  assert.equal(shouldSendUp(T0, T0 + 120), true)
})

test('maintenance suppresses mail only for the services it names, only while it runs', () => {
  const m = [{ monitors: ['app'], body: 'upgrade', start: '2026-10-01T02:00:00+02:00', end: '2026-10-01T03:00:00+02:00' }]
  const during = Date.parse('2026-10-01T02:30:00+02:00') / 1000
  const after = Date.parse('2026-10-01T03:30:00+02:00') / 1000
  assert.equal(inMaintenance('app', during, m), true)
  assert.equal(inMaintenance('sandbox', during, m), false)
  assert.equal(inMaintenance('app', after, m), false)
})

test('the DOWN mail names the service, the reason and where it was checked from', () => {
  const monitor = { id: 'app', name: 'API & Dashboard', method: 'GET', target: 'https://app.bankconnector.com/ready' }
  const { subject, text } = formatAlert(monitor, false, T0, T0 + 60, 'Expected codes: 200, Got: 503')
  assert.equal(subject, 'DOWN: API & Dashboard')
  assert.match(text, /Got: 503/)
  assert.match(text, /app\.bankconnector\.com\/ready/)
})
