import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './supabase'
import './App.css'

const statusLabels = {
  registered: 'Påmeldt',
  interested: 'Interessert',
  undecided: 'Ikke avklart',
}

const eventTypes = {
  race: { label: 'Løp', color: 'race' },
  training: { label: 'Fellestrening', color: 'training' },
}

const databaseType = { race: 'Løp', training: 'Fellestrening' }
const databaseStatus = {
  registered: 'Påmeldt',
  interested: 'Interessert',
  undecided: 'Ikke avklart',
}
const statusFromDatabase = Object.fromEntries(
  Object.entries(databaseStatus).map(([key, value]) => [value, key]),
)
const runnerColors = ['#e87555', '#738b5c', '#826bb6', '#4f7f9d', '#d3a547']

const demoAthletes = [
  { id: 'demo-1', name: 'Ida Nilsen', color: '#e87555' },
  { id: 'demo-2', name: 'Oskar Berg', color: '#738b5c' },
  { id: 'demo-3', name: 'Mia Hansen', color: '#826bb6' },
]

const demoEvents = [
  { id: 'demo-1', title: 'Sentrumsløpet', starts_at: '2026-09-06T10:00', location: 'Oslo', type: 'race', distance: '10 km' },
  { id: 'demo-2', title: 'Rolig langtur', starts_at: '2026-09-09T18:00', location: 'Sognsvann', type: 'training', distance: '12 km' },
  { id: 'demo-3', title: 'Nordmarka Trail', starts_at: '2026-09-13T09:00', location: 'Frognerseteren', type: 'race', distance: '21 km' },
  { id: 'demo-4', title: 'Intervaller', starts_at: '2026-09-16T18:00', location: 'Bislett stadion', type: 'training', distance: '8 x 800 m' },
  { id: 'demo-5', title: 'Høstmaraton', starts_at: '2026-09-27T09:30', location: 'Oslo', type: 'race', distance: '42,2 km' },
]

const emptyEvent = {
  title: '',
  type: 'race',
  starts_at: '',
  location: '',
  distance: '',
  notes: '',
}

function formatDate(value, options = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('nb-NO', options).format(new Date(value))
}

function toLocalInput(value) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16)
}

function App() {
  const configured = isSupabaseConfigured
  const [athletes, setAthletes] = useState(() => configured ? [] : demoAthletes)
  const [events, setEvents] = useState(() => configured ? [] : demoEvents)
  const [registrations, setRegistrations] = useState([])
  const [view, setView] = useState('calendar')
  const [typeFilter, setTypeFilter] = useState('all')
  const [month, setMonth] = useState(new Date(2026, 8, 1))
  const [eventForm, setEventForm] = useState(null)
  const [showRunners, setShowRunners] = useState(false)
  const [athleteName, setAthleteName] = useState('')
  const [notice, setNotice] = useState('')
  const loadData = useCallback(async () => {
    const [athleteResult, eventResult] = await Promise.all([
      supabase.from('runners').select('*').order('name'),
      supabase.from('race_events').select('*').order('date').order('time'),
    ])
    const error = athleteResult.error || eventResult.error
    if (error) setNotice(`Kunne ikke hente data: ${error.message}`)
    else {
      setAthletes(athleteResult.data)
      setEvents(eventResult.data.map((event) => ({
        ...event,
        type: event.type === 'Løp' ? 'race' : 'training',
        starts_at: `${event.date}T${event.time}`,
        notes: event.note,
      })))
      setRegistrations(eventResult.data.flatMap((event) =>
        Object.entries(event.statuses || {}).map(([athleteId, status]) => ({
          event_id: event.id,
          athlete_id: athleteId,
          status: statusFromDatabase[status] || 'undecided',
        }))))
    }
  }, [])

  useEffect(() => {
    if (!configured) return undefined
    queueMicrotask(loadData)
    const channel = supabase
      .channel('race-calendar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'runners' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'race_events' }, loadData)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [configured, loadData])

  const registrationsFor = (eventId) =>
    registrations.filter((registration) => registration.event_id === eventId)

  const upcomingEvents = useMemo(
    () => [...events].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)),
    [events],
  )

  const futureEvents = useMemo(
    () => upcomingEvents.filter((event) => new Date(event.starts_at) >= new Date()),
    [upcomingEvents],
  )
  const filteredEvents = typeFilter === 'all'
    ? events
    : events.filter((event) => event.type === typeFilter)
  const registeredCount = registrations.filter((registration) => registration.status === 'registered').length

  async function addAthlete(event) {
    event.preventDefault()
    const name = athleteName.trim()
    if (!name) return
    if (!configured) {
      setAthletes((current) => [...current, { id: crypto.randomUUID(), name, color: '#4f7f9d' }])
    } else {
      const initials = name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
      const color = runnerColors[athletes.length % runnerColors.length]
      const { error } = await supabase.from('runners').insert({ id: crypto.randomUUID(), name, initials, color })
      if (error) setNotice(`Kunne ikke legge til løper: ${error.message}`)
      else loadData()
    }
    setAthleteName('')
  }

  async function removeAthlete(id) {
    if (!configured) setAthletes((current) => current.filter((athlete) => athlete.id !== id))
    else {
      const cleanup = events.map((event) => {
        const statuses = { ...(event.statuses || {}) }
        delete statuses[id]
        return supabase.from('race_events').update({ statuses }).eq('id', event.id)
      })
      const results = await Promise.all([
        ...cleanup,
        supabase.from('runners').delete().eq('id', id),
      ])
      const error = results.find((result) => result.error)?.error
      if (error) setNotice(`Kunne ikke fjerne løper: ${error.message}`)
      else loadData()
    }
  }

  async function saveEvent(event) {
    event.preventDefault()
    const startsAt = new Date(eventForm.starts_at)
    const values = {
      ...eventForm,
      starts_at: startsAt.toISOString(),
      distance: eventForm.distance || '',
      location: eventForm.location || '',
      notes: eventForm.notes || '',
    }
    if (!configured) {
      const savedEvent = eventForm.id ? values : { ...values, id: crypto.randomUUID() }
      setEvents((current) => eventForm.id
        ? current.map((item) => (item.id === eventForm.id ? savedEvent : item))
        : [...current, savedEvent])
      setRegistrations((current) => [
        ...current.filter((registration) => registration.event_id !== savedEvent.id),
        ...Object.entries(savedEvent.statuses || {}).map(([athleteId, status]) => ({
          event_id: savedEvent.id,
          athlete_id: athleteId,
          status: statusFromDatabase[status] || 'undecided',
        })),
      ])
    } else {
      const { id, starts_at, notes, type, ...rest } = values
      const payload = {
        ...rest,
        type: databaseType[type],
        date: starts_at.slice(0, 10),
        time: starts_at.slice(11, 16),
        note: notes,
      }
      const result = id
        ? await supabase.from('race_events').update(payload).eq('id', id)
        : await supabase.from('race_events').insert({ ...payload, id: crypto.randomUUID() })
      if (result.error) {
        setNotice(`Kunne ikke lagre arrangement: ${result.error.message}`)
        return
      }
      loadData()
    }
    setEventForm(null)
  }

  async function deleteEvent(id) {
    if (!window.confirm('Vil du slette dette arrangementet?')) return
    if (!configured) setEvents((current) => current.filter((event) => event.id !== id))
    else {
      const { error } = await supabase.from('race_events').delete().eq('id', id)
      if (error) setNotice(`Kunne ikke slette arrangement: ${error.message}`)
      else loadData()
    }
  }

  async function setStatus(eventId, athleteId, status) {
    if (!configured) {
      setRegistrations((current) => {
        const existing = current.find((item) => item.event_id === eventId && item.athlete_id === athleteId)
        return existing
          ? current.map((item) => (item === existing ? { ...item, status } : item))
          : [...current, { id: crypto.randomUUID(), event_id: eventId, athlete_id: athleteId, status }]
      })
      return
    }
    const event = events.find((item) => item.id === eventId)
    const statuses = { ...(event.statuses || {}), [athleteId]: databaseStatus[status] }
    const { error } = await supabase.from('race_events').update({ statuses }).eq('id', eventId)
    if (error) setNotice(`Kunne ikke oppdatere status: ${error.message}`)
    else loadData()
  }

  const monthEvents = filteredEvents.filter((event) =>
    new Date(event.starts_at).getMonth() === month.getMonth() &&
    new Date(event.starts_at).getFullYear() === month.getFullYear(),
  )
  const calendarStart = new Date(month.getFullYear(), month.getMonth(), 1)
  calendarStart.setDate(calendarStart.getDate() - ((calendarStart.getDay() + 6) % 7))
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart)
    date.setDate(calendarStart.getDate() + index)
    return date
  })
  const showList = () => {
    setView('list')
    document.querySelector('#calendar')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Race Calendar">
          <span className="brand-mark">R</span>
          <span>Race Calendar</span>
        </a>
        <div className="topbar-actions">
          <button className="team-link" onClick={() => setShowRunners(true)}>
            <span>Løpegjengen</span>
            <span className="team-avatars" aria-hidden="true">
              {athletes.slice(0, 5).map((athlete) => <i key={athlete.id} style={{ backgroundColor: athlete.color || '#4f7f9d' }}>{athlete.initials || athlete.name.slice(0, 2).toUpperCase()}</i>)}
            </span>
          </button>
          <button className="primary-button" onClick={() => setEventForm({ ...emptyEvent })}>+ Nytt arrangement</button>
        </div>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">Sesongen {month.getFullYear()}</p>
          <h1>Hva skal vi løpe?</h1>
          <p className="intro">Samle løp, treningsøkter og påmeldinger på ett sted.</p>
        </div>
        <div className="stats">
          <div><strong>{events.filter((event) => event.type === 'race').length}</strong><span>løp planlagt</span></div>
          <div><strong>{registeredCount}</strong><span>påmeldinger</span></div>
          <div><strong>{athletes.length}</strong><span>løpere</span></div>
        </div>
      </section>

      {!configured && <aside className="setup-note">Viser eksempeldata. Legg inn <code>VITE_SUPABASE_URL</code> og <code>VITE_SUPABASE_ANON_KEY</code> i <code>.env.local</code> for delt lagring.</aside>}
      {notice && <div className="notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}

      <section className="calendar-controls" aria-label="Kalenderkontroller">
        <div className="view-toggle" aria-label="Velg visning">
          <button className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}>Kalender</button>
          <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>Liste</button>
        </div>
        <div className="event-filters">
          <button className={typeFilter === 'all' ? 'active' : ''} onClick={() => setTypeFilter('all')}>Alle</button>
          <button className={typeFilter === 'race' ? 'active' : ''} onClick={() => setTypeFilter('race')}>Løp</button>
          <button className={typeFilter === 'training' ? 'active' : ''} onClick={() => setTypeFilter('training')}>Fellestrening</button>
        </div>
      </section>

      <section className="content-grid" id="calendar">
        <div className="calendar-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Månedsoversikt</p>
              <h2>{formatDate(month, { month: 'long', year: 'numeric' })}</h2>
            </div>
            <div className="month-nav">
              <button aria-label="Forrige måned" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button>
              <button onClick={() => setMonth(new Date())}>I dag</button>
              <button aria-label="Neste måned" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button>
            </div>
          </div>

          {view === 'calendar' ? (
              <div className="calendar">
                {['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'].map((day) => <div className="weekday" key={day}>{day}</div>)}
                {calendarDays.map((day) => {
                  const dayEvents = monthEvents.filter((event) => new Date(event.starts_at).toDateString() === day.toDateString())
                  const inCurrentMonth = day.getMonth() === month.getMonth()
                  const isToday = day.toDateString() === new Date().toDateString()
                  return <div className={`calendar-day ${inCurrentMonth ? '' : 'outside-month'}`} key={day.toISOString()}><span className={isToday ? 'today' : ''}>{day.getDate()}</span>{dayEvents.map((event) => <button className={`event-pill ${eventTypes[event.type].color}`} key={event.id} onClick={() => setEventForm({ ...event, starts_at: toLocalInput(event.starts_at) })}>{event.title}</button>)}</div>
                })}
              </div>
          ) : (
            <div className="list-view">{filteredEvents.map((event) => <EventCard key={event.id} event={event} registrations={registrationsFor(event.id)} athletes={athletes} onEdit={() => setEventForm({ ...event, starts_at: toLocalInput(event.starts_at) })} onDelete={() => deleteEvent(event.id)} onStatus={setStatus} />)}</div>
          )}
        </div>
      </section>

      <section className="upcoming-section">
        <div className="section-heading"><div><p className="eyebrow">Neste på planen</p><h2>Kommende arrangementer</h2></div><button className="text-button" onClick={showList}>Se alle →</button></div>
        <div className="upcoming-grid">
          {(futureEvents.length ? futureEvents : upcomingEvents).slice(0, 3).map((event) => <UpcomingCard key={event.id} event={event} registrations={registrationsFor(event.id)} athletes={athletes} onEdit={() => setEventForm({ ...event, starts_at: toLocalInput(event.starts_at) })} />)}
        </div>
      </section>

      {eventForm && <EventModal form={eventForm} setForm={setEventForm} athletes={athletes} onSave={saveEvent} onDelete={eventForm.id ? () => { deleteEvent(eventForm.id); setEventForm(null) } : null} onClose={() => setEventForm(null)} />}
      {showRunners && <RunnersModal athletes={athletes} athleteName={athleteName} setAthleteName={setAthleteName} onAdd={addAthlete} onRemove={removeAthlete} onClose={() => setShowRunners(false)} />}
    </main>
  )
}

function UpcomingCard({ event, registrations, athletes, onEdit }) {
  const registered = registrations.filter((item) => item.status === 'registered').length
  return <button className="upcoming-card" onClick={onEdit}>
    <span className={`event-tag ${eventTypes[event.type].color}`}>{eventTypes[event.type].label}</span>
    <time>{formatDate(event.starts_at, { day: 'numeric', month: 'long' })}</time>
    <strong>{event.title}</strong>
    <span className="upcoming-location">◎ {event.location || 'Sted ikke satt'}</span>
    <span className="upcoming-details">◷ {formatDate(event.starts_at, { hour: '2-digit', minute: '2-digit' })}<b>{event.distance || '–'}</b></span>
    <span className="upcoming-footer">{registered ? `${registered} påmeldt` : 'Ingen påmeldt'} <em>{registered} av {athletes.length} påmeldt</em></span>
  </button>
}

function RunnersModal({ athletes, athleteName, setAthleteName, onAdd, onRemove, onClose }) {
  return <div className="modal-backdrop" role="presentation"><section className="modal runners-modal" role="dialog" aria-modal="true" aria-labelledby="runners-modal-title">
    <div className="modal-header"><div><p className="eyebrow">Laget</p><h2 id="runners-modal-title">Løpegjengen</h2></div><button className="icon-button" onClick={onClose} aria-label="Lukk">×</button></div>
    <div className="runners-modal-content">
      <p className="modal-description">Legg til eller fjern løpere fra den felles kalenderen.</p>
      <div className="runner-list">
        {athletes.map((athlete) => <div className="runner" key={athlete.id}><span className="avatar" style={{ backgroundColor: athlete.color || '#4f7f9d' }}>{athlete.initials || athlete.name.slice(0, 2).toUpperCase()}</span><span>{athlete.name}</span><button aria-label={`Fjern ${athlete.name}`} onClick={() => onRemove(athlete.id)}>×</button></div>)}
      </div>
      <form className="add-runner-modal" onSubmit={onAdd}><input value={athleteName} onChange={(event) => setAthleteName(event.target.value)} placeholder="Navn på løper" aria-label="Navn på løper" /><button className="primary-button">+ Legg til løper</button></form>
    </div>
  </section></div>
}

function EventCard({ event, registrations, athletes, onEdit, onDelete, onStatus, compact = false }) {
  const registered = registrations.filter((item) => item.status === 'registered').length
  return <article className={`event-card ${compact ? 'compact' : ''}`}>
    <div className="event-date"><b>{formatDate(event.starts_at, { day: 'numeric' })}</b><span>{formatDate(event.starts_at, { month: 'short' })}</span></div>
    <div className="event-info">
      <div className="event-title-line"><span className={`type-dot ${eventTypes[event.type].color}`} /><h3>{event.title}</h3></div>
      <p>{formatDate(event.starts_at, { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · {event.location || 'Sted ikke satt'}{event.distance ? ` · ${event.distance}` : ''}</p>
      {!compact && <StatusPicker event={event} registrations={registrations} athletes={athletes} onStatus={onStatus} />}
      {compact && <span className="registered-count">{registered} påmeldt</span>}
    </div>
    <div className="event-menu"><button aria-label={`Rediger ${event.title}`} onClick={onEdit}>Rediger</button><button className="delete" aria-label={`Slett ${event.title}`} onClick={onDelete}>×</button></div>
  </article>
}

function StatusPicker({ event, registrations, athletes, onStatus }) {
  if (!athletes.length) return <p className="no-runners">Legg til løpere for å angi status.</p>
  return <div className="statuses">{athletes.map((athlete) => {
    const status = registrations.find((item) => item.athlete_id === athlete.id)?.status || 'undecided'
    return <label key={athlete.id}><span className="avatar small" style={{ backgroundColor: athlete.color || '#4f7f9d' }}>{athlete.name.slice(0, 1)}</span>{athlete.name}<select value={status} onChange={(e) => onStatus(event.id, athlete.id, e.target.value)}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
  })}</div>
}

function EventModal({ form, setForm, athletes, onSave, onDelete, onClose }) {
  const edit = Boolean(form.id)
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const [date = '', time = ''] = (form.starts_at || 'T').split('T')
  const updateDateTime = (part, value) => update('starts_at', `${part === 'date' ? value : date}T${part === 'time' ? value : time}`)
  const updateStatus = (athleteId, status) => setForm((current) => ({
    ...current,
    statuses: { ...(current.statuses || {}), [athleteId]: databaseStatus[status] },
  }))
  return <div className="modal-backdrop" role="presentation"><section className="modal event-modal" role="dialog" aria-modal="true" aria-labelledby="event-modal-title">
    <div className="modal-header"><div><p className="eyebrow">{edit ? 'Endre arrangement' : 'Nytt arrangement'}</p><h2 id="event-modal-title">{edit ? form.title : 'Legg til i kalenderen'}</h2></div><button className="icon-button" onClick={onClose}>×</button></div>
    <form onSubmit={onSave}>
      <label>Navn<input required value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="For eksempel: Sentrumsløpet" /></label>
      <div className="field-row"><label>Type<select value={form.type} onChange={(e) => update('type', e.target.value)}><option value="race">Løp</option><option value="training">Fellestrening</option></select></label><label>Distanse / økt<input value={form.distance || ''} onChange={(e) => update('distance', e.target.value)} placeholder="10 km" /></label></div>
      <div className="field-row"><label>Dato<input required type="date" value={date} onChange={(e) => updateDateTime('date', e.target.value)} /></label><label>Tid<input required type="time" value={time} onChange={(e) => updateDateTime('time', e.target.value)} /></label></div>
      <label>Sted<input value={form.location || ''} onChange={(e) => update('location', e.target.value)} /></label>
      <label>Notater (valgfritt)<textarea value={form.notes || ''} onChange={(e) => update('notes', e.target.value)} rows="3" /></label>
      <div className="modal-statuses">
        <p>Hvem blir med?</p>
        <div className="statuses">{athletes.map((athlete) => {
          const status = statusFromDatabase[form.statuses?.[athlete.id]] || 'undecided'
          return <label key={athlete.id}><span className="avatar small" style={{ backgroundColor: athlete.color || '#4f7f9d' }}>{athlete.initials || athlete.name.slice(0, 1)}</span><span>{athlete.name}</span><select value={status} onChange={(event) => updateStatus(athlete.id, event.target.value)}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        })}</div>
      </div>
      <div className="modal-actions">{onDelete && <button type="button" className="delete-button" onClick={onDelete}>Slett</button>}<span /><button type="button" className="secondary-button" onClick={onClose}>Avbryt</button><button className="primary-button">{edit ? 'Lagre arrangement' : 'Opprett arrangement'}</button></div>
    </form>
  </section></div>
}

export default App
