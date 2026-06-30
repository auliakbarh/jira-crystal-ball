# Implementation Plan — JIRA Crystal Ball

## 1. Goal

Build a web dashboard used **during standup meetings**. The meeting lead drives the
session: for the active sprint and the day's date, they go ticket-by-ticket through the
board, capturing each member's update, who is involved (FE/BE/QA), progress, and
blockers. The tool must support multiple squads, simple authentication, light/dark
theming, and a settings area for JIRA credentials, team members, leave, holidays and
sprints.

## 2. Requirements → design decisions

| INIT.md requirement | How it is met |
| --- | --- |
| Pull JIRA board tickets | Global JIRA credentials from server env (`env.jira`); `jira.ts` calls the Agile board issues endpoint (or a JQL override) with Basic auth, scoped to the squad's optional board id. |
| ENV configurable from a menu; popup if unset | Credentials live in the server `.env` (global). Per-squad **Board ID** (optional, may be blank) is set in **Settings → JIRA Board**. The Dashboard shows a blocking modal when env creds are absent (`jiraConfigured` reflects env). **Test connection** calls `/myself`. |
| PostgreSQL | Prisma + PostgreSQL. |
| Apollo GraphQL backend | Apollo Server 4 standalone. |
| Simple auth with a login form | Email/password, bcrypt hash, JWT bearer token; `/login` page. |
| Multi-squad | Every domain entity is scoped by `squadId`; squad switcher in the header and full add/switch/delete management in **Settings → Squads / Teams**. |
| Menus: current sprint, previous sprints, dark/light, settings | React Router routes + theme toggle in the header. A **Board** menu lists the active sprint's tickets (`activeSprintTickets`) pulled live from JIRA. |
| Members with position, leave status, leave range, substitute | `TeamMember` (FE/BE/QA/PM) + `Leave` (range + substitute). Team panel flags who is on leave today. |
| Blocker list (desc, ticket, found/resolved dates, note) | `Blocker` model + Blockers panel. |
| Lead writes updates per ticket in a text area | `StandupEntry.updateText` editable per row. |
| Sprint = number + start + end | `Sprint` model with `number`, `startDate`, `endDate`. |
| Ticket info: key, status, assignee, description, link to JIRA | Pulled live from the board; key links to `/browse/{key}`. |
| Row-per-date dashboard with columns: ticket info, assignee form, update, progress %, blocker note | `StandupEntry` keyed by `(sprint, date, ticketKey)`; the dashboard table renders one row per ticket for the chosen date with exactly those columns. |
| Filling a blocker note syncs the blocker section | `saveStandupEntry` upserts a linked `Blocker` (via `sourceEntryId`); clearing the note auto-resolves it. |

## 3. Architecture

```
┌──────────────┐     GraphQL (HTTP)     ┌──────────────────┐     SQL      ┌────────────┐
│  React SPA   │  ───────────────────▶  │  Apollo Server 4 │  ─────────▶  │ PostgreSQL │
│ Apollo Client│  ◀───────────────────  │   + Prisma ORM   │  ◀─────────  │            │
└──────────────┘                        └────────┬─────────┘              └────────────┘
       ▲                                          │ REST (Basic auth)
       │ JWT in localStorage                      ▼
       │                                  ┌──────────────────┐
       └── login form                     │  JIRA Cloud API  │
                                          └──────────────────┘
```

- **Authentication**: `login` mutation returns a JWT. The client stores it in
  `localStorage` and sends it as `Authorization: Bearer <token>`. The server's context
  decodes it into `userId`; resolvers call `requireAuth`.
- **JIRA fetch**: done server-side so the API token never reaches the browser. The
  dashboard query merges live board tickets with saved entries so untouched tickets
  still appear as rows.

## 4. Data model (Prisma)

`User`, `Squad (name, optional defaultBoardId)`, `TeamMember (Position FE|BE|QA|PM)`,
`Leave (range + substitute)`, `Holiday`, `Sprint (number, start, end)`,
`StandupEntry (sprint+date+ticket cell-set)`, `Blocker (synced from entries)`.
JIRA credentials are not in the DB — they live in the server environment.

Key constraints:
- `StandupEntry @@unique([sprintId, date, ticketKey])` — one cell-set per ticket per day.
- `Sprint @@unique([squadId, number])`.
- `Blocker.sourceEntryId @unique` — links an auto-created blocker back to its entry for sync.

See [DOCUMENTATION.md](DOCUMENTATION.md) for the full schema and the GraphQL API.

## 5. Build phases (as executed)

1. **Scaffold** — npm workspaces monorepo, Docker Postgres, env templates.
2. **Backend** — Prisma schema, auth, JIRA client, GraphQL schema + resolvers, seed.
3. **Frontend** — Apollo client, auth/theme/squad contexts, login, layout, dashboard
   (team + blockers + standup table), previous sprints, settings.
4. **Verify** — typecheck both packages; smoke-test login, sprint create, entry upsert,
   blocker auto-sync and auto-resolve against a live DB.
5. **Document** — this plan + technical docs, usage, deployment, summary.

## 6. Out of scope / future work

- Per-squad user membership & roles (currently any logged-in user sees all squads).
- Encrypting the stored JIRA API token at rest (currently plaintext column — see
  Security notes in DEPLOYMENT.md).
- Real-time multi-user editing (currently save-on-blur with refetch).
- Webhook-based JIRA sync and burndown charts.
