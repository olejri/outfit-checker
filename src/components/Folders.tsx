"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createFolder, loadFolders } from "@/lib/outfits";
import { normalizeFolderName, type Folder } from "@/lib/types";

export function useFolders() {
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFolders(createClient())
      .then(setFolders)
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Could not load folders.");
        setFolders([]);
      });
  }, []);

  const create = useCallback(async (raw: string) => {
    const name = normalizeFolderName(raw);
    if (!name) return null;
    const folder = await createFolder(createClient(), name);
    setFolders((all) => [...(all ?? []), folder].sort((a, b) => a.name.localeCompare(b.name)));
    return folder;
  }, []);

  return { folders, setFolders, error, create };
}

/** Folder chips to tick on and off, plus a field to make a new folder (which is ticked). */
export function FolderPicker({
  folders,
  value,
  onChange,
  onCreate,
}: {
  folders: Folder[];
  value: string[];
  onChange: (ids: string[]) => void;
  onCreate: (name: string) => Promise<Folder | null>;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!draft.trim() || busy) return;
    const existing = folders.find((f) => f.name.toLowerCase() === normalizeFolderName(draft).toLowerCase());
    setBusy(true);
    try {
      const folder = existing ?? (await onCreate(draft));
      if (folder && !value.includes(folder.id)) onChange([...value, folder.id]);
      setDraft("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not make the folder.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {folders.map((f) => {
        const on = value.includes(f.id);
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== f.id) : [...value, f.id])}
            className={`rounded-full px-3 py-1 text-sm ${on ? "bg-ink text-white" : "bg-white ring-1 ring-line"}`}
          >
            {on ? "✓ " : "📁 "}
            {f.name}
          </button>
        );
      })}
      <input
        className="min-w-32 flex-1 rounded-full border border-line bg-white px-3 py-1 text-sm outline-none focus:border-accent"
        placeholder={folders.length ? "New folder…" : "New folder, e.g. Party"}
        maxLength={40}
        value={draft}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={() => draft && add()}
      />
    </div>
  );
}
