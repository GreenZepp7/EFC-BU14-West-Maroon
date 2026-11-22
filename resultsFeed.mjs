const upstreamUrl = new URL(
  'https://wys.sportsaffinity.com/tour/public/info/schedule_results2.asp?sessionguid=&flightguid=C48FB252-3C45-4D73-A503-AE7FB8808B8D&tournamentguid=6DBB3AF6-DEC3-4341-8D25-2DC23F01177B&BeginDate=&EndDate=',
)
const allowedHosts = new Set([upstreamUrl.hostname])

export async function getResultsPage() {
  const seen = new Set()
  let url = upstreamUrl

  for (let redirects = 0; redirects <= 4; redirects += 1) {
    if (seen.has(url.href)) {
      throw new Error('SportsAffinity redirected the results request to a URL it already visited.')
    }
    seen.add(url.href)

    const upstream = await fetch(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        'user-agent': 'Mozilla/5.0',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
    })

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get('location')
      if (!location) {
        throw new Error(`SportsAffinity returned an incomplete redirect (${upstream.status}).`)
      }

      const nextUrl = new URL(location, url)
      if (nextUrl.protocol !== 'https:' || !allowedHosts.has(nextUrl.hostname)) {
        throw new Error('SportsAffinity redirected the results request to an untrusted address.')
      }
      url = nextUrl
      continue
    }

    if (!upstream.ok) throw new Error(`SportsAffinity returned HTTP ${upstream.status}.`)

    const content = await upstream.text()
    if (!/Total\s*Points/i.test(content) || !/Home Team/i.test(content)) {
      throw new Error('SportsAffinity responded, but the page did not contain results and standings.')
    }

    return content
  }

  throw new Error('SportsAffinity exceeded the results redirect limit.')
}
