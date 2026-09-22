// The public status feed that bankconnector.com/status and the app's sidebar read (`/api/status`).
//
// Upstream's `/api/data` carries current state and maintenances only; the SLA promises incidents too, and
// the page draws 90-day uptime bars. This builds both from the same stored state upstream's own page reads
// (components/DetailBar.tsx), and publishes ONLY the monitors listed in `pageConfig.group` — a monitor left
// out of every group is alert-only and never appears here.

import type { IncidentRecord, MaintenanceConfig, MonitorTarget, PageConfig } from '../types/config'

export const FEED_SCHEMA = 1
export const HISTORY_DAYS = 90

export type FeedIncident = { start: number; end: number | null; reasons: string[] }

export type FeedService = {
  id: string
  name: string
  group: string
  up: boolean
  /** Unix seconds the monitor was first checked; nothing before it is claimed either way. */
  monitoringSince: number
  /** Share of the monitored time in the last 90 days the service answered, 0–100, 3 decimals. */
  uptimePercent: number
  /** Outages overlapping the last 90 days, oldest first. `end: null` = ongoing. */
  incidents: FeedIncident[]
}

export type FeedMaintenance = {
  title: string
  body: string
  start: number
  end: number | null
  services: string[]
  state: 'upcoming' | 'active' | 'past'
}

export type Feed = {
  schema: number
  updatedAt: number
  overall: 'operational' | 'degraded' | 'maintenance'
  services: FeedService[]
  maintenances: FeedMaintenance[]
}

/** The two reads the feed needs from upstream's CompactedMonitorStateWrapper. */
export type StateReader = {
  incidentLen(monitorId: string): number
  getIncident(monitorId: string, index: number): IncidentRecord
}

const toUnix = (t: number | string): number => (typeof t === 'number' ? t : Math.round(Date.parse(t) / 1000))

export function buildFeed(
  state: StateReader,
  updatedAt: number,
  monitors: MonitorTarget[],
  pageConfig: PageConfig,
  maintenances: MaintenanceConfig[],
  now: number
): Feed {
  const windowStart = now - HISTORY_DAYS * 86400
  const services: FeedService[] = []

  for (const [group, ids] of Object.entries(pageConfig.group ?? {})) {
    for (const id of ids) {
      const monitor = monitors.find((m) => m.id === id)
      const len = state.incidentLen(id)
      if (!monitor || len === 0) continue // not configured, or not checked yet

      // Index 0 is upstream's dummy record: its start is when monitoring began (DetailBar.tsx).
      const monitoringSince = state.getIncident(id, 0).start[0]
      const from = Math.max(windowStart, monitoringSince)
      const incidents: FeedIncident[] = []
      let downSeconds = 0

      for (let i = 1; i < len; i++) {
        const rec = state.getIncident(id, i)
        const end = rec.end ?? now
        if (end < windowStart) continue
        downSeconds += Math.max(0, Math.min(end, now) - Math.max(rec.start[0], from))
        incidents.push({ start: rec.start[0], end: rec.end, reasons: Array.from(new Set(rec.error)) })
      }

      const monitored = now - from
      const last = state.getIncident(id, len - 1)
      services.push({
        id,
        name: monitor.name,
        group,
        up: last.end !== null,
        monitoringSince,
        uptimePercent: monitored > 0 ? Math.round(((monitored - downSeconds) / monitored) * 100000) / 1000 : 100,
        incidents,
      })
    }
  }

  const feedMaintenances: FeedMaintenance[] = maintenances
    .map((m) => {
      const start = toUnix(m.start)
      const end = m.end === undefined ? null : toUnix(m.end)
      const state: FeedMaintenance['state'] =
        now < start ? 'upcoming' : end === null || now <= end ? 'active' : 'past'
      return {
        title: m.title ?? 'Scheduled maintenance',
        body: m.body,
        start,
        end,
        services: (m.monitors ?? []).filter((id) => services.some((s) => s.id === id)),
        state,
      }
    })
    .filter((m) => m.end === null || m.end >= windowStart)
    .sort((a, b) => a.start - b.start)

  const activeIds = new Set(feedMaintenances.filter((m) => m.state === 'active').flatMap((m) => m.services))
  const downOutsideMaintenance = services.some((s) => !s.up && !activeIds.has(s.id))
  const overall: Feed['overall'] = downOutsideMaintenance
    ? 'degraded'
    : activeIds.size > 0
      ? 'maintenance'
      : 'operational'

  return { schema: FEED_SCHEMA, updatedAt, overall, services, maintenances: feedMaintenances }
}
