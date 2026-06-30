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
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | initial admin for `npm run db:seed` |
| `JIRA_BASE_URL` / `JIRA_EMAIL` / `JIRA_API_TOKEN` | **global** JIRA credentials (all squads) |
| `JIRA_DEFAULT_BOARD_ID` / `JIRA_JQL` | optional fallback board id / JQL override |

### Frontend (`client/.env`)

| Var | Purpose |
| --- | --- |
| `VITE_GRAPHQL_URL` | Public URL of the GraphQL server (baked in at build time) |

## Option A — Docker Postgres + Node processes (simple VM)

```bash
git clone <repo> && cd jira-crystal-ball

# 1. Database
docker compose up -d db

# 2. Backend
cp server/.env.example server/.env     # set a strong JWT_SECRET
npm install
npm run db:push                        # or: npm -w server run db:migrate  (prod migrations)
npm run db:seed                        # first deploy only
npm -w server run build
npm -w server run start                # node dist/index.js  (run under pm2/systemd)

# 3. Frontend
echo 'VITE_GRAPHQL_URL=https://api.your-domain.com/' > client/.env
npm -w client run build                # outputs client/dist
# serve client/dist with nginx / Caddy / any static host
```

Run the backend under a process manager (pm2, systemd, or a container) so it restarts on
crash/reboot. Put nginx/Caddy in front for TLS and to serve the static frontend.

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

- **Development / first run**: `npm run db:push` syncs the schema directly.
- **Production**: switch to migrations — `npm -w server run db:migrate` to author them,
  `prisma migrate deploy` to apply on deploy. This gives you a reviewable history.

## CORS

Apollo standalone enables permissive CORS by default, which is fine when the frontend is
served from a different origin. To restrict it, front the API with a reverse proxy and
limit `Access-Control-Allow-Origin`, or migrate to the Express integration with a
configured `cors` middleware.

## Security checklist (do before production)

- [ ] Set a strong, unique `JWT_SECRET`.
- [ ] Change the seeded admin password (or seed with your own credentials).
- [ ] Serve everything over HTTPS.
- [ ] **Protect the JIRA API token.** It now lives in `JIRA_API_TOKEN` (server env), not
      the database. Inject it via your platform's secrets manager; don't commit `.env`.
- [ ] Lock down database network access (private subnet / firewall).
- [ ] Take regular database backups (`pg_dump` / managed snapshots).
- [ ] Consider rate-limiting the `login` mutation.
