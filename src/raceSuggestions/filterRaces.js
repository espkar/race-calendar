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
  'backyard',
  'trappeløp',
  'stairs',
  'mountain',
  'uphill',
]
// "opp" is handled separately with a stricter word-boundary match (see
// keywordMatches) since it's a common, generic Norwegian word that would
// otherwise false-positive inside unrelated words. The other keywords above
// are distinctive enough to match as plain substrings, which is important
// because Norwegian often glues words together without spaces (e.g.
// "Bakgårdsultra", "Fjelløp") where a word-boundary match would fail.
const GENERIC_WORD_BOUNDARY_KEYWORDS = ['opp']

// EQ Timing uses the same generic "Terreng"/"Utfor" categories for both
// trail running and mountain biking, so keyword matching alone lets bike
// races (cross-country/downhill MTB, road cycling) through. Norwegian
// cycling races are consistently labelled with "ritt" ("Regionritt",
// "Klubbritt", "UCI Ritt" etc.) or explicit bike/UCI/velodrome terms, which
// never appear in genuine running race names/categories - verified against
// live data before enabling this exclusion.
const EXCLUDED_KEYWORDS = ['ritt', 'sykkel', 'rundbane', 'uci']

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

// Generic short keywords like "opp" would otherwise match unrelated
// substrings (e.g. "oppland", "shopping"). Word-boundary matching keeps
// them useful for real patterns such as "Holtbakken opp" or "Stoltzekleiven
// Opp" without over-triggering on unrelated words.
function keywordMatches(haystack, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`).test(haystack)
}

export function isRelevantRace(race) {
  const haystack = normalizeText(`${race.raceType || ''} ${race.name}`)
  if (EXCLUDED_KEYWORDS.some((keyword) => haystack.includes(normalizeText(keyword)))) return false
  const substringMatch = RELEVANT_KEYWORDS.some((keyword) => haystack.includes(normalizeText(keyword)))
  if (substringMatch) return true
  return GENERIC_WORD_BOUNDARY_KEYWORDS.some((keyword) => keywordMatches(haystack, normalizeText(keyword)))
}

export function matchesCategoryFilter(race, filter) {
  if (filter === 'all') return true
  const haystack = normalizeText(`${race.raceType || ''} ${race.name}`)
  return haystack.includes(normalizeText(filter))
}

export function filterRelevantRaces(races) {
  return races.filter(isRelevantRace)
}
