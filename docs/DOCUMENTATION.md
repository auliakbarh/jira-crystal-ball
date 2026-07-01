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
│       ├── crypto.ts          # AES-256-GCM secret encrypt/decrypt (JIRA token at rest)
│       ├── encryptToken.ts    # CLI: encrypt the JIRA token (npm run token:encrypt)
│       ├── jira.ts            # JIRA Cloud REST client (paginated board/sprint fetch)
│       ├── context.ts         # request context + requireAuth/requireAdmin/requireSuperAdmin
│       ├── schema.ts          # GraphQL typeDefs
│       ├── scheduler.ts       # hourly: Confluence auto-export + tarot/log retention purge
│       ├── pubsub.ts          # in-memory PubSub (standup + tarot topics)
│       ├── resolvers/         # per-domain: squad, standup, confluence, tarot, admin, velocity, shared, index
│       ├── seed.ts            # seeds admin user + default squads (Athens/Berlin/Cairo)
│       └── seed-config.ts     # bulk-seeds squads + members from a JSON file (idempotent)
└── client/                    # React + Vite frontend
    ├── public/sounds/         # tarot WAV sounds (join/select/reveal)
    └── src/
        ├── apollo.ts          # Apollo Client + auth/WS split link
        ├── i18n.ts            # i18next setup (EN/ID) + language switcher helper
        ├── graphql.ts         # all queries/mutations/subscriptions
        ├── context/           # Auth, Theme, Squad providers
        ├── components/        # Layout, Modal, panels, StandupTable/Row, tarot/*
        ├── pages/             # Login, Dashboard, Board, Clairvoyance, Tarot, TarotRoom, PreviousSprints, Velocity, Settings
        └── lib/               # helpers.ts, tarot.ts (uid + card meta), sound.ts
```

## Data model

| Model | Key fields | Notes |
| --- | --- | --- |
| `User` | email (unique), name, passwordHash, isAdmin | login credentials |
| `Squad` | name (unique), defaultBoardId?, spFieldDefault/FE/BE/QA? | tenant boundary; board id + per-role Story-Point field config (id or name) |
| `TeamMember` | name, fullName?, position `FE\|BE\|QA\|PM\|FULLSTACK\|ALL`, jiraAccountId? | belongs to squad; `name` = short label, `fullName` = optional full name; `FULLSTACK` = assignable to FE+BE, `ALL` = assignable to FE+BE+QA |
| `Leave` | type `CUTI\|SAKIT\|IZIN`, startDate, endDate, substituteId?, note? | member ↔ substitute (both TeamMember) |
| `Holiday` | date, name | unique per (squad, date) |
| `Sprint` | number, name?, startDate, endDate, confluencePageId/Url/ExportedAt? | unique per (squad, number); Confluence export marker |
| `StandupEntry` | date, ticketKey, ticket snapshot (status/summary/type/storyPoints/epic/parent/carry-over), feAssignee/beAssignee/qaAssignee, feProgress/beProgress/qaProgress, updateText, progress, blockerNote | unique per (sprint, date, ticketKey) |
| `Blocker` | description, jiraTicket?, foundDate, resolvedDate?, note?, resolveNote?, sourceEntryId? | sourceEntryId links to the StandupEntry that created it |
| `ActivityLog` | actor, ticketKey?, message, prevText?, newText?, createdAt | standup update log per squad (note before→after) |
| `StandupSession` | sprintId (unique), leadName, leadKey, lastSeen | live standup lock (heartbeat) |
| `StandupLog` | squadId, leadName, startedAt, endedAt, durationSec | completed standup duration log |
| `ExportLog` | sprintId, squadId, pageId, url, action, actor?, createdAt | Confluence export history |
| `TarotRoom` | squadId, hostName, hostKey, status `ACTIVE\|ENDED`, scaleType `FIBONACCI\|SCRUM\|CUSTOM`, scaleValues (JSON nums), currentRoundId?, sprintName?, endedAt? | one ACTIVE room per squad; `hostKey` = client token (host may be a guest) |
| `TarotParticipant` | roomId, name, key, isHost, joinedAt, lastSeen, leftAt?, kicked | attendance log + live presence (online = recent `lastSeen`); unique per (roomId, key) |
| `TarotRound` | roomId, ticketKey + snapshot, status `VOTING\|REVEALED\|DECIDED`, cycle | one voting cycle per ticket; re-vote ("next cycle") creates a new round |
| `TarotVote` | roundId, participantId, participantName, value, confirmed | unique per (round, participant); `value` = number-as-string or `?`/`coffee` |
| `TarotResult` | roomId, ticketKey, effort, pointFE/BE/QA?, decidedAt, jiraPrevValues?, syncedAt? | decided point history; `jiraPrevValues` snapshots Jira fields before sync (reset restores) |

Squad also carries `tarotScaleType?` / `tarotScaleValues?` — the per-squad default deck a
host can set via the room scale dialog ("set as default").

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
`graphql-ws`/`ws`. All operations except `login`/`guestLogin`/`memberSuggestions` require
`Authorization: Bearer <token>`.

**Pub/sub backend** (`pubsub.ts`): in-memory `graphql-subscriptions` by default (single
process). Set `REDIS_URL` to use `graphql-redis-subscriptions` (+ `ioredis`) so events fan
out across **multiple instances** — required for horizontal scaling. Note: the presence
sweep runs per-instance, so with N nodes an offline transition may publish up to N times
(clients just refetch; harmless).

**Subscriptions:** `standupChanged(sprintId)` → `{ sprintId, kind }` fires on
`start`/`end`/`entry`; the dashboard refetches live (no polling). `tarotRoomChanged(roomId)`
→ `{ roomId, kind, actor }` fires on every Tarot room change (see below).

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
| `jiraUsers` | `squadId` | human JIRA users `{ accountId, displayName, email }` (for the member account-id picker; needs *Browse users* permission) |
| `memberSuggestions` | — | **public** (no auth) distinct member names `{ name, fullName }` for the guest-login name suggestion |
| `nextSprintTickets` | `squadId`, `refresh?` | board's **next (future) sprint** `[JiraTicket]` — powers Clairvoyance + Tarot |
| `jiraNextSprint` | `squadId` | live next-sprint info `{ id, number, name, startDate, endDate }` |
| `tarotRooms` | `squadId` | `[TarotRoomSummary]` (id, hostName, status, participantCount), newest first |
| `tarotRoom` | `id`, `key?` | full `TarotRoom` (participants, currentRound w/ vote stats, results); `key` sets `isHost`/`viewerKicked` |
| `tarotTickets` | `roomId`, `refresh?` | next-sprint `[TarotTicket]` (ticket + its decided `result`, if any) |

### Mutations

`login`, `guestLogin`, `createSquad`, `updateSquad` (name/board id/SP fields),
`deleteSquad`, `testJiraConfig`, `addMember`, `updateMember`, `deleteMember`, `addLeave`,
`deleteLeave`, `addHoliday`, `deleteHoliday`, `createSprint`, `updateSprint`,
`deleteSprint`, `syncActiveSprint`, `saveStandupEntry`, `upsertBlocker`, `deleteBlocker`,
`resetDatabase`, `startStandup`, `standupHeartbeat`, `endStandup`,
`exportSprintToConfluence`.

**Tarot mutations:** `createTarotRoom`, `joinTarotRoom`, `leaveTarotRoom`,
`tarotHeartbeat`, `kickTarotParticipant`, `setTarotScale`, `startTarotRound`,
`castTarotVote`, `nextTarotCycle`, `forceRevealTarotRound`, `decideTarotPoint`,
`resetTarotPoints`, `endTarotRoom`, `deleteTarotRoom`, `syncTarotToJira` (returns
`{ updated, tickets, failed }`), `resetTarotSync`. See the Tarot section below.

**Subscription:** `standupChanged(sprintId)` → `{ sprintId, kind }`;
`tarotRoomChanged(roomId)` → `{ roomId, kind, actor }`.

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
- **Admin management** (`resolvers/admin.ts`, **super-admin only** — `requireSuperAdmin`):
  `admins` lists all admins; `createAdmin(email,name,password)`, `updateAdmin(id,email?,name?)`,
  `changeAdminPassword(id,password)`, `deleteAdmin(id)`. The **super admin** is the env
  account whose email = `SEED_ADMIN_EMAIL` (`isSuperAdminUser`, matched by email — no DB
  column/migration; `User.isSuperAdmin` is a derived field resolver). It manages *other*
  admins only: every mutation rejects a target that is itself (`The env super admin cannot
  be modified`), preventing self-lockout. Passwords require ≥6 chars; emails are unique.
  Exposed in the UI as **Settings → Admin Accounts**.
- **Grooming** (`groomingBuckets(squadId, refresh)` in `resolvers/squad.ts` →
  `fetchGroomingBuckets` in `jira.ts`): returns grooming sources — every **future**
  (not-yet-started) sprint, each with its issues, plus the **Backlog** (`/board/{id}/backlog`).
  Powers the Clairvoyance source dropdown. All issue fetches are paginated.
- **Velocity / burndown** (`resolvers/velocity.ts`):
  - `velocity(squadId, limit)` — per-sprint `{ committedPoints, completedPoints, ticketCount,
    doneCount }` derived from **`StandupEntry` snapshots** in this tool's DB (latest per ticket;
    "done" = status in done/closed/resolved/complete via `isDoneStatus`). No JIRA calls, so it
    only reflects sprints that were actually run through standups here.
  - `burndown(sprintId)` — daily `{ date, remainingPoints, idealPoints }`, also from
    `StandupEntry` (DB source only).
  - `jiraVelocity(squadId, limit)` — same shape but computed **live from JIRA** closed sprints
    (`fetchJiraVelocity` in `jira.ts`: `/board/{id}/sprint?state=closed` → each sprint's issues,
    committed = Σ story points, completed = Σ SP of Done/Closed/Resolved). No standups needed;
    no burndown for this source (JIRA has no per-day snapshot here).
  - UI: **Velocity** page with a **From standups / From JIRA** source toggle.
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

**Next (future) sprint** — `fetchNextSprintInfo` / `fetchNextSprintIssues` resolve the
board's first `state=future` sprint (= current + 1) and pull its issues (paginated, cached
under `nextInfo`/`nextIssues`). Powers Clairvoyance and the Tarot ticket list.

**Write-back** — `getIssueFieldValues(cfg, key, [fieldIds])` reads current numeric field
values; `updateIssueFields(cfg, key, { fieldId: value })` does `PUT /rest/api/3/issue/{key}`
and busts the read cache. Used only by Tarot's Jira sync (and its reset). `resolveSquadSpIds`
exposes the squad's resolved default/FE/BE/QA custom-field ids.

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
`CONFLUENCE_PARENT_ID` — the space key + parent id are **per-squad overridable**
(`Squad.confluenceSpaceKey` / `confluenceParentId`, set in Settings → Squads → Edit;
blank falls back to the env defaults). Credentials + base URL stay global.

### Clairvoyance & Tarot

**Clairvoyance** (`/clairvoyance`, `pages/Clairvoyance.tsx`) is read-only: it queries
`nextSprintTickets` + `jiraNextSprint` and renders the next-sprint tickets grouped by
parent/story (key/type/summary/status/priority), with an empty state + Reload.

**Tarot** (`/tarot` landing, `/tarot/:roomId` room) is real-time planning poker
(`server/src/resolvers/tarot.ts`, `client/src/components/tarot/*`):

- **Identity** — each browser holds a stable `jcb_tarot_uid` (`lib/tarot.ts`) used as the
  participant/host `key`. `(roomId, key)` is unique; the room's `hostKey` marks the host.
  Host gameplay actions assert `hostKey === key`; management (reset/end/delete/sync) allows
  host **or** admin, and deleting an **ended** room is admin-only. **Jira sync/reset also
  require a non-guest** (`assertNotGuest`) — a guest host may not mutate the board.
- **One active room per squad** — `createTarotRoom` re-checks + allocates `seq` + inserts
  inside a **`Serializable` transaction**, so two simultaneous creates can't both pass
  (write-skew); the loser (`P2034`) maps to "An active room already exists." Room name =
  `"<Squad> - Sprint Planning #<seq> - <date>"`.
- **Presence** — `TarotRoom.tsx` joins on mount, sends `tarotHeartbeat` every ~8s, leaves
  on unmount, and also leaves on tab close via `fetch(keepalive)` (`pagehide`). `online` =
  `lastSeen` within 15s. A server **presence sweep** (`tarotPresence.ts`, every 5s) detects
  when a room's online set changes and publishes a `presence` event so peers update live.
  Full room state is recomputed server-side per request (`buildRoom`) — vote values are
  **hidden until the round is `REVEALED`**. `buildRoom` also returns the requester's own
  `viewerVote` so a guest who **reloads** rehydrates their selection instead of re-voting.
- **Events** — every mutation publishes `tarotRoomChanged(roomId)`; the room refetches and
  plays sounds (`lib/sound.ts`, WAV files in `public/sounds/`: join, select, reveal). An
  8s poll is a fallback if a WS event is missed.
- **Voting** — `castTarotVote(value, confirmed)`; a round auto-reveals once every online
  non-host voter has confirmed. The host can `forceRevealTarotRound` early (≥1 confirmed).
  `voteStats` computes the team-synchronization % (top value share) and a suggestion (single
  most-picked **numeric** value; null on a draw). `decideTarotPoint` stores effort + per-role
  points (each ≤ effort) as a `TarotResult` and marks the round `DECIDED`; `nextTarotCycle`
  opens a fresh round for the same ticket. `TarotRound.createdAt` drives a client elapsed
  timer.
- **Scales** — Fibonacci / Scrum presets or Custom numbers; `?` and `coffee` are always
  appended to the deck. `setTarotScale(..., setDefault)` can persist the deck as the squad
  default (`Squad.tarotScaleType/Values`).
- **Jira sync** — `syncTarotToJira(fields)` maps `point→default`, `fe/be/qa→` the squad's
  configured fields, snapshots prior Jira values into `TarotResult.jiraPrevValues`, then
  PUTs the points **per-ticket with its own try/catch** (one failing issue doesn't abort the
  rest; returns `{ updated, tickets, failed }`). `resetTarotSync` restores those snapshots.
  `endTarotRoom` refuses unless every next-sprint ticket has a result.
- **History & retention** — ended rooms keep full attendance + per-ticket results (grouped
  by parent/story; `TarotResult` stores `parentKey/parentName/ticketSummary`). The scheduler
  purges ended rooms older than `TAROT_ROOM_RETENTION_DAYS` (default 30; 0 disables).
- **Activity log** — create/estimate/sync/reset/end write `ActivityLog` rows (`logTarot`).

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
  squad's members of that role. `FULLSTACK` members appear in FE+BE suggestions, `ALL`
  members in FE+BE+QA.
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

## Testing

Server unit tests run with **Vitest** (`cd server && npm test`). Pure Tarot logic lives in
`server/src/resolvers/tarotLogic.ts` (no I/O / side-effect imports) so it's testable in
isolation — `tarotLogic.test.ts` covers `presetValues`/`deckStrings` (deck building +
special cards), `voteStats` (sync % and most-picked suggestion, incl. draw → null and
special-card handling), `isOnline` (heartbeat staleness), and `capRolePoint` (per-role
point ≤ effort, with error paths). Resolver flows that need a database aren't covered yet
(would want a throwaway Postgres + seeded fixtures).
