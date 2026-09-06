// Removes suggested races that already exist in the manually curated
// calendar. Matching is intentionally simple and deterministic (no fuzzy/AI
// matching): we normalize names (strip accents, punctuation and common
// filler words like "løpet"/"opp") and compare that alongside the date and,
// when available, the location. This is enough to catch near-duplicates
// like "Stoltzekleiven Opp" vs "Stoltzen Opp" without a heavy dependency.
const FILLER_WORDS = ['løpet', 'løp', 'opp', 'rittet', 'ritt']

function normalizeName(name) {
  const stripped = (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !FILLER_WORDS.includes(word))
  return stripped.join(' ').trim()
}

function namesLikelyMatch(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  return a.includes(b) || b.includes(a)
}

export function deduplicateRaces(suggestedRaces, existingEvents) {
  const existing = existingEvents.map((event) => ({
    name: normalizeName(event.title),
    date: (event.starts_at || '').slice(0, 10),
    location: normalizeName(event.location),
  }))

  return suggestedRaces.filter((race) => {
    const raceName = normalizeName(race.name)
    const raceLocation = normalizeName(race.location)
    return !existing.some((event) => {
      if (event.date !== race.date) return false
      if (namesLikelyMatch(event.name, raceName)) return true
      return Boolean(raceLocation) && event.location === raceLocation && namesLikelyMatch(event.name, raceName)
    })
  })
}

// Collapses exact repeats within a single source's own result list (name +
// date + location), keeping the first occurrence. This is deliberately
// stricter than deduplicateRaces() above: it must never merge legitimately
// distinct events (e.g. the same karusell series on different dates), only
// literal repeats of the same event.
export function deduplicateWithinList(races) {
  const seen = new Set()
  return races.filter((race) => {
    const key = `${normalizeName(race.name)}|${race.date}|${normalizeName(race.location)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
