import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MOODS, MOOD_VALUES, moodMeta, type MoodValue } from "../lib/mood";

/**
 * Per-member mood control. Shows only the selected emoji; click (or hover) opens
 * a small popover to pick a mood 1..5. Hovering a mood shows an info box that
 * explains what that mood represents. Picking updates the shown emoji.
 *
 * UI-only for now: `value`/`onChange` let the parent hold state; if `onChange`
 * is omitted it self-manages (dummy). Wire to a mutation at implementation.
 */
export default function MoodPicker({
  value,
  onChange,
  disabled = false,
  name,
}: {
  value?: MoodValue;
  onChange?: (v: MoodValue) => void;
  disabled?: boolean;
  name?: string;
}) {
  const { t } = useTranslation();
  const [self, setSelf] = useState<MoodValue>(value ?? 5);
  const current = value ?? self;
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<MoodValue | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (v: MoodValue) => {
    if (disabled) return;
    if (onChange) onChange(v);
    else setSelf(v);
    setOpen(false);
  };

  const meta = moodMeta(current);
  const infoFor = hovered ?? current;
  const infos = t(`mood.${MOODS[infoFor].key}.infos`, { returnObjects: true }) as string[];

  return (
    <div
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => !disabled && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        title={disabled ? t("mood.disabledHint") : t("mood.pickLabel")}
        aria-label={t("mood.moodOf", { name: name ?? "", mood: t(`mood.${meta.key}.label`) })}
        className="flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none transition hover:scale-110 hover:bg-gray-100 disabled:cursor-default disabled:opacity-70 dark:hover:bg-gray-800"
      >
        <span>{meta.emoji}</span>
      </button>

      {open && !disabled && (
        <div className="absolute left-1/2 top-full z-30 mt-1 w-64 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-2 shadow-xl dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {t("mood.pickLabel")}
          </div>
          {/* Emoji row: worst → best */}
          <div className="flex items-center justify-between gap-1">
            {MOOD_VALUES.map((v) => {
              const m = MOODS[v];
              const isCur = v === current;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => pick(v)}
                  onMouseEnter={() => setHovered(v)}
                  onMouseLeave={() => setHovered(null)}
                  className={`flex flex-1 flex-col items-center rounded-md py-1.5 text-2xl transition hover:scale-110 ${
                    isCur ? "bg-gray-100 ring-2 ring-brand dark:bg-gray-800" : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <span>{m.emoji}</span>
                  <span className="mt-0.5 text-[9px] font-semibold text-gray-400">{v}</span>
                </button>
              );
            })}
          </div>

          {/* Info box for the hovered (or selected) mood */}
          <div className="mt-2 rounded-md bg-gray-50 p-2 dark:bg-gray-800/60">
            <div className="flex items-center gap-1.5">
              <span className="text-base">{MOODS[infoFor].emoji}</span>
              <span className={`chip ${MOODS[infoFor].chip}`}>{t(`mood.${MOODS[infoFor].key}.label`)}</span>
            </div>
            <ul className="mt-1.5 space-y-0.5 text-[11px] text-gray-600 dark:text-gray-300">
              {infos.map((line, i) => (
                <li key={i} className="flex gap-1">
                  <span className="text-gray-400">·</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-1.5 text-center text-[10px] text-gray-400">{t("mood.scaleHint")}</div>
        </div>
      )}
    </div>
  );
}
