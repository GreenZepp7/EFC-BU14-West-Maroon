import { isTeamName, TEAM_NAME } from './team'

export type Standing = {
  rank: number
  group: string
  team: string
  pointsByRound: Array<number | null>
  points: number
  goalDifference: number
  goalsFor: number
  goalsAgainst: number
  wins: number
  shutouts: number
}

export type TeamFixture = {
  gameId: string
  home: string
  away: string
  homeScore: number | null
  awayScore: number | null
  venue: string
  time: string
  field: string
}

export type ResultsSnapshot = {
  standings: Standing[]
  games: TeamFixture[]
}

function rowCells(row: HTMLTableRowElement) {
  return Array.from(row.cells, (cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim())
}

function tableRows(table: HTMLTableElement) {
  return Array.from(table.querySelectorAll('tr')).filter((row) => row.closest('table') === table)
}

function numberAt(cells: string[], index: number): number | null {
  const value = cells[index]?.trim()
  return value && /^-?\d+$/.test(value) ? Number(value) : null
}

export function parseResultsHtml(source: string): ResultsSnapshot {
  const document = new DOMParser().parseFromString(source, 'text/html')
  const tables = Array.from(document.querySelectorAll('table'))
  const standingsTable = tables.find((table) =>
    tableRows(table).some((row) => rowCells(row).some((cell) => /^total\s*points$/i.test(cell))) &&
    tableRows(table).some((row) => rowCells(row).some((cell) => /^goal diff$/i.test(cell))),
  )

  if (!standingsTable) throw new Error('The saved schedule page did not contain a standings table.')

  const standingRows = tableRows(standingsTable)
  const headerIndex = standingRows.findIndex((row) => rowCells(row).some((cell) => /^total\s*points$/i.test(cell)))
  const headers = rowCells(standingRows[headerIndex])
  const indexOf = (pattern: RegExp) => headers.findIndex((header) => pattern.test(header))
  const groupIndex = indexOf(/^group/i)
  const pointsIndex = indexOf(/^total\s*points$/i)
  const goalDifferenceIndex = indexOf(/^goal diff$/i)
  const goalsForIndex = indexOf(/^goals for$/i)
  const goalsAgainstIndex = indexOf(/^goals against$/i)
  const winsIndex = indexOf(/^most wins$/i)
  const shutoutsIndex = indexOf(/^shut outs$/i)
  const roundColumns = headers.flatMap((header, index) => /^\d+$/.test(header) ? [{ round: Number(header), index }] : [])

  const standings = standingRows.slice(headerIndex + 1).flatMap((row, index) => {
    const cells = rowCells(row)
    const group = cells[groupIndex] ?? ''
    const teamMatch = group.match(/^\s*([A-Z]\d+)\s*:\s*(.+?)\s*$/)
    if (!teamMatch) return []

    return [{
      rank: index + 1,
      group: teamMatch[1],
      team: teamMatch[2],
      pointsByRound: roundColumns.map(({ index: column }) => numberAt(cells, column)),
      points: numberAt(cells, pointsIndex) ?? 0,
      goalDifference: numberAt(cells, goalDifferenceIndex) ?? 0,
      goalsFor: numberAt(cells, goalsForIndex) ?? 0,
      goalsAgainst: numberAt(cells, goalsAgainstIndex) ?? 0,
      wins: numberAt(cells, winsIndex) ?? 0,
      shutouts: numberAt(cells, shutoutsIndex) ?? 0,
    }]
  })

  if (!standings.some((standing) => isTeamName(standing.team))) {
    throw new Error(`The standings table did not include ${TEAM_NAME}.`)
  }

  const gamesById = new Map<string, TeamFixture>()
  for (const table of tables) {
    const rows = tableRows(table)
    const matchHeaderIndex = rows.findIndex((row) => {
      const cells = rowCells(row)
      return cells.includes('Home Team') && cells.includes('Away Team') && cells.filter((cell) => cell === 'Score').length >= 2
    })
    if (matchHeaderIndex < 0) continue

    const headers = rowCells(rows[matchHeaderIndex])
    const gameIndex = headers.findIndex((header) => /^game$/i.test(header))
    const homeIndex = headers.findIndex((header) => /^home team$/i.test(header))
    const awayIndex = headers.findIndex((header) => /^away team$/i.test(header))
    const venueIndex = headers.findIndex((header) => /^venue$/i.test(header))
    const timeIndex = headers.findIndex((header) => /^time$/i.test(header))
    const fieldIndex = headers.findIndex((header) => /^field$/i.test(header))
    const scoreIndices = headers.flatMap((header, index) => /^score$/i.test(header) ? [index] : [])

    for (const row of rows.slice(matchHeaderIndex + 1)) {
      const cells = rowCells(row)
      const gameId = cells[gameIndex]
      const home = cells[homeIndex]
      const away = cells[awayIndex]
      const homeScore = numberAt(cells, scoreIndices[0] ?? -1)
      const awayScore = numberAt(cells, scoreIndices[1] ?? -1)
      if (!gameId || !/^\d+$/.test(gameId)) continue
      if (!isTeamName(home) && !isTeamName(away)) continue
      gamesById.set(gameId, {
        gameId,
        home,
        away,
        homeScore,
        awayScore,
        venue: cells[venueIndex] ?? '',
        time: cells[timeIndex] ?? '',
        field: cells[fieldIndex] ?? '',
      })
    }
  }

  const games = Array.from(gamesById.values())
  if (!games.length) throw new Error('The saved schedule page did not include any Eastside fixtures.')
  return { standings, games }
}
