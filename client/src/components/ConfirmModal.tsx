import { ReactNode } from "react";
import Modal from "./Modal";

// In-app confirmation dialog — replaces window.confirm. Render conditionally
// (e.g. {open && <ConfirmModal ... />}) or pass `open`.
export default function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={busy ? undefined : onClose}>
      <div className="text-sm text-gray-600 dark:text-gray-300">{message}</div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className={danger ? "btn-danger" : "btn-primary"}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
