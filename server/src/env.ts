import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET", "dev-insecure-secret"),
  port: parseInt(process.env.PORT ?? "4000", 10),
  // JIRA credentials live in the environment (global, not per-squad).
  // Only the board id is per-squad (Squad.defaultBoardId) and is optional.
  jira: {
    baseUrl: process.env.JIRA_BASE_URL ?? "",
    email: process.env.JIRA_EMAIL ?? "",
    apiToken: process.env.JIRA_API_TOKEN ?? "",
    defaultBoardId: process.env.JIRA_DEFAULT_BOARD_ID ?? "",
    jql: process.env.JIRA_JQL ?? "",
    // Story Points custom field id (varies per JIRA site; Cloud default below).
    storyPointsField: process.env.JIRA_STORY_POINTS_FIELD ?? "customfield_10016",
  },
  // Confluence export (same Atlassian site/credentials as JIRA by default).
  confluence: {
    baseUrl: process.env.CONFLUENCE_BASE_URL ?? process.env.JIRA_BASE_URL ?? "",
    spaceKey: process.env.CONFLUENCE_SPACE_KEY ?? "MYHERO",
    parentId: process.env.CONFLUENCE_PARENT_ID ?? "1119092737",
  },
};

/** True when the global JIRA credentials are present in the environment. */
export function hasJiraCreds(): boolean {
  return Boolean(env.jira.baseUrl && env.jira.email && env.jira.apiToken);
}
