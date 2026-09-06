// EQ Timing race source adapter (browser side).
//
// EQ Timing (eqtiming.com) does have a real, public, key-free API endpoint
// (GET https://api.eqtiming.com/api/v2/Events), but it does not support
// browser CORS - a direct fetch() from GitHub Pages is rejected by the
// browser even though the request itself succeeds on the wire.
//
// To work around this without introducing a database or an external proxy,
// a scheduled GitHub Actions workflow
// (.github/workflows/update-eqtiming-events.yml) calls the API server-side
// once a day, normalizes/filters the result using the same shared logic as
// the rest of this feature, and commits the output to
// public/eqtiming-events.json. That file is same-origin on GitHub Pages, so
// the browser can simply fetch it with no CORS issue.
//
// If the snapshot file is missing or fails to load, this source simply
// contributes zero suggestions (surfaced as an error by the aggregator) -
// the rest of the app keeps working regardless.
const FEED_PATH = `${import.meta.env.BASE_URL}eqtiming-events.json`

export async function fetchEqTimingRaces() {
  const response = await fetch(FEED_PATH, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Kunne ikke hente EQ Timing-snapshot (${response.status})`)
  const payload = await response.json()
  return {
    races: Array.isArray(payload.events) ? payload.events : [],
    updatedAt: payload.updatedAt,
  }
}
