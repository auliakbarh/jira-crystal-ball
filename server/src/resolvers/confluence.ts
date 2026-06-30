// Confluence export (report builder) + export history.
import type { Context } from "../context.js";
import { requireAuth } from "../context.js";
import { env } from "../env.js";
import { fetchActiveSprintIssues } from "../jira.js";
import { createPage, updatePage, escapeHtml, confluenceConfigured } from "../confluence.js";
import { jiraCfgForBoard, toISODate } from "./shared.js";

// Build the Confluence storage-format report for a sprint, then create/update
// the page and record the export. Returns the created/updated page.
async function exportSprint(ctx: Context, sprintId: string) {
  if (!confluenceConfigured()) throw new Error("CONFLUENCE_NOT_CONFIGURED");
  const sprint = await ctx.prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint) throw new Error("Sprint not found");
  const squad = await ctx.prisma.squad.findUnique({ where: { id: sprint.squadId } });

  const entries = await ctx.prisma.standupEntry.findMany({
    where: { sprintId },
    orderBy: [{ date: "asc" }, { ticketKey: "asc" }],
  });

  // Ticket list synced from the board's active sprint; entries consolidated on top.
  const byKey = new Map<string, any>();
  const cfg = jiraCfgForBoard(squad);
  if (cfg && cfg.boardId) {
    try {
      const board = await fetchActiveSprintIssues(cfg);
      for (const j of board) {
        byKey.set(j.key, {
          key: j.key,
          summary: j.summary,
          status: j.status,
          issueType: j.issueType,
          storyPoints: j.storyPoints,
          spFE: j.storyPointsFE,
          spBE: j.storyPointsBE,
          spQA: j.storyPointsQA,
          parentKey: j.parentKey ?? j.epicKey ?? null,
          parentName: j.parentName ?? j.epicName ?? null,
          fromBoard: true,
          updates: [] as any[],
          blockers: [] as any[],
        });
      }
    } catch {
      /* board unavailable → entry-derived tickets only */
    }
  }

  for (const e of entries) {
    let t = byKey.get(e.ticketKey);
    if (!t) {
      t = { key: e.ticketKey, updates: [], blockers: [] };
      byKey.set(e.ticketKey, t);
    }
    t.summary = t.summary ?? e.ticketSummary;
    t.status = t.status ?? e.ticketStatus;
    t.issueType = t.issueType ?? e.issueType;
    if (t.storyPoints == null && e.storyPoints != null) t.storyPoints = e.storyPoints;
    t.parentKey = t.parentKey ?? e.parentKey;
    t.parentName = t.parentName ?? e.parentName;
    t.progress = e.progress;
    if (e.feAssignee) t.fe = e.feAssignee;
    if (e.beAssignee) t.be = e.beAssignee;
    if (e.qaAssignee) t.qa = e.qaAssignee;
    t.feProg = e.feProgress;
    t.beProg = e.beProgress;
    t.qaProg = e.qaProgress;
    if ((e.updateText ?? "").trim()) t.updates.push({ date: toISODate(e.date), text: e.updateText });
    if ((e.blockerNote ?? "").trim()) t.blockers.push({ date: toISODate(e.date), text: e.blockerNote });
  }
  const tickets = Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key));

  const done = tickets.filter((t) => /done|closed|resolved/i.test(t.status ?? "")).length;
  const total = tickets.length;
  const carryOver = total - done;
  const jiraBase = env.jira.baseUrl.replace(/\/+$/, "");

  const statusLozenge = (status?: string | null) => {
    const s = (status ?? "").toLowerCase();
    let colour = "Grey";
    if (/done|closed|resolved/.test(s)) colour = "Green";
    else if (/qa|review|test/.test(s)) colour = "Yellow";
    else if (/progress|doing|develop/.test(s)) colour = "Blue";
    if (!status) return "";
    return `<ac:structured-macro ac:name="status"><ac:parameter ac:name="colour">${colour}</ac:parameter><ac:parameter ac:name="title">${escapeHtml(status)}</ac:parameter></ac:structured-macro>`;
  };

  const spTag = (t: any) => {
    const lines: string[] = [];
    if (t.storyPoints != null) lines.push(`<strong>Story Point:</strong> ${t.storyPoints} SP`);
    if (t.spFE != null) lines.push(`<strong>FE Story Point:</strong> ${t.spFE} SP`);
    if (t.spBE != null) lines.push(`<strong>BE Story Point:</strong> ${t.spBE} SP`);
    if (t.spQA != null) lines.push(`<strong>QA Story Point:</strong> ${t.spQA} SP`);
    if (lines.length === 0) return "";
    return `<p style="color:#6b778c;font-size:12px;">${lines.join("<br/>")}</p>`;
  };
  const ticketCell = (t: any) => {
    if (jiraBase) {
      return `<ac:structured-macro ac:name="jira" ac:schema-version="1"><ac:parameter ac:name="key">${escapeHtml(t.key)}</ac:parameter></ac:structured-macro>${spTag(t)}`;
    }
    return `<p><strong>${escapeHtml(t.key)}</strong> ${escapeHtml(t.issueType ?? "")} ${statusLozenge(t.status)}</p><p>${escapeHtml(t.summary ?? "")}</p>${spTag(t)}`;
  };

  const effProgress = (t: any) =>
    /done|closed|resolved/i.test(t.status ?? "") ? 100 : Math.max(0, Math.min(100, t.progress ?? 0));

  const progressCell = (t: any) => {
    const v = effProgress(t);
    const colour = v >= 100 ? "Green" : v >= 50 ? "Blue" : v > 0 ? "Yellow" : "Grey";
    return `<ac:structured-macro ac:name="status"><ac:parameter ac:name="colour">${colour}</ac:parameter><ac:parameter ac:name="title">${v}%</ac:parameter></ac:structured-macro>`;
  };

  const row = (t: any, n: number) => {
    const updates = t.updates.map((u: any) => `<p><strong>${escapeHtml(u.date.slice(5))}</strong> ${escapeHtml(u.text)}</p>`).join("") || "—";
    const blockers = t.blockers.map((b: any) => `<p>🚧 <strong>${escapeHtml(b.date.slice(5))}</strong> ${escapeHtml(b.text)}</p>`).join("") || "—";
    const pctTag = (p?: number) => (typeof p === "number" ? ` (${p}%)` : "");
    const assignees =
      [
        t.fe && `FE: ${escapeHtml(t.fe)}${pctTag(t.feProg)}`,
        t.be && `BE: ${escapeHtml(t.be)}${pctTag(t.beProg)}`,
        t.qa && `QA: ${escapeHtml(t.qa)}${pctTag(t.qaProg)}`,
      ]
        .filter(Boolean)
        .join("<br/>") || "—";
    return `<tr>
      <td><p>${n}</p></td>
      <td>${ticketCell(t)}</td>
      <td>${assignees}</td>
      <td>${progressCell(t)}</td>
      <td>${updates}</td>
      <td>${blockers}</td>
    </tr>`;
  };

  const groupsMap = new Map<string, { key: string; parentKey: string | null; tickets: any[] }>();
  for (const t of tickets) {
    const gk = t.parentKey ?? t.key;
    if (!groupsMap.has(gk)) groupsMap.set(gk, { key: gk, parentKey: t.parentKey ?? null, tickets: [] });
    groupsMap.get(gk)!.tickets.push(t);
  }
  const groups = Array.from(groupsMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  const groupHeader = (g: any) => {
    const label = g.parentKey
      ? `<ac:structured-macro ac:name="jira" ac:schema-version="1"><ac:parameter ac:name="key">${escapeHtml(g.parentKey)}</ac:parameter></ac:structured-macro>`
      : "<em>No parent</em>";
    return `<tr><td colspan="6" data-highlight-colour="#deebff"><strong>📂 ${label}</strong> <span style="color:#6b778c;">(${g.tickets.length})</span></td></tr>`;
  };
  let rowNo = 0;
  const bodyRows = groups.map((g) => groupHeader(g) + g.tickets.map((t: any) => row(t, ++rowNo)).join("")).join("");

  const bucket = (s?: string | null) => {
    const x = (s ?? "").toLowerCase();
    if (/done|closed|resolved/.test(x)) return "Done";
    if (/qa|review|test/.test(x)) return "In QA";
    if (/progress|doing|develop/.test(x)) return "In Progress";
    return "To Do";
  };
  const dist: Record<string, number> = { Done: 0, "In QA": 0, "In Progress": 0, "To Do": 0 };
  for (const t of tickets) dist[bucket(t.status)]++;

  const sp = (t: any) => (typeof t.storyPoints === "number" ? t.storyPoints : 0);
  const totalSP = tickets.reduce((s: number, t: any) => s + sp(t), 0);
  const doneSP = tickets.filter((t) => bucket(t.status) === "Done").reduce((s: number, t: any) => s + sp(t), 0);
  const num = (x: any) => (typeof x === "number" ? x : 0);
  const spByMember = new Map<string, number>();
  const addSP = (name: string | undefined, pts: number) => {
    if (!name || !pts) return;
    spByMember.set(name, (spByMember.get(name) ?? 0) + pts);
  };
  for (const t of tickets) {
    addSP(t.fe, t.spFE != null ? num(t.spFE) : sp(t));
    addSP(t.be, t.spBE != null ? num(t.spBE) : sp(t));
    addSP(t.qa, t.spQA != null ? num(t.spQA) : sp(t));
  }

  const members = await ctx.prisma.teamMember.findMany({
    where: { squadId: sprint.squadId },
    include: { leaves: { include: { substitute: true } } },
  });
  const holidays = await ctx.prisma.holiday.findMany({ where: { squadId: sprint.squadId } });
  const holidaySet = new Set(holidays.map((h) => toISODate(h.date)));
  const startISO = toISODate(sprint.startDate);
  const endISO = toISODate(sprint.endDate);
  const workingDays = (aISO: string, bISO: string): number => {
    let n = 0;
    const cur = new Date(`${aISO}T00:00:00.000Z`);
    const end = new Date(`${bISO}T00:00:00.000Z`);
    for (let i = 0; i < 400 && cur <= end; i++) {
      const iso = cur.toISOString().slice(0, 10);
      const dow = cur.getUTCDay();
      if (dow !== 0 && dow !== 6 && !holidaySet.has(iso)) n++;
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return n;
  };
  const LEAVE_LABEL: Record<string, string> = { CUTI: "Annual Leave", SAKIT: "Sick", IZIN: "Permission" };
  const LEAVE_COLOUR: Record<string, string> = { CUTI: "Red", SAKIT: "Yellow", IZIN: "Blue" };
  const manpower = { CUTI: 0, SAKIT: 0, IZIN: 0 };
  let availableCount = 0;
  const sprintDays = workingDays(startISO, endISO);

  const rosterRows: string[] = [];
  for (const m of members) {
    const overlapping = m.leaves.filter((l) => {
      const ls = toISODate(l.startDate);
      const le = toISODate(l.endDate);
      return !(ls > endISO || le < startISO);
    });
    let statusCell: string;
    if (overlapping.length === 0) {
      availableCount++;
      statusCell = `<ac:structured-macro ac:name="status"><ac:parameter ac:name="colour">Green</ac:parameter><ac:parameter ac:name="title">Available</ac:parameter></ac:structured-macro>`;
    } else {
      const parts: string[] = [];
      for (const l of overlapping) {
        const ls = toISODate(l.startDate);
        const le = toISODate(l.endDate);
        const os = ls > startISO ? ls : startISO;
        const oe = le < endISO ? le : endISO;
        const days = workingDays(os, oe);
        const type = (l.type as string) ?? "CUTI";
        if (type in manpower) (manpower as any)[type] += 1;
        const sub = type === "CUTI" && l.substitute ? ` · cover: <strong>${escapeHtml(l.substitute.name)}</strong>` : "";
        parts.push(
          `<ac:structured-macro ac:name="status"><ac:parameter ac:name="colour">${LEAVE_COLOUR[type] ?? "Grey"}</ac:parameter><ac:parameter ac:name="title">${LEAVE_LABEL[type] ?? type}</ac:parameter></ac:structured-macro> ${days}d${sub}`,
        );
      }
      statusCell = parts.join("<br/>");
    }
    const memberSP = spByMember.get(m.name) ?? 0;
    rosterRows.push(
      `<tr><td><strong>${escapeHtml(m.name)}</strong></td><td>${escapeHtml(m.position)}</td><td>${memberSP} SP</td><td>${statusCell}</td></tr>`,
    );
  }

  const avgProgress = total ? Math.round(tickets.reduce((s: number, t: any) => s + effProgress(t), 0) / total) : 0;

  const html = `
    <h2>${escapeHtml(squad?.name ?? "Squad")} — Sprint ${sprint.number}${sprint.name ? ` (${escapeHtml(sprint.name)})` : ""}</h2>
    <p><strong>Range:</strong> ${startISO} → ${endISO} &nbsp;·&nbsp; ${sprintDays} working days</p>
    <table data-table-width="760">
      <colgroup><col style="width: 90.0px"/><col style="width: 80.0px"/><col style="width: 80.0px"/><col style="width: 110.0px"/><col style="width: 80.0px"/><col style="width: 100.0px"/><col style="width: 110.0px"/><col style="width: 110.0px"/></colgroup>
      <tbody>
        <tr>
          <th>Tickets</th><th>Done</th><th>In QA</th><th>In Progress</th><th>To Do</th>
          <th>Carry-over</th><th>Avg Progress</th><th>Story Points</th>
        </tr>
        <tr>
          <td><strong>${total}</strong> tickets</td>
          <td>${dist.Done} tickets</td>
          <td>${dist["In QA"]} tickets</td>
          <td>${dist["In Progress"]} tickets</td>
          <td>${dist["To Do"]} tickets</td>
          <td>${carryOver} tickets</td>
          <td><strong>${avgProgress}%</strong></td>
          <td><strong>${doneSP}</strong> / ${totalSP} SP</td>
        </tr>
      </tbody>
    </table>
    <p><em>Counts are ticket counts · <strong>Avg Progress</strong> = average ticket progress percentage · <strong>Story Points</strong> = done / total SP · <strong>Carry-over</strong> = tickets not Done.</em></p>

    <h3>📈 Sprint progress</h3>
    ${(() => {
      const LEGEND: Record<string, string> = { Done: "Green", "In QA": "Yellow", "In Progress": "Blue", "To Do": "Grey" };
      const segs = [
        { label: "Done", n: dist.Done, colour: "#36b37e" },
        { label: "In QA", n: dist["In QA"], colour: "#ffab00" },
        { label: "In Progress", n: dist["In Progress"], colour: "#4c9aff" },
        { label: "To Do", n: dist["To Do"], colour: "#c1c7d0" },
      ].filter((s) => s.n > 0);
      if (!total || segs.length === 0) return "<p>No tickets.</p>";
      const pct = (n: number) => Math.round((n / total) * 100);
      const BAR_W = 680;
      const cols = segs.map((s) => `<col style="width: ${Math.max(Math.round((s.n / total) * BAR_W), 8)}.0px" />`).join("");
      const cells = segs.map((s) => `<td data-highlight-colour="${s.colour}"><p>&nbsp;</p></td>`).join("");
      const legend = segs
        .map(
          (s) =>
            `<ac:structured-macro ac:name="status"><ac:parameter ac:name="colour">${LEGEND[s.label]}</ac:parameter><ac:parameter ac:name="title">${escapeHtml(s.label)} ${s.n} (${pct(s.n)}%)</ac:parameter></ac:structured-macro>`,
        )
        .join(" ");
      return `<table data-table-width="680"><colgroup>${cols}</colgroup><tbody><tr>${cells}</tr></tbody></table>
        <p>${legend}</p>
        <p>Average ticket progress: <strong>${avgProgress}%</strong></p>`;
    })()}

    <h3>👥 Man-power (this sprint)</h3>
    <p>Available <strong>${availableCount}</strong> · Annual Leave <strong>${manpower.CUTI}</strong> · Sick <strong>${manpower.SAKIT}</strong> · Permission <strong>${manpower.IZIN}</strong> · of ${members.length} member(s)</p>
    ${
      members.length
        ? `<table data-table-width="760">
             <colgroup><col style="width: 230.0px"/><col style="width: 90.0px"/><col style="width: 110.0px"/><col style="width: 330.0px"/></colgroup>
             <tbody>
               <tr><th>Member</th><th>Role</th><th>Story Points</th><th>Status (this sprint)</th></tr>
               ${rosterRows.join("")}
             </tbody>
           </table>`
        : "<p>No team members configured.</p>"
    }
    <h3>📋 Tickets</h3>
    <table data-table-width="800">
      <colgroup><col style="width: 40.0px"/><col style="width: 170.0px"/><col style="width: 120.0px"/><col style="width: 95.0px"/><col style="width: 245.0px"/><col style="width: 130.0px"/></colgroup>
      <tbody>
        <tr><th>No</th><th>Ticket</th><th>Assignees</th><th>Progress</th><th>Updates</th><th>Blockers</th></tr>
        ${bodyRows}
      </tbody>
    </table>
    <p><em>Generated by JIRA Crystal Ball — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.</em></p>`;

  const sprintLabel = sprint.name ? `Sprint (${sprint.name})` : `Sprint ${sprint.number}`;
  const title = `${squad?.name ?? "Squad"} - ${sprintLabel}`;

  const confluenceTarget = {
    spaceKey: squad?.confluenceSpaceKey ?? undefined,
    parentId: squad?.confluenceParentId ?? undefined,
  };

  const isUpdate = !!sprint.confluencePageId;
  let page;
  if (isUpdate) {
    page = await updatePage(sprint.confluencePageId!, title, html);
  } else {
    try {
      page = await createPage(title, html, confluenceTarget);
    } catch (e: any) {
      if (/title|already exists|400|409/i.test(e?.message ?? "")) {
        const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
        page = await createPage(`${title} - ${stamp}`, html, confluenceTarget);
      } else {
        throw e;
      }
    }
  }

  await ctx.prisma.sprint.update({
    where: { id: sprintId },
    data: { confluencePageId: page.id, confluenceUrl: page.url, confluenceExportedAt: new Date() },
  });
  await ctx.prisma.exportLog.create({
    data: {
      sprintId,
      squadId: sprint.squadId,
      pageId: page.id,
      url: page.url,
      action: isUpdate ? "update" : "create",
      actor: ctx.userName ?? null,
    },
  });
  return page;
}

export const confluenceResolvers = {
  Query: {
    exportHistory: (_p: unknown, { sprintId }: { sprintId: string }, ctx: Context) => {
      requireAuth(ctx);
      return ctx.prisma.exportLog.findMany({ where: { sprintId }, orderBy: { createdAt: "desc" }, take: 50 });
    },
  },
  Mutation: {
    exportSprintToConfluence: (_p: unknown, { sprintId }: { sprintId: string }, ctx: Context) => {
      requireAuth(ctx);
      return exportSprint(ctx, sprintId);
    },
  },
};
