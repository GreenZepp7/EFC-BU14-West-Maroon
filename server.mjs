import 'dotenv/config'
import { getCalendar } from './calendarFeed.mjs'
import { getResultsPage } from './resultsFeed.mjs'
import { getPracticeCalendar } from './practiceCalendarFeed.mjs'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { POST as handleChat } from './api/chat.ts'
import { GET as handleMcpGet, POST as handleMcpPost } from './api/mcp.ts'
import { GET as handleAdminMembersGet, POST as handleAdminMembersPost } from './api/admin-members.ts'
import { POST as handleMessagePush } from './api/message-push.ts'

const root = fileURLToPath(new URL('.', import.meta.url))
const distDirectory = resolve(root, 'dist')
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
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
    'cache-control': extname(filePath) === '.html' || relativePath === 'sw.js' || relativePath === 'manifest.webmanifest'
      ? 'no-cache'
      : 'public, max-age=31536000, immutable',
  })
  if (response.req.method === 'HEAD') response.end()
  else createReadStream(filePath).pipe(response)
}

async function serveWebHandler(handler, request, response, requestUrl) {
  const method = request.method || 'GET'
  const body = method === 'GET' || method === 'HEAD' ? undefined : Readable.toWeb(request)
  const webRequest = new Request(requestUrl, {
    method,
    headers: request.headers,
    body,
    ...(body ? { duplex: 'half' } : {}),
  })

  try {
    const webResponse = await handler(webRequest)
    response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers))
    if (!webResponse.body) {
      response.end()
      return
    }

    Readable.fromWeb(webResponse.body).pipe(response)
  } catch (error) {
    console.error('API request failed:', error)
    sendJson(response, 500, { error: 'The API request failed.' })
  }
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)

  const apiHandlers = {
    '/api/chat': { POST: handleChat },
    '/api/mcp': { GET: handleMcpGet, POST: handleMcpPost },
    '/api/admin-members': { GET: handleAdminMembersGet, POST: handleAdminMembersPost },
    '/api/message-push': { POST: handleMessagePush },
  }
  const apiHandler = apiHandlers[requestUrl.pathname]?.[request.method]
  if (apiHandler) {
    await serveWebHandler(apiHandler, request, response, requestUrl)
    return
  }

  if (requestUrl.pathname in apiHandlers) {
    const allow = Object.keys(apiHandlers[requestUrl.pathname]).join(', ')
    response.writeHead(405, { allow }).end('Method not allowed')
    return
  }

  const isPracticeCalendar = requestUrl.pathname === '/api/practice-calendar'
  if (requestUrl.pathname === '/api/results') {
    if (request.method !== 'GET') {
      response.writeHead(405, { allow: 'GET' }).end('Method not allowed')
      return
    }

    try {
      const resultsPage = await getResultsPage()
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'private, no-store',
      })
      response.end(resultsPage)
    } catch (error) {
      sendJson(response, 502, {
        error: 'Results feed unavailable',
        detail: error instanceof Error ? error.message : 'The results request failed.',
      })
    }
    return
  }

  if (requestUrl.pathname === '/api/calendar' || requestUrl.pathname === '/api/calendar.ics' || isPracticeCalendar) {
    if (request.method !== 'GET') {
      response.writeHead(405, { allow: 'GET' }).end('Method not allowed')
      return
    }

    try {
      const calendar = isPracticeCalendar ? await getPracticeCalendar() : await getCalendar()
      response.writeHead(200, {
        'content-type': 'text/calendar; charset=utf-8',
        'cache-control': 'private, no-store',
      })
      response.end(calendar)
    } catch (error) {
      sendJson(response, 502, {
        error: isPracticeCalendar ? 'Practice calendar unavailable' : 'Calendar feed unavailable',
        detail: error instanceof Error
          ? error.message
          : isPracticeCalendar ? 'The practice calendar request failed.' : 'The calendar request failed.',
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