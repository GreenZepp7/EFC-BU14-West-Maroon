import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpRight,
  CalendarDays,
  Clock3,
  ExternalLink,
  MapPin,
  Trophy,
  Upload,
} from 'lucide-react'
import { parseCalendar, type CalendarEvent } from './calendar'
import { parseResultsHtml, type ResultsSnapshot, type Standing, type TeamFixture } from './results'
import { seasonSnapshot } from './seasonSnapshot'
import { isTeamName, TEAM_NAME } from './team'

const calendarApiUrl = '/api/calendar'
const teamUrl = 'https://wys.sportsaffinity.com/tour/public/info/schedule_results2.asp?sessionguid=&flightguid=C48FB252-3C45-4D73-A503-AE7FB8808B8D&tournamentguid=6DBB3AF6-DEC3-4341-8D25-2DC23F01177B'
const timezone = 'America/Los_Angeles'

type MatchView = {
  fixture: TeamFixture
  event?: CalendarEvent
  opponent: string
  opponentRank?: number
  isHome: boolean
  goalsFor: number | null
  goalsAgainst: number | null
  outcome: 'W' | 'D' | 'L' | null
  points: number
}

type PointSeries = {
  name: string
  color: string
  values: number[]
  dashed?: boolean
}

function gameIdForEvent(event: CalendarEvent) {
  return event.description.match(/Game#:\s*(\d+)/i)?.[1]
}

function teamsForEvent(event: CalendarEvent) {
  const lines = event.description.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const versusIndex = lines.findIndex((line) => /^vs\.?$/i.test(line))
  if (versusIndex <= 0 || !lines[versusIndex + 1]) return null
  return { home: lines[versusIndex - 1], away: lines[versusIndex + 1] }
}

function dateLabel(date?: Date, options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return date ? new Intl.DateTimeFormat('en-US', { ...options, timeZone: timezone }).format(date) : 'Date TBD'
}

function timeLabel(fixture: TeamFixture, event?: CalendarEvent) {
  if (fixture.time === '--') return 'Time TBD'
  if (fixture.time) return fixture.time
  if (!event) return 'Time TBD'
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(event.start)
}

function venueLocation(fixture: TeamFixture, event?: CalendarEvent) {
  const locations = [fixture.venue.trim(), event?.location.trim() ?? '']
  return locations.find((location) => location && !/virtual tbd|^tbd$|^--$/i.test(location)) ?? ''
}

function venueLabel(fixture: TeamFixture, event?: CalendarEvent) {
  const venue = venueLocation(fixture, event)
  if (!venue) return 'Venue TBD'
  return fixture.field && fixture.field !== '--' ? `${venue} · Field ${fixture.field}` : venue
}

function googleMapsUrl(location: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
}

function ordinal(value: number) {
  const suffix = value % 100 >= 11 && value % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[value % 10] ?? 'th'
  return `${value}${suffix}`
}

function summarize(matches: MatchView[]) {
  const wins = matches.filter((match) => match.outcome === 'W').length
  const draws = matches.filter((match) => match.outcome === 'D').length
  const losses = matches.filter((match) => match.outcome === 'L').length
  const goalsFor = matches.reduce((total, match) => total + (match.goalsFor ?? 0), 0)
  const goalsAgainst = matches.reduce((total, match) => total + (match.goalsAgainst ?? 0), 0)
  const points = matches.reduce((total, match) => total + match.points, 0)
  const games = matches.length

  return { games, wins, draws, losses, goalsFor, goalsAgainst, points }
}

function recordLabel(stats: ReturnType<typeof summarize>) {
  return `${stats.wins}-${stats.draws}-${stats.losses}`
}

function perGame(value: number, games: number) {
  return games ? (value / games).toFixed(2) : '—'
}

function pointsForStanding(standing: Standing, roundCount = standing.pointsByRound.length) {
  let total = 0
  const values = [0]
  for (let round = 0; round < roundCount; round += 1) {
    const points = standing.pointsByRound[round]
    if (points !== null && points !== undefined) total += points
    values.push(total)
  }
  return values
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function predictNextFixture(nextFixture: MatchView | undefined, completed: MatchView[]) {
  if (!nextFixture || !completed.length) return null

  const recent = completed.slice(-5)
  const recentStats = summarize(recent)
  const recentPointsPerGame = recentStats.games ? recentStats.points / recentStats.games : 0
  const recentGoalDifference = recentStats.games ? (recentStats.goalsFor - recentStats.goalsAgainst) / recentStats.games : 0
  const opponentAdjustment = nextFixture.opponentRank ? clamp((11 - nextFixture.opponentRank) * 0.03, -0.14, 0.18) : 0.04
  const homeAdjustment = nextFixture.isHome ? 0.1 : -0.04
  const winChance = clamp(0.38 + (recentPointsPerGame / 3) * 0.42 + recentGoalDifference * 0.08 + homeAdjustment + opponentAdjustment, 0.2, 0.8)
  const drawChance = clamp(0.26 + (3 - recentPointsPerGame) * 0.08 - Math.abs(recentGoalDifference) * 0.05, 0.12, 0.35)
  const lossChance = clamp(1 - winChance - drawChance, 0.1, 0.5)

  let outcome: MatchView['outcome']
  if (winChance >= drawChance && winChance >= lossChance) outcome = 'W'
  else if (drawChance >= lossChance) outcome = 'D'
  else outcome = 'L'

  const confidence = Math.round(Math.max(winChance, drawChance, lossChance) * 100)
  const summary = outcome === 'W' ? 'Likely win' : outcome === 'D' ? 'Likely draw' : 'Likely loss'
  const note = outcome === 'W'
    ? 'Recent form and home edge suggest the next result is in our favour.'
    : outcome === 'D'
      ? 'A tight contest is the most likely outcome based on the recent run.'
      : 'Opposition strength and recent defending point to a tougher test.'

  return { outcome, summary, confidence, note }
}

function makePointSeries(standings: Standing[], teamStanding?: Standing): PointSeries[] {
  if (!teamStanding || !standings.length) return []
  const rounds = Math.max(...standings.map((standing) => standing.pointsByRound.length))
  const cumulative = standings.map((standing) => pointsForStanding(standing, rounds))
  const teamValues = pointsForStanding(teamStanding, rounds)
  const leader = standings[0]
  const fourth = standings[3]
  const averageValues = Array.from({ length: rounds + 1 }, (_, index) =>
    cumulative.reduce((sum, values) => sum + values[index], 0) / standings.length,
  )

  return [
    { name: TEAM_NAME, color: '#752f40', values: teamValues },
    { name: leader.team, color: '#263f50', values: pointsForStanding(leader, rounds) },
    ...(fourth ? [{ name: `${ordinal(fourth.rank)} place · ${fourth.team}`, color: '#d2924f', values: pointsForStanding(fourth, rounds) }] : []),
    { name: 'Division average', color: '#8b9493', values: averageValues, dashed: true },
  ]
}

function PointsChart({ series }: { series: PointSeries[] }) {
  if (!series.length) return <div className="chart-empty">Standings points are not available.</div>

  const width = 900
  const height = 270
  const left = 44
  const right = 18
  const top = 14
  const bottom = 32
  const maxRound = Math.max(...series.map((item) => item.values.length - 1))
  const maxPoints = Math.max(...series.flatMap((item) => item.values))
  const yMax = Math.max(5, Math.ceil(maxPoints / 5) * 5)
  const x = (index: number) => left + index * (width - left - right) / Math.max(1, maxRound)
  const y = (value: number) => top + (yMax - value) * (height - top - bottom) / yMax
  const ticks = Array.from({ length: yMax / 5 + 1 }, (_, index) => index * 5)

  return <>
    <div className="chart-scroll">
      <svg className="points-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cumulative division points by round">
        {ticks.map((tick) => <g key={tick}>
          <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="chart-gridline" />
          <text x={left - 10} y={y(tick) + 4} textAnchor="end" className="chart-axis-label">{tick}</text>
        </g>)}
        {Array.from({ length: maxRound }, (_, index) => <text key={index} x={x(index + 1)} y={height - 8} textAnchor="middle" className="chart-axis-label">{index + 1}</text>)}
        {series.map((item) => <polyline
          key={item.name}
          points={item.values.map((value, index) => `${x(index)},${y(value)}`).join(' ')}
          fill="none"
          stroke={item.color}
          strokeWidth={item.name === TEAM_NAME ? 3.5 : 2}
          strokeDasharray={item.dashed ? '5 5' : undefined}
          strokeLinejoin="round"
          strokeLinecap="round"
        />)}
        {series[0].values.map((value, index) => <circle key={index} cx={x(index)} cy={y(value)} r="3.5" fill="#752f40" />)}
      </svg>
    </div>
    <div className="chart-legend">{series.map((item) => <span key={item.name}><i style={{ backgroundColor: item.color }} />{item.name}</span>)}</div>
  </>
}

function App() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [snapshot, setSnapshot] = useState<ResultsSnapshot>(seasonSnapshot)
  const [feedMessage, setFeedMessage] = useState('')
  const [statsSource, setStatsSource] = useState('Provided SportsAffinity export')
  const [importMessage, setImportMessage] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    fetch(calendarApiUrl)
      .then(async (response) => {
        if (!response.ok) {
          const result = await response.json() as { detail?: string }
          throw new Error(result.detail || 'The calendar could not be reached.')
        }
        return response.text()
      })
      .then((text) => {
        const parsed = parseCalendar(text)
        if (!parsed.length) throw new Error('The calendar feed did not contain any team events.')
        if (active) {
          setEvents(parsed)
          setStatus('ready')
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setFeedMessage(error instanceof Error ? error.message : 'The calendar could not be reached.')
          setStatus('error')
        }
      })
    return () => { active = false }
  }, [])

  const teamStanding = snapshot.standings.find((standing) => isTeamName(standing.team))
  const matches = useMemo(() => {
    const fixturesById = new Map(snapshot.games.map((fixture) => [fixture.gameId, fixture]))
    return events.flatMap((event) => {
      const gameId = gameIdForEvent(event)
      const fixture = gameId ? fixturesById.get(gameId) : undefined
      const matchup = teamsForEvent(event)
      const home = fixture?.home || matchup?.home
      const away = fixture?.away || matchup?.away
      if (!gameId || !home || !away) return []

      const hasScore = fixture?.homeScore !== null && fixture?.homeScore !== undefined &&
        fixture?.awayScore !== null && fixture?.awayScore !== undefined
      const isHome = isTeamName(home)
      const opponent = isHome ? away : home
      const goalsFor = hasScore ? (isHome ? fixture.homeScore : fixture.awayScore) : null
      const goalsAgainst = hasScore ? (isHome ? fixture.awayScore : fixture.homeScore) : null
      const outcome: MatchView['outcome'] = goalsFor === null || goalsAgainst === null
        ? null
        : goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D'

      return [{
        fixture: fixture ?? {
          gameId,
          home,
          away,
          homeScore: null,
          awayScore: null,
          venue: event.location,
          time: '',
          field: '',
        },
        event,
        opponent,
        opponentRank: snapshot.standings.find((standing) =>
          isTeamName(opponent) ? isTeamName(standing.team) : standing.team === opponent,
        )?.rank,
        isHome,
        goalsFor,
        goalsAgainst,
        outcome,
        points: outcome === 'W' ? 3 : outcome === 'D' ? 1 : 0,
      }]
    }).sort((a, b) => (a.event?.start.getTime() ?? 0) - (b.event?.start.getTime() ?? 0))
  }, [events, snapshot])

  const completed = matches.filter((match) => match.outcome !== null)
  const upcoming = matches.filter((match) => match.outcome === null)
  const stats = summarize(completed)
  let runningPoints = 0
  const resultsWithRunningPoints = completed.map((match) => {
    runningPoints += match.points
    return { ...match, runningPoints }
  })
  const recentThree = completed.slice(-3)
  const recentStats = summarize(recentThree)
  const leader = snapshot.standings[0]
  const pointsBehind = leader && teamStanding ? Math.max(0, leader.points - teamStanding.points) : 0
  const chartSeries = makePointSeries(snapshot.standings, teamStanding)
  const nextFixture = upcoming[0]
  const nextPrediction = useMemo(() => predictNextFixture(nextFixture, completed), [nextFixture, completed])
  const nextLocation = nextFixture ? venueLocation(nextFixture.fixture, nextFixture.event) : ''
  const splits = [
    { name: 'Overall', matches: completed },
    { name: 'Home', matches: completed.filter((match) => match.isHome) },
    { name: 'Away', matches: completed.filter((match) => !match.isHome) },
    { name: 'Last 3', matches: recentThree },
  ]

  async function importResults(file?: File) {
    if (!file) return
    try {
      const parsed = parseResultsHtml(await file.text())
      setSnapshot(parsed)
      setStatsSource(file.name)
      setImportMessage('')
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : 'The results page could not be parsed.')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return <div className="dashboard-shell">
    <header className="topbar">
      <a className="brand" href={teamUrl} target="_blank" rel="noreferrer" aria-label="Eastside FC schedule">
        <img className="brand-logo" src="/eastside-fc-wordmark.png" alt="Eastside FC" />
        <span className="brand-label"><small>Season tracker</small></span>
      </a>
      <div className="topbar-actions">
        <a className="source-link" href={teamUrl} target="_blank" rel="noreferrer">Official schedule <ExternalLink size={14} /></a>
        <button className="update-button" onClick={() => inputRef.current?.click()}><Upload size={15} />Update stats</button>
        <input ref={inputRef} className="visually-hidden" type="file" accept=".html,.htm,.aspx,text/html" onChange={(event) => void importResults(event.target.files?.[0])} />
      </div>
    </header>

    <main className="dashboard">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span />26/27 REGIONAL CLUB LEAGUE <b>·</b> BOYS UNDER 14 <b>·</b> DIV 2 NORTH</div>
          <h1>Eastside FC<br /><em>BU14 West Maroon</em></h1>
          <p className="hero-summary">
            {teamStanding ? `${ordinal(teamStanding.rank)}, ${pointsBehind ? `${pointsBehind} point${pointsBehind === 1 ? '' : 's'} behind ${leader?.team}` : 'at the top of the table'}.` : 'Season overview'}
            {' '}{completed.length} played · {upcoming.length} to play
          </p>
        </div>
        <aside className="next-card">
          <span className="next-kicker"><i />NEXT FIXTURE</span>
          {nextFixture ? <>
            <strong>{nextFixture.opponent}</strong>
            <span>{dateLabel(nextFixture.event?.start)} · {timeLabel(nextFixture.fixture, nextFixture.event)}</span>
            {nextLocation ? (
              <a className="next-location" href={googleMapsUrl(nextLocation)} target="_blank" rel="noreferrer">
                <MapPin size={12} />
                <span>{venueLabel(nextFixture.fixture, nextFixture.event)}</span>
                <ExternalLink size={11} />
              </a>
            ) : (
              <span className="next-location"><MapPin size={12} /><span>{venueLabel(nextFixture.fixture, nextFixture.event)}</span></span>
            )}
            <small>{nextFixture.opponentRank ? `${ordinal(nextFixture.opponentRank)} in the division` : 'League fixture'}</small>
            {nextPrediction ? <div className="next-prediction">
              <span className="prediction-label">Prediction</span>
              <strong>{nextPrediction.summary}</strong>
              <small>{nextPrediction.confidence}% chance</small>
              <em>{nextPrediction.note}</em>
            </div> : null}
          </> : <strong>{status === 'loading' ? 'Loading schedule…' : 'No upcoming fixtures found'}</strong>}
        </aside>
      </section>

      {status === 'error' && <div className="notice error-notice"><span>Schedule feed unavailable: {feedMessage}</span><a href={teamUrl} target="_blank" rel="noreferrer">Open schedule <ArrowUpRight size={14} /></a></div>}
      {importMessage && <div className="notice error-notice">{importMessage}</div>}

      <section className="metric-grid" aria-label="Season statistics">
        <article className="metric-card primary-metric"><span>POSITION</span><strong>{teamStanding ? ordinal(teamStanding.rank) : '—'}</strong><small>of {snapshot.standings.length} clubs</small></article>
        <article className="metric-card"><span>POINTS</span><strong>{teamStanding?.points ?? '—'}</strong><small>from {stats.games} games</small></article>
        <article className="metric-card"><span>POINTS / GAME</span><strong>{perGame(teamStanding?.points ?? stats.points, stats.games)}</strong><small>season average</small></article>
        <article className="metric-card"><span>W · D · L</span><strong>{recordLabel(stats)}</strong><small>{stats.games ? `${Math.round(stats.wins / stats.games * 100)}% win rate` : 'no results yet'}</small></article>
        <article className="metric-card"><span>GOALS FOR / GAME</span><strong>{perGame(stats.goalsFor, stats.games)}</strong><small>{stats.goalsFor} scored</small></article>
        <article className="metric-card"><span>GOALS AGAINST / GAME</span><strong>{perGame(stats.goalsAgainst, stats.games)}</strong><small>{stats.goalsAgainst} conceded</small></article>
        <article className="metric-card"><span>GOAL DIFFERENCE / GAME</span><strong>{stats.games ? `${((stats.goalsFor - stats.goalsAgainst) / stats.games > 0 ? '+' : '')}${perGame(stats.goalsFor - stats.goalsAgainst, stats.games)}` : '—'}</strong><small>GD {teamStanding ? `${teamStanding.goalDifference > 0 ? '+' : ''}${teamStanding.goalDifference}` : '—'}</small></article>
        <article className="metric-card"><span>LAST 3 · PPG</span><strong>{perGame(recentStats.points, recentStats.games)}</strong><small>{recordLabel(recentStats)} W-D-L</small></article>
      </section>

      <section className="panel results-panel">
        <div className="section-heading">
          <div><h2>Results</h2><p>Most recent first · running points on the right</p></div>
          <span className="section-count">{completed.length} PLAYED</span>
        </div>
        <div className="results-list">
          {resultsWithRunningPoints.length ? resultsWithRunningPoints.slice().reverse().map((match) => <article className="result-row" key={match.fixture.gameId}>
            <div className="result-date"><strong>{dateLabel(match.event?.start, { day: '2-digit' })}</strong><span>{dateLabel(match.event?.start, { month: 'short' }).toUpperCase()}</span></div>
            <span className={`home-away ${match.isHome ? 'home' : 'away'}`}>{match.isHome ? 'H' : 'A'}</span>
            <div className="result-opponent"><strong>{match.opponent}</strong><small>{venueLabel(match.fixture, match.event)}</small></div>
            <span className={`result-outcome ${match.outcome?.toLowerCase()}`}>{match.outcome}</span>
            <strong className="result-score">{match.fixture.homeScore} – {match.fixture.awayScore}</strong>
            <span className="running-points"><b>{match.runningPoints}</b><small>PTS</small></span>
          </article>) : <div className="empty-row">No completed results are available in this export.</div>}
        </div>
      </section>

      <section className="panel chart-panel">
        <div className="section-heading">
          <div><h2>Points, game by game</h2><p>Cumulative points against the leader, fourth place and division average.</p></div>
          <Trophy size={18} />
        </div>
        <PointsChart series={chartSeries} />
      </section>

      <div className="lower-grid">
        <section className="panel standings-panel">
          <div className="section-heading">
            <div><h2>Division table</h2><p>Official group table · points and goal-difference tie-breakers.</p></div>
            <span className="section-count">{snapshot.standings.length} CLUBS</span>
          </div>
          <div className="table-scroll">
            <table className="standings-table">
              <thead><tr><th>#</th><th>Club</th><th>GP</th><th>W-D-L</th><th>GD</th><th>Pts</th><th>PPG</th></tr></thead>
              <tbody>{snapshot.standings.map((standing) => {
                const played = standing.pointsByRound.filter((value) => value !== null).length
                const wins = standing.pointsByRound.filter((value) => value === 3).length
                const draws = standing.pointsByRound.filter((value) => value === 1).length
                const losses = played - wins - draws
                return                 <tr className={isTeamName(standing.team) ? 'our-team' : ''} key={standing.team}>
                  <td>{standing.rank}</td>
                  <td><span className="club-cell"><i>{standing.group}</i>{isTeamName(standing.team) ? TEAM_NAME : standing.team}</span></td>
                  <td>{played}</td>
                  <td>{wins}-{draws}-{losses}</td>
                  <td className={standing.goalDifference > 0 ? 'positive' : standing.goalDifference < 0 ? 'negative' : ''}>{standing.goalDifference > 0 ? '+' : ''}{standing.goalDifference}</td>
                  <td><b>{standing.points}</b></td>
                  <td>{perGame(standing.points, played)}</td>
                </tr>
              })}</tbody>
            </table>
          </div>
        </section>

        <section className="panel fixtures-panel">
          <div className="section-heading">
            <div><h2>Still to play</h2><p>Opponent rank · venue’s local time</p></div>
            <span className="section-count">{upcoming.length} FIXTURES</span>
          </div>
          <div className="fixtures-list">
            {upcoming.length ? upcoming.map((match) => <article className="fixture-row" key={match.fixture.gameId}>
              <div className="fixture-date"><strong>{dateLabel(match.event?.start, { day: '2-digit' })}</strong><span>{dateLabel(match.event?.start, { month: 'short' }).toUpperCase()}</span></div>
              <span className={`home-away ${match.isHome ? 'home' : 'away'}`}>{match.isHome ? 'H' : 'A'}</span>
              <div className="fixture-details"><strong>{match.opponent}</strong><span><Clock3 size={12} />{timeLabel(match.fixture, match.event)}<MapPin size={12} />{venueLabel(match.fixture, match.event)}</span></div>
              <span className="opponent-rank">{match.opponentRank ? `#${match.opponentRank}` : '—'}</span>
            </article>) : <div className="empty-row">No upcoming fixtures.</div>}
          </div>
          <p className="prediction-note">Opponent ranks shown; win probabilities are not included in the source data.</p>
        </section>
      </div>

      <section className="panel splits-panel">
        <div className="section-heading">
          <div><h2>Splits</h2><p>Season, home, away and recent form.</p></div>
        </div>
        <div className="table-scroll">
          <table className="splits-table">
            <thead><tr><th>Split</th><th>GP</th><th>W-D-L</th><th>PPG</th><th>GF/G</th><th>GA/G</th><th>GD/G</th><th>Points</th></tr></thead>
            <tbody>{splits.map(({ name, matches: splitMatches }) => {
              const split = summarize(splitMatches)
              return <tr key={name}>
                <td><b>{name}</b></td><td>{split.games}</td><td>{recordLabel(split)}</td>
                <td>{perGame(split.points, split.games)}</td><td>{perGame(split.goalsFor, split.games)}</td>
                <td>{perGame(split.goalsAgainst, split.games)}</td>
                <td>{split.games ? `${(split.goalsFor - split.goalsAgainst) > 0 ? '+' : ''}${perGame(split.goalsFor - split.goalsAgainst, split.games)}` : '—'}</td>
                <td>{split.points}</td>
              </tr>
            })}</tbody>
          </table>
        </div>
      </section>

      <footer className="dashboard-footer">
        <span><span className={`source-dot ${status}`} />{status === 'ready' ? 'Fixture schedule connected' : status === 'loading' ? 'Connecting to fixture schedule' : 'Fixture schedule offline'}</span>
        <span>Stats: {statsSource}</span>
        <button onClick={() => inputRef.current?.click()}><CalendarDays size={13} />Replace results export</button>
      </footer>
    </main>
  </div>
}

export default App
