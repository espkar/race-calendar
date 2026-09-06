#!/usr/bin/env node
// Fetches Norwegian mountain/trail running events from the public EQ Timing
// API and writes a static, pre-filtered snapshot to
// public/eqtiming-events.json for the GitHub Pages frontend to read.
//
// This script is intended to run server-side only (GitHub Actions), because
// api.eqtiming.com does not support browser CORS - see README.md. It is not
// a database: it only produces a periodically-refreshed cache of publicly
// available data. The manually curated Supabase calendar is untouched.
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { normalizeRaces } from '../src/raceSuggestions/normalizeRace.js'
import { filterRelevantRaces } from '../src/raceSuggestions/filterRaces.js'
import { deduplicateWithinList } from '../src/raceSuggestions/deduplicateRaces.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'eqtiming-events.json')
const SOURCE_NAME = 'EQ Timing'
const API_URL = 'https://api.eqtiming.com/api/v2/Events'

// EQ Timing sometimes leaves category fields at generic placeholder values
// when the organizer hasn't set anything specific - these add noise rather
// than useful info, so we drop them before building a display "raceType".
const IGNORED_CATEGORY_VALUES = new Set(['', 'alle', 'ingen', 'na'])

function buildRequest() {
  const today = new Date()
  const dateFrom = today.toISOString().slice(0, 10)
  const dateTo = `${today.getFullYear()}-12-31`
  const params = new URLSearchParams({
    countryIso2: 'NO',
    // No sportIds filter: EQ Timing categorizes many genuinely relevant
    // mountain/uphill races (e.g. "Kongskleiven Opp", "Motbakkeløpet 2026")
    // under generic sport codes like "Annet"/"Idrettsskoler"/"Landevei"
    // rather than a dedicated running category, so restricting by sportIds
    // server-side was found (empirically) to silently drop real races.
    // Relevance is instead decided entirely by the shared name/category
    // keyword filter below - the request itself stays bounded to one
    // country and the remainder of the current calendar year.
    dateFrom,
    dateTo,
    dateSort: 'true',
    desc: 'false',
    publishedOnly: 'true',
    take: '3000',
  })
  return { url: `${API_URL}?${params}`, dateFrom, dateTo }
}

async function fetchEqTimingEvents(url) {
  // Some environments' Brotli decoder chokes on this API's br-compressed
  // responses; explicitly request gzip/deflate instead to avoid that.
  const response = await fetch(url, { headers: { 'Accept-Encoding': 'gzip, deflate' } })
  if (!response.ok) throw new Error(`EQ Timing API svarte ${response.status} ${response.statusText}`)
  // The API's Content-Type header does not reliably declare charset=utf-8,
  // so decode the raw bytes explicitly to avoid mangling å/ø/æ.
  const buffer = await response.arrayBuffer()
  const text = new TextDecoder('utf-8').decode(buffer)
  return JSON.parse(text)
}

function isValidEventDate(value) {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  // Guards against junk/test data seen in the live feed (e.g. year "0202").
  return date.getFullYear() >= 2020 && date.getFullYear() <= 2100
}

function meaningfulCategory(value) {
  if (!value) return null
  const trimmed = value.trim()
  return IGNORED_CATEGORY_VALUES.has(trimmed.toLowerCase()) ? null : trimmed
}

function mapEqTimingEvent(raw) {
  // Sanity bound: reject implausible distances rather than display obvious
  // data-entry errors from organizers (e.g. one live event had "7800000"
  // meters = 7800 km, clearly a unit mistake). 500 km comfortably covers
  // even the longest real multi-day ultras without inventing anything.
  const MAX_PLAUSIBLE_DISTANCE_KM = 500
  const distancesKm = Object.values(raw.Race || {})
    .map((race) => race?.Distance)
    .filter((distance) => typeof distance === 'number' && distance > 0)
    .map((meters) => meters / 1000)
    .filter((km) => km <= MAX_PLAUSIBLE_DISTANCE_KM)
  // An event can have several race distances (5/10/21 km etc). We keep one
  // suggestion per event (matching the API's own event-level granularity)
  // and use the longest distance as the representative headline distance,
  // rather than inventing a single number or exploding into many entries.
  const distanceKm = distancesKm.length ? Math.max(...distancesKm) : undefined

  const startValue = raw.Starttime || raw.Date
  // Read the clock time directly from the string rather than via a Date
  // object: parsing a timezone-less string with `new Date(...)` interprets
  // it as local time, so extracting hours/minutes back out (even as UTC)
  // can be wrong depending on the machine's timezone. A plain regex match
  // avoids any timezone conversion.
  const timeMatch = typeof startValue === 'string' ? startValue.match(/T(\d{2}):(\d{2})/) : null
  const hasRealTime = Boolean(timeMatch) && (timeMatch[1] !== '00' || timeMatch[2] !== '00')

  const raceType = [
    meaningfulCategory(raw.Sport?.Name),
    meaningfulCategory(raw.Dicipline?.Name),
    meaningfulCategory(raw.Sportlevel?.Name),
  ].filter(Boolean).join(' · ') || undefined

  return {
    name: raw.Name,
    date: startValue,
    startTime: hasRealTime ? startValue.slice(11, 16) : undefined,
    location: raw.City?.Name,
    distanceKm,
    elevationGainM: undefined, // EQ Timing's schema does not expose elevation data - never invented.
    raceType,
    source: SOURCE_NAME,
    sourceUrl: raw.Homepage?.trim() || raw.Url?.trim() || undefined,
    registrationUrl: raw.Signup?.ExternalUrl || undefined,
  }
}

async function main() {
  const { url, dateFrom, dateTo } = buildRequest()
  console.log(`[${new Date().toISOString()}] Henter EQ Timing-arrangementer:`)
  console.log(url)

  const rawEvents = await fetchEqTimingEvents(url)
  console.log(`Hentet ${rawEvents.length} arrangementer fra EQ Timing`)

  const published = rawEvents.filter((event) => event.Published !== false)
  const withValidDates = published.filter((event) => isValidEventDate(event.Starttime || event.Date))
  const withinRange = withValidDates.filter((event) => {
    const date = (event.Starttime || event.Date).slice(0, 10)
    return date >= dateFrom && date <= dateTo
  })
  const withNames = withinRange.filter((event) => event.Name && event.Name.trim().length > 0)
  const invalidRemoved = rawEvents.length - withNames.length
  console.log(`${withNames.length} igjen etter dato-/gyldighetsfiltrering (${invalidRemoved} fjernet som ugyldige/utenfor periode/upubliserte/uten navn)`)

  const normalized = normalizeRaces(withNames.map(mapEqTimingEvent))

  const relevant = filterRelevantRaces(normalized)
  console.log(`${relevant.length} igjen etter relevansfiltrering (motbakke/fjell/trail/ultra/skyrace/terreng/trapper)`)

  const deduped = deduplicateWithinList(relevant)
  const duplicatesRemoved = relevant.length - deduped.length
  console.log(`${deduped.length} igjen etter dedup (${duplicatesRemoved} duplikater fjernet)`)

  const payload = {
    source: SOURCE_NAME,
    updatedAt: new Date().toISOString(),
    events: deduped,
  }

  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`Skrev ${deduped.length} arrangementer til ${OUTPUT_PATH}`)
}

main().catch((error) => {
  // Deliberately exit non-zero without touching the output file, so a
  // temporary EQ Timing outage never overwrites the previous valid snapshot.
  console.error('Kunne ikke oppdatere EQ Timing-forslag:', error)
  process.exit(1)
})
