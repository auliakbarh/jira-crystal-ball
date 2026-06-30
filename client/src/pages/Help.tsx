const SECTIONS: { title: string; items: string[] }[] = [
  {
    title: "Getting started",
    items: [
      "Pick your squad from the dropdown in the header. Each squad has its own board, members, sprints and holidays.",
      "Guests run standups without an account; admins (login) also manage Settings. On the guest screen the name field suggests existing team-member names as you type.",
      "Need the current sprint pulled in? Use ↻ Sync from JIRA on the Current Sprint page.",
    ],
  },
  {
    title: "Running a standup (Current Sprint)",
    items: [
      "Click ▶ Start standup to take the lead — only you can edit while you lead; others are read-only. Click ■ End standup to release (it also auto-releases if you close the tab).",
      "Pick the Standup date (within the sprint range) or click a day in the Sprint Timeline.",
      "For each ticket row, record FE/BE/QA assignees (suggested from members), the update note, progress, and any blocker note. Rows save on blur.",
      "Per-assignee progress shows when a role name is filled; the ticket % mirrors their average. A Done ticket is always 100%.",
      "A blocker note auto-syncs into the Blockers panel; clearing it resolves the blocker.",
      "Group tickets by Epic or Parent/Story, filter by status (Done/Archived hidden by default), and toggle carry-over only.",
      "Keyboard: Enter / Alt+↑↓ move between rows; ⤢ expands a note into a popup.",
    ],
  },
  {
    title: "Panels",
    items: [
      "Standup Lead — a rotating lead per working day (skips members on leave).",
      "Team Members — position, leave status (+substitute), and story points per member.",
      "Blockers — add/resolve (with a resolve note); synced from ticket blocker notes.",
      "Update Log — every saved update (searchable, infinite scroll) with the note before→after.",
      "Standup Duration Log — how long each standup took, who led, when.",
    ],
  },
  {
    title: "Board",
    items: [
      "Live tickets of the board's active sprint: key (links to JIRA), type, status, priority, story points, assignee.",
      "Filter by status, group by epic/parent, carry-over only, ↻ Refresh to re-pull.",
    ],
  },
  {
    title: "Clairvoyance (Grooming)",
    items: [
      "Read-only view of the NEXT sprint's tickets (the future sprint after the active one), live from JIRA — helps the Sprint Grooming session.",
      "Each row: key (links to JIRA), type, summary, status, priority — grouped by parent/story.",
      "If the next sprint has no tickets, or hasn't been created yet, you'll see an empty state with a ↻ Reload button.",
    ],
  },
  {
    title: "Tarot (Planning Poker)",
    items: [
      "Estimate next-sprint tickets together — helps Sprint Planning. The landing page lists rooms (newest first); + Create room is top-right. Only one ACTIVE room per squad; others Join it instead of creating another.",
      "The creator becomes Host; everyone else joins as a participant. The live roster (with online dots) updates in real time, and a sound plays when someone joins.",
      "Host: pick a ticket and Start a session. Guests see the deck face-up and pick a card, then click it again to confirm. Cards reveal once everyone has voted, showing each pick, the team-synchronization %, and a suggested point (the most-picked value).",
      "Host then Sets the story point (suggestion pre-filled) and fills per-role FE/BE/QA points (each capped at the ticket effort), or runs another cycle (Next cycle).",
      "Special cards: ❓ = info unclear / needs discussion, ☕ = need a break. Hover a special card for its meaning.",
      "Host controls: change the point scale (Fibonacci / Scrum / Custom, optionally set as squad default), Reset points (type RESET), End room (only when every ticket is pointed), Delete room (type DELETE), and kick participants.",
      "Sync to Jira: once all tickets are pointed, write the effort + per-role points back to the squad's configured Jira fields (pick at least one). Reset Jira restores the values from before the last sync.",
      "Once the room is ended (or you're kicked) guests return to the Tarot landing with a thank-you. Ended rooms can only be deleted by an admin; their results stay as history.",
    ],
  },
  {
    title: "Previous Sprints",
    items: [
      "Read-only history: sprint summary (status %, progress, blockers, man-power, story points), grouped tickets, per-ticket progress chart + update/blocker history.",
      "Export to Confluence (creates/updates one report page; export history is listed).",
    ],
  },
  {
    title: "Settings (admin)",
    items: [
      "Squads — add/switch/delete; edit name, board id, Story Point fields (default + FE/BE/QA; pick from the board field list), per-squad Confluence Space Key + Parent ID (blank = global env default), and the Tarot default point scale (Fibonacci/Scrum/Custom — a host can still override per room).",
      "Members — add with a short name, optional full name, and position; edit or delete existing members inline. Plus leave (Annual/Sick/Permission + substitute), Sprints, Public Holidays, JIRA Board test.",
      "Bulk setup: admins can seed squads + members from a JSON file via `npm run db:seed:config` (idempotent; see DEPLOYMENT docs).",
      "Member JIRA account id (optional) — the opaque Atlassian id (e.g. 5b10ac8d82e05b22cc7d4ef5), not the email; links the member to their JIRA assignee. The field is a picker: choose a JIRA user (name + email) from the dropdown to fill the id, or paste one manually (profile URL …/jira/people/<id>, or /rest/api/3/user/search?query=<email>).",
      "Danger Zone — reset the database (admin only).",
    ],
  },
];

export default function Help() {
  return (
    <div className="space-y-5">
      <div className="card">
        <h1 className="text-xl font-bold">❓ How to use the dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          A quick guide to running standups with JIRA Crystal Ball.
        </p>
      </div>

      {SECTIONS.map((s) => (
        <div key={s.title} className="card">
          <h2 className="mb-2 text-base font-bold">{s.title}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300">
            {s.items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
