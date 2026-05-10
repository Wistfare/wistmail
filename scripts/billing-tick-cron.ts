/**
 * Billing tick cron — runs inside the `billing-cron` compose service.
 *
 * Hits POST {API_URL}/api/v1/billing/internal/tick every TICK_INTERVAL_MS
 * (default 5min) with the shared INBOUND_SECRET so the renewal /
 * grace / suspension state machine keeps advancing without anyone poking
 * the admin UI. The endpoint is idempotent — a missed or failed tick
 * self-heals on the next cycle.
 *
 * Stays a single file with no runtime deps: it's a `node:20-alpine`
 * container running tsx so we don't need to wire it into the workspace
 * build graph. Logs to stdout; on tick failure logs and continues — we
 * don't want a blip on the API to crashloop the cron container.
 */
/* eslint-disable no-console */
type Fetch = typeof globalThis.fetch

export interface BillingTickConfig {
  apiUrl: string
  inboundSecret: string
  fetchImpl?: Fetch
}

export interface BillingTickResult {
  ok: boolean
  status: number
  body: unknown
}

/**
 * Fire one tick. Resolves with {ok,status,body} for both success and
 * non-2xx responses; only network-level failures throw. The cron loop
 * (see `runForever`) catches those and keeps looping.
 */
export async function runBillingTick(
  config: BillingTickConfig,
): Promise<BillingTickResult> {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch
  const url = `${config.apiUrl.replace(/\/$/, '')}/api/v1/billing/internal/tick`
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'X-Inbound-Secret': config.inboundSecret,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // tick endpoint always returns JSON; if it didn't, ignore body.
  }
  return { ok: res.ok, status: res.status, body }
}

/**
 * Forever-loop driver. Used by the container entrypoint. Exposed for
 * tests but they don't drive it — they call `runBillingTick` directly.
 */
export async function runForever(
  config: BillingTickConfig & {
    intervalMs: number
    sleep?: (ms: number) => Promise<void>
  },
): Promise<void> {
  const sleep =
    config.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  // Single-shot first so a fresh container reports its first heartbeat
  // immediately instead of after a full interval.
  for (;;) {
    const startedAt = Date.now()
    try {
      const r = await runBillingTick(config)
      if (r.ok) {
        console.log(
          `[billing-cron] tick ok status=${r.status} body=${JSON.stringify(r.body)}`,
        )
      } else {
        console.error(
          `[billing-cron] tick non-2xx status=${r.status} body=${JSON.stringify(r.body)}`,
        )
      }
    } catch (err) {
      console.error('[billing-cron] tick failed:', (err as Error).message)
    }
    const elapsed = Date.now() - startedAt
    const wait = Math.max(config.intervalMs - elapsed, 1000)
    await sleep(wait)
  }
}

// ── Container entrypoint ────────────────────────────────────────────────────
// The entrypoint runs only when this file is executed directly. Vitest
// imports the module to test it without booting the loop.

const isEntrypoint = (() => {
  // tsx + ESM: process.argv[1] is the resolved file path of the entry
  // module. import.meta.url is a file:// URL of *this* file.
  if (typeof process === 'undefined' || !process.argv[1]) return false
  try {
    const entry = new URL(`file://${process.argv[1]}`).href
    return entry === import.meta.url
  } catch {
    return false
  }
})()

if (isEntrypoint) {
  const apiUrl = process.env.API_URL ?? 'http://api:3001'
  const inboundSecret = process.env.INBOUND_SECRET ?? ''
  if (!inboundSecret) {
    console.error('[billing-cron] INBOUND_SECRET not set — refusing to start')
    process.exit(1)
  }
  const intervalMs = Number.parseInt(
    process.env.TICK_INTERVAL_MS ?? '300000',
    10,
  )
  if (!Number.isFinite(intervalMs) || intervalMs < 1000) {
    console.error(
      `[billing-cron] TICK_INTERVAL_MS=${process.env.TICK_INTERVAL_MS ?? ''} invalid — must be >= 1000`,
    )
    process.exit(1)
  }
  console.log(
    `[billing-cron] starting, target=${apiUrl} intervalMs=${intervalMs}`,
  )
  void runForever({ apiUrl, inboundSecret, intervalMs })
}
