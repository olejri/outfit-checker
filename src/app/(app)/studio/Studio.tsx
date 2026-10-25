"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  BEARD_STYLES,
  CATEGORIES,
  DEFAULT_AVATAR,
  HAIR_COLORS,
  HAIR_GROUPS,
  HAIR_STYLES,
  SKIN_TONES,
  allTags,
  avatarWithDefaults,
  wear,
  type AvatarSettings,
  type Category,
  type Worn,
} from "@/lib/types";
import { TagFilter } from "@/components/Tags";
import { AvatarView } from "@/components/AvatarView";
import { useItems } from "@/components/useItems";
import { ItemPhoto } from "@/components/ItemPhoto";
import { FolderPicker, useFolders } from "@/components/Folders";
import { setOutfitFolders } from "@/lib/outfits";
import { useLeaveWarning } from "@/components/useLeaveWarning";
import { LeaveSheet } from "@/components/LeaveSheet";

/** Everything that is saved with an outfit, as one comparable string. */
function snapshot(name: string, avatar: Required<AvatarSettings>, itemIds: string[], folderIds: string[]) {
  return JSON.stringify([name.trim(), avatar, [...itemIds].sort(), [...folderIds].sort()]);
}

export function Studio() {
  const router = useRouter();
  const params = useSearchParams();
  const outfitId = params.get("outfit");
  const wearId = params.get("wear");
  const fresh = params.get("new");
  const { items } = useItems();
  const { folders, create: createFolder } = useFolders();
  const [folderIds, setFolderIds] = useState<string[]>([]);
  // Folders as last saved, to tell what changed.
  const [savedFolderIds, setSavedFolderIds] = useState<string[]>([]);
  // Items in the saved outfit that couldn't be loaded; kept so saving doesn't drop them.
  const [unloaded, setUnloaded] = useState<string[]>([]);

  const [worn, setWorn] = useState<Worn>({});
  const [avatar, setAvatar] = useState<Required<AvatarSettings>>(DEFAULT_AVATAR);
  const [hairGroup, setHairGroup] = useState<(typeof HAIR_GROUPS)[number]["id"] | "beard">("short");
  const [name, setName] = useState("");
  const [tab, setTab] = useState<Category | "hair">("tops");
  const [tag, setTag] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // What the outfit looked like when it was opened or last saved, to tell if it has changed.
  const [baseline, setBaseline] = useState(() => snapshot("", DEFAULT_AVATAR, [], []));

  // The page keeps its state when you navigate away and back, so a different outfit
  // in the URL, or a new one, has to clear what was there.
  const routeKey = outfitId ?? `new:${wearId ?? ""}:${fresh ?? ""}`;
  const [shownKey, setShownKey] = useState(routeKey);
  if (shownKey !== routeKey) {
    setShownKey(routeKey);
    if (!outfitId) {
      setWorn({});
      setAvatar(DEFAULT_AVATAR);
      setHairGroup("short");
      setName("");
      setFolderIds([]);
      setSavedFolderIds([]);
      setUnloaded([]);
      setNotice(null);
      setBaseline(snapshot("", DEFAULT_AVATAR, [], []));
    }
  }
  // "+ New outfit" links to ?new=1 so it always starts over; tidy the URL afterwards.
  useEffect(() => {
    if (fresh) router.replace("/studio", { scroll: false });
  }, [fresh, router]);

  // Once items are loaded, dress the model from the URL (?outfit=… or ?wear=…).
  useEffect(() => {
    if (!items) return;
    let cancelled = false;
    (async () => {
      if (outfitId) {
        const { data } = await createClient()
          .from("outfits")
          .select("name, avatar, outfit_items(item_id), outfit_folder_items(folder_id)")
          .eq("id", outfitId)
          .single();
        if (cancelled || !data) return;
        const ids = new Set((data.outfit_items as { item_id: string }[]).map((o) => o.item_id));
        const loaded = items.filter((i) => ids.has(i.id)).reduce(wear, {} as Worn);
        setWorn(loaded);
        setUnloaded([...ids].filter((id) => !items.some((i) => i.id === id)));
        const inFolders = (data.outfit_folder_items as { folder_id: string }[]).map((f) => f.folder_id);
        setFolderIds(inFolders);
        setSavedFolderIds(inFolders);
        setName(data.name);
        const saved = avatarWithDefaults(data.avatar);
        setAvatar(saved);
        setBaseline(snapshot(data.name, saved, Object.values(loaded).map((i) => i!.id), inFolders));
        setHairGroup(HAIR_STYLES.find((h) => h.id === saved.hair)?.group ?? "short");
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
  const current = snapshot(name, avatar, wornList.map((i) => i!.id), folderIds);
  const dirty = current !== baseline;
  const savedName = (JSON.parse(baseline) as [string])[0];
  const leaving = useLeaveWarning(dirty);

  function startNew() {
    if (dirty) leaving.ask("/studio?new=1");
    else router.push("/studio?new=1");
  }

  /** Saves, then goes to `then` if given (from the unsaved-changes sheet). */
  async function save(asNew = false, then?: string) {
    if (wornList.length === 0) return;
    setSaving(true);
    setNotice(null);
    const supabase = createClient();
    const isNew = asNew || !outfitId;
    try {
      let outfitName = name.trim() || "Untitled outfit";
      if (asNew && outfitName === savedName) outfitName += " (copy)";
      const row = { name: outfitName, avatar, updated_at: new Date().toISOString() };
      let id = isNew ? null : outfitId;
      if (id) {
        const { error } = await supabase.from("outfits").update(row).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("outfits").insert(row).select("id").single();
        if (error) throw error;
        id = data.id as string;
      }
      // Add the new items before removing old ones, so a failure never empties the outfit.
      const keep = [...wornList.map((i) => i!.id), ...unloaded];
      const { error } = await supabase
        .from("outfit_items")
        .upsert(keep.map((item_id) => ({ outfit_id: id, item_id })), { ignoreDuplicates: true });
      if (error) throw error;
      const del = await supabase
        .from("outfit_items")
        .delete()
        .eq("outfit_id", id)
        .not("item_id", "in", `(${keep.join(",")})`);
      if (del.error) throw del.error;
      await setOutfitFolders(supabase, id!, isNew ? [] : savedFolderIds, folderIds);
      setSavedFolderIds(folderIds);
      setName(outfitName);
      setBaseline(snapshot(outfitName, avatar, wornList.map((i) => i!.id), folderIds));
      setNotice(asNew ? `Saved as a new outfit, "${outfitName}".` : "Saved.");
      if (then) leaveTo(then);
      else if (isNew) router.replace(`/studio?outfit=${id}`, { scroll: false });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Saving failed.");
      leaving.cancel(); // so the error under the name field can be seen
    } finally {
      setSaving(false);
    }
  }

  function leaveTo(href: string) {
    leaving.cancel();
    router.push(href);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <p className="mr-auto min-w-0 truncate">
          {outfitId ? (
            <>
              <span className="text-muted">Editing </span>
              <span className="font-semibold">{savedName || "outfit"}</span>
            </>
          ) : (
            <span className="font-semibold">New outfit</span>
          )}
        </p>
        {dirty ? (
          <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">● Unsaved changes</span>
        ) : (
          outfitId && <span className="shrink-0 text-xs text-muted">✓ Saved</span>
        )}
        {(outfitId || dirty) && (
          <button onClick={startNew} className="shrink-0 font-semibold text-accent">
            + New
          </button>
        )}
      </div>
      <div className="relative -mx-4 h-[52dvh] min-h-80 overflow-hidden bg-canvas sm:mx-0 sm:rounded-3xl">
        <AvatarView worn={worn} avatar={avatar} />
        <div className="absolute left-3 top-3 flex gap-1.5 rounded-full bg-white/80 p-1.5 backdrop-blur">
          {SKIN_TONES.map((t) => (
            <button
              key={t}
              aria-label="Skin tone"
              onClick={() => setAvatar((a) => ({ ...a, skin: t }))}
              className={`h-6 w-6 rounded-full border-2 ${avatar.skin === t ? "border-ink" : "border-white"}`}
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
        <button
          onClick={() => setTab("hair")}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm ${
            tab === "hair" ? "border-ink bg-ink text-white" : "border-line bg-white"
          }`}
        >
          💇 Hair
        </button>
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

      {tab === "hair" ? (
        <div className="space-y-3">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {HAIR_COLORS.map((c) => (
              <button
                key={c.id}
                aria-label={`${c.label} hair`}
                title={c.label}
                onClick={() => setAvatar((a) => ({ ...a, hairColor: c.id }))}
                className={`h-8 w-8 shrink-0 rounded-full border-2 ${avatar.hairColor === c.id ? "border-ink" : "border-white shadow"}`}
                style={{ background: c.id }}
              />
            ))}
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {[...HAIR_GROUPS, { id: "beard", label: "Facial hair" } as const].map((g) => (
              <button
                key={g.id}
                onClick={() => setHairGroup(g.id)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs ${
                  hairGroup === g.id ? "border-ink bg-ink text-white" : "border-line bg-white"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {hairGroup === "beard"
              ? BEARD_STYLES.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setAvatar((a) => ({ ...a, beard: b.id }))}
                    className={`rounded-2xl border-2 bg-white p-1.5 text-xs ${avatar.beard === b.id ? "border-accent" : "border-line"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- small static preview */}
                    <img src={`/hair/beard-${b.id}.png`} alt="" className="mx-auto aspect-square w-full rounded-xl bg-canvas object-cover" />
                    <span className="mt-1 block truncate">{b.label}</span>
                  </button>
                ))
              : HAIR_STYLES.filter((h) => h.group === hairGroup).map((h) => (
                  <button
                    key={h.id}
                    onClick={() => setAvatar((a) => ({ ...a, hair: h.id }))}
                    className={`rounded-2xl border-2 bg-white p-1.5 text-xs ${avatar.hair === h.id ? "border-accent" : "border-line"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- small static preview */}
                    <img src={`/hair/${h.id}.png`} alt="" className="mx-auto aspect-square w-full rounded-xl bg-canvas object-cover" />
                    <span className="mt-1 block truncate">{h.label}</span>
                  </button>
                ))}
          </div>
        </div>
      ) : (
        <>
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
                    <ItemPhoto item={item} className="h-full w-full object-contain" />
                  </button>
                );
              })}
            </div>
          )}
          {worn[tab] && (
            <p className="text-sm">
              <Link href={`/wardrobe/${worn[tab]!.id}/fit`} className="font-semibold text-accent">
                Adjust how {worn[tab]!.name || "it"} fits →
              </Link>
            </p>
          )}
        </>
      )}

      <div className="flex gap-2">
        <input className="input" placeholder="Outfit name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary shrink-0" disabled={saving || wornList.length === 0 || (!!outfitId && !dirty)} onClick={() => save()}>
          {saving ? "Saving…" : outfitId ? "Update" : "Save"}
        </button>
      </div>
      {outfitId && (
        <button className="btn-ghost w-full py-2" disabled={saving || wornList.length === 0} onClick={() => save(true)}>
          Save as a new outfit
        </button>
      )}
      {folders && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted">Save in folders (optional)</p>
          <FolderPicker folders={folders} value={folderIds} onChange={setFolderIds} onCreate={createFolder} />
        </div>
      )}
      {unloaded.length > 0 && (
        <p className="text-xs text-muted">
          {unloaded.length === 1 ? "1 item" : `${unloaded.length} items`} in this outfit couldn&apos;t be loaded. It stays in the outfit when you save.
        </p>
      )}
      {notice && !(dirty && notice.startsWith("Saved")) && (
        <p className="text-sm text-muted">
          {notice} {notice.startsWith("Saved") && <Link href="/outfits" className="font-semibold text-accent">See your outfits</Link>}
        </p>
      )}
      {leaving.pending && (
        <LeaveSheet
          title={wornList.length === 0 ? "Leave this outfit?" : "Save your changes?"}
          message={
            wornList.length === 0
              ? "The model has nothing on, so there is nothing to save. Your other changes will be lost."
              : outfitId
                ? `You've changed "${savedName || "this outfit"}" since it was last saved.`
                : "This new outfit hasn't been saved yet."
          }
          saveLabel={outfitId ? "Update outfit" : "Save outfit"}
          canSave={wornList.length > 0}
          saving={saving}
          onSave={() => save(false, leaving.pending!)}
          onDiscard={() => leaveTo(leaving.pending!)}
          onCancel={leaving.cancel}
        />
      )}
    </div>
  );
}
