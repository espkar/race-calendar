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
  const [month, setMonth] = useState(new Date(2026, 8, 1))
  const [eventForm, setEventForm] = useState(null)
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

  const nextEvent = useMemo(
    () => upcomingEvents.find((event) => new Date(event.starts_at) >= new Date()) || upcomingEvents[0],
    [upcomingEvents],
  )

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
      setEvents((current) =>
        eventForm.id ? current.map((item) => (item.id === eventForm.id ? values : item)) : [...current, { ...values, id: crypto.randomUUID() }],
      )
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

  const monthEvents = events.filter((event) =>
    new Date(event.starts_at).getMonth() === month.getMonth() &&
    new Date(event.starts_at).getFullYear() === month.getFullYear(),
  )
  const calendarDays = Array.from({ length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() }, (_, index) => index + 1)
  const blanks = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Race Calendar">
          <span className="brand-mark">R</span>
          <span>Race Calendar</span>
        </a>
        <div className="topbar-actions">
          <span className="sync-indicator"><i /> {configured ? 'Delt kalender' : 'Demomodus'}</span>
          <button className="primary-button" onClick={() => setEventForm({ ...emptyEvent })}>+ Nytt arrangement</button>
        </div>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">Løpekalender</p>
          <h1>Planlegg løpene.<br /><em>Løp dem sammen.</em></h1>
          <p className="intro">En felles oversikt over løp, treninger og hvem som blir med.</p>
        </div>
        <div className="hero-stat"><strong>{events.length}</strong><span>kommende<br />arrangementer</span></div>
      </section>

      {!configured && <aside className="setup-note">Viser eksempeldata. Legg inn <code>VITE_SUPABASE_URL</code> og <code>VITE_SUPABASE_ANON_KEY</code> i <code>.env.local</code> for delt lagring.</aside>}
      {notice && <div className="notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}

      {nextEvent && (
        <section className="next-event">
          <div className="next-event-label">
            <span className={`type-dot ${eventTypes[nextEvent.type].color}`} />
            <p className="eyebrow">Neste opp</p>
          </div>
          <div className="next-event-body">
            <div className="next-event-date"><b>{formatDate(nextEvent.starts_at, { day: 'numeric' })}</b><span>{formatDate(nextEvent.starts_at, { month: 'short' })}</span></div>
            <div className="next-event-info">
              <h3>{nextEvent.title}</h3>
              <p>{formatDate(nextEvent.starts_at, { weekday: 'long', hour: '2-digit', minute: '2-digit' })} · {nextEvent.location || 'Sted ikke satt'}{nextEvent.distance ? ` · ${nextEvent.distance}` : ''}</p>
            </div>
            <button className="secondary-button" onClick={() => setEventForm({ ...nextEvent, starts_at: toLocalInput(nextEvent.starts_at) })}>Se detaljer</button>
          </div>
        </section>
      )}

      <section className="content-grid">
        <div className="calendar-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Oversikt</p>
              <h2>Kalender</h2>
            </div>
            <div className="view-toggle" aria-label="Velg visning">
              <button className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}>Kalender</button>
              <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>Liste</button>
            </div>
          </div>

          {view === 'calendar' ? (
            <>
              <div className="month-nav">
                <button aria-label="Forrige måned" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button>
                <strong>{formatDate(month, { month: 'long', year: 'numeric' })}</strong>
                <button aria-label="Neste måned" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button>
              </div>
              <div className="calendar">
                {['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'].map((day) => <div className="weekday" key={day}>{day}</div>)}
                {Array.from({ length: blanks }).map((_, index) => <div className="calendar-day empty" key={`blank-${index}`} />)}
                {calendarDays.map((day) => {
                  const dayEvents = monthEvents.filter((event) => new Date(event.starts_at).getDate() === day)
                  return <div className="calendar-day" key={day}><span>{day}</span>{dayEvents.map((event) => <button className={`event-pill ${eventTypes[event.type].color}`} key={event.id} onClick={() => setEventForm({ ...event, starts_at: toLocalInput(event.starts_at) })}>{event.title}</button>)}</div>
                })}
              </div>
            </>
          ) : (
            <div className="list-view">{upcomingEvents.map((event) => <EventCard key={event.id} event={event} registrations={registrationsFor(event.id)} athletes={athletes} onEdit={() => setEventForm({ ...event, starts_at: toLocalInput(event.starts_at) })} onDelete={() => deleteEvent(event.id)} onStatus={setStatus} />)}</div>
          )}
        </div>
      </section>

      <section className="runners-section">
        <div className="section-heading"><div><p className="eyebrow">Laget</p><h2>Løpere</h2></div><span className="count-label">{athletes.length} i laget</span></div>
        <div className="runners">
          {athletes.map((athlete) => <div className="runner" key={athlete.id}><span className="avatar" style={{ backgroundColor: athlete.color || '#4f7f9d' }}>{athlete.name.slice(0, 1)}</span><span>{athlete.name}</span><button aria-label={`Fjern ${athlete.name}`} onClick={() => removeAthlete(athlete.id)}>×</button></div>)}
          <form className="add-runner" onSubmit={addAthlete}><input value={athleteName} onChange={(event) => setAthleteName(event.target.value)} placeholder="Navn på løper" aria-label="Navn på løper" /><button>+ Legg til</button></form>
        </div>
      </section>

      {eventForm && <EventModal form={eventForm} setForm={setEventForm} onSave={saveEvent} onClose={() => setEventForm(null)} />}
    </main>
  )
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

function EventModal({ form, setForm, onSave, onClose }) {
  const edit = Boolean(form.id)
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="event-modal-title">
    <div className="modal-header"><div><p className="eyebrow">{edit ? 'Endre arrangement' : 'Nytt arrangement'}</p><h2 id="event-modal-title">{edit ? form.title : 'Legg til i kalenderen'}</h2></div><button className="icon-button" onClick={onClose}>×</button></div>
    <form onSubmit={onSave}>
      <label>Navn<input required value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="For eksempel: Sentrumsløpet" /></label>
      <div className="field-row"><label>Type<select value={form.type} onChange={(e) => update('type', e.target.value)}><option value="race">Løp</option><option value="training">Fellestrening</option></select></label><label>Dato og tid<input required type="datetime-local" value={form.starts_at} onChange={(e) => update('starts_at', e.target.value)} /></label></div>
      <div className="field-row"><label>Sted<input value={form.location || ''} onChange={(e) => update('location', e.target.value)} /></label><label>Distanse / økt<input value={form.distance || ''} onChange={(e) => update('distance', e.target.value)} placeholder="10 km" /></label></div>
      <label>Notater (valgfritt)<textarea value={form.notes || ''} onChange={(e) => update('notes', e.target.value)} rows="3" /></label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Avbryt</button><button className="primary-button">{edit ? 'Lagre endringer' : 'Opprett arrangement'}</button></div>
    </form>
  </section></div>
}

export default App
