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
- [ ] **GraphQL subscriptions (WebSocket)** — replace 15s polling for the standup lock and
      live cell updates; true real-time co-editing.
- [ ] **Presence** — show who else is viewing the sprint.

## Data / features
- [ ] **JIRA write-back** — push status/assignee changes from the dashboard to JIRA.
- [ ] **Export** sprint summary / logs to CSV/PDF.
- [ ] **Velocity / burndown** across sprints (story points).
- [ ] **Notifications** — new blocker / standup start → Slack or email.

## Robustness / quality
- [ ] **Automated tests** — no unit/integration tests yet.
- [ ] **Prisma migrations** — currently `db push`; production needs a migration history.
- [ ] **Toasts + error boundary** — replace remaining `alert()` calls.

## UX
- [ ] **Mobile layout** for the wide standup table.
- [ ] **Keyboard navigation** between cells during standup.
- [ ] **Proper i18n** (UI currently English with a few mixed strings).
