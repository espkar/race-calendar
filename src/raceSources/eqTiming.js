// EQ Timing race source adapter.
//
// Investigation notes (see also README.md):
// EQ Timing (eqtiming.com) does not publish a documented, public, CORS-enabled
// JSON/REST API for browsing races. The site is a per-event registration/
// e-commerce platform (robots.txt disallows /account, /basket, /checkout,
// /wishlist – typical for a registration/webshop system, not an open data
// API), its sitemap.xml is empty, and no discoverable "list all events"
// endpoint exists. Calling it directly from a static GitHub Pages site would
// therefore either 404 or be blocked by CORS, and there is nothing we can
// safely build a real integration against without an official API key/
// endpoint from EQ Timing.
//
// To keep the architecture ready for when a real feed becomes available
// (either an official EQ Timing API or a manually maintained JSON export),
// this adapter supports an optional, user-configurable feed URL:
//
//   VITE_EQTIMING_FEED_URL=https://example.com/eqtiming-events.json
//
// If the variable is not set, this source simply contributes zero
// suggestions (the rest of the app keeps working). If it is set, we fetch it
// defensively (timeout + try/catch) and map a handful of common field-name
// variants onto our internal race model, without inventing any data.
const SOURCE_NAME = 'EQ Timing'
const FEED_URL = import.meta.env.VITE_EQTIMING_FEED_URL

function firstDefined(object, keys) {
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null && object[key] !== '') return object[key]
  }
  return undefined
}

function mapRawEvent(raw) {
  return {
    name: firstDefined(raw, ['name', 'title', 'eventName']),
    date: firstDefined(raw, ['date', 'startDate', 'eventDate', 'start_date']),
    startTime: firstDefined(raw, ['startTime', 'time', 'start_time']),
    location: firstDefined(raw, ['location', 'city', 'place', 'venue']),
    distanceKm: firstDefined(raw, ['distanceKm', 'distance_km', 'distance']),
    elevationGainM: firstDefined(raw, ['elevationGainM', 'elevationGain', 'elevation', 'climb']),
    raceType: firstDefined(raw, ['raceType', 'category', 'discipline', 'type']),
    sourceUrl: firstDefined(raw, ['sourceUrl', 'url', 'link', 'eventUrl']),
    registrationUrl: firstDefined(raw, ['registrationUrl', 'signupUrl', 'registerUrl']),
    source: SOURCE_NAME,
  }
}

export async function fetchEqTimingRaces() {
  if (!FEED_URL) return []
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(FEED_URL, { signal: controller.signal })
    if (!response.ok) throw new Error(`EQ Timing feed svarte ${response.status}`)
    const payload = await response.json()
    const rawEvents = Array.isArray(payload) ? payload : payload.events || []
    return rawEvents.map(mapRawEvent)
  } finally {
    clearTimeout(timeout)
  }
}
