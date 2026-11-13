import 'dotenv/config'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const distDirectory = resolve(root, 'dist')
const upstreamUrl = new URL('https://wys-2026rcl.sportsaffinity.com/tour/public/info/ischedule.aspx?flightguid=C48FB252-3C45-4D73-A503-AE7FB8808B8D&tournamentguid=6DBB3AF6-DEC3-4341-8D25-2DC23F01177B&gametimezone=pacific')
const allowedHosts = new Set([upstreamUrl.hostname, 'wys-2026rcl.sportsaffinity.com'])
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(body))
}

async function getCalendar() {
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

async function serveStatic(pathname, response) {
  let requestedPath
  try {
    requestedPath = decodeURIComponent(pathname)
  } catch {
    response.writeHead(400).end('Bad request')
    return
  }

  const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.replace(/^\/+/, '')
  let filePath = resolve(distDirectory, relativePath)
  if (filePath !== distDirectory && !filePath.startsWith(`${distDirectory}${sep}`)) {
    response.writeHead(403).end('Forbidden')
    return
  }

  try {
    if (!(await stat(filePath)).isFile()) throw new Error('Not a file')
  } catch {
    filePath = resolve(distDirectory, 'index.html')
    try {
      await stat(filePath)
    } catch {
      response.writeHead(404).end('Build the app with npm run build first.')
      return
    }
  }

  response.writeHead(200, {
    'content-type': mimeTypes[extname(filePath)] || 'application/octet-stream',
    'cache-control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  if (response.req.method === 'HEAD') response.end()
  else createReadStream(filePath).pipe(response)
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)

  if (requestUrl.pathname === '/api/calendar.ics') {
    if (request.method !== 'GET') {
      response.writeHead(405, { allow: 'GET' }).end('Method not allowed')
      return
    }

    try {
      const calendar = await getCalendar()
      response.writeHead(200, {
        'content-type': 'text/calendar; charset=utf-8',
        'cache-control': 'private, no-store',
      })
      response.end(calendar)
    } catch (error) {
      sendJson(response, 502, {
        error: 'Calendar feed unavailable',
        detail: error instanceof Error ? error.message : 'The calendar request failed.',
      })
    }
    return
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' }).end('Method not allowed')
    return
  }

  await serveStatic(requestUrl.pathname, response)
})

const port = Number(process.env.PORT || 3001)
server.listen(port, '0.0.0.0', () => {
  console.log(`Calendar server listening on http://localhost:${port}`)
})