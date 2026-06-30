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
  },
};

/** True when the global JIRA credentials are present in the environment. */
export function hasJiraCreds(): boolean {
  return Boolean(env.jira.baseUrl && env.jira.email && env.jira.apiToken);
}
