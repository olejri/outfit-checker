"use client";

import { useState } from "react";
import { SUGGESTED_TAGS, normalizeTag } from "@/lib/types";

/** Pick suggested tags or type your own (Enter or comma adds it). */
export function TagEditor({ value, onChange, extra = [] }: { value: string[]; onChange: (tags: string[]) => void; extra?: string[] }) {
  const [draft, setDraft] = useState("");
  const suggestions = [...new Set([...SUGGESTED_TAGS, ...extra])].filter((t) => !value.includes(t));

  function add(raw: string) {
    const tag = normalizeTag(raw);
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onChange(value.filter((x) => x !== t))}
            className="rounded-full bg-ink px-3 py-1 text-sm text-white"
            aria-label={`Remove tag ${t}`}
          >
            #{t} <span className="opacity-60">×</span>
          </button>
        ))}
        <input
          className="min-w-28 flex-1 rounded-full border border-line bg-white px-3 py-1 text-sm outline-none focus:border-accent"
          placeholder="Add a tag…"
          value={draft}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value.slice(0, -1)) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => draft && add(draft)}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => add(t)}
              className="rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs text-muted hover:border-ink hover:text-ink"
            >
              + {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A row of tag chips; picking one filters, picking it again clears. */
export function TagFilter({ tags, value, onChange }: { tags: string[]; value: string | null; onChange: (tag: string | null) => void }) {
  if (tags.length === 0) return null;
  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
      {tags.map((t) => (
        <button
          key={t}
          onClick={() => onChange(value === t ? null : t)}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
            value === t ? "bg-accent text-white" : "bg-white text-muted ring-1 ring-line"
          }`}
        >
          #{t}
        </button>
      ))}
    </div>
  );
}
