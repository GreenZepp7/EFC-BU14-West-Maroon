const upstreamUrl = new URL('https://ical-cdn.teamsnap.com/team_schedule/6e3343ff-1c07-4d81-b36c-59319c593551.ics')
const allowedHosts = new Set([upstreamUrl.hostname])

export async function getPracticeCalendar() {
  const seen = new Set()
  let url = upstreamUrl

  for (let redirects = 0; redirects <= 4; redirects += 1) {
    if (seen.has(url.href)) throw new Error('TeamSnap redirected the calendar request to a URL it already visited.')
    seen.add(url.href)

    const upstream = await fetch(url, {
      headers: { accept: 'text/calendar, text/plain;q=0.9, */*;q=0.1' },
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
    })

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get('location')
      if (!location) throw new Error(`TeamSnap returned an incomplete redirect (${upstream.status}).`)

      const nextUrl = new URL(location, url)
      if (nextUrl.protocol !== 'https:' || !allowedHosts.has(nextUrl.hostname)) {
        throw new Error('TeamSnap redirected the calendar to an untrusted address.')
      }
      url = nextUrl
      continue
    }

    if (!upstream.ok) throw new Error(`TeamSnap returned HTTP ${upstream.status}.`)

    const content = await upstream.text()
    if (!/BEGIN:VCALENDAR/i.test(content)) {
      throw new Error('TeamSnap responded, but the response is not an iCalendar feed.')
    }

    return content
  }

  throw new Error('TeamSnap exceeded the calendar redirect limit.')
}
