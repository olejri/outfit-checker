"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Outfit } from "@/lib/types";
import { useItems } from "@/components/useItems";
import { ItemPhoto } from "@/components/ItemPhoto";

export default function OutfitsPage() {
  const { items } = useItems();
  const [outfits, setOutfits] = useState<Outfit[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .from("outfits")
      .select("id, name, is_public, share_token, avatar, created_at, outfit_items(item_id)")
      .order("updated_at", { ascending: false })
      .then(({ data }) => setOutfits((data as Outfit[]) ?? []));
  }, []);

  const byId = new Map((items ?? []).map((i) => [i.id, i]));
  const shareUrl = (o: Outfit) => `${location.origin}/s/${o.share_token}`;

  async function toggleShare(o: Outfit) {
    const { error } = await createClient().from("outfits").update({ is_public: !o.is_public }).eq("id", o.id);
    if (error) return alert(error.message);
    setOutfits((all) => all!.map((x) => (x.id === o.id ? { ...x, is_public: !o.is_public } : x)));
  }

  async function share(o: Outfit) {
    const url = shareUrl(o);
    if (navigator.share) {
      try {
        await navigator.share({ title: o.name, url });
        return;
      } catch {
        // cancelled or unsupported, fall back to copying
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(o.id);
    setTimeout(() => setCopied(null), 2000);
  }

  async function remove(o: Outfit) {
    if (!confirm(`Delete "${o.name}"?`)) return;
    const { error } = await createClient().from("outfits").delete().eq("id", o.id);
    if (error) return alert(error.message);
    setOutfits((all) => all!.filter((x) => x.id !== o.id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Outfits</h1>
        <Link href="/studio" className="btn-primary py-2.5">
          + New outfit
        </Link>
      </div>

      {outfits === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : outfits.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-muted">
          <p className="mb-4">No saved outfits yet.</p>
          <Link href="/studio" className="btn-primary">
            Put one together
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {outfits.map((o) => (
            <li key={o.id} className="rounded-2xl border border-line bg-white p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{o.name}</p>
                  <p className="text-xs text-muted">{o.is_public ? "🔗 Anyone with the link can view" : "🔒 Private"}</p>
                </div>
                <Link href={`/studio?outfit=${o.id}`} className="text-sm font-semibold text-accent">
                  Open
                </Link>
              </div>
              <div className="mb-3 flex gap-2 overflow-x-auto">
                {o.outfit_items.map(({ item_id }) => {
                  const item = byId.get(item_id);
                  return (
                    <div key={item_id} className="checker h-16 w-16 shrink-0 rounded-xl border border-line p-1">
                      {item && <ItemPhoto item={item} className="h-full w-full object-contain" />}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="mr-auto flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={o.is_public} onChange={() => toggleShare(o)} className="h-5 w-5 accent-accent" />
                  Share with link
                </label>
                {o.is_public && (
                  <button className="btn-ghost py-2" onClick={() => share(o)}>
                    {copied === o.id ? "Link copied" : "Share link"}
                  </button>
                )}
                <button className="btn-ghost py-2 text-red-700" onClick={() => remove(o)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
