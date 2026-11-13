import type { ResultsSnapshot } from './results'
import { TEAM_NAME } from './team'

export const seasonSnapshot: ResultsSnapshot = {
  standings: [
    { rank: 1, group: 'A8', team: 'Cascade FC B12 Green', pointsByRound: [3, 3, 3, 3, 3, 0, 3], points: 18, goalDifference: 19, goalsFor: 25, goalsAgainst: 6, wins: 6, shutouts: 4 },
    { rank: 2, group: 'A1', team: TEAM_NAME, pointsByRound: [1, 3, 3, 3, 3, 3, 1], points: 17, goalDifference: 15, goalsFor: 22, goalsAgainst: 7, wins: 5, shutouts: 3 },
    { rank: 3, group: 'A6', team: 'XF U14 B12-13 RCL 1', pointsByRound: [3, 0, 3, 1, 3, 3], points: 13, goalDifference: 10, goalsFor: 14, goalsAgainst: 4, wins: 4, shutouts: 3 },
    { rank: 4, group: 'A4', team: 'Whatcom FC Rangers BU 14 Silver', pointsByRound: [0, 0, 0, 1, 3, 3, 0, 3, 3], points: 13, goalDifference: 2, goalsFor: 15, goalsAgainst: 13, wins: 4, shutouts: 3 },
    { rank: 5, group: 'A2', team: 'Sound FC BU14B', pointsByRound: [1, 3, 1, 3, 1, 3], points: 12, goalDifference: 16, goalsFor: 20, goalsAgainst: 4, wins: 3, shutouts: 2 },
    { rank: 6, group: 'A9', team: 'SOZO FC BU14 ROYAL', pointsByRound: [0, 3, 0, 3, 3, 0, 1, 1, 0], points: 11, goalDifference: -1, goalsFor: 15, goalsAgainst: 16, wins: 3, shutouts: 3 },
    { rank: 7, group: 'A3', team: 'Washington Rush BU14 Nero', pointsByRound: [3, 0, 0, 0, 3, 0, 3, 0], points: 9, goalDifference: 2, goalsFor: 18, goalsAgainst: 16, wins: 3, shutouts: 2 },
    { rank: 8, group: 'A7', team: 'Sound FC BU14C', pointsByRound: [3, 0, 0, 0, 0, 0, 0, 0], points: 3, goalDifference: -26, goalsFor: 2, goalsAgainst: 28, wins: 1, shutouts: 1 },
    { rank: 9, group: 'A5', team: 'NW United BU14 Wht', pointsByRound: [0, 0, 0, 0, 0, 0, 0, 1], points: 1, goalDifference: -37, goalsFor: 4, goalsAgainst: 41, wins: 0, shutouts: 0 },
  ],
  games: [
    { gameId: '721487', home: TEAM_NAME, away: 'Sound FC BU14B', homeScore: 2, awayScore: 2, venue: 'Preston Park', time: '02:30 PM', field: '3' },
    { gameId: '721491', home: 'Washington Rush BU14 Nero', away: TEAM_NAME, homeScore: 2, awayScore: 4, venue: 'Tambark Park', time: '04:00 PM', field: '1' },
    { gameId: '721495', home: TEAM_NAME, away: 'Whatcom FC Rangers BU 14 Silver', homeScore: 3, awayScore: 0, venue: 'Preston Park', time: '03:00 PM', field: '2' },
    { gameId: '721499', home: 'NW United BU14 Wht', away: TEAM_NAME, homeScore: 2, awayScore: 5, venue: 'Skagit River Park', time: '05:00 PM', field: '12' },
    { gameId: '721507', home: 'Sound FC BU14C', away: TEAM_NAME, homeScore: 0, awayScore: 4, venue: 'North Creek 1', time: '04:30 PM', field: '1' },
    { gameId: '721511', home: TEAM_NAME, away: 'Cascade FC B12 Green', homeScore: 3, awayScore: 0, venue: 'South Mercer Playfield', time: '11:00 AM', field: '3 EB' },
    { gameId: '721515', home: 'SOZO FC BU14 ROYAL', away: TEAM_NAME, homeScore: 1, awayScore: 1, venue: 'Sozo Sports Complex', time: '11:00 AM', field: '1' },
    { gameId: '721527', home: TEAM_NAME, away: 'Washington Rush BU14 Nero', homeScore: null, awayScore: null, venue: 'South Mercer Playfield', time: '10:30 AM', field: '1' },
    { gameId: '721531', home: 'Whatcom FC Rangers BU 14 Silver', away: TEAM_NAME, homeScore: null, awayScore: null, venue: 'Virtual TBD', time: '--', field: '--' },
    { gameId: '721523', home: 'Sound FC BU14B', away: TEAM_NAME, homeScore: null, awayScore: null, venue: 'North Creek 4', time: '10:30 AM', field: '4' },
    { gameId: '721535', home: TEAM_NAME, away: 'NW United BU14 Wht', homeScore: null, awayScore: null, venue: 'Virtual TBD', time: '--', field: '--' },
    { gameId: '721539', home: 'XF U14 B12-13 RCL 1', away: TEAM_NAME, homeScore: null, awayScore: null, venue: 'Virtual TBD', time: '--', field: '--' },
    { gameId: '721543', home: TEAM_NAME, away: 'Sound FC BU14C', homeScore: null, awayScore: null, venue: 'Virtual TBD', time: '--', field: '--' },
    { gameId: '721547', home: 'Cascade FC B12 Green', away: TEAM_NAME, homeScore: null, awayScore: null, venue: 'Virtual TBD', time: '--', field: '--' },
    { gameId: '721503', home: TEAM_NAME, away: 'XF U14 B12-13 RCL 1', homeScore: null, awayScore: null, venue: 'South Mercer Playfield', time: '01:00 AM', field: '1' },
    { gameId: '721551', home: TEAM_NAME, away: 'SOZO FC BU14 ROYAL', homeScore: null, awayScore: null, venue: 'Virtual TBD', time: '--', field: '--' },
    { gameId: '721559', home: TEAM_NAME, away: 'Sound FC BU14B', homeScore: null, awayScore: null, venue: 'Virtual TBD', time: '--', field: '--' },
    { gameId: '721563', home: 'Washington Rush BU14 Nero', away: TEAM_NAME, homeScore: null, awayScore: null, venue: 'Virtual TBD', time: '--', field: '--' },
  ],
}
