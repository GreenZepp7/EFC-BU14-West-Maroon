import { getResultsPage } from '../resultsFeed.mjs'

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
    const resultsPage = await getResultsPage()
    response.statusCode = 200
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.setHeader('Cache-Control', 'private, no-store')
    response.end(resultsPage)
  } catch (error) {
    response.statusCode = 502
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.end(JSON.stringify({
      error: 'Results feed unavailable',
      detail: error instanceof Error ? error.message : 'The results request failed.',
    }))
  }
}
