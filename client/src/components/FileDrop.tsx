import { useRef, useState } from "react";

// Accepted upload types for Fortune (Gemini multimodal): text/markdown, images, PDF.
export const FORTUNE_ACCEPT = ".txt,.md,.markdown,.png,.jpg,.jpeg,.webp,.gif,.pdf";
const ACCEPT_MIME = ["text/", "image/", "application/pdf"];
const MAX_MB = 15;

function isAccepted(f: File): boolean {
  if (ACCEPT_MIME.some((p) => f.type.startsWith(p))) return true;
  return /\.(txt|md|markdown|png|jpe?g|webp|gif|pdf)$/i.test(f.name);
}
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function fileIcon(f: File): string {
  if (f.type.startsWith("image/")) return "🖼️";
  if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) return "📕";
  return "📄";
}

/**
 * Drag-and-drop (or click-to-browse) file picker. Emits accepted File[] to the
 * parent; rejects unsupported/oversized files with an inline note. Purely
 * presentational — reading/encoding the files for Gemini happens server-side.
 */
export default function FileDrop({
  files,
  onChange,
  title,
  sub,
  skippedLabel,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  title: string;
  sub: string;
  skippedLabel: (list: string) => string;
}) {
  const [drag, setDrag] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(incoming: FileList | File[]) {
    const good: File[] = [];
    const bad: string[] = [];
    for (const f of Array.from(incoming)) {
      if (!isAccepted(f)) bad.push(f.name);
      else if (f.size > MAX_MB * 1024 * 1024) bad.push(`${f.name} (>${MAX_MB}MB)`);
      else good.push(f);
    }
    const seen = new Set(files.map((f) => `${f.name}:${f.size}`));
    onChange([...files, ...good.filter((f) => !seen.has(`${f.name}:${f.size}`))]);
    setNote(bad.length ? skippedLabel(bad.join(", ")) : null);
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center transition ${
          drag
            ? "border-brand bg-brand/5"
            : "border-gray-300 hover:border-brand/60 dark:border-gray-700"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={FORTUNE_ACCEPT}
          className="hidden"
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
        />
        <span className="text-2xl">📎</span>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{sub}</p>
      </div>

      {note && (
        <div className="mt-2 rounded-md bg-amber-100 px-3 py-1.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
          {note}
        </div>
      )}

      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f, i) => (
            <li
              key={`${f.name}:${f.size}:${i}`}
              className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-sm dark:border-gray-800"
            >
              <span>{fileIcon(f)}</span>
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-xs text-gray-500">{fmtSize(f.size)}</span>
              <button
                type="button"
                className="btn-ghost px-2 py-0.5 text-xs"
                onClick={(e) => { e.stopPropagation(); onChange(files.filter((_, idx) => idx !== i)); }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
