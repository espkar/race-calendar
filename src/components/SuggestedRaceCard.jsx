function formatSuggestionDate(dateString) {
  return new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' }).format(new Date(`${dateString}T00:00`))
}

function formatDistanceElevation(race) {
  const parts = []
  if (race.distanceKm !== null) parts.push(`${race.distanceKm.toLocaleString('nb-NO')} km`)
  if (race.elevationGainM !== null) parts.push(`+${race.elevationGainM.toLocaleString('nb-NO')} m`)
  return parts.length ? parts.join(' · ') : 'Ikke oppgitt'
}

function SuggestedRaceCard({ race, onAdd }) {
  return (
    <article className="suggestion-card">
      <div className="event-date">
        <b>{new Date(`${race.date}T00:00`).getDate()}</b>
        <span>{formatSuggestionDate(race.date)}</span>
      </div>
      <div className="suggestion-info">
        <h3>{race.name}</h3>
        <p>{race.location || 'Ikke oppgitt'}</p>
        <p>{formatDistanceElevation(race)}</p>
        {race.raceType && <span className="event-tag race">{race.raceType}</span>}
        <p className="suggestion-source">Kilde: {race.source}</p>
      </div>
      <div className="suggestion-actions">
        {(race.sourceUrl || race.registrationUrl) && (
          <a className="secondary-button" href={race.sourceUrl || race.registrationUrl} target="_blank" rel="noreferrer">Se løp</a>
        )}
        <button className="primary-button" onClick={onAdd}>Legg til</button>
      </div>
    </article>
  )
}

export default SuggestedRaceCard
