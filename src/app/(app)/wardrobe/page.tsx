"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BUCKET, itemPaths } from "@/lib/data";
import { addSampleWardrobe } from "@/lib/samples";
import { CATEGORIES, allTags, type Category, type ItemWithUrl } from "@/lib/types";
import { TagEditor, TagFilter } from "@/components/Tags";
import { useItems } from "@/components/useItems";

export default function WardrobePage() {
  const { items, setItems, error, reload } = useItems();
  const [filter, setFilter] = useState<Category | "all">("all");
  const [tag, setTag] = useState<string | null>(null);
  const [selected, setSelected] = useState<ItemWithUrl | null>(null);
  const [loadingSamples, setLoadingSamples] = useState(false);

  const tags = allTags(items ?? []);
  const tagged = (items ?? []).filter((i) => !tag || i.tags.includes(tag));
  const shown = tagged.filter((i) => filter === "all" || i.category === filter);
  const count = (c: Category) => tagged.filter((i) => i.category === c).length;

  async function loadSamples() {
    if (items?.some((i) => i.tags.includes("test")) && !confirm("You already have test items. Add another set?")) return;
    setLoadingSamples(true);
    try {
      await addSampleWardrobe(createClient());
      await reload();
      setTag("test");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not add test items.");
    } finally {
      setLoadingSamples(false);
    }
  }

  async function saveTags(item: ItemWithUrl, next: string[]) {
    const updated = { ...item, tags: next };
    setSelected(updated);
    setItems((all) => all?.map((i) => (i.id === item.id ? updated : i)) ?? null);
    const { error } = await createClient().from("items").update({ tags: next }).eq("id", item.id);
    if (error) alert(error.message);
  }

  async function remove(item: ItemWithUrl) {
    if (!confirm(`Delete "${item.name || "this item"}"? It is also removed from saved outfits.`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("items").delete().eq("id", item.id);
    if (error) return alert(error.message);
    await supabase.storage.from(BUCKET).remove(itemPaths(item));
    setItems((all) => all?.filter((i) => i.id !== item.id) ?? null);
    setSelected(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Wardrobe</h1>
        <Link href="/wardrobe/new" className="btn-primary py-2.5">
          + Add item
        </Link>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          All {items ? `· ${tagged.length}` : ""}
        </Chip>
        {CATEGORIES.map((c) => (
          <Chip key={c.id} active={filter === c.id} onClick={() => setFilter(c.id)}>
            {c.emoji} {c.label} {items && count(c.id) ? `· ${count(c.id)}` : ""}
          </Chip>
        ))}
      </div>

      <TagFilter tags={tags} value={tag} onChange={setTag} />

      {error && <p className="rounded-xl bg-white p-3 text-sm text-red-700">{error}</p>}

      {items === null ? (
        <Grid>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-2xl bg-line" />
          ))}
        </Grid>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-muted">
          <p className="mb-4">{items.length ? "Nothing matches these filters." : "Your wardrobe is empty."}</p>
          <div className="flex flex-col items-center gap-2">
            <Link href="/wardrobe/new" className="btn-primary">
              Photograph your first item
            </Link>
            {items.length === 0 && (
              <button className="btn-ghost" onClick={loadSamples} disabled={loadingSamples}>
                {loadingSamples ? "Adding test items…" : "Add test items to try it out"}
              </button>
            )}
          </div>
        </div>
      ) : (
        <Grid>
          {shown.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelected(item)}
              className="group overflow-hidden rounded-2xl border border-line bg-white text-left"
            >
              <div className="checker aspect-square p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                <img src={item.url} alt={item.name} className="h-full w-full object-contain" />
              </div>
              <div className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full border border-line" style={{ background: item.color }} />
                  <span className="truncate text-sm">{item.name || labelFor(item.category)}</span>
                </div>
                {item.tags.length > 0 && (
                  <p className="mt-0.5 truncate text-xs text-muted">{item.tags.map((t) => `#${t}`).join(" ")}</p>
                )}
              </div>
            </button>
          ))}
        </Grid>
      )}

      {items && items.length > 0 && (
        <p className="pt-2 text-center">
          <button className="text-xs text-muted underline" onClick={loadSamples} disabled={loadingSamples}>
            {loadingSamples ? "Adding test items…" : "Add a set of test items"}
          </button>
        </p>
      )}

      {selected && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/40 sm:items-center sm:justify-center" onClick={() => setSelected(null)}>
          <div className="w-full rounded-t-3xl bg-white p-5 sm:max-w-sm sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="checker mb-4 aspect-square rounded-2xl p-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
              <img src={selected.url} alt={selected.name} className="h-full w-full object-contain" />
            </div>
            <p className="font-semibold">{selected.name || labelFor(selected.category)}</p>
            <p className="mb-3 text-sm text-muted">{labelFor(selected.category)}</p>
            <div className="mb-4">
              <TagEditor value={selected.tags} onChange={(next) => saveTags(selected, next)} extra={tags} />
            </div>
            <div className="flex gap-2">
              <Link href={`/studio?wear=${selected.id}`} className="btn-primary flex-1">
                Try it on
              </Link>
              <Link href={`/wardrobe/${selected.id}/fit`} className="btn-ghost">
                Adjust fit
              </Link>
              <button className="btn-ghost text-red-700" onClick={() => remove(selected)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const labelFor = (c: Category) => CATEGORIES.find((x) => x.id === c)?.label ?? c;

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm ${
        active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink"
      }`}
    >
      {children}
    </button>
  );
}
