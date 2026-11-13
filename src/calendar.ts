import ICAL from 'ical.js'
import { TEAM_NAME } from './team'

export type CalendarEvent = {
  id: string
  title: string
  start: Date
  end: Date
  location: string
  description: string
  url: string
}

export function parseCalendar(source: string): CalendarEvent[] {
  const parsed = ICAL.parse(source)
  const calendar = new ICAL.Component(parsed)

  return calendar.getAllSubcomponents('vevent').flatMap((component, index) => {
    try {
      const event = new ICAL.Event(component)
      if (!event.startDate) return []

      const start = event.startDate.toJSDate()
      const end = event.endDate?.toJSDate() ?? new Date(start.getTime() + 60 * 60 * 1000)
      const description = String(component.getFirstPropertyValue('description') ?? '')
      if (!description.replace(/\s+/g, ' ').toLowerCase().includes(TEAM_NAME.toLowerCase())) return []
      const descriptionLines = description.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      const versusIndex = descriptionLines.findIndex((line) => /^vs\.?$/i.test(line))
      const matchup = versusIndex > 0 && descriptionLines[versusIndex + 1]
        ? `${descriptionLines[versusIndex - 1]} vs ${descriptionLines[versusIndex + 1]}`
        : ''
      const title = matchup || event.summary?.trim() || 'Team event'
      const location = String(component.getFirstPropertyValue('location') ?? '')
      const url = String(component.getFirstPropertyValue('url') ?? '')
      const uid = String(component.getFirstPropertyValue('uid') ?? `${title}-${index}`)

      return [{ id: uid, title, start, end, location, description, url }]
    } catch {
      return []
    }
  }).sort((a, b) => a.start.getTime() - b.start.getTime())
}

export function parseScheduleHtml(source: string): CalendarEvent[] {
  const document = new DOMParser().parseFromString(source, 'text/html')
  const events: CalendarEvent[] = []

  for (const table of Array.from(document.querySelectorAll('table'))) {
    const rows = Array.from(table.querySelectorAll('tr'))
    const headerIndex = rows.findIndex((row) =>
      Array.from(row.cells).some((cell) => /date|day|time|home|away|visitor|field|location/i.test(cell.textContent ?? '')),
    )
    if (headerIndex < 0) continue

    const headers = Array.from(rows[headerIndex].cells, (cell) => (cell.textContent ?? '').trim().toLowerCase())
    const indexOf = (pattern: RegExp) => headers.findIndex((header) => pattern.test(header))
    const dateIndex = indexOf(/date|day/)
    const timeIndex = indexOf(/time|kick.?off/)
    const homeIndex = indexOf(/home|host/)
    const awayIndex = indexOf(/away|visitor|opponent/)
    const matchIndex = indexOf(/match|game|fixture|event/)
    const locationIndex = indexOf(/field|location|venue|complex/)

    for (const [rowIndex, row] of rows.slice(headerIndex + 1).entries()) {
      const cells = Array.from(row.cells, (cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim())
      if (cells.length < 2) continue

      const dateText = cells[dateIndex] || cells.find((cell) => /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b/i.test(cell))
      if (!dateText) continue

      const start = parseScheduleDate(dateText, cells[timeIndex] ?? '')
      if (!start) continue

      const home = cells[homeIndex] ?? ''
      const away = cells[awayIndex] ?? ''
      const listedMatch = cells[matchIndex] ?? ''
      const title = home && away
        ? `${home} vs ${away}`
        : listedMatch || cells.find((cell) => /\b(?:vs\.?|v\.?|at)\b/i.test(cell)) || (away ? `Eastside F.C. vs ${away}` : '')
      if (!title) continue

      const location = cells[locationIndex] ?? ''
      const id = `${start.getTime()}-${title}-${rowIndex}`
      events.push({ id, title, start, end: new Date(start.getTime() + 60 * 60 * 1000), location, description: '', url: '' })
    }
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime())
}

function parseScheduleDate(dateText: string, timeText: string): Date | null {
  const numericDate = dateText.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/)
  let date: Date

  if (numericDate) {
    const year = numericDate[3] ? Number(numericDate[3].length === 2 ? `20${numericDate[3]}` : numericDate[3]) : new Date().getFullYear()
    date = new Date(year, Number(numericDate[1]) - 1, Number(numericDate[2]))
  } else {
    date = new Date(dateText)
  }

  if (Number.isNaN(date.getTime())) return null

  const time = timeText.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)?\b/i)
  if (time) {
    let hours = Number(time[1]) % 12
    if (time[3]?.toUpperCase() === 'PM') hours += 12
    date.setHours(hours, Number(time[2]), 0, 0)
  }

  return date
}

export function eventDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isMatch(event: CalendarEvent): boolean {
  return /\b(vs\.?|v\.?|at)\b|\b(u\d{1,2}|game|match|league|tournament)\b/i.test(event.title)
}