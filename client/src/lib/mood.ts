// Mood scale for standup — 1 (worst) .. 5 (best/happy). Default = 5 (happy).
// Emoji + colors live here; labels + info blurbs come from i18n (mood.mN.*).
export type MoodValue = 1 | 2 | 3 | 4 | 5;

export const MOOD_DEFAULT: MoodValue = 5;
export const MOOD_VALUES: MoodValue[] = [1, 2, 3, 4, 5];

export interface MoodMeta {
  value: MoodValue;
  emoji: string;
  /** i18n key suffix, e.g. mood.m5.label / mood.m5.infos */
  key: string;
  /** Tailwind classes for the chip / cell background + text. */
  chip: string;
  /** Solid color for charts (hex). */
  color: string;
}

export const MOODS: Record<MoodValue, MoodMeta> = {
  1: { value: 1, emoji: "😫", key: "m1", chip: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300", color: "#ef4444" },
  2: { value: 2, emoji: "😟", key: "m2", chip: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300", color: "#f97316" },
  3: { value: 3, emoji: "😐", key: "m3", chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300", color: "#f59e0b" },
  4: { value: 4, emoji: "🙂", key: "m4", chip: "bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300", color: "#84cc16" },
  5: { value: 5, emoji: "😄", key: "m5", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300", color: "#10b981" },
};

export const moodMeta = (v: number): MoodMeta => MOODS[(Math.min(5, Math.max(1, Math.round(v))) as MoodValue)] ?? MOODS[MOOD_DEFAULT];
