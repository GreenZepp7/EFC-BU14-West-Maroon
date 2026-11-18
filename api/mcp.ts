import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { getTeamSeasonStats, getUpcomingMatches, getUpcomingPractices } from "../server/scheduleTools.ts";

const handler = createMcpHandler((server) => {
  server.registerTool(
    "get_upcoming_matches",
    {
      title: "Get Upcoming Matches",
      description: "Fetch upcoming Eastside FC BU14 West Maroon matches and practices.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(20).default(5),
      }),
    },
    async ({ limit }) => {
      const matches = await getUpcomingMatches(limit);
      return {
        content: [{ type: "text", text: JSON.stringify(matches, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_upcoming_practices",
    {
      title: "Get Upcoming Practices",
      description: "Fetch upcoming Eastside FC BU14 West Maroon practices.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(20).default(5),
      }),
    },
    async ({ limit }) => {
      const practices = await getUpcomingPractices(limit);
      return {
        content: [{ type: "text", text: JSON.stringify(practices, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_team_season_stats",
    {
      title: "Get Team Season Stats",
      description: "Return league standings, Eastside results, upcoming fixtures, and the next match's win/draw/loss point scenarios. Use this for standings or match-outcome questions; the stats come from the bundled season snapshot.",
      inputSchema: z.object({}),
    },
    async () => {
      const stats = await getTeamSeasonStats();
      return {
        content: [{ type: "text", text: JSON.stringify(stats, null, 2) }],
      };
    }
  );
});

export { handler as GET, handler as POST };
