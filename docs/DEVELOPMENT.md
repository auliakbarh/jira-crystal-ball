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
| `JWT_SECRET` | dev placeholder | fine for dev; for prod generate one: `openssl rand -base64 48` |
| `PORT` | `4000` | GraphQL server port |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | `admin@example.com` / `admin123` | seeded login |
| `JIRA_BASE_URL` / `JIRA_EMAIL` / `JIRA_API_TOKEN` | empty | global JIRA creds; set to pull tickets |
| `JIRA_DEFAULT_BOARD_ID` / `JIRA_JQL` | empty | optional fallback board id / JQL |
| `CONFLUENCE_BASE_URL` / `CONFLUENCE_SPACE_KEY` / `CONFLUENCE_PARENT_ID` | blank / `MYHERO` / `1119092737` | export target (see DEPLOYMENT → "Finding the JIRA / Confluence env values") |

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

## Sharing on your local network (LAN)

Let teammates on the **same wifi/office network** try your local instance — no
tunnel needed. You bind both apps to your machine's LAN IP and point the client
at it.

### 1. Find your machine's LAN IP

```bash
ipconfig getifaddr en0        # wifi (try en1 if empty)
```

Example result: `10.10.5.130`. Use yours below.

### 2. Point the client at your IP

The client reads the server URL from `VITE_GRAPHQL_URL`. Set it to your **IP**
(not `localhost` — else a teammate's browser hits their own machine). WebSocket
subscriptions auto-derive (`http` → `ws`):

```bash
# client/.env
VITE_GRAPHQL_URL="http://10.10.5.130:4000/graphql"
```

### 3. Bind Vite to the LAN

The GraphQL server (`4000`) already binds all interfaces. Vite binds `localhost`
by default — expose it with `host: true` in `vite.config.ts` (already set), or a
one-off flag:

```bash
cd client && npm run dev -- --host
```

### 4. Run + share

```bash
npm run dev                          # both apps
```

Teammates open `http://10.10.5.130:5173` in their browser.

### Notes & gotchas

- **Restart Vite** after editing `client/.env` — env is baked at dev-server start.
- **macOS firewall** may block `:4000` / `:5173`. System Settings → Network →
  Firewall → allow `node`, or disable for the test.
- **IP changes** on wifi reconnect / DHCP lease renewal — re-check
  `ipconfig getifaddr en0` and re-set `VITE_GRAPHQL_URL` if it moved.
- **Same network only** — teammates must be on the same wifi with no AP/client
  isolation. For remote/off-network sharing use the ngrok section below.
- **CORS** — in development the server allows all origins, so LAN works as-is.
- Teammates need a login account (or guest login if enabled).

## Exposing locally with ngrok (dev + testing)

Share your local instance (demo, testing on a phone, webhook callbacks) with
[ngrok](https://ngrok.com). You expose **two** ports: the client (Vite `5173`)
and the GraphQL server (`4000`). WebSocket subscriptions ride the same server
tunnel automatically (`https` → `wss`).

### 1. One-time setup

```bash
brew install ngrok        # or: https://ngrok.com/download
ngrok config add-authtoken <YOUR_TOKEN>   # from the ngrok dashboard
```

### 2. Start both apps + two tunnels

Run the apps as usual (`npm run dev`), then start both tunnels. The free plan
allows multiple tunnels via a config file — create `~/.config/ngrok/ngrok.yml` or check `~/Library/Application Support/ngrok/ngrok.yml`:

```yaml
version: "3"
agent:
  authtoken: <YOUR_TOKEN>
tunnels:
  jcb-web:
    proto: http
    addr: 5173
  jcb-api:
    proto: http
    addr: 4000
```

```bash
ngrok start --all
```

ngrok prints two `https://<random>.ngrok-free.app` URLs — one for `5173`
(the UI) and one for `4000` (the API).

### 3. Point the client at the API tunnel

The client reads the server URL from `VITE_GRAPHQL_URL`. Set it to the **API**
tunnel and restart Vite (env is baked at dev-server start):

```bash
# client/.env
VITE_GRAPHQL_URL="https://<api-random>.ngrok-free.app/graphql"
```

Then open the **web** tunnel URL (`https://<web-random>.ngrok-free.app`).

### Notes & gotchas

- **Vite host allow-list.** Vite blocks unknown hosts; `*.ngrok-free.app` /
  `*.ngrok.app` / `*.ngrok.io` are already allowed in `vite.config.ts`
  (`server.allowedHosts`). Add your custom domain there if you use one.
- **WebSocket.** Subscriptions (standup/tarot live updates) use the API tunnel
  over `wss://…/graphql` — no extra config; it's derived from `VITE_GRAPHQL_URL`.
- **CORS.** In development the server allows all origins, so tunnels work as-is.
  If you run the server with `NODE_ENV=production`, add the **web** tunnel origin
  to `CORS_ORIGINS` in `server/.env` (it gates both HTTP and the WS handshake).
- **ngrok warning page.** The free plan shows an interstitial on first visit —
  click through once, or send the `ngrok-skip-browser-warning` header for API
  clients. Browsers loading the UI just click through.
- **URLs change** each restart on the free plan. Re-set `VITE_GRAPHQL_URL` and
  restart Vite whenever the API tunnel URL changes (or use a reserved domain).
- **Never expose a production DB / real secrets** over a casual tunnel — use a
  throwaway dev database and test JIRA/Gemini credentials.
