"use client";

import { useEffect } from "react";

/** Bottom sheet (a dialog on wider screens) asking what to do with unsaved changes. */
export function LeaveSheet({
  title,
  message,
  saveLabel,
  canSave,
  saving,
  onSave,
  onDiscard,
  onCancel,
}: {
  title: string;
  message: string;
  saveLabel: string;
  canSave: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-[2px] sm:items-center" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-title"
        className="w-full max-w-sm rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line sm:hidden" />
        <h2 id="leave-title" className="text-lg font-bold">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted">{message}</p>
        <div className="mt-5 space-y-2">
          <button className="btn-primary w-full" disabled={!canSave || saving} onClick={onSave} autoFocus>
            {saving ? "Saving…" : saveLabel}
          </button>
          <button className="btn-ghost w-full text-red-700" disabled={saving} onClick={onDiscard}>
            Discard changes
          </button>
          <button className="w-full py-2 text-sm font-semibold text-muted hover:text-ink" disabled={saving} onClick={onCancel}>
            Keep editing
          </button>
        </div>
      </div>
    </div>
  );
}
