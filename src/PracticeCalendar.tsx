import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, X } from 'lucide-react'
import { eventDateKey, parseCalendar, type CalendarEvent } from './calendar'

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
}

function formatEventTime(event: CalendarEvent) {
  return event.start.getTime() === event.end.getTime()
    ? formatTime(event.start)
    : `${formatTime(event.start)} – ${formatTime(event.end)}`
}

function formatLongDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function mapsUrl(location: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
}

function PracticeCalendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    let active = true
    fetch('/api/practice-calendar')
      .then(async (response) => {
        if (!response.ok) {
          const result = await response.json() as { detail?: string }
          throw new Error(result.detail || 'The practice calendar could not be reached.')
        }
        return response.text()
      })
      .then((text) => {
        const parsed = parseCalendar(text, { teamOnly: false })
        if (!parsed.length) throw new Error('The TeamSnap feed did not contain any events.')
        if (active) {
          const nextPractice = parsed.find((event) => /practice/i.test(event.title) && event.start.getTime() >= Date.now())
          if (nextPractice) {
            const nextDate = new Date(nextPractice.start.getFullYear(), nextPractice.start.getMonth(), nextPractice.start.getDate())
            setMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1))
            setSelectedDate(nextDate)
          }
          setEvents(parsed)
          setStatus('ready')
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'The practice calendar could not be reached.')
          setStatus('error')
        }
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (selectedEvent && !dialog.open) dialog.showModal()
    else if (!selectedEvent && dialog.open) dialog.close()
  }, [selectedEvent])

  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const key = eventDateKey(event.start)
      grouped.set(key, [...(grouped.get(key) ?? []), event])
    }
    return grouped
  }, [events])

  const days = useMemo(() => {
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
    return Array.from({ length: 42 }, (_, index) =>
      new Date(month.getFullYear(), month.getMonth(), 1 - firstDay.getDay() + index),
    )
  }, [month])

  const selectedEvents = eventsByDay.get(eventDateKey(selectedDate)) ?? []
  const nextPractice = useMemo(() => {
    const now = Date.now()
    return events.find((event) => /practice/i.test(event.title) && event.start.getTime() >= now)
  }, [events])

  function changeMonth(offset: number) {
    const nextMonth = new Date(month.getFullYear(), month.getMonth() + offset, 1)
    setMonth(nextMonth)
    setSelectedDate(nextMonth)
  }

  function selectToday() {
    const today = new Date()
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedDate(today)
  }

  return <div className="practice-calendar-shell">
    <header className="topbar">
      <a className="brand" href="/" aria-label="Eastside FC season dashboard">
        <img className="brand-logo" src="/eastside-fc-wordmark.png" alt="Eastside FC" />
        <span className="brand-label"><small>Season tracker</small></span>
      </a>
      <a className="source-link" href="/"><ArrowLeft size={14} />Season dashboard</a>
    </header>

    <main className="practice-calendar-page">
      <section className="practice-calendar-title">
        <div>
          <div className="eyebrow"><span />TEAMSNAP <b>·</b> TEAM CALENDAR</div>
          <h1>Practice schedule</h1>
          <p>Practices and team events from TeamSnap.</p>
        </div>
        <CalendarDays size={24} aria-hidden="true" />
      </section>

      {status === 'error' && <div className="notice error-notice">Practice schedule unavailable: {errorMessage}</div>}

      <section className="panel practice-day-panel" aria-live="polite">
        <div className="section-heading">
          <div><h2>{formatLongDate(selectedDate)}</h2><p>{selectedEvents.length ? `${selectedEvents.length} scheduled event${selectedEvents.length === 1 ? '' : 's'}` : 'Team schedule'}</p></div>
        </div>
        {selectedEvents.length ? <div className="practice-event-list">
          {selectedEvents.map((event) => <button
            className={`practice-event ${event.id === nextPractice?.id ? 'next-practice-event' : ''}`}
            type="button"
            key={event.id}
            onClick={() => setSelectedEvent(event)}
            aria-label={`View details for ${event.title}`}
          >
            <div className="practice-event-time"><Clock3 size={14} /><span>{formatEventTime(event)}</span></div>
            <div className="practice-event-description">
              {event.id === nextPractice?.id && <span className="practice-next-badge">Next practice</span>}
              <strong>{event.title}</strong>
              {event.location && <span><MapPin size={13} />{event.location}</span>}
            </div>
          </button>)}
        </div> : <p className="practice-calendar-message">
          {status === 'loading' ? 'Loading events…' : status === 'error' ? 'Try reloading the page to reconnect to TeamSnap.' : 'No events scheduled for this day.'}
        </p>}
      </section>

      <section className="panel practice-calendar-panel" aria-label="Practice calendar">
        <div className="practice-calendar-toolbar">
          <div className="practice-month-navigation">
            <button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft size={18} /></button>
            <h2>{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(month)}</h2>
            <button type="button" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight size={18} /></button>
          </div>
          <button className="practice-today-button" type="button" onClick={selectToday}>Today</button>
        </div>

        <div className="practice-calendar-grid">
          {weekdays.map((day) => <div className="practice-weekday" key={day}>{day}</div>)}
          {days.map((day) => {
            const dayEvents = eventsByDay.get(eventDateKey(day)) ?? []
            const isCurrentMonth = day.getMonth() === month.getMonth()
            const isSelected = eventDateKey(day) === eventDateKey(selectedDate)
            const isToday = eventDateKey(day) === eventDateKey(new Date())
            const isNextPracticeDay = dayEvents.some((event) => event.id === nextPractice?.id)
            const className = [
              'practice-day',
              isCurrentMonth ? '' : 'outside-month',
              isSelected ? 'selected' : '',
              isToday ? 'today' : '',
              isNextPracticeDay ? 'next-practice-day' : '',
            ].filter(Boolean).join(' ')

            return <div className={className} key={eventDateKey(day)}>
              <button
                className="practice-day-select"
                type="button"
                aria-pressed={isSelected}
                aria-label={`${formatLongDate(day)}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : ''}`}
                onClick={() => {
                  setSelectedDate(day)
                  if (!isCurrentMonth) setMonth(new Date(day.getFullYear(), day.getMonth(), 1))
                }}
              >
                <span className="practice-day-number">{day.getDate()}</span>
              </button>
              <div className="practice-day-events">
                {dayEvents.slice(0, 2).map((event) => <button
                  className={`practice-day-event ${event.id === nextPractice?.id ? 'next-practice-event' : ''}`}
                  type="button"
                  key={event.id}
                  aria-label={`View ${event.title}, ${formatLongDate(event.start)} at ${formatEventTime(event)}`}
                  onClick={() => {
                    setSelectedDate(day)
                    if (!isCurrentMonth) setMonth(new Date(day.getFullYear(), day.getMonth(), 1))
                    setSelectedEvent(event)
                  }}
                >
                  {event.id === nextPractice?.id && <span className="practice-next-badge">Next</span>}
                  <time>{formatTime(event.start)}</time> {event.title}
                </button>)}
                {dayEvents.length > 2 && <button
                  className="practice-day-more"
                  type="button"
                  onClick={() => {
                    setSelectedDate(day)
                    if (!isCurrentMonth) setMonth(new Date(day.getFullYear(), day.getMonth(), 1))
                  }}
                >+{dayEvents.length - 2} more</button>}
              </div>
            </div>
          })}
        </div>
        {status === 'loading' && <p className="practice-calendar-message">Loading TeamSnap events…</p>}
      </section>

    </main>
    <dialog
      className="practice-event-dialog"
      ref={dialogRef}
      onClose={() => setSelectedEvent(null)}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close()
      }}
    >
      {selectedEvent && <div className="practice-event-modal">
        <div className="practice-event-modal-heading">
          <div><span>{selectedEvent.id === nextPractice?.id ? 'NEXT PRACTICE' : 'TEAM EVENT'}</span><h2>{selectedEvent.title}</h2></div>
          <button type="button" className="practice-event-close" aria-label="Close event details" onClick={() => setSelectedEvent(null)}><X size={18} /></button>
        </div>
        <div className="practice-event-modal-details">
          <div><CalendarDays size={16} /><span>{formatLongDate(selectedEvent.start)}</span></div>
          <div><Clock3 size={16} /><span>{formatEventTime(selectedEvent)}</span></div>
          {selectedEvent.location && <div className="practice-event-modal-location">
            <MapPin size={16} />
            <a href={mapsUrl(selectedEvent.location)} target="_blank" rel="noreferrer">{selectedEvent.location}</a>
          </div>}
        </div>
        {selectedEvent.description.trim() && <p className="practice-event-modal-description">{selectedEvent.description}</p>}
      </div>}
    </dialog>
  </div>
}

export default PracticeCalendar
