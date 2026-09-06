import { useEffect, useMemo, useState } from 'react'
import { fetchAllRaceSuggestions } from '../raceSources'
import { normalizeRaces } from '../raceSuggestions/normalizeRace'
import { CATEGORY_FILTERS, filterRelevantRaces, matchesCategoryFilter } from '../raceSuggestions/filterRaces'
import { deduplicateRaces } from '../raceSuggestions/deduplicateRaces'
import SuggestedRaceCard from './SuggestedRaceCard'

function RaceSuggestions({ existingEvents, onAdd }) {
  const [status, setStatus] = useState('loading')
  const [rawRaces, setRawRaces] = useState([])
  const [categoryFilter, setCategoryFilter] = useState('all')

  // Fetch external suggestions exactly once. Failures never throw - the rest
  // of the calendar keeps working regardless of external API availability.
  useEffect(() => {
    let cancelled = false
    fetchAllRaceSuggestions().then(({ races, allFailed }) => {
      if (cancelled) return
      const relevant = filterRelevantRaces(normalizeRaces(races))
      setRawRaces(relevant)
      setStatus(allFailed ? 'error' : 'ready')
    }).catch(() => {
      if (!cancelled) setStatus('error')
    })
    return () => { cancelled = true }
  }, [])

  const visibleRaces = useMemo(() => {
    const deduped = deduplicateRaces(rawRaces, existingEvents)
    return deduped
      .filter((race) => matchesCategoryFilter(race, categoryFilter))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [rawRaces, existingEvents, categoryFilter])

  return (
    <section className="suggestions-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Utenfor egen kalender</p>
          <h2>Forslag til andre løp</h2>
          <p className="intro">Arrangementer hentet automatisk fra eksterne løpskalendere.</p>
        </div>
      </div>

      <div className="event-filters suggestions-filters" aria-label="Filtrer løpsforslag">
        {CATEGORY_FILTERS.map(({ value, label }) => (
          <button key={value} className={categoryFilter === value ? 'active' : ''} onClick={() => setCategoryFilter(value)}>{label}</button>
        ))}
      </div>

      {status === 'loading' && <p className="suggestions-state">Finner aktuelle løp …</p>}
      {status === 'error' && <p className="suggestions-state">Kunne ikke hente løpsforslag akkurat nå.</p>}
      {status === 'ready' && visibleRaces.length === 0 && <p className="suggestions-state">Ingen andre aktuelle løp funnet.</p>}

      {visibleRaces.length > 0 && (
        <div className="suggestions-grid">
          {visibleRaces.map((race) => <SuggestedRaceCard key={race.id} race={race} onAdd={() => onAdd(race)} />)}
        </div>
      )}
    </section>
  )
}

export default RaceSuggestions
