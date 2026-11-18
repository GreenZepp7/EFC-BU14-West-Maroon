import { google } from "@ai-sdk/google";
import { convertToModelMessages, stepCountIs, streamText, tool, validateUIMessages } from "ai";
import { z } from "zod";
import { getTeamSeasonStats, getUpcomingMatches, getUpcomingPractices } from "../server/scheduleTools.ts";

const requestSchema = z.object({
  messages: z.array(z.unknown()).min(1),
});

function jsonResponse(status: number, error: string) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return jsonResponse(503, "Chat is unavailable because GOOGLE_GENERATIVE_AI_API_KEY is not configured.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, "The request body must be valid JSON.");
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(400, "The request must include at least one chat message.");
  }

  let messages;
  try {
    messages = await validateUIMessages({ messages: parsed.data.messages });
  } catch {
    return jsonResponse(400, "The request contains invalid chat messages.");
  }

  try {
    const result = streamText({
      model: google("gemini-4-hydrogen"),
      system: "You are the Eastside FC BU14 West Maroon team assistant. Answer questions about upcoming matches and practices using the available schedule tools. Use get_team_season_stats and get_upcoming_matches for standings and win/draw/loss scenarios. Distinguish point totals from clinching: do not claim a result guarantees a position unless remaining league fixtures and tiebreak rules prove it. The stats tool uses a bundled snapshot that may be stale. If data is unavailable, say so clearly. Format replies with concise Markdown headings, lists, and tables where they improve readability; never output raw HTML.",
      messages: await convertToModelMessages(messages),
      tools: {
        get_upcoming_matches: tool({
          description: "Fetch upcoming Eastside FC BU14 West Maroon matches.",
          inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(5) }),
          execute: ({ limit }) => getUpcomingMatches(limit),
        }),
        get_upcoming_practices: tool({
          description: "Fetch upcoming Eastside FC BU14 West Maroon practices.",
          inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(5) }),
          execute: ({ limit }) => getUpcomingPractices(limit),
        }),
        get_team_season_stats: tool({
          description: "Return league standings, Eastside results, remaining fixtures, and the next match's win/draw/loss point scenarios. Use this for standings or match-outcome questions; the stats come from the bundled season snapshot.",
          inputSchema: z.object({}),
          execute: () => getTeamSeasonStats(),
        }),
      },
      stopWhen: stepCountIs(5),
      abortSignal: request.signal,
    });

    return result.toUIMessageStreamResponse({
      onError: () => "Gemini could not complete the request. Check the API key and free-tier quota.",
    });
  } catch (error) {
    console.error("Chat request failed:", error);
    return jsonResponse(502, "The chat service could not reach the schedule assistant.");
  }
}
