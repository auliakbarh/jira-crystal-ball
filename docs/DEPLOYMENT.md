# Deployment Guide

## Overview

Three pieces to deploy:
1. **PostgreSQL** database
2. **Backend** — Apollo GraphQL server (Node 20+)
3. **Frontend** — static React build served by any web server / CDN

## Environment variables

### Backend (`server/.env`)

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | **Long random string** — sign in tokens. Rotating it logs everyone out. |
| `PORT` | HTTP port (default 4000) |
| `NODE_ENV` | `production` enables the CORS allow-list (below); anything else is dev (permissive). |
| `CORS_ORIGINS` | **Comma-separated** browser origins allowed in production (e.g. `https://app.example.com,https://admin.example.com`). Gates both HTTP CORS and the WebSocket handshake. Empty in production → browser cross-origin requests are blocked (a startup warning is logged). Ignored in dev. Non-browser clients (curl / server-to-server, no `Origin` header) always pass. |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | initial admin for `npm run db:seed`. **`SEED_ADMIN_EMAIL` also designates the "super admin"** — the only account that can manage other admins (Settings → Admin Accounts). Matched by email at runtime, so keep it in sync with the seeded user. |
| `JIRA_BASE_URL` / `JIRA_EMAIL` / `JIRA_API_TOKEN` | **global** JIRA credentials (all squads) |
| `JIRA_DEFAULT_BOARD_ID` / `JIRA_JQL` | optional fallback board id / JQL override |
| `CONFLUENCE_BASE_URL` | Confluence site URL; blank → uses `JIRA_BASE_URL` |
| `CONFLUENCE_SPACE_KEY` | **global default** space the export page is created in (e.g. `MYHERO`); per-squad override in **Settings → Squads → Edit** |
| `CONFLUENCE_PARENT_ID` | **global default** parent page/folder id the export nests under; per-squad override in **Settings → Squads → Edit** |

### Frontend (`client/.env`)

| Var | Purpose |
| --- | --- |
| `VITE_GRAPHQL_URL` | Public URL of the GraphQL server (baked in at build time) |

## Finding the JIRA / Confluence env values

All of these come from your Atlassian Cloud site (`https://<org>.atlassian.net`).

| Var | How to get it |
| --- | --- |
| `JIRA_BASE_URL` / `CONFLUENCE_BASE_URL` | Your site URL, e.g. `https://guardianhero.atlassian.net` (no trailing slash). Confluence shares the same host; leave `CONFLUENCE_BASE_URL` blank to reuse it. |
| `JIRA_EMAIL` | The Atlassian account email the token belongs to. |
| `JIRA_API_TOKEN` | Create at **id.atlassian.com → Security → API tokens → Create API token**. One token works for both JIRA and Confluence REST. |
| `JIRA_DEFAULT_BOARD_ID` | Open the board in JIRA; the URL ends `…/boards/<id>` — use that number. A project key (e.g. `ATH`) also works (first board of the project). |
| `CONFLUENCE_SPACE_KEY` | In Confluence, open the space → **Space settings**, or read it from the URL: `…/wiki/spaces/<KEY>/…` (e.g. `MYHERO`). **Global default**; a squad can override it (**Settings → Squads → Edit → Confluence Space Key**). |
| `CONFLUENCE_PARENT_ID` | Open the target page/folder in Confluence; the id is the number in the URL: `…/wiki/spaces/MYHERO/folder/<id>/…` or `…/pages/<id>/…`. To confirm via API: `GET {base}/wiki/api/v2/spaces?keys=MYHERO` for the space id. **Global default**; per-squad override in **Settings → Squads → Edit → Confluence Parent ID**. |
| `JIRA_STORY_POINTS_FIELD` | **Global default** Story Points field id, used when a squad has none. Per-squad fields (default + FE/BE/QA) are set in the admin UI (**Settings → Squads → Edit**), which lists every board field with its id to pick from. A value may be a custom field id (`customfield_10033`) or an exact field name ("Story Points QA") — prefer the **id** when several fields share a name. List fields: `GET /rest/api/3/field`. |

Verify quickly from a shell (Basic auth = `email:token`):

```bash
# whoami (JIRA) — confirms base URL + credentials
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" "$JIRA_BASE_URL/rest/api/3/myself" | jq .displayName
# space id for a key (Confluence)
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" "$JIRA_BASE_URL/wiki/api/v2/spaces?keys=MYHERO" | jq '.results[0].id'
# story-points field candidates
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" "$JIRA_BASE_URL/rest/api/3/field" \
  | jq -r '.[] | select(.name|test("point";"i")) | "\(.id) | \(.name)"'
```

## Option A — Docker Postgres + Node processes (simple VM)

```bash
git clone <repo> && cd jira-crystal-ball

# 1. Database
docker compose up -d db

# 2. Backend
cp server/.env.example server/.env     # set a strong JWT_SECRET
npm install
npm run db:push                        # or: npm -w server run db:migrate  (prod migrations)
npm run db:seed                        # first deploy only (admin user + default squads)
npm run db:seed:config                 # optional: bulk squads + members from JSON (see below)
npm -w server run build
npm -w server run start                # node dist/index.js  (run under pm2/systemd)

# 3. Frontend
echo 'VITE_GRAPHQL_URL=https://api.your-domain.com/' > client/.env
npm -w client run build                # outputs client/dist
# serve client/dist with nginx / Caddy / any static host
```

Run the backend under a process manager (pm2, systemd, or a container) so it restarts on
crash/reboot. Put nginx/Caddy in front for TLS and to serve the static frontend.

## Bulk seeding squads + members from JSON

`npm run db:seed:config` (root) / `npm -w server run seed:config` reads a JSON config and
upserts squads + team members — **idempotent**, safe to re-run. Default path is
`server/dashboard-config-seed.json`; pass a custom one:

```bash
npm -w server run seed:config -- path/to/config.json
```

Copy `server/dashboard-config-seed.example.json` as a starting point. Shape:

```jsonc
{
  "squads": [
    {
      "name": "Athens",            // unique; upsert key
      "boardId": "ATH",            // → Squad.defaultBoardId
      "spDefault": "customfield_10033",
      "spFe": "", "spBe": "", "spQa": "customfield_10154",  // SP field id/name per role
      "confluenceSpaceKey": "MYHERO",
      "confluenceParentId": "1120927787"
    }
  ],
  "teams": [
    {
      "name": "Akbar",             // short display label (TeamMember.name)
      "fullName": "Aulia Akbar Harahap",  // optional full name
      "squads": ["Cairo"],         // member is added to each named squad
      "position": "ALL",           // FE | BE | QA | PM | FULLSTACK | ALL
      "jiraAccountId": ""          // optional Atlassian account id
    }
  ]
}
```

Empty strings are stored as `null`. Squads are upserted by `name`; a member is upserted by
(squad, `name`) so re-runs update in place instead of duplicating. Squads referenced by a
team but missing from `squads` are auto-created.

### Example nginx

```nginx
server {
  server_name app.your-domain.com;
  root /var/www/jcb/client/dist;
  location / { try_files $uri /index.html; }   # SPA fallback
}
server {
  server_name api.your-domain.com;
  location / { proxy_pass http://127.0.0.1:4000; }
}
```

## Option B — Managed Postgres + container platform

- **DB**: a managed PostgreSQL (RDS, Cloud SQL, Neon, Supabase). Put its URL in
  `DATABASE_URL`.
- **Backend**: containerize with the Dockerfile below; deploy to Cloud Run / Fly / ECS /
  Render. Run `prisma migrate deploy` on release.
- **Frontend**: deploy `client/dist` to Vercel / Netlify / S3+CloudFront with
  `VITE_GRAPHQL_URL` set to the backend URL.

### Backend Dockerfile (reference)

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/
RUN npm install -w server
COPY server server
RUN npm -w server run build           # tsc + prisma generate

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/server/node_modules server/node_modules
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/prisma server/prisma
WORKDIR /app/server
CMD ["node", "dist/index.js"]
```

Run migrations at release time: `npx prisma migrate deploy` (use
`prisma migrate dev` locally to author migrations instead of `db push`).

## Database migrations

The project uses **Prisma migrations** (a reviewable history under
`server/prisma/migrations/`, starting from the `0_init` baseline).

- **Author a change** (dev): edit `schema.prisma`, then
  `npm -w server run db:migrate -- --name <change>` — creates a migration and applies it.
- **Apply on deploy** (prod): `npm -w server run db:migrate:deploy` (`prisma migrate deploy`).
- **Check state**: `npm -w server run db:migrate:status`.
- `db:push` remains for quick local prototyping, but prefer migrations so prod stays in
  sync with a reviewable history.

> Adopting on an existing DB: the `0_init` migration was baselined with
> `prisma migrate resolve --applied 0_init` so it isn't re-run against a DB that already
> has the schema.

## CORS

CORS is **permissive in development** (all origins) and **restricted in production**. Set
`NODE_ENV=production` and list your client origin(s) in `CORS_ORIGINS`:

```bash
NODE_ENV=production
CORS_ORIGINS=https://app.example.com,https://admin.example.com
```

The same allow-list gates the WebSocket handshake (subscriptions), so the client URL must
be listed or live subscriptions will be refused. Requests without an `Origin` header (curl,
server-to-server, health checks) always pass. If `CORS_ORIGINS` is empty in production the
server logs a warning at startup and blocks browser cross-origin calls — set it to your
client URL(s). Enforcement lives in `originAllowed()` in `server/src/index.ts`; you can
still additionally front the API with a reverse proxy if you prefer.

## Generating a JWT secret

`JWT_SECRET` signs login tokens — it must be a long, unpredictable random string (≥32
bytes). Generate one with any of:

```bash
openssl rand -base64 48           # OpenSSL (most systems)
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # Node
python3 -c "import secrets; print(secrets.token_urlsafe(48))"                  # Python
head -c 48 /dev/urandom | base64   # *nix fallback
```

Paste the output into `server/.env` as `JWT_SECRET="…"`. Keep it secret (never commit it),
use a **different** value per environment, and inject it via your platform's secrets
manager in production. Rotating it invalidates all existing sessions (everyone is logged
out) — expected.

## Security checklist (do before production)

- [ ] Set a strong, unique `JWT_SECRET` (see "Generating a JWT secret" above).
- [ ] Change the seeded admin password (or seed with your own credentials).
- [ ] Set `NODE_ENV=production` and `CORS_ORIGINS` to your client URL(s) — see "CORS".
- [ ] Serve everything over HTTPS.
- [ ] **Protect the JIRA API token.** It now lives in `JIRA_API_TOKEN` (server env), not
      the database. Inject it via your platform's secrets manager; don't commit `.env`.
- [ ] Lock down database network access (private subnet / firewall).
- [ ] Take regular database backups (`pg_dump` / managed snapshots).
- [ ] Consider rate-limiting the `login` mutation.
