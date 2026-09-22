// BankConnector's public status feed — see bankconnector/feed.ts for what it carries and why.
import { maintenances, pageConfig, workerConfig } from '@/uptime.config'
import { CompactedMonitorStateWrapper, getFromStore } from '@/worker/src/store'
import { buildFeed } from '@/bankconnector/feed'

export const runtime = 'edge'

const headers = {
  'Content-Type': 'application/json',
  // Read cross-origin by bankconnector.com/status and app.bankconnector.com's sidebar; it is public by design.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=30',
}

export default async function handler(): Promise<Response> {
  const state = new CompactedMonitorStateWrapper(await getFromStore(process.env as any, 'state'))
  if (state.data.lastUpdate === 0) {
    return new Response(JSON.stringify({ error: 'No data available' }), { status: 503, headers })
  }
  const feed = buildFeed(
    state,
    state.data.lastUpdate,
    workerConfig.monitors,
    pageConfig,
    maintenances,
    Math.round(Date.now() / 1000)
  )
  return new Response(JSON.stringify(feed), { headers })
}
