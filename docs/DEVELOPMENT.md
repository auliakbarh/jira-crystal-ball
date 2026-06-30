# How to Run in Development

Step-by-step to get JIRA Crystal Ball running locally for development.

## Prerequisites

| Tool | Version | Check |
| --- | --- | --- |
| Node.js | 20+ (tested on 22) | `node -v` |
| npm | 9+ (tested on 11) | `npm -v` |
| PostgreSQL | 15 or 16 | via Docker **or** local install |
| Docker | optional, for the bundled DB | `docker --version` |

You need a PostgreSQL instance. Two options below — pick **A** (Docker, recommended) or
**B** (local Postgres).

---

## 1. Get a database running

### Option A — Docker (recommended)

```bash
docker compose up -d db
```

Starts PostgreSQL 16 on `localhost:5432` with user `jcb` / password `jcb_password` /
database `jira_crystal_ball` — exactly matching the default `DATABASE_URL`.

Check it's healthy:

```bash
docker compose ps
```

### Option B — Local PostgreSQL (no Docker)

Create a matching role and database once:

```bash
psql -d postgres -c "CREATE ROLE jcb LOGIN PASSWORD 'jcb_password';"
createdb -O jcb jira_crystal_ball
```

This keeps the default `DATABASE_URL` valid. (Or point `DATABASE_URL` at any Postgres you
already have — see step 2.)

---

## 2. Configure environment files

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Defaults work out of the box for local dev. Edit `server/.env` only if needed:

| Var | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://jcb:jcb_password@localhost:5432/jira_crystal_ball?schema=public` | point at your DB |
| `JWT_SECRET` | dev placeholder | fine for dev; change for prod |
| `PORT` | `4000` | GraphQL server port |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | `admin@example.com` / `admin123` | seeded login |
| `JIRA_BASE_URL` / `JIRA_EMAIL` / `JIRA_API_TOKEN` | empty | global JIRA creds; set to pull tickets |
| `JIRA_DEFAULT_BOARD_ID` / `JIRA_JQL` | empty | optional fallback board id / JQL |

`client/.env` → `VITE_GRAPHQL_URL=http://localhost:4000/` (the GraphQL endpoint).

---

## 3. Install dependencies

```bash
npm install
```

Run from the repo root — npm workspaces installs both `server` and `client`. A
`postinstall` hook runs `prisma generate` automatically.

---

## 4. Create the schema + seed data

```bash
npm run db:push    # creates all tables from prisma/schema.prisma
npm run db:seed    # creates admin user + default squads Athens(ATH)/Berlin(BER)/Cairo(CAI)
```

`db:seed` prints the admin credentials (default `admin@example.com / admin123`).

> Shortcut for steps 1A + 2-edited + 3 + 4: after editing env files, run `npm run setup`
> (= db up + install + push + seed).

---

## 5. Run both apps

```bash
npm run dev
```

Starts (via `concurrently`):
- **server** → http://localhost:4000  (GraphQL — open in a browser for Apollo Sandbox)
- **client** → http://localhost:5173  (the app)

Open http://localhost:5173 and log in with the seeded admin.

### Run them separately

```bash
npm run dev:server   # backend only (tsx watch — hot reload)
npm run dev:client   # frontend only (vite — HMR)
```

---

## 6. First-run checklist in the UI

1. Log in (`admin@example.com / admin123`).
2. Squad **Squad Alpha** already exists (from seed) — or create one with the **+** box.
3. Set JIRA credentials in `server/.env` (`JIRA_BASE_URL`, `JIRA_EMAIL`,
   `JIRA_API_TOKEN`) and restart. Per squad, set the optional **Board ID** in
   **Settings → JIRA Board** → **Test connection**. (Without creds the dashboard shows a
   popup and the ticket table stays empty.)
4. **Settings** → add members, a sprint covering today's date, holidays. (Settings also
   manages squads and has **Reset** for the JIRA connection.)
5. **Current Sprint** → run standup. **Board** → view the active sprint's tickets.

---

## Common tasks

| Task | Command |
| --- | --- |
| Type-check backend | `npm -w server run build` (or `cd server && npx tsc --noEmit`) |
| Type-check frontend | `cd client && npx tsc --noEmit` |
| Open Prisma Studio (DB GUI) | `cd server && npx prisma studio` |
| Re-sync schema after editing `schema.prisma` | `npm run db:push` |
| Reset the database | `cd server && npx prisma db push --force-reset && npm run seed` |
| Stop the Docker DB | `docker compose down` (add `-v` to wipe data) |

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Can't reach database server` | DB not running — `docker compose up -d db`, or start local Postgres. Check `DATABASE_URL`. |
| `Missing required env var: DATABASE_URL` | You skipped `cp server/.env.example server/.env`. |
| Login fails / no admin | Run `npm run db:seed`. |
| Port 5432 already in use | A local Postgres is already bound. Use Option B, or stop the other instance, or change the port in both `docker-compose.yml` and `DATABASE_URL`. |
| Port 4000 / 5173 in use | Change `PORT` in `server/.env`, or Vite picks the next free port automatically. |
| Dashboard ticket table empty | JIRA not configured or bad credentials — Settings → **Test connection**. Verify Board ID. |
| Prisma client type errors after schema edit | `cd server && npx prisma generate`. |
| `401 Unauthorized` on GraphQL calls | Token missing/expired — log out and back in. |
