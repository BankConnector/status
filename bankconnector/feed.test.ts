import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFeed, type StateReader } from './feed.ts'
import type { IncidentRecord } from '../types/config'

const DAY = 86400
const NOW = 1_790_000_000

function reader(records: Record<string, IncidentRecord[]>): StateReader {
  return {
    incidentLen: (id) => records[id]?.length ?? 0,
    getIncident: (id, i) => records[id][i],
  }
}
const dummy = (since: number): IncidentRecord => ({ start: [since], end: since, error: ['dummy'] })
const monitors = [
  { id: 'app', name: 'API & Dashboard', method: 'GET', target: 'https://app.example/ready' },
  { id: 'hidden', name: 'Alert only', method: 'GET', target: 'https://example/' },
]
const page = { group: { Services: ['app'] } }

test('a monitor in no group never reaches the public feed', () => {
  const feed = buildFeed(reader({ app: [dummy(NOW - DAY)], hidden: [dummy(NOW - DAY)] }), NOW, monitors, page, [], NOW)
  assert.deepEqual(feed.services.map((s) => s.id), ['app'])
})

test('uptime counts only monitored time — no credit or blame before monitoring began', () => {
  const since = NOW - 10 * DAY
  const outage = { start: [NOW - 5 * DAY], end: NOW - 5 * DAY + 864, error: ['timeout'] } // 1 % of a day
  const feed = buildFeed(reader({ app: [dummy(since), outage] }), NOW, monitors, page, [], NOW)
  const app = feed.services[0]
  assert.equal(app.uptimePercent, 99.9) // 864 s down of 10 days
  assert.equal(app.up, true)
  assert.equal(feed.overall, 'operational')
  assert.deepEqual(app.incidents, [{ start: outage.start[0], end: outage.end, reasons: ['timeout'] }])
})

test('an ongoing outage outside maintenance makes the whole feed degraded', () => {
  const open = { start: [NOW - 300, NOW - 120], end: null, error: ['timeout', 'Got: 503'] }
  const feed = buildFeed(reader({ app: [dummy(NOW - DAY), open] }), NOW, monitors, page, [], NOW)
  assert.equal(feed.services[0].up, false)
  assert.equal(feed.overall, 'degraded')
  assert.deepEqual(feed.services[0].incidents[0].reasons, ['timeout', 'Got: 503'])
})

test('the same outage inside declared maintenance reads as maintenance, not degraded', () => {
  const open = { start: [NOW - 300], end: null, error: ['Got: 503'] }
  const m = [{ monitors: ['app'], body: 'upgrade', start: NOW - 600, end: NOW + 600 }]
  const feed = buildFeed(reader({ app: [dummy(NOW - DAY), open] }), NOW, monitors, page, m, NOW)
  assert.equal(feed.overall, 'maintenance')
  assert.equal(feed.maintenances[0].state, 'active')
})

test('maintenance announced ahead is published as upcoming — the SLA’s 7-day notice', () => {
  const m = [{ monitors: ['app', 'hidden'], title: 'Database upgrade', body: 'b', start: NOW + 8 * DAY, end: NOW + 8 * DAY + 3600 }]
  const feed = buildFeed(reader({ app: [dummy(NOW - DAY)] }), NOW, monitors, page, m, NOW)
  assert.equal(feed.maintenances[0].state, 'upcoming')
  assert.deepEqual(feed.maintenances[0].services, ['app']) // the alert-only monitor is not named publicly
  assert.equal(feed.overall, 'operational')
})

test('incidents that ended before the 90-day window are dropped', () => {
  const old = { start: [NOW - 100 * DAY], end: NOW - 100 * DAY + 60, error: ['x'] }
  const feed = buildFeed(reader({ app: [dummy(NOW - 200 * DAY), old] }), NOW, monitors, page, [], NOW)
  assert.deepEqual(feed.services[0].incidents, [])
  assert.equal(feed.services[0].uptimePercent, 100)
})
