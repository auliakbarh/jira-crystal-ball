# Improvement Roadmap

Backlog of enhancements beyond the current feature set. Grouped by area; ordered roughly
by value/effort within each group. ✅ = done.

## Security / auth
- ✅ **Rate-limit `login`** — throttle repeated failed logins to slow brute-force.
- [ ] **Change-password / admin management UI** — admins are seed-only today.
- [ ] **Restrict CORS** in production (Apollo standalone is permissive by default).
- [ ] **Encrypt or vault the JIRA API token** (currently a server env var; fine for a
      single org, encrypt for stricter setups).
- [ ] **Per-squad membership & roles** — any logged-in member currently sees all squads.

## Performance
- ✅ **JIRA response cache** — board/active-sprint fetches are cached with a short TTL;
      the Board "Refresh" forces a live re-pull. Cuts latency and JIRA rate-limit risk.
- [ ] **Paginate `fetchBoardIssues`** (JQL/board path) — only active-sprint fetch is
      paginated; a large board is capped at 100.
- [ ] **Cleanup/retention** for `ActivityLog` / `StandupLog`.

## Realtime / collaboration
- ✅ **GraphQL subscriptions (WebSocket)** — `standupChanged(sprintId)` pushes lock/cell
      changes; the dashboard re-pulls live instead of 15s polling.
- [ ] **Presence** — show who else is viewing the sprint.

## Data / features
- [ ] **JIRA write-back** — push status/assignee changes from the dashboard to JIRA.
- [ ] **Export** sprint summary / logs to CSV/PDF.
- [ ] **Velocity / burndown** across sprints (story points).
- [ ] **Notifications** — new blocker / standup start → Slack or email.

## Robustness / quality
- ✅ **Automated tests (vitest)** — `npm test` in each workspace. Client: `lib/helpers.test.ts`
      (formatDuration, working-days, status buckets, lead rotation incl. CUTI/SAKIT) + `lib/csv.test.ts`.
      Server: `rateLimit.test.ts` (lockout after 5 fails, reset on success). More coverage still welcome.
- ✅ **Split `resolvers.ts` per domain** — now `server/src/resolvers/{shared,squad,standup,confluence,index}.ts`;
      `resolvers.ts` re-exports the merged map. Shared helpers + field resolvers live in `shared.ts`.
- ✅ **Prisma migrations** — migration history under `prisma/migrations/` (baselined
      `0_init`); `db:migrate:deploy` on release.
- ✅ **Toasts + error boundary** — `ToastProvider` + `ErrorBoundary`; `alert()` removed.

## Data / features (more)
- ✅ **Export CSV** — Previous Sprints entries + standup duration log export to CSV.
- ✅ **Export to Confluence** — Previous Sprints writes a formatted report page to
      Confluence (space `MYHERO`, under parent `CONFLUENCE_PARENT_ID`) via the v2 REST API,
      reusing the JIRA Atlassian credentials. Native Jira issue macros, status lozenges,
      pie chart, man-power roster, grouped by parent. Re-export **updates the same page**
      (version bump); each export is recorded in an **export history** with its link; a
      scheduler **auto-exports** a sprint once it ends.

## UX
- [ ] **Mobile layout** for the wide standup table.
- ✅ **Keyboard navigation** — Enter / Alt+↑↓ to move between standup cells.
- ✅ **Help page** — `/help` route (`pages/Help.tsx`) explains how to use the dashboard.
- [ ] **Proper i18n** (UI currently English with a few mixed strings).
