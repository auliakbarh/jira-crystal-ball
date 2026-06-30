# 🔮 JIRA Crystal Ball

A web tool for running daily **standup meetings** on top of your JIRA board data.

The lead picks the sprint and the date, the dashboard pulls every ticket from the
board, and the team walks through each one — recording who's working on it (FE / BE / QA),
the update, a progress percentage, and any blocker. Blockers entered on a ticket are
**automatically synced** into a dedicated blocker tracker. Multiple squads share one
install, each with its own JIRA connection, members, sprints and holidays.

## Stack

| Layer    | Tech                                                  |
| -------- | ----------------------------------------------------- |
| Frontend | React 18 + Vite + TypeScript + Apollo Client + Tailwind |
| Backend  | Apollo Server 4 (GraphQL) + TypeScript                |
| Database | PostgreSQL + Prisma ORM                               |
| Auth     | Email/password, JWT (bcrypt-hashed passwords)         |
| JIRA     | Atlassian Cloud REST (Agile board + JQL search)       |

## Quick start

```bash
# 1. Start PostgreSQL (Docker)
docker compose up -d db

# 2. Configure backend env
cp server/.env.example server/.env      # edit JWT_SECRET for production
cp client/.env.example client/.env

# 3. Install, create schema, seed an admin user
npm install
npm run db:push
npm run db:seed                          # creates admin@example.com / admin123

# 4. Run both apps
npm run dev
# server → http://localhost:4000   client → http://localhost:5173
```

> One-liner after editing env files: `npm run setup` (db up + push + seed).

Log in with the seeded admin, create/choose a squad, open **Settings** to enter the
JIRA connection, add members and sprints, then go to **Current Sprint** to run standup.

## Documentation

- [Development Guide](docs/DEVELOPMENT.md) — how to run locally, step by step
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md) — architecture & data model
- [Technical Documentation](docs/DOCUMENTATION.md) — schema, GraphQL API, code map
- [Usage Guide](docs/USAGE.md) — how to run a standup day to day
- [Deployment Guide](docs/DEPLOYMENT.md) — production deploy options
- [Session Summary](docs/SUMMARY.md) — what was built in this session
