# Usage Guide

This guide walks through first-time setup and the day-to-day standup flow.

## 1. Sign in

Open the client (default `http://localhost:5173`). The **default entry is guest access**
— no account needed to run a standup:
1. Enter your **name** (the standup lead) — the field **suggests existing team-member
   names** (across all squads) as you type; pick one or type a new name.
2. Pick a **squad** — its **board** is shown (and whether JIRA is connected).
3. Click **Enter dashboard**.

Guests can run the standup (dashboard, board, previous sprints) and take the **standup
session lock**, but **cannot** open Settings, manage squads, or reset the database. A
**Guest** badge shows in the header.

For management, use **Admin login** (link on the guest page). The seeded admin is
**admin@example.com / admin123** (change it in production). Only admins reach Settings and
can always edit / take over a standup.

The seeded account (its email = `SEED_ADMIN_EMAIL`) is the **super admin**. It's the only
one that can add / edit / delete admins and reset their passwords, in **Settings → Admin
Accounts**. Admins created there are regular admins — they use every other setting but
can't manage admin accounts. The super admin can only manage *other* admins; its own row is
read-only (so it can't lock itself out). See §12.

## 2. Pick or create a squad

Use the squad dropdown in the header. To add a team, type a name in the **New squad…**
box and click **+**. Everything below (JIRA config, members, sprints, holidays) is
per-squad.

You can also manage teams in **Settings → Squads / Teams**: add a squad and **Switch** to
it. **Admins** can additionally **Edit** each squad's **name**, **board id**, and its
**Story Points fields** (default + FE/BE/QA — accepts a field id like
`customfield_10033` or an exact field name; the editor lists every board field with its id
to pick from, and shows a "name → id" reference), or **Delete** it (cascades — members, leaves, holidays, sprints, standup entries and blockers
are all removed; asks for confirmation).

## 3. Configure JIRA

**Credentials are global**, set once in the server environment (not in the UI):

```
JIRA_BASE_URL="https://your-org.atlassian.net"
JIRA_EMAIL="you@your-org.com"
JIRA_API_TOKEN="your-atlassian-api-token"
JIRA_DEFAULT_BOARD_ID=""   # optional fallback board id
JIRA_JQL=""                # optional JQL override
```

Restart the server after editing `.env`. The API token is created at
id.atlassian.com → Security → API tokens.

**Per-squad** you only set the **Board ID** (optional) in **Settings → JIRA Board**:
- The number in your board's URL (`…/boards/123`), or a project key like `ATH` (the
  project's first board is used).
- **Leave it blank** — that's allowed. Board ticket views (Dashboard table, Board menu)
  just stay empty until a board id is resolvable (squad board id, else `JIRA_DEFAULT_BOARD_ID`).

The form shows whether the global credentials are configured, and **Test connection**
verifies them (`✅ Connected as: <you>`). If credentials are missing, the dashboard shows
a popup telling you which env vars to set.

## 4. Set up the team (Settings)

- **Team Members** — add each person with a short **name**, an optional **full name**,
  and a position (FE/BE/QA/PM/FULLSTACK/ALL). Existing members can be **edited** inline
  (Edit button) or removed. `FULLSTACK` can be assigned as FE or BE; `ALL` can be assigned
  as FE, BE or QA. Optionally record their **JIRA account id** — the opaque Atlassian id (e.g.
  `5b10ac8d82e05b22cc7d4ef5`), *not* the email/username. It links the member to their
  JIRA assignee. The account-id field is a **picker**: it offers a dropdown of the site's
  JIRA users (name + email) pulled live — pick a person to fill the id automatically, or
  paste one manually. (The dropdown needs the *Browse users and groups* global permission;
  if it's empty you can still find an id from the JIRA profile URL `…/jira/people/<accountId>`,
  via `GET {base}/rest/api/3/user/search?query=<email>`, or any issue's `assignee.accountId`.)
- **Leave / cuti** — under each member, add a leave with start/end dates, an optional
  **substitute**, and a note. Members on leave *today* are flagged on the dashboard with
  their date range and cover.
- **Sprints** — add each sprint with its **number**, optional name, **start** and **end**
  dates. The dashboard auto-selects the sprint whose range contains today.
- **Public Holidays** — add dates the team is off.

## 5. Run the standup (Current Sprint)

1. The header shows the active **Sprint** and its dates. **On first load, if JIRA is
   configured and there's no local sprint, the active sprint (number, dates) is pulled
   from JIRA automatically.** Use **↻ Sync from JIRA** any time to refresh it. The
   **Standup date** defaults to today — change it if you're catching up a missed day.
2. The left column shows **Team Members** (with leave status) and the **Blockers** panel.
3. The main table lists every board ticket as a row. For each ticket, going around the
   team, the lead records:
   - **Assignees (FE/BE/QA)** — who is actually working on it
   - **Update** — the spoken update, in the text area
   - **Progress** — drag the slider (0–100%)
   - **Blocker Note** — anything blocking it
4. Each row saves automatically when you click away from a field (or hit **Save**).
   The ticket key links out to JIRA.

A **status filter** sits above the table (same chips as the Board): **Done** and
**Archived** tickets are **hidden by default** — click a status chip to toggle it.

Tickets that also appear in an earlier sprint of the squad show a **↪ carry-over** flag.

**Hold.** Click **Hold** on a ticket row to mark it on hold (e.g. blocked or deprioritized);
the row greys out and shows a ⏸ Hold chip. Click **Resume** to clear it. Hold is saved per
standup date and doesn't change the ticket's story points or progress — it's a visual cue.

**Progress** can be set with the slider **or** typed directly in the number box (0–100).

Rows can be **grouped by Epic or Parent/Story**, each ticket shows its **priority**, and
the FE/BE/QA boxes **suggest** squad members of that role (still free text) — `FULLSTACK`
members show in FE+BE boxes, `ALL` members in FE+BE+QA.

The left column also shows the **Standup Lead** rotation (a different member leads each
working day). On **Cuti** a member is excluded for those days (turn passes on). On
**Sakit/Izin** they are covered for that day — by their leave **substitute** if set
(customizable in the Team panel), otherwise the next available member — and they keep
their place, so they lead the **next** standup (the skipped turn switches forward) and you can set a member's **status**
(Cuti / Sakit / Izin + dates + substitute) right from the **Team Members** panel — guests
can do this too. A **Sprint Timeline** of day-blocks (date + weekday) sits below the
header, marking elapsed days, today, and weekends/holidays.

An **Update Log** panel on the left records every saved update — who (member name or
guest lead), which ticket, the progress and any blocker — with a timestamp.

### Blockers stay in sync

Type a **Blocker Note** on a ticket and it appears in the **Blockers** panel
automatically (description + ticket + date). Clear the note later and that blocker is
marked **resolved**. You can also add standalone blockers directly in the panel, and
mark any blocker resolved/reopened or delete it.

### Standup session lock

Multiple people (guests included) can open the same dashboard at once. Click **▶ Start
standup** to take the lead — while you lead, **only you can edit** the tickets; everyone
else sees a read-only banner "🔒 Standup led by <you>". Click **■ End standup** to release.

If the lead closes the tab or logs out, the lock auto-releases after ~45s (heartbeat
stops) so someone else can **Start standup** and take over. **Admins** can always edit and
can **Take over** an active session.

## 6. Browse the board (active sprint)

The **Board** menu shows every ticket in the board's **currently active sprint**, pulled
live from JIRA — Key (links to JIRA), **Type**, Status, Priority, Summary, Assignee. Use
**↻ Refresh** to re-pull.

**Filter by status:** a row of status chips lets you toggle which statuses are shown.
**Done** and **Archived** tickets are **hidden by default** — click their chip to reveal
them, or click any active status to hide it.

If the board is Kanban (no sprints) or has no active sprint, the list is empty.

## 7. Review previous sprints

Go to **Previous Sprints** and choose a sprint (read-only history). A **Sprint Summary**
sits on top:
- **Performance** — average progress, tickets done vs carry-over;
- **JIRA status distribution** — % Done / In QA / In Progress / To Do (anything not Done is
  flagged as **carry-over** to the next sprint, including In QA);
- **Blockers** — how many tickets were blocked and how many notes;
- **Sprint info** — start/end and day breakdown (total · working · weekend · holiday);
- **Team status** — counts of Available / Cuti / Sakit / Izin during the sprint, plus a
  per-member breakdown of how many working days each was away (and, for Cuti, the
  substitute).

Carry-over counts **everything except Done** (In QA, In Progress, To Do) as rolling into
the next sprint.

Use **Export CSV** to download the entries, or **Export to Confluence** to publish a
formatted report page — it opens the page in a new tab. Confluence reuses the server's
JIRA Atlassian credentials. The target **space key** and **parent page id** can be set
**per-squad** (Settings → Squads → Edit); when left blank they fall back to the global
env defaults (`CONFLUENCE_SPACE_KEY` / `CONFLUENCE_PARENT_ID`).

Once a sprint has been exported it shows a **✓ on Confluence** badge; the button becomes
**Update Confluence page** and re-exporting **overwrites the same page** (no duplicates).
Every export is listed in the **Confluence export history** section (create/update, who,
when, link). The server also **auto-exports** a sprint to Confluence shortly after its end
date passes (if Confluence is configured).

Tickets can be **grouped by Epic or Parent/Story**, and each ticket key **links to JIRA**.
Each ticket shows a card with:

- **Assignees** (FE/BE/QA),
- a **progress chart** (y = progress %, x = date),
- an **update log** — one row per date with that day's note,
- a **blocker list** — one row per date that had a blocker.

Grouping and these snapshots work for any sprint recorded after this version (each saved
entry stores the ticket's epic/parent at the time).

## 8. Velocity & Burndown

Open **Velocity** for story-point trends across sprints (the last 12):

- **Source toggle** — pick where the numbers come from:
  - **From standups** — computed from **this tool's standup snapshots** (story points + status
    recorded each day, stored in the app DB). It fills in as you run standups here — sprints
    never run through a standup won't appear. Includes the burndown.
  - **From JIRA** — computed **live from JIRA's closed sprints** (the board's story points), so
    it works even without standups. For each closed sprint: **Committed** = sum of story points
    of all its issues, **Completed** = sum for Done/Closed/Resolved issues. Uses the squad's
    configured Story Points field (Settings → Squads → Edit), shows the last 12 closed sprints,
    and refreshes ~60s. No burndown for this source (JIRA has no per-day snapshot). Note:
    "Committed" reflects the issues currently in the sprint, not a sprint-start snapshot.
- **Story points per sprint** — two bars per sprint: **Committed** (total points) vs
  **Completed** (points on Done/Closed/Resolved tickets), plus the **average completed**
  velocity for planning. Hover a sprint for its exact numbers.
- **Burndown** (standups source) — click any sprint bar to see its daily burndown below:
  **Remaining** vs the **Ideal** line across the sprint's calendar days. **Hover** the bars or
  the burndown line for exact numbers.
- **Tips card** — a stacked flashcard deck (auto-advances every 10s, hide/show, ← Prev / Next →)
  with tips on keeping velocity healthy (commit realistically, slice tickets, attack blockers
  early, watch the trend).

## 8b. Moon Phase (Team Mood)

Track how the team **feels** through the sprint, alongside how much it ships.

- **Setting a mood** — on the **Stand Up Meeting** page, each member in the team list shows a
  mood emoji (scale **1–5**, default 😄 "Great"). Only the selected emoji is shown. Click or
  hover it to open the picker; **hover** any of the five moods to read what it represents (a few
  cues per mood), then **click** to set it. The member's emoji updates to the chosen mood.
- **When / who** — mood can only be set while a standup is **running**. Clicking **Start
  Standup** seeds a default 😄 (5) for every member on that date; the lead (or an admin) can then
  adjust any member's mood. After **End Standup** the pickers lock again (start a new standup to
  edit). If a standup was never started for a day, no mood is saved for it. Mood is recorded
  **per member, per standup date** (follows the date picker at the top of the page).
- **Moon Phase page** — under the 🔮 **Crystal Ball** menu. It shows:
  - a **team-average mood line** across the sprint's recorded days,
  - a **per-member heatmap** (one colored emoji cell per member per day, plus each member's
    average), and
  - a **sprint selector** to browse mood from **previous sprints** (history), newest first.
- **Default is happy** — the day axis is every day a standup was started (moods were seeded).
  On those days a member who never adjusted their mood stays 😄 (5), so the default is reflected
  without anyone choosing it. Days without a started standup never appear; a sprint with no
  started standups shows a friendly placeholder.

## 9. Clairvoyance (Sprint Grooming)

The **Clairvoyance** menu is a **read-only** grooming view of upcoming work, pulled live
from JIRA. It's meant to support the **Sprint Grooming** session.

A **source dropdown** lets you switch between grooming sources: every **future sprint** (the
not-yet-started sprints on the board, in order) and the **Backlog** (issues not assigned to
any sprint). Each option shows its ticket count.

The selected source's tickets are shown **grouped by parent/story**, each row with the
ticket **key** (links to JIRA), **type**, **summary**, **status** and **priority**. If no
future sprints or backlog exist yet, an empty state with a **↻ Reload** button is shown.
Results are cached ~60s server-side; Reload forces a re-pull.

## 10. Tarot (Planning Poker)

The **Tarot** menu runs collaborative estimation of the next sprint's tickets — it
supports **Sprint Planning**. Available to anyone logged in (guest or admin).

**How to play card.** The landing page shows a shuffleable (← Prev / Next →) **How to play**
card covering both roles: the **guest** flow (join, pick a card, confirm, special ❓/☕
cards) and the **host** flow (start a session, guide the vote & reveal, decide points, run
cycles, finish & sync to Jira).

**Rooms.** The landing page lists rooms (newest first); **+ Create room** is top-right.
Only **one ACTIVE room per squad** is allowed — while one is active, others **Join** it
instead of creating a new one. The creator becomes the **Host**; the room id and host are
stored, and the host runs the session.

**Live presence.** Everyone in a room sees the participant roster update in real time
(online dots), on both the host and guest screens. A **sound effect** plays when someone
joins. Real-time updates use GraphQL subscriptions over WebSocket.

**Voting flow.**
- The **host** picks a ticket from the next-sprint list and **Starts** a session.
- **Guests** see the deck face-up, **click a card** to select, then **click it again to
  confirm** (you can change your pick until you confirm). A sound plays on select/confirm.
- Once **every online voter has confirmed**, cards **reveal** — each participant's name +
  value (sorted by point), the **team-synchronization %** (how much the team agreed), and
  a **suggestion** (the most-picked value; blank on a draw).
- The host then **Sets the story point** (suggestion pre-filled) and fills **per-role
  FE/BE/QA** points in a popup — each capped at the ticket effort — or runs **Next cycle**
  to re-vote. If a member won't vote, the host can **Reveal now** (needs ≥1 confirmed card).
  An **elapsed timer** shows how long the current round has run.

**Live + reload-safe.** The roster updates in real time as people join/leave (closing a tab
drops you within a few seconds via a presence sweep). If a guest **refreshes** mid-round,
their confirmed card is **restored** rather than reset.

**Special cards.** ❓ = *information unclear / needs discussion*; ☕ = *need a break*.
Hover a special card for the full meaning.

**Scales.** The host can set the point system — **Fibonacci** (default), **Scrum**, or a
**Custom** list of numbers — and optionally **set it as the squad default** for future
rooms. ❓ and ☕ are always available.

**Host management (guarded).**
- **Reset points** — clears every decided point in the room (type `RESET`).
- **End room** — only allowed when **every** next-sprint ticket has a point.
- **Delete room** — type `DELETE`. An **ended** room can only be deleted by an **admin**.
- **Kick** a participant from the roster (kicked guests are sent back to the landing).

**Sync to Jira.** Once all tickets are pointed, the host can **write the points back to
the Jira board**: a popup maps **effort → Story Points** and the per-role points to the
squad's configured fields (same fields as Settings → Squads). Pick **at least one** field,
then **Sync**. A ticket that fails (permission / missing field) **doesn't stop the rest** —
you're told how many synced and which failed. **Reset Jira** restores each ticket's field
values captured *before* the last sync (the previous values are snapshotted so the sync is
reversible). Only a **signed-in user** (host or admin) can sync — **guests cannot** write to
the board.

**Guest end states.** When the room is **ended** — or a guest is **kicked** — guests are
shown a thank-you and a button to **view results**. Opening an *already* ended room jumps
straight to the results (no thank-you).

**History.** An ended room keeps its full record: **attendance** (everyone who joined),
decided points per ticket (effort + FE/BE/QA, grouped by parent/story, ticket links to
Jira). A **host or admin** can still **Sync / Reset Jira** from history. Ended rooms are
**auto-purged** after a retention window (`TAROT_ROOM_RETENTION_DAYS`, default 30; 0
disables) and can otherwise only be **deleted by an admin**.

**Activity log.** Key actions (create, estimate, sync, reset, end) are recorded in the
squad's **Update Log**.

## 11. Fortune (draft tickets with Gemini)

**Fortune** drafts JIRA tickets with Google Gemini. **Signed-in members only** (guests
can't create tickets). Requires a server-side `GEMINI_API_KEY` (plaintext, or encrypted
`GEMINI_API_KEY_ENC` + `GEMINI_ENC_KEY`), and JIRA configured for the selected squad.

**Modes** (top of the page): **Single ticket**, **Epic breakdown**, and **Import** (refine
an existing ticket). Tabs: **New draft**, **Drafts**, **History**.

**Generate.** Drop files (text / image / PDF) and/or type a requirement, pick a **Gemini
model** (a recommended default is preselected; the list comes from your key's available
models), then generate. Output follows the house **Gherkin UAC** template (GIVEN/WHEN/THEN,
EN|ID tables, image placeholders). Edit anything in the review step.

**Refine.** Send a follow-up instruction and Gemini rewrites the draft, keeping the prior
context (shown in the *Context & conversation* panel). **Usage** (tokens) + an **estimated**
cost (USD & IDR — actual billing lives in Google Cloud Console) are shown per draft.

**Create.** A popup shows the target **board** (from the selected squad) and asks for the
**reporter's JIRA email** (resolved to an accountId; if not found, the ticket is still
created and you're warned). Epics create the Epic then each linked child.

**Import → Update → Undo.** Search a board ticket by key or title, edit + refine it, then
**Update** JIRA. An **Undo** button restores the ticket's original summary/description.

**Drafts & History.** Save a draft to continue later (update the open one or save as new).
**History** logs who generated / created / updated / reverted each ticket, with usage + cost;
**Recreate** reopens an entry in the edit view first. Drafts/history are shared per-squad;
**delete** is limited to the creator or a super admin. History auto-purges after
`FORTUNE_HISTORY_RETENTION_DAYS` (default 90; 0 disables) — created tickets are untouched.

**After creating:** replace the `[image-…]` placeholders + TBD links (Figma/PRD/Postman/API)
in the description, and complete the remaining JIRA fields (assignee, story points, sprint,
components) directly on the ticket.

**Admin — model temperature.** In **Settings → Gemini (Fortune) settings**, an admin sets the
global sampling **temperature** (0–2; suggestions: 0 deterministic, **0.2 consistent —
recommended**, 0.4 balanced, 0.7 creative, 1.0 very creative). Lower = more consistent
adherence to the template; higher = more varied wording. Default comes from `GEMINI_TEMPERATURE`.

## 12. Manage admin accounts (super admin)

The **super admin** — the seeded account whose email = `SEED_ADMIN_EMAIL` — sees an **Admin
Accounts** panel in **Settings**. There it can:

- **Add admin** — enter email + name + password (min 6 chars). New admins are *regular*
  admins: full access to every setting except this panel.
- **Edit** an admin's name / email, **Reset password** (min 6), or **Delete** an admin
  (type-to-confirm).

The super admin can only manage **other** admins — its own row is read-only, so it can't
demote, delete, or lock itself out. The panel is hidden for regular admins and guests.

## 13. Reset the database (admin only)

Admins see a **Danger Zone** at the bottom of **Settings**. **Reset Database** deletes
every squad and all data under them (members, leaves, holidays, sprints, standup entries,
blockers, JIRA configs) — user logins are kept. Tick **Recreate default squads** to
re-add Athens / Berlin / Cairo afterwards. You must type `RESET` to enable the button.
This cannot be undone.

## 14. Health check

Open **`/health`** (no login needed) for a status page showing the GraphQL API, database
and JIRA-credential checks, auto-refreshing every 15s. Unknown URLs show a 404 page.

## 15. Theme & language

Use the 🌙 / ☀️ button in the header to toggle dark/light mode. Your choice is remembered.

Next to it, the **EN / ID** dropdown switches the interface language (English / Indonesian);
the choice persists across sessions. Navigation, common header controls, and the Help page
are translated — other pages are English for now.

## Tips

- The dashboard merges **live** board tickets with saved entries, so a ticket shows up as
  a row even before anyone has touched it that day.
- If tickets don't load, re-check the JIRA config (Settings → Test connection). A wrong
  Board ID or expired token is the usual cause.
- Switching the **Standup date** gives each day its own independent set of entries for the
  sprint.
