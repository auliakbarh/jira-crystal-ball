# Technical Documentation

## Repository layout

```
jira-crystal-ball/
├── docker-compose.yml         # PostgreSQL 16
├── package.json               # npm workspaces + dev/build/setup scripts
├── server/                    # Apollo GraphQL backend
│   ├── prisma/schema.prisma   # data model
│   └── src/
│       ├── index.ts           # Apollo standalone bootstrap
│       ├── env.ts             # env loading/validation
│       ├── db.ts              # Prisma client singleton
│       ├── auth.ts            # bcrypt + JWT helpers
│       ├── jira.ts            # JIRA Cloud REST client
│       ├── context.ts         # request context + requireAuth
│       ├── schema.ts          # GraphQL typeDefs
│       ├── resolvers.ts       # all resolvers + Date scalar + blocker sync
│       └── seed.ts            # seeds admin user + default squads (Athens/Berlin/Cairo)
└── client/                    # React + Vite frontend
    └── src/
        ├── apollo.ts          # Apollo Client + auth link
        ├── graphql.ts         # all queries/mutations
        ├── context/           # Auth, Theme, Squad providers
        ├── components/        # Layout, Modal, JiraConfigForm, panels, StandupTable/Row
        ├── pages/             # Login, Dashboard, Board, PreviousSprints, Settings
        └── lib/helpers.ts     # date + status/position color helpers
```

## Data model

| Model | Key fields | Notes |
| --- | --- | --- |
| `User` | email (unique), name, passwordHash, isAdmin | login credentials |
| `Squad` | name (unique), defaultBoardId?, spFieldDefault/FE/BE/QA? | tenant boundary; board id + per-role Story-Point field config (id or name) |
| `TeamMember` | name, position `FE\|BE\|QA\|PM`, jiraAccountId? | belongs to squad |
| `Leave` | type `CUTI\|SAKIT\|IZIN`, startDate, endDate, substituteId?, note? | member ↔ substitute (both TeamMember) |
| `Holiday` | date, name | unique per (squad, date) |
| `Sprint` | number, name?, startDate, endDate, confluencePageId/Url/ExportedAt? | unique per (squad, number); Confluence export marker |
| `StandupEntry` | date, ticketKey, ticket snapshot (status/summary/type/storyPoints/epic/parent/carry-over), feAssignee/beAssignee/qaAssignee, feProgress/beProgress/qaProgress, updateText, progress, blockerNote | unique per (sprint, date, ticketKey) |
| `Blocker` | description, jiraTicket?, foundDate, resolvedDate?, note?, resolveNote?, sourceEntryId? | sourceEntryId links to the StandupEntry that created it |
| `ActivityLog` | actor, ticketKey?, message, prevText?, newText?, createdAt | standup update log per squad (note before→after) |
| `StandupSession` | sprintId (unique), leadName, leadKey, lastSeen | live standup lock (heartbeat) |
| `StandupLog` | squadId, leadName, startedAt, endedAt, durationSec | completed standup duration log |
| `ExportLog` | sprintId, squadId, pageId, url, action, actor?, createdAt | Confluence export history |

### Blocker sync rules (in `saveStandupEntry`)

1. Save (upsert) the standup entry for `(sprint, date, ticketKey)`.
2. If `blockerNote` is **non-empty**:
   - linked blocker exists → update its description/ticket;
   - none exists → create one with `foundDate = entry date`, `sourceEntryId = entry.id`.
3. If `blockerNote` is **cleared** and a linked unresolved blocker exists →
   set `resolvedDate = entry date`.

Blockers can also be created/edited/resolved directly in the Blockers panel; those are
independent of any entry.

## GraphQL API

Endpoint: `http://localhost:4000/graphql` (also served at `/` for back-compat).
Subscriptions run over WebSocket at `ws://localhost:4000/graphql` (token sent via
`connectionParams.authorization`). The server is Express + `@apollo/server/express4` +
`graphql-ws`/`ws`. All operations except `login`/`guestLogin` require
`Authorization: Bearer <token>`.

**Subscriptions:** `standupChanged(sprintId)` → `{ sprintId, kind }` fires on
`start`/`end`/`entry`; the dashboard refetches live (no polling).

### Queries

| Query | Args | Returns |
| --- | --- | --- |
| `health` | — | **unauthenticated** status: `{ ok, database, jira, time }` (used by the `/health` page) |
| `me` | — | current `User` or null |
| `jiraEnv` | — | global JIRA env status: `{ configured, baseUrl, email, defaultBoardId }` (no secrets) |
| `squads` | — | `[Squad]` |
| `squad` | `id` | `Squad` (with members, holidays, sprints) |
| `sprints` | `squadId` | `[Sprint]` desc by number |
| `currentSprint` | `squadId` | active sprint (today in range) or latest |
| `boardTickets` | `squadId` | all live board `[JiraTicket]` from JIRA |
| `activeSprintTickets` | `squadId` | board's **active sprint** `[JiraTicket]` only |
| `jiraActiveSprint` | `squadId` | live active-sprint info from JIRA: `{ id, number, name, startDate, endDate }` (number parsed from the sprint name) |
| `standupEntries` | `sprintId` | `[StandupEntry]` |
| `dashboard` | `sprintId`, `date?` | `[DashboardRow]` — the board's **active-sprint** tickets (statuses match the board) merged with saved entries |
| `blockers` | `squadId`, `includeResolved?` | `[Blocker]` |
| `activityLog` | `squadId`, `limit?`, `offset?`, `search?` | paginated/searchable update log |
| `activeStandup` | `sprintId`, `leadKey?` | live standup lock `{ leadName, active, isMine, startedAt }` or null |
| `standupLogs` | `squadId`, `limit?`, `offset?` | completed standup duration log (paginated) |
| `exportHistory` | `sprintId` | Confluence export history `[ExportLog]` |
| `jiraFields` | `squadId` | all board JIRA fields `{ id, name }` (for picking the SP field) |

### Mutations

`login`, `guestLogin`, `createSquad`, `updateSquad` (name/board id/SP fields),
`deleteSquad`, `testJiraConfig`, `addMember`, `updateMember`, `deleteMember`, `addLeave`,
`deleteLeave`, `addHoliday`, `deleteHoliday`, `createSprint`, `updateSprint`,
`deleteSprint`, `syncActiveSprint`, `saveStandupEntry`, `upsertBlocker`, `deleteBlocker`,
`resetDatabase`, `startStandup`, `standupHeartbeat`, `endStandup`,
`exportSprintToConfluence`.

**Subscription:** `standupChanged(sprintId)` → `{ sprintId, kind }`.

**Standup session lock** (`StandupSession`, one per sprint): `startStandup(sprintId,
leadName, leadKey)` claims the lock; the client sends a `standupHeartbeat` every ~20s and
`endStandup` on close (also `navigator.sendBeacon` on `beforeunload`). A session is "live"
while its `lastSeen` is within 45s — once stale, anyone may take over. `saveStandupEntry`
takes an optional `leadKey`; if a live session leads the sprint, only its holder (matching
leadKey) or an **admin** may edit. The lead key is a per-tab `sessionStorage` UUID
(`lib/leadKey.ts`), so closing the tab drops it.

Notes:
- **JIRA credentials are global**, read from the server environment
  (`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, optional `JIRA_DEFAULT_BOARD_ID`,
  `JIRA_JQL`). There is no per-squad credential storage.
- `updateSquad(id, name?, defaultBoardId?)` sets a squad's name and/or its **optional**
  board id (admins edit these per squad in Settings). Empty `defaultBoardId` clears it.
- `syncActiveSprint(squadId)` pulls the board's active sprint from JIRA and upserts it as
  a local `Sprint` (keyed by squad + parsed number), returning it. The dashboard calls
  this automatically on first load when no local sprint exists, and via **↻ Sync from JIRA**.
- `testJiraConfig` (no args) calls JIRA `/myself` using the env credentials and returns
  the connected display name; throws `JIRA_NOT_CONFIGURED` if env creds are absent.
- `deleteSquad(id)` removes a squad and cascades its members, leaves, holidays, sprints,
  standup entries and blockers.
- `guestLogin(name)` — issues a JWT for a guest identity (`userId: "guest"`, no DB user,
  `isAdmin: false`, `isGuest: true`). Guests can run standup but are blocked from
  admin/management actions (`requireAdmin` fails; client hides Settings and routes
  `/settings` away). `me` returns null for a guest token.
- `resetDatabase(reseedDefaults?)` — **admin only** (`requireAdmin`). Deletes all squads
  (cascading every related record); users are preserved. With `reseedDefaults: true` it
  recreates the Athens/Berlin/Cairo squads. Exposed in the UI as **Settings → Danger
  Zone** (admin only, type-to-confirm).
- The `Date` scalar is serialized as `YYYY-MM-DD` (calendar dates, UTC-midnight parsed).

### Example

```graphql
mutation {
  login(email: "admin@example.com", password: "admin123") {
    token
    user { name }
  }
}
```

```graphql
mutation Save($i: StandupEntryInput!) {
  saveStandupEntry(input: $i) { id progress blockerNote }
}
# variables:
# { "i": { "sprintId": "...", "date": "2026-06-29", "ticketKey": "ABC-1",
#          "updateText": "merged PR", "progress": 80, "blockerNote": "" } }
```

## JIRA integration

Credentials come from the server environment (`env.jira` in `server/src/env.ts`;
`hasJiraCreds()` reports presence). Resolvers build a per-request config with
`jiraCfgForBoard(squadBoardId)` = env credentials + the squad's board id (or
`JIRA_DEFAULT_BOARD_ID`). Board id is optional — ticket queries return `[]` when none is
resolvable.

`server/src/jira.ts`:
- Auth: HTTP Basic, `base64(email:apiToken)`.
- `fetchBoardIssues(cfg)` → `GET /rest/agile/1.0/board/{boardId}/issue?fields=summary,status,assignee`
  unless a `jql` override is set, in which case `GET /rest/api/3/search?jql=...`.
- `fetchActiveSprintInfo(cfg)` → first active sprint's `{ id, number, name, startDate,
  endDate }` (number parsed: prefers the digits after "Sprint", else the last number).
- `fetchActiveSprintIssues(cfg)` → resolves active sprint ids via
  `GET /rest/agile/1.0/board/{boardId}/sprint?state=active`, then fetches
  `GET /rest/agile/1.0/board/{boardId}/sprint/{sprintId}/issue` for each (deduped,
  **paginated** via `startAt` so large sprints aren't truncated at 100). Board-scoped, so
  it won't leak other projects' open sprints. Returns `[]` when the board has no active
  sprint (e.g. Kanban boards). The **dashboard** uses this too, so the standup table
  reflects the board's active sprint with all real statuses (To Do / In Progress / …).
- `testConnection(cfg)` → `GET /rest/api/3/myself`.
- Each issue maps to `{ key, status, assignee, summary, url, priority, issueType,
  epic*/parent*, storyPoints, storyPointsFE/BE/QA, carryOver(+count/sprints) }`.

Create the API token at **id.atlassian.com → Security → API tokens** and put it in
`JIRA_API_TOKEN`. The **Board ID** is per-squad (`Squad.defaultBoardId`, optional): the
number in the board URL (`…/boards/<boardId>`). A **project key** (e.g. `ATH`) is also
accepted — `resolveBoardId` looks it up to the project's first board via
`GET /rest/agile/1.0/board?projectKeyOrId=...`.

JIRA responses are cached in-process for 60s (`force` bypasses; Board "Refresh" and
"Sync from JIRA" force).

### Story Points
Per squad you configure four Story-Point fields (default + FE + BE + QA) in
**Settings → Squads → Edit** — each value is a **custom field id** (`customfield_10033`)
or a **field name** (resolved to id via `GET /rest/api/3/field`; use the id when several
fields share a name). `jiraFields(squadId)` lists every board field for the picker.
`JIRA_STORY_POINTS_FIELD` is the global default when a squad has none. Per-member SP =
the role field's value attributed to that role's standup assignee (fallback default).
**carry-over** comes from `fields.closedSprints` (count + sprint names).

### Confluence export
`server/src/confluence.ts` (v2 REST, same Atlassian credentials). `exportSprintToConfluence`
builds a storage-format page: heading, summary metrics table (units + caption), proportional
**progress bar** with a status legend, **man-power** roster (per-member SP + leave), and a
**tickets table** grouped by parent — native Jira issue macros, status lozenges, SP labels,
a No. column. First export **creates** a page (`<Squad> - Sprint (<name>)`, timestamp
appended only on title clash); re-export **updates** the same page (version bump). Each run
is recorded in `ExportLog`; the marker (`Sprint.confluence*`) shows "✓ on Confluence". A
**scheduler** (`server/src/scheduler.ts`) auto-exports a sprint hourly once its end date
passes. Env: `CONFLUENCE_BASE_URL` (blank → JIRA), `CONFLUENCE_SPACE_KEY`,
`CONFLUENCE_PARENT_ID`.

## Frontend notes

- **Auth/Theme/Squad** are React contexts persisted to `localStorage`
  (`jcb_token`, `jcb_user`, `jcb_theme`, `jcb_squad`).
- The squad switcher and "new squad" input live in `Layout`. **Settings** also has a
  full **Squads / Teams** section (add, switch, delete with cascade). Theme toggles the
  `dark` class on `<html>` (Tailwind `darkMode: "class"`).
- **Board** page (`/board`) and the **Current Sprint** standup table both have a
  client-side **status filter** (chips) that hides Done/Archived by default
  (`hiddenByDefaultStatus` in `lib/helpers`).
- **Previous Sprints** page (read-only) groups `standupEntries` by ticket, optionally by
  Epic or Parent/Story, and renders per-ticket cards with assignees, a
  **progress line chart** (inline SVG, y=progress × x=date), an **update-log** row list,
  and a **blocker** row list. Grouping uses the epic/parent **snapshot** stored on each
  `StandupEntry` at save time (`epicKey/epicName/parentKey/parentName`), so it works for
  historical sprints too. A **Sprint Summary** header shows average progress, done vs
  carry-over, a JIRA status distribution bar (`statusBucket`), blocker counts, and the
  sprint day breakdown (`dayBreakdown`: total/working/weekend/holiday), and a **team
  status** block (Available/Cuti/Sakit/Izin counts + per-member working-days-away with the
  Cuti substitute). Ticket keys link to JIRA via the env base URL (`jiraEnv.baseUrl`).
- **Carry-over** comes straight from JIRA `fields.closedSprints`: `carryOver` (bool),
  `carryOverCount` (how many completed sprints it rolled through) and `carryOverSprints`
  (their names). Current Sprint shows a ↪×N icon (tooltip lists the sprints); the count +
  names are snapshotted onto `StandupEntry` (`carryOverCount/carryOverFrom`) so Previous
  Sprints can show them historically.
- `JiraConfigForm` (Settings → JIRA Board, and the Dashboard popup) shows the global env
  credential status (via `jiraEnv`), lets a squad set/clear its optional board id
  (`updateSquad`), and **Test**s the env connection.
- Each `saveStandupEntry` writes an `ActivityLog` row (actor = the JWT's `name`, which
  `login`/`guestLogin` now embed). The Current Sprint screen shows these in the
  **Update Log** panel (`ActivityPanel`), refreshed when a row is saved.
- Loading states use shimmer skeletons (`components/Skeleton.tsx`, `.shimmer` CSS) in the
  standup table, team panel and update log.
- Progress can be set with **either** the slider or a number input (0–100) per row.
- The standup table can **group rows by Epic or Parent/Story** and shows each ticket's
  **priority** chip (`JiraTicket.priority/epicKey/epicName/parentKey/parentType/issueType`,
  fetched from JIRA). Assignee inputs (FE/BE/QA) offer **datalist suggestions** from the
  squad's members of that role.
- The Current Sprint screen also shows a **Standup Lead rotation** (`computeLeadSchedule`:
  one member per working day; **Cuti** excludes a member, **Sakit/Izin** is covered by the
  leave's substitute or next available member while the skipped member leads the next
  standup), a **Sprint Timeline** of day blocks (date + weekday,
  elapsed/today/weekend-holiday), and lets anyone (incl. guests) set a member's
  **leave status** (Cuti/Sakit/Izin + range + substitute) from the Team panel.
- `/health` is a public status page; `/health`, `/login`, `/guest` are unauthenticated.
  Unknown routes render a 404 page.
- `StandupRow` keeps local field state and **saves on blur** (and via an explicit Save
  button), then refetches the dashboard + blockers so the Blockers panel updates live.
- The JIRA-not-configured modal renders on the Dashboard when `squad.jiraConfigured` is
  false and the user hasn't dismissed it.
