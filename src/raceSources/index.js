// Aggregates race suggestions from every external source.
//
// Each source module exports an async function returning an array of loosely
// shaped race objects (see normalizeRace.js for the common internal model).
// Sources are fetched independently with Promise.allSettled so a failure in
// one source (network error, CORS, missing feed) never breaks the others or
// the rest of the app.
//
// To add another source later (for example Kondis' terminliste, if a
// reliable non-scraping way to read it becomes available): create a new
// file in this folder exporting an async fetch function, then add it to
// the `sources` list below.
import { fetchEqTimingRaces } from './eqTiming'

const sources = [
  { name: 'EQ Timing', fetch: fetchEqTimingRaces },
]

export async function fetchAllRaceSuggestions() {
  const results = await Promise.allSettled(sources.map((source) => source.fetch()))
  const races = []
  const errors = []
  const meta = []
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      races.push(...result.value.races)
      if (result.value.updatedAt) meta.push({ source: sources[index].name, updatedAt: result.value.updatedAt })
    } else {
      errors.push({ source: sources[index].name, error: result.reason })
    }
  })
  return { races, errors, meta, allFailed: errors.length > 0 && errors.length === sources.length }
}
