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

## 8. Reset the database (admin only)

Admins see a **Danger Zone** at the bottom of **Settings**. **Reset Database** deletes
every squad and all data under them (members, leaves, holidays, sprints, standup entries,
blockers, JIRA configs) — user logins are kept. Tick **Recreate default squads** to
re-add Athens / Berlin / Cairo afterwards. You must type `RESET` to enable the button.
This cannot be undone.

## 9. Health check

Open **`/health`** (no login needed) for a status page showing the GraphQL API, database
and JIRA-credential checks, auto-refreshing every 15s. Unknown URLs show a 404 page.

## 10. Theme

Use the 🌙 / ☀️ button in the header to toggle dark/light mode. Your choice is remembered.

## Tips

- The dashboard merges **live** board tickets with saved entries, so a ticket shows up as
  a row even before anyone has touched it that day.
- If tickets don't load, re-check the JIRA config (Settings → Test connection). A wrong
  Board ID or expired token is the usual cause.
- Switching the **Standup date** gives each day its own independent set of entries for the
  sprint.
