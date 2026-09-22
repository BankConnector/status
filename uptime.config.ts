// BankConnector's status checks. The public page is bankconnector.com/status, drawn from this repo's feed
// (`/api/status`, bankconnector/feed.ts); UptimeFlare's own page at bankconnector-status.pages.dev is the
// unlinked fallback. How to announce maintenance: README.md.
//
// Nothing secret belongs in this file. It is bundled into both the Worker and the Pages functions; the
// outage email's Brevo key is a Worker secret read at send time (bankconnector/alerts.ts).

// Don't edit this line
import { MaintenanceConfig, PageConfig, WorkerConfig } from './types/config'
import {
  GRACE_MINUTES,
  TIME_ZONE,
  formatAlert,
  inMaintenance,
  sendAlert,
  shouldSendDown,
  shouldSendUp,
} from './bankconnector/alerts'

const pageConfig: PageConfig = {
  title: 'BankConnector Status',
  links: [
    { link: 'https://bankconnector.com', label: 'BankConnector' },
    { link: 'https://docs.bankconnector.com', label: 'Docs' },
    { link: 'https://bankconnector.com/status', label: 'Status page', highlight: true },
  ],
  // Only monitors listed here are shown — on this page AND in the public feed. `marketing_site` is
  // deliberately in no group: it alerts, but it is not a service customers depend on.
  group: {
    Services: ['app', 'sandbox', 'docs'],
  },
  maintenances: {
    upcomingColor: 'gray',
  },
}

// `/ready`, never `/health`: `/health` answers 200 whenever the process runs; `/ready` answers 503 when the
// database is unreachable, the schema is not migrated or the web app is missing (docs/RUNBOOK.md §3 in the
// engine repo). The status code is the signal; the keyword only proves the 200 came from our app and not
// from a proxy's error page. It is the bare key, not `"ready": true`, because the body is pretty-printed
// JSON and a formatting change must not read as an outage.
const workerConfig: WorkerConfig = {
  monitors: [
    {
      id: 'app',
      name: 'API & Dashboard',
      method: 'GET',
      target: 'https://app.bankconnector.com/ready',
      statusPageLink: 'https://app.bankconnector.com',
      expectedCodes: [200],
      timeout: 10000,
      responseKeyword: '"ready"',
      headers: { 'User-Agent': 'BankConnector-Status (UptimeFlare)' },
    },
    {
      id: 'sandbox',
      name: 'Sandbox',
      method: 'GET',
      target: 'https://sandbox.bankconnector.com/ready',
      statusPageLink: 'https://sandbox.bankconnector.com',
      expectedCodes: [200],
      timeout: 10000,
      responseKeyword: '"ready"',
      headers: { 'User-Agent': 'BankConnector-Status (UptimeFlare)' },
    },
    {
      id: 'docs',
      name: 'Developer docs',
      method: 'GET',
      target: 'https://docs.bankconnector.com/',
      statusPageLink: 'https://docs.bankconnector.com',
      expectedCodes: [200],
      timeout: 10000,
      headers: { 'User-Agent': 'BankConnector-Status (UptimeFlare)' },
    },
    {
      // TEMPORARY — proves the outage email end to end; in no group, so never on the page or feed.
      id: 'alert_test',
      name: 'Alert test (ignore this)',
      method: 'GET',
      target: 'https://bankconnector.com/alert-test-does-not-exist',
      expectedCodes: [200],
      timeout: 10000,
      headers: { 'User-Agent': 'BankConnector-Status (UptimeFlare)' },
    },
    {
      id: 'marketing_site',
      name: 'Marketing site (bankconnector.com)',
      method: 'GET',
      target: 'https://bankconnector.com/',
      expectedCodes: [200],
      timeout: 10000,
      headers: { 'User-Agent': 'BankConnector-Status (UptimeFlare)' },
    },
  ],
  notification: {
    // No `webhook`: the email goes from `callbacks` below. `gracePeriod` still drives upstream's own
    // logging, and bankconnector/alerts.ts applies the same number to the email.
    timeZone: TIME_ZONE,
    gracePeriod: GRACE_MINUTES,
  },
  callbacks: {
    onIncident: async (env, monitor, timeIncidentStart, timeNow, reason) => {
      if (!shouldSendDown(timeIncidentStart, timeNow)) return
      if (inMaintenance(monitor.id, timeNow, maintenances)) return
      const { subject, text } = formatAlert(monitor, false, timeIncidentStart, timeNow, reason)
      await sendAlert(env as any, subject, text)
    },
    onStatusChange: async (env, monitor, isUp, timeIncidentStart, timeNow, reason) => {
      if (!isUp || !shouldSendUp(timeIncidentStart, timeNow)) return
      if (inMaintenance(monitor.id, timeNow, maintenances)) return
      const { subject, text } = formatAlert(monitor, true, timeIncidentStart, timeNow, reason)
      await sendAlert(env as any, subject, text)
    },
  },
}

// Scheduled maintenance. The SLA promises ≥7 days' notice, so add an entry at least 7 days before `start`;
// it shows as "Upcoming" on the status page from the moment it is deployed. `monitors` names the services
// it covers (their outage emails are suppressed while it runs). Times in ISO 8601 with an offset.
const maintenances: MaintenanceConfig[] = []

// Don't edit this line
export { maintenances, pageConfig, workerConfig }
