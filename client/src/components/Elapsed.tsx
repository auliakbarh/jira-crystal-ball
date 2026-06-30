import { useEffect, useState } from "react";
import { formatDuration } from "../lib/helpers";

// Live ticking elapsed time since `startedAt` (ISO).
export default function Elapsed({ startedAt }: { startedAt: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const sec = (Date.now() - new Date(startedAt).getTime()) / 1000;
  return <span className="font-mono">{formatDuration(sec)}</span>;
}
