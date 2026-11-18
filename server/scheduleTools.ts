import ICAL from "ical.js";
import { getCalendar } from "../calendarFeed.mjs";
import { getPracticeCalendar } from "../practiceCalendarFeed.mjs";
import { seasonSnapshot } from "../src/seasonSnapshot.ts";
import { isTeamName, TEAM_NAME } from "../src/team.ts";

type ScheduleEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  location: string;
  description: string;
  url: string;
};

function parseSchedule(source: string): ScheduleEvent[] {
  const parsed = ICAL.parse(source);
  const calendar = new ICAL.Component(parsed);

  return calendar.getAllSubcomponents("vevent").flatMap((component, index) => {
    try {
      const event = new ICAL.Event(component);
      if (!event.startDate) return [];

      const start = event.startDate.toJSDate();
      const end = event.endDate?.toJSDate() ?? new Date(start.getTime() + 60 * 60 * 1000);
      const description = String(component.getFirstPropertyValue("description") ?? "");
      const location = String(component.getFirstPropertyValue("location") ?? "");
      const url = String(component.getFirstPropertyValue("url") ?? "");
      const id = String(component.getFirstPropertyValue("uid") ?? `${start.toISOString()}-${index}`);
      const title = event.summary?.trim() || "Eastside FC team event";

      return [{ id, title, start: start.toISOString(), end: end.toISOString(), location, description, url }];
    } catch {
      return [];
    }
  }).sort((a, b) => a.start.localeCompare(b.start));
}

async function fetchEastsideSchedule(limit: number, kind: "matches" | "practices") {
  const source = kind === "matches" ? await getCalendar() : await getPracticeCalendar();
  const now = Date.now();
  const events = parseSchedule(source).filter((event) => new Date(event.end).getTime() >= now);

  if (kind === "matches") {
    return events
      .filter((event) => /\b(vs\.?|v\.?|at)\b/i.test(`${event.title} ${event.description}`))
      .slice(0, limit);
  }

  return events.slice(0, limit);
}

function getGameId(event: ScheduleEvent) {
  return event.description.match(/Game#:\s*(\d+)/i)?.[1];
}

export async function getUpcomingMatches(limit: number) {
  return fetchEastsideSchedule(limit, "matches");
}

export async function getUpcomingPractices(limit: number) {
  return fetchEastsideSchedule(limit, "practices");
}

export async function getTeamSeasonStats() {
  const teamStanding = seasonSnapshot.standings.find((standing) => isTeamName(standing.team));
  if (!teamStanding) throw new Error(`The season snapshot does not contain ${TEAM_NAME}.`);

  const scheduledMatches = await fetchEastsideSchedule(20, "matches");
  const eventsByGameId = new Map(
    scheduledMatches.flatMap((event) => {
      const gameId = getGameId(event);
      return gameId ? [[gameId, event] as const] : [];
    }),
  );
  const standingsByTeam = new Map(seasonSnapshot.standings.map((standing) => [standing.team, standing]));
  const remainingFixtures = seasonSnapshot.games
    .filter((game) => game.homeScore === null || game.awayScore === null)
    .map((game) => {
      const event = eventsByGameId.get(game.gameId);
      const opponent = isTeamName(game.home) ? game.away : game.home;
      const opponentStanding = standingsByTeam.get(opponent);
      return {
        gameId: game.gameId,
        opponent,
        homeAway: isTeamName(game.home) ? "home" : "away",
        start: event?.start ?? null,
        location: event?.location || game.venue,
        opponentRank: opponentStanding?.rank ?? null,
        opponentPoints: opponentStanding?.points ?? null,
      };
    })
    .sort((a, b) => {
      if (a.start && b.start) return a.start.localeCompare(b.start);
      if (a.start) return -1;
      if (b.start) return 1;
      return 0;
    });

  const nextGame = remainingFixtures.find((fixture) => fixture.start) ?? null;
  const playedPoints = teamStanding.pointsByRound.filter((points) => points !== null);
  const completedGames = seasonSnapshot.games.filter(
    (game) => game.homeScore !== null && game.awayScore !== null,
  );
  const teamResults = completedGames.flatMap((game) => {
    if (game.homeScore === null || game.awayScore === null) return [];
    const isHome = isTeamName(game.home);
    const goalsFor = isHome ? game.homeScore : game.awayScore;
    const goalsAgainst = isHome ? game.awayScore : game.homeScore;
    return [{
      opponent: isHome ? game.away : game.home,
      result: goalsFor > goalsAgainst ? "win" : goalsFor < goalsAgainst ? "loss" : "draw",
      score: `${goalsFor}-${goalsAgainst}`,
    }];
  });

  return {
    source: "Bundled season snapshot; dashboard-only uploaded results are not shared with this MCP server.",
    team: {
      name: TEAM_NAME,
      rank: teamStanding.rank,
      points: teamStanding.points,
      goalDifference: teamStanding.goalDifference,
      goalsFor: teamStanding.goalsFor,
      goalsAgainst: teamStanding.goalsAgainst,
      record: {
        played: playedPoints.length,
        wins: playedPoints.filter((points) => points === 3).length,
        draws: playedPoints.filter((points) => points === 1).length,
        losses: playedPoints.filter((points) => points === 0).length,
      },
      results: teamResults,
    },
    standings: seasonSnapshot.standings.map((standing) => ({
      rank: standing.rank,
      team: standing.team,
      points: standing.points,
      goalDifference: standing.goalDifference,
      goalsFor: standing.goalsFor,
      goalsAgainst: standing.goalsAgainst,
      wins: standing.wins,
    })),
    nextGame: nextGame
      ? {
          ...nextGame,
          pointsIfWin: teamStanding.points + 3,
          pointsIfDraw: teamStanding.points + 1,
          pointsIfLoss: teamStanding.points,
        }
      : null,
    remainingFixtures,
    caveat: "A draw or win's effect on final placement depends on other teams' remaining matches and league tiebreak rules; those are not included in this snapshot.",
  };
}
