// Common internal race model used for suggestions from any external source.
//
// Race = {
//   id, name, date (YYYY-MM-DD), startTime (HH:mm|null), location,
//   distanceKm (number|null), elevationGainM (number|null),
//   raceType (string|null), source, sourceUrl, registrationUrl,
// }
//
// We never invent missing fields (distance, elevation, etc.) - if a source
// doesn't provide them they stay null and the UI shows "Ikke oppgitt" or
// hides the field entirely.
function toNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const match = String(value).replace(',', '.').match(/-?\d+(\.\d+)?/)
  return match ? Number(match[0]) : null
}

function toDateOnly(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

export function normalizeRace(raw) {
  const name = raw.name?.trim()
  const date = toDateOnly(raw.date)
  if (!name || !date) return null
  return {
    id: `${raw.source}:${name}:${date}`.toLowerCase().replace(/\s+/g, '-'),
    name,
    date,
    startTime: raw.startTime ? String(raw.startTime).slice(0, 5) : null,
    location: raw.location?.trim() || null,
    distanceKm: toNumber(raw.distanceKm),
    elevationGainM: toNumber(raw.elevationGainM),
    raceType: raw.raceType?.trim() || null,
    source: raw.source,
    sourceUrl: raw.sourceUrl || null,
    registrationUrl: raw.registrationUrl || null,
  }
}

export function normalizeRaces(rawList) {
  return rawList.map(normalizeRace).filter(Boolean)
}
