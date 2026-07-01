import { useEffect, useState } from "react";

// Elapsed time since a round started (count-up). Ticks once per second.
export default function RoundTimer({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const start = new Date(startedAt).getTime();
  const sec = Math.max(0, Math.floor((now - start) / 1000));
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return (
    <span className="font-mono tabular-nums" title="Time since this round started">
      ⏱ {mm}:{String(ss).padStart(2, "0")}
    </span>
  );
}
