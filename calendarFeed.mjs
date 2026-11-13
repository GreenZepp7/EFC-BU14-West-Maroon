const upstreamUrl = new URL('https://wys-2026rcl.sportsaffinity.com/tour/public/info/ischedule.aspx?flightguid=C48FB252-3C45-4D73-A503-AE7FB8808B8D&tournamentguid=6DBB3AF6-DEC3-4341-8D25-2DC23F01177B&gametimezone=pacific')
const allowedHosts = new Set([upstreamUrl.hostname])

export async function getCalendar() {
  const seen = new Set()
  const cookies = new Map()
  for (const pair of (process.env.SPORTSAFFINITY_COOKIE || '').split(';')) {
    const separator = pair.indexOf('=')
    if (separator > 0) cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim())
  }
  let url = upstreamUrl

  for (let redirects = 0; redirects <= 4; redirects += 1) {
    const headers = {
      accept: 'text/calendar, text/plain;q=0.9, */*;q=0.1',
      'user-agent': 'Mozilla/5.0',
    }
    const cookieHeader = Array.from(cookies, ([name, value]) => `${name}=${value}`).join('; ')
    const requestKey = `${url.href}\n${cookieHeader}`
    if (seen.has(requestKey)) throw new Error('SportsAffinity redirected the calendar request back to a URL it already visited.')
    seen.add(requestKey)
    if (cookieHeader) headers.cookie = cookieHeader

    const upstream = await fetch(url, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
    })

    for (const setCookie of upstream.headers.getSetCookie()) {
      const pair = setCookie.split(';', 1)[0]
      const separator = pair.indexOf('=')
      if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1))
    }

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get('location')
      if (!location) throw new Error(`SportsAffinity returned an incomplete redirect (${upstream.status}).`)

      const nextUrl = new URL(location, url)
      if (nextUrl.protocol !== 'https:' || !allowedHosts.has(nextUrl.hostname)) {
        throw new Error('SportsAffinity redirected the calendar to an untrusted address.')
      }
      url = nextUrl
      continue
    }

    if (!upstream.ok) throw new Error(`SportsAffinity returned HTTP ${upstream.status}.`)

    const content = await upstream.text()
    if (!/BEGIN:VCALENDAR/i.test(content)) {
      throw new Error('SportsAffinity responded, but the response is not an iCalendar feed.')
    }

    return content
  }

  throw new Error('SportsAffinity exceeded the calendar redirect limit.')
}
