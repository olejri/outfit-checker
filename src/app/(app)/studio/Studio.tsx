"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, SKIN_TONES, allTags, wear, type Category, type Worn } from "@/lib/types";
import { TagFilter } from "@/components/Tags";
import { AvatarView } from "@/components/AvatarView";
import { useItems } from "@/components/useItems";

export function Studio() {
  const router = useRouter();
  const params = useSearchParams();
  const outfitId = params.get("outfit");
  const wearId = params.get("wear");
  const { items } = useItems();

  const [worn, setWorn] = useState<Worn>({});
  const [skin, setSkin] = useState(SKIN_TONES[1]);
  const [name, setName] = useState("");
  const [tab, setTab] = useState<Category>("tops");
  const [tag, setTag] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Once items are loaded, dress the model from the URL (?outfit=… or ?wear=…).
  useEffect(() => {
    if (!items) return;
    let cancelled = false;
    (async () => {
      if (outfitId) {
        const { data } = await createClient()
          .from("outfits")
          .select("name, avatar, outfit_items(item_id)")
          .eq("id", outfitId)
          .single();
        if (cancelled || !data) return;
        const ids = new Set((data.outfit_items as { item_id: string }[]).map((o) => o.item_id));
        setWorn(items.filter((i) => ids.has(i.id)).reduce(wear, {} as Worn));
        setName(data.name);
        if (data.avatar?.skin) setSkin(data.avatar.skin);
      } else if (wearId) {
        const item = items.find((i) => i.id === wearId);
        if (item) {
          setWorn((w) => wear(w, item));
          setTab(item.category);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items, outfitId, wearId]);

  const tags = useMemo(() => allTags(items ?? []), [items]);
  const inTab = useMemo(
    () => (items ?? []).filter((i) => i.category === tab && (!tag || i.tags.includes(tag))),
    [items, tab, tag],
  );
  const wornList = Object.values(worn);

  async function save() {
    if (wornList.length === 0) return;
    setSaving(true);
    setNotice(null);
    const supabase = createClient();
    try {
      const row = { name: name.trim() || "Untitled outfit", avatar: { skin }, updated_at: new Date().toISOString() };
      let id = outfitId;
      if (id) {
        const { error } = await supabase.from("outfits").update(row).eq("id", id);
        if (error) throw error;
        const del = await supabase.from("outfit_items").delete().eq("outfit_id", id);
        if (del.error) throw del.error;
      } else {
        const { data, error } = await supabase.from("outfits").insert(row).select("id").single();
        if (error) throw error;
        id = data.id as string;
      }
      const { error } = await supabase
        .from("outfit_items")
        .insert(wornList.map((i) => ({ outfit_id: id, item_id: i!.id })));
      if (error) throw error;
      setNotice("Saved.");
      if (!outfitId) router.replace(`/studio?outfit=${id}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Saving failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative -mx-4 h-[52dvh] min-h-80 overflow-hidden bg-canvas sm:mx-0 sm:rounded-3xl">
        <AvatarView worn={worn} skin={skin} />
        <div className="absolute left-3 top-3 flex gap-1.5 rounded-full bg-white/80 p-1.5 backdrop-blur">
          {SKIN_TONES.map((t) => (
            <button
              key={t}
              aria-label="Skin tone"
              onClick={() => setSkin(t)}
              className={`h-6 w-6 rounded-full border-2 ${skin === t ? "border-ink" : "border-white"}`}
              style={{ background: t }}
            />
          ))}
        </div>
        {wornList.length > 0 && (
          <button className="absolute right-3 top-3 rounded-full bg-white/80 px-3 py-1.5 text-xs backdrop-blur" onClick={() => setWorn({})}>
            Undress
          </button>
        )}
        <p className="pointer-events-none absolute bottom-2 w-full text-center text-xs text-muted">Drag to turn · pinch to zoom</p>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setTab(c.id)}
            className={`relative shrink-0 rounded-full border px-3.5 py-1.5 text-sm ${
              tab === c.id ? "border-ink bg-ink text-white" : "border-line bg-white"
            }`}
          >
            {c.emoji} {c.label}
            {worn[c.id] && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      <TagFilter tags={tags} value={tag} onChange={setTag} />

      {items === null ? (
        <p className="text-sm text-muted">Loading wardrobe…</p>
      ) : inTab.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-sm text-muted">
          No {CATEGORIES.find((c) => c.id === tab)?.label.toLowerCase()} {tag ? `tagged #${tag}` : "yet"}.{" "}
          <Link href="/wardrobe/new" className="font-semibold text-accent">
            Add one
          </Link>
        </p>
      ) : (
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
          {inTab.map((item) => {
            const on = worn[item.category]?.id === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setWorn((w) => wear(w, item))}
                className={`checker h-24 w-24 shrink-0 rounded-2xl border-2 p-1.5 ${on ? "border-accent" : "border-line"}`}
                title={item.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                <img src={item.url} alt={item.name} className="h-full w-full object-contain" />
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <input className="input" placeholder="Outfit name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary shrink-0" disabled={saving || wornList.length === 0} onClick={save}>
          {saving ? "Saving…" : outfitId ? "Update" : "Save"}
        </button>
      </div>
      {notice && (
        <p className="text-sm text-muted">
          {notice} {notice === "Saved." && <Link href="/outfits" className="font-semibold text-accent">See your outfits</Link>}
        </p>
      )}
    </div>
  );
}
