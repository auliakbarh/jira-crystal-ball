import { ReactNode, useEffect, useRef, useState } from "react";

// Tooltip that opens on hover AND on click/tap (good for touch). Click toggles
// and stays open until you click elsewhere.
export default function Tooltip({
  content,
  children,
  className = "",
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!pinned) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setPinned(false);
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [pinned]);

  const show = open || pinned;

  return (
    <span
      ref={ref}
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => {
        e.stopPropagation();
        setPinned((p) => !p);
        setOpen(true);
      }}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-1 w-max max-w-[260px] -translate-x-1/2 rounded-md bg-gray-900 px-2 py-1 text-left text-xs font-normal normal-case leading-snug text-white shadow-lg dark:bg-gray-700"
        >
          {content}
        </span>
      )}
    </span>
  );
}
