export const TEAM_NAME = 'Eastside FC - BU14 West Maroon'

function normalizeTeamName(name: string) {
  return name.toLowerCase().replace(/\./g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

export function isTeamName(name: string) {
  return normalizeTeamName(name) === normalizeTeamName(TEAM_NAME)
}

export function mentionsTeam(text: string) {
  return normalizeTeamName(text).includes(normalizeTeamName(TEAM_NAME))
}
