// Filtering for the mountain/trail/uphill running focus of this calendar.
//
// We deliberately keep this simple and keyword-based rather than trusting
// a single source's category taxonomy, since different sources label the
// same kind of race differently (e.g. "Fjelløp" vs "Trail" vs "Skyrace").
const RELEVANT_KEYWORDS = [
  'motbakke',
  'fjell',
  'trail',
  'skyrace',
  'sky race',
  'terrengløp',
  'terreng',
  'ultra',
  'trappeløp',
  'opp',
]

export const CATEGORY_FILTERS = [
  { value: 'all', label: 'Alle' },
  { value: 'motbakke', label: 'Motbakke' },
  { value: 'fjell', label: 'Fjell' },
  { value: 'trail', label: 'Trail' },
  { value: 'ultra', label: 'Ultra' },
]

function normalizeText(value) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function isRelevantRace(race) {
  const haystack = normalizeText(`${race.raceType || ''} ${race.name}`)
  return RELEVANT_KEYWORDS.some((keyword) => haystack.includes(normalizeText(keyword)))
}

export function matchesCategoryFilter(race, filter) {
  if (filter === 'all') return true
  const haystack = normalizeText(`${race.raceType || ''} ${race.name}`)
  return haystack.includes(normalizeText(filter))
}

export function filterRelevantRaces(races) {
  return races.filter(isRelevantRace)
}
