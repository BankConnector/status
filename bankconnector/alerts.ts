// BankConnector's outage email, sent from UptimeFlare's `callbacks` because the built-in webhook takes its
// headers from this repo's config — and the Brevo API key must never be in a file. The key is a Worker
// secret (`BREVO_API_KEY`, bound in deploy.tf from the GitHub Actions secret of the same name), read from
// `env` only at send time.
//
// The callbacks do not apply `notification.gracePeriod` or the maintenance skip the built-in webhook applies
// (worker/src/index.ts, worker/src/util.ts `formatAndNotify`), so both are re-stated here with the SAME
// windows upstream uses, as pure functions a plain `node --test` run can prove.

import type { MaintenanceConfig, MonitorTarget } from '../types/config'

/** Minutes a monitor must stay down after its first failed check before anyone is emailed. 1 = the second
 *  consecutive failed check (checks run every minute). */
export const GRACE_MINUTES = 1

export const ALERT_TO = 'ops@bankconnector.com'
export const ALERT_FROM = { name: 'BankConnector Status', email: 'status@bankconnector.com' }
export const TIME_ZONE = 'Europe/Copenhagen'

/**
 * onIncident runs once a minute while a monitor is down. The DOWN mail goes on the one tick that lands in
 * the grace window — ±30 s of drift, exactly upstream's window — so it is sent once per outage, not every
 * minute.
 */
export function shouldSendDown(incidentStart: number, now: number, graceMinutes = GRACE_MINUTES): boolean {
  const downFor = now - incidentStart
  return downFor >= graceMinutes * 60 - 30 && downFor < graceMinutes * 60 + 30
}

/** The RECOVERED mail goes only when a DOWN mail was sent, i.e. the outage outlived the grace window. */
export function shouldSendUp(incidentStart: number, now: number, graceMinutes = GRACE_MINUTES): boolean {
  return now - incidentStart >= (graceMinutes + 1) * 60 - 30
}

/** True while a declared maintenance window covers this monitor — no outage mail for planned work. */
export function inMaintenance(monitorId: string, now: number, maintenances: MaintenanceConfig[]): boolean {
  const at = new Date(now * 1000)
  return maintenances.some(
    (m) =>
      (m.monitors ?? []).includes(monitorId) &&
      at >= new Date(m.start) &&
      (!m.end || at <= new Date(m.end))
  )
}

function when(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString('en-GB', { timeZone: TIME_ZONE }) + ' (Copenhagen)'
}

function minutes(seconds: number): string {
  const m = Math.round(seconds / 60)
  return m === 1 ? '1 minute' : `${m} minutes`
}

export function formatAlert(
  monitor: MonitorTarget,
  isUp: boolean,
  incidentStart: number,
  now: number,
  reason: string
): { subject: string; text: string } {
  if (isUp) {
    return {
      subject: `RECOVERED: ${monitor.name}`,
      text:
        `${monitor.name} is answering again.\n\n` +
        `Down from ${when(incidentStart)} to ${when(now)} — ${minutes(now - incidentStart)}.\n` +
        `Checked: ${monitor.target}\n`,
    }
  }
  return {
    subject: `DOWN: ${monitor.name}`,
    text:
      `${monitor.name} has failed every check since ${when(incidentStart)}.\n\n` +
      `Reason: ${reason}\n` +
      `Checked: ${monitor.target}\n\n` +
      `This check runs from Cloudflare, outside the server it watches. Status page: https://bankconnector.com/status\n`,
  }
}

type AlertEnv = { BREVO_API_KEY?: string }

export async function sendAlert(env: AlertEnv, subject: string, text: string): Promise<void> {
  if (!env.BREVO_API_KEY) {
    // Loud in the Worker log, never silent: a missing secret must not look like a quiet night.
    console.log(`ALERT NOT SENT — BREVO_API_KEY is not bound: ${subject}`)
    return
  }
  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: ALERT_FROM, to: [{ email: ALERT_TO }], subject, textContent: text }),
  })
  if (!resp.ok) {
    console.log(`ALERT NOT SENT — Brevo answered ${resp.status}: ${await resp.text()} (${subject})`)
  }
}
