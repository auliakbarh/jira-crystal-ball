// Pure Tarot (planning poker) logic — no I/O, no side-effect imports — so it's
// trivially unit-testable and reusable by the resolver.

export const TAROT_STALE_MS = 15_000;
export const SPECIAL_CARDS = ["?", "coffee"];

export const PRESETS: Record<string, number[]> = {
  FIBONACCI: [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89],
  SCRUM: [0, 0.5, 1, 2, 3, 5, 8, 13, 20, 40, 100],
};

export function presetValues(scaleType: string, scaleValues?: string | null): number[] {
  if (scaleType === "CUSTOM") {
    try {
      const arr = JSON.parse(scaleValues ?? "[]");
      if (Array.isArray(arr)) return arr.map(Number).filter((n) => Number.isFinite(n));
    } catch {
      /* fall through */
    }
    return [];
  }
  return PRESETS[scaleType] ?? PRESETS.FIBONACCI;
}

// The full deck shown to players: numeric cards (as strings) + special cards.
export function deckStrings(scaleType: string, scaleValues?: string | null): string[] {
  return [...presetValues(scaleType, scaleValues).map((n) => String(n)), ...SPECIAL_CARDS];
}

export function isOnline(p: { leftAt: Date | null; kicked: boolean; lastSeen: Date }, now = Date.now()): boolean {
  return !p.leftAt && !p.kicked && now - new Date(p.lastSeen).getTime() < TAROT_STALE_MS;
}

// Vote statistics for a revealed round: team-synchronization % (share of the most
// common value) and a suggestion (the single most-picked NUMERIC value; null on a
// draw or when only special cards were played).
export function voteStats(votes: { value: string }[]): { syncPercent: number | null; suggestion: string | null } {
  const counts = new Map<string, number>();
  for (const v of votes) counts.set(v.value, (counts.get(v.value) ?? 0) + 1);
  const total = votes.length;
  let topCount = 0;
  for (const c of counts.values()) topCount = Math.max(topCount, c);
  const syncPercent = total > 0 ? Math.round((topCount / total) * 100) : null;

  const numeric = [...counts.entries()].filter(([k]) => !SPECIAL_CARDS.includes(k));
  let suggestion: string | null = null;
  if (numeric.length) {
    const max = Math.max(...numeric.map(([, c]) => c));
    const tops = numeric.filter(([, c]) => c === max);
    suggestion = tops.length === 1 ? tops[0][0] : null;
  }
  return { syncPercent, suggestion };
}

// Validate a per-role point: null passes through; otherwise must be a finite
// number in [0, effort]. Throws with a labelled message on violation.
export function capRolePoint(v: unknown, effort: number, label: string): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid ${label} point`);
  if (n > effort) throw new Error(`${label} point cannot exceed the ticket effort (${effort})`);
  return n;
}
