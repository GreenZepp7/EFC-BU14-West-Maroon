import { getPracticeCalendar } from '../practiceCalendarFeed.mjs'

type ApiRequest = { method?: string }
type ApiResponse = {
  statusCode: number
  setHeader(name: string, value: string): void
  end(body?: string): void
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'GET') {
    response.statusCode = 405
    response.setHeader('Allow', 'GET')
    response.end('Method not allowed')
    return
  }

  try {
    const calendar = await getPracticeCalendar()
    response.statusCode = 200
    response.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    response.setHeader('Cache-Control', 'private, no-store')
    response.end(calendar)
  } catch (error) {
    response.statusCode = 502
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.end(JSON.stringify({
      error: 'Practice calendar unavailable',
      detail: error instanceof Error ? error.message : 'The practice calendar request failed.',
    }))
  }
}
