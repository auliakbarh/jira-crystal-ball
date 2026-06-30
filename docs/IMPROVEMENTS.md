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
      changes; the dashboard re-pulls live instead of 15s polling. `tarotRoomChanged(roomId)`
      drives the Tarot room.
- ✅ **Presence** — Tarot rooms show a live roster (online dots); a 5s server sweep
      (`tarotPresence.ts`) pushes offline transitions, and tab-close leaves via
      `fetch(keepalive)`. (Standup-view presence still open.)
- ✅ **Multi-instance pub/sub** — `REDIS_URL` switches `pubsub.ts` to Redis so subscriptions
      fan out across nodes (`graphql-redis-subscriptions` + `ioredis`); in-memory otherwise.

## Data / features
- ✅ **JIRA write-back** — Tarot syncs decided points (effort + per-role FE/BE/QA) to the
      squad's configured fields (`PUT /rest/api/3/issue`), reversible via a saved snapshot
      (`resetTarotSync`). Dashboard status/assignee write-back still open.
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

## Clairvoyance & Tarot (Grooming + Planning Poker)
New feature set (see USAGE §8–9, DOCUMENTATION → "Clairvoyance & Tarot").
- ✅ **Clairvoyance** — read-only next (future) sprint ticket list, grouped by parent/story.
- ✅ **Tarot planning poker** — rooms (one ACTIVE per squad), host/guest views, live deck +
      reveal + team-sync %, per-role points, custom/Fibonacci/Scrum scales, sounds + flip
      animation, history with attendance + results.
- ✅ **Guest vote rehydrate** — `viewerVote` in `buildRoom`; a reload restores the guest's
      confirmed card instead of resetting it.
- ✅ **Host force-reveal** — `forceRevealTarotRound` (≥1 confirmed) so an idle member can't
      stall a round; round elapsed timer (`TarotRound.createdAt`).
- ✅ **Active-room race** — `createTarotRoom` re-checks + inserts in a `Serializable` tx
      (write-skew safe), not just a pre-check.
- ✅ **Jira sync hardening** — non-guest only (`assertNotGuest`); per-ticket try/catch so one
      failure doesn't abort the rest (`{ updated, tickets, failed }`).
- ✅ **Ended-room retention** — scheduler purges ended rooms older than
      `TAROT_ROOM_RETENTION_DAYS` (default 30; 0 disables).
- ✅ **Activity log** — create/estimate/sync/reset/end recorded via `logTarot`.
- ✅ **Pure logic + tests** — `tarotLogic.ts` + `tarotLogic.test.ts` (deck/voteStats/cap).
- [ ] **Per-room sweep leadership** — with N instances the presence sweep can publish an
      offline event up to N times (harmless refetch); elect a leader to dedupe.
- [ ] **Resolver-level integration tests** — need a throwaway Postgres + fixtures.
- [ ] **Round countdown / auto-reveal timer** — optional time-box per round.
