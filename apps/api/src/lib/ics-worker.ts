/// Worker-thread entrypoint for ICS parsing. The parent passes a
/// string via `workerData`; we run it through ical.js and post the
/// normalised `ParsedIcs` object back. The parent kills this worker
/// if parsing doesn't return within its timeout — that's the whole
/// point of doing this off the main loop, so ical.js's grammar
/// can't stall request serving if a malicious invite triggers a
/// catastrophic-backtracking regex path.

import { parentPort, workerData } from 'node:worker_threads'
import { parseIcs } from './ics.js'

try {
  const text = typeof workerData === 'string' ? workerData : ''
  const result = parseIcs(text)
  parentPort?.postMessage({ ok: true, result })
} catch (err) {
  parentPort?.postMessage({
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  })
}
