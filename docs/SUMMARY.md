# Session Summary

> Created by **Aulia Akbar Harahap** · June 2026

## What was built

A complete, working **standup-meeting web tool** ("JIRA Crystal Ball") from an empty
repository, per `INIT.md`.

### Backend (`server/`)
- Apollo Server 4 over **Express + graphql-ws/ws** (HTTP at `/graphql`, WebSocket
  subscriptions at the same path), TypeScript ESM.
- Prisma + PostgreSQL (migration history): `User`, `Squad`, `TeamMember`, `Leave`,
  `Holiday`, `Sprint`, `StandupEntry`, `Blocker`, `ActivityLog`, `StandupSession`,
  `StandupLog`, `ExportLog`.
- JWT auth (bcrypt) + **guest login**; admin/guest gating; **login rate-limit**.
- JIRA Cloud REST client: board/active-sprint issues (paginated), live status, story
  points (per-role field config), carry-over (`closedSprints`), field listing; **60s cache**.
- Confluence v2 export + **auto-export scheduler**; GraphQL **subscription** for live
  standup updates; **blocker auto-sync**; standup **session lock** with heartbeat.
- Credentials live in the server **env** (JIRA + Confluence), never returned to clients.

### Frontend (`client/`)
- React 18 + Vite + Apollo Client + Tailwind; Auth/Theme/Squad/Toast contexts; error
  boundary; themed scrollbars; shimmer loading.
- Pages: **Guest** (default entry) + **Admin Login**, **Current Sprint** dashboard,
  **Board**, **Previous Sprints**, **Settings**, **Health**, 404.
- **Current Sprint**: sprint header + sync, clickable **sprint timeline**, sprint summary
  (status/progress/blockers/man-power + SP), lead rotation, team panel (leave + per-member
  SP), blockers (+resolve note), update log (search + infinite scroll), standup duration
  log, and the standup table — group by epic/parent, status filter, carry-over flag, SP,
  per-assignee progress, keyboard nav, expand-to-popup, **session lock** (start/end).
- **Board**: live active-sprint tickets, status filter, group, SP, priority/type.
- **Previous Sprints**: read-only, grouped, per-ticket progress chart + update/blocker
  history, sprint summary, **CSV + Confluence export** with export history.
- **Settings**: squads (admin: name/board id/**SP fields** with field picker), members +
  leave (cuti/sakit/izin + substitute), sprints, holidays, JIRA board, danger zone.

### Tooling / docs
- npm workspaces monorepo, Docker Compose for PostgreSQL, env templates, `npm run setup`.
- Docs: implementation plan, technical docs, usage, deployment, improvements, this summary.

## How to run

```bash
docker compose up -d db
cp server/.env.example server/.env && cp client/.env.example client/.env
npm install && npm run db:migrate:deploy && npm run db:seed
npm run dev      # server :4000/graphql, client :5173  → guest entry, or admin login
```

JIRA + Confluence credentials are server env vars (see DEPLOYMENT → "Finding env values").

## Requirements coverage

All `INIT.md` items are implemented (JIRA board fetch with env config + popup, PostgreSQL,
Apollo GraphQL, login, multi-squad, current/previous-sprint menus, dark/light, settings,
member leave with range + substitute, blocker list, per-ticket update areas, sprint
number/start/end, JIRA ticket info with links, row-per-date dashboard with blocker sync),
plus a large set of post-build enhancements — see [IMPROVEMENTS.md](IMPROVEMENTS.md) for the
✅/planned list (story points, Confluence export + auto-export, subscriptions, session lock,
CSV export, rate-limit, migrations, toasts, keyboard nav, etc.).

## Known limitations / next steps

See [IMPROVEMENTS.md](IMPROVEMENTS.md) (planned items) and the security checklist in
[DEPLOYMENT.md](DEPLOYMENT.md) — notably: per-squad user membership/roles, automated tests,
CORS restriction, and presence.
