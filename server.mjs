import 'dotenv/config'
import { getCalendar } from './calendarFeed.mjs'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const distDirectory = resolve(root, 'dist')
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

  if (requestUrl.pathname === '/api/calendar' || requestUrl.pathname === '/api/calendar.ics') {
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