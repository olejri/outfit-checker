"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BUCKET } from "@/lib/data";
import { saveThumb, setOutfitFolders, thumbKey } from "@/lib/outfits";
import { avatarWithDefaults, hairLabel, normalizeFolderName, wear, type Outfit, type Worn } from "@/lib/types";
import { useItems } from "@/components/useItems";
import { ItemPhoto } from "@/components/ItemPhoto";
import { FolderPicker, useFolders } from "@/components/Folders";
import { OutfitSnapshots } from "@/components/OutfitSnapshots";
import type { SnapshotJob } from "@/components/three/SnapshotScene";

export function OutfitList() {
  const router = useRouter();
  const pathname = usePathname();
  const folderId = useSearchParams().get("folder");
  const { items } = useItems();
  const { folders, setFolders, create: createFolder } = useFolders();
  const [outfits, setOutfits] = useState<Outfit[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("outfits")
        .select("id, name, is_public, share_token, avatar, created_at, thumb_path, thumb_key, outfit_items(item_id), outfit_folder_items(folder_id)")
        .order("updated_at", { ascending: false });
      if (error) {
        setLoadError(error.message);
        return setOutfits([]);
      }
      const list = data as Outfit[];
      setOutfits(list);
      const paths = list.map((o) => o.thumb_path).filter((p): p is string => !!p);
      if (paths.length === 0) return;
      const signed = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
      const byPath = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
      setThumbs((t) => {
        const next = { ...t };
        for (const o of list) {
          const url = o.thumb_path && byPath.get(o.thumb_path);
          if (url && !next[o.id]) next[o.id] = url;
        }
        return next;
      });
    })();
  }, []);

  const byId = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);
  const folder = folders?.find((f) => f.id === folderId) ?? null;
  const shown = (outfits ?? []).filter((o) => !folder || o.outfit_folder_items.some((f) => f.folder_id === folder.id));

  // What each outfit looks like now, and whether its preview picture is out of date.
  const looks = useMemo(() => {
    const map = new Map<string, { worn: Worn; avatar: ReturnType<typeof avatarWithDefaults>; key: string }>();
    if (!items) return map;
    for (const o of outfits ?? []) {
      const worn = o.outfit_items.flatMap(({ item_id }) => byId.get(item_id) ?? []);
      const avatar = avatarWithDefaults(o.avatar);
      map.set(o.id, { worn: worn.reduce(wear, {} as Worn), avatar, key: thumbKey(avatar, worn) });
    }
    return map;
  }, [items, outfits, byId]);

  // Draw stale previews one at a time, the visible ones first, in one shared canvas.
  const job: SnapshotJob | null = useMemo(() => {
    const queue = [...shown, ...(outfits ?? [])];
    const next = queue.find((o) => {
      const look = looks.get(o.id);
      return look && look.key !== o.thumb_key && !failed.has(`${o.id}:${look.key}`);
    });
    if (!next) return null;
    const look = looks.get(next.id)!;
    return { key: `${next.id}:${look.key}`, worn: look.worn, avatar: look.avatar };
  }, [shown, outfits, looks, failed]);

  const onShot = useCallback(
    async (key: string, image: Blob | null) => {
      const [id, thumb] = key.split(":");
      const outfit = outfits?.find((o) => o.id === id);
      if (!image || !outfit) return setFailed((f) => new Set(f).add(key));
      setThumbs((t) => ({ ...t, [id]: URL.createObjectURL(image) }));
      // Marked done straight away so the next outfit can be drawn while this uploads.
      setOutfits((all) => all!.map((o) => (o.id === id ? { ...o, thumb_key: thumb } : o)));
      try {
        const path = await saveThumb(createClient(), outfit, image, thumb);
        setOutfits((all) => all!.map((o) => (o.id === id ? { ...o, thumb_path: path } : o)));
      } catch {
        // Shown for now anyway; it is drawn again next time.
      }
    },
    [outfits],
  );

  function openFolder(id: string | null) {
    router.replace(id ? `${pathname}?folder=${id}` : pathname, { scroll: false });
  }

  async function newFolder() {
    const name = normalizeFolderName(prompt("Name of the new folder, e.g. Party") ?? "");
    if (!name) return;
    try {
      const f = await createFolder(name);
      if (f) openFolder(f.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not make the folder.");
    }
  }

  async function renameFolder() {
    if (!folder) return;
    const name = normalizeFolderName(prompt("Rename folder", folder.name) ?? "");
    if (!name || name === folder.name) return;
    const { error } = await createClient().from("outfit_folders").update({ name }).eq("id", folder.id);
    if (error) return alert(error.code === "23505" ? `You already have a folder called "${name}".` : error.message);
    setFolders((all) => all!.map((f) => (f.id === folder.id ? { ...f, name } : f)).sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function deleteFolder() {
    if (!folder || !confirm(`Delete the folder "${folder.name}"? The outfits in it are kept.`)) return;
    const { error } = await createClient().from("outfit_folders").delete().eq("id", folder.id);
    if (error) return alert(error.message);
    setFolders((all) => all!.filter((f) => f.id !== folder.id));
    setOutfits((all) => all!.map((o) => ({ ...o, outfit_folder_items: o.outfit_folder_items.filter((x) => x.folder_id !== folder.id) })));
    openFolder(null);
  }

  async function changeFolders(o: Outfit, next: string[]) {
    const before = o.outfit_folder_items.map((f) => f.folder_id);
    setOutfits((all) => all!.map((x) => (x.id === o.id ? { ...x, outfit_folder_items: next.map((folder_id) => ({ folder_id })) } : x)));
    try {
      await setOutfitFolders(createClient(), o.id, before, next);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not update folders.");
      setOutfits((all) => all!.map((x) => (x.id === o.id ? { ...x, outfit_folder_items: o.outfit_folder_items } : x)));
    }
  }

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
    const supabase = createClient();
    const { error } = await supabase.from("outfits").delete().eq("id", o.id);
    if (error) return alert(error.message);
    if (o.thumb_path) await supabase.storage.from(BUCKET).remove([o.thumb_path]);
    setOutfits((all) => all!.filter((x) => x.id !== o.id));
  }

  const count = (id: string) => (outfits ?? []).filter((o) => o.outfit_folder_items.some((f) => f.folder_id === id)).length;
  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3.5 py-1.5 text-sm ${active ? "border-ink bg-ink text-white" : "border-line bg-white"}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Outfits</h1>
        <Link href="/studio?new=1" className="btn-primary py-2.5">
          + New outfit
        </Link>
      </div>

      {loadError && (
        <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">
          Could not load outfits: {loadError}. If it mentions thumb_path or outfit_folder_items, the database update for
          folders hasn&apos;t run yet.
        </p>
      )}

      {outfits && outfits.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <button className={chip(!folder)} onClick={() => openFolder(null)}>
            All · {outfits.length}
          </button>
          {(folders ?? []).map((f) => (
            <button key={f.id} className={chip(folder?.id === f.id)} onClick={() => openFolder(f.id)}>
              📁 {f.name} · {count(f.id)}
            </button>
          ))}
          <button className="shrink-0 rounded-full border border-dashed border-line px-3.5 py-1.5 text-sm text-muted" onClick={newFolder}>
            + Folder
          </button>
        </div>
      )}

      {folder && (
        <div className="flex items-center gap-3 text-sm">
          <p className="mr-auto font-semibold">📁 {folder.name}</p>
          <button className="text-muted hover:text-ink" onClick={renameFolder}>
            Rename
          </button>
          <button className="text-red-700" onClick={deleteFolder}>
            Delete folder
          </button>
        </div>
      )}

      {outfits === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : outfits.length === 0 ? (
        !loadError && (
          <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-muted">
            <p className="mb-4">No saved outfits yet.</p>
            <Link href="/studio?new=1" className="btn-primary">
              Put one together
            </Link>
          </div>
        )
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white p-6 text-center text-sm text-muted">
          Nothing in this folder yet. Under All, tap “📁 Add to folder” on an outfit, or pick folders when you save in Try on.
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((o) => {
            const avatar = avatarWithDefaults(o.avatar);
            const inFolders = o.outfit_folder_items.map((f) => f.folder_id);
            const drawing = job?.key.startsWith(`${o.id}:`);
            return (
              <li key={o.id} className="rounded-2xl border border-line bg-white p-3 sm:p-4">
                <div className="flex gap-3">
                  <Link
                    href={`/studio?outfit=${o.id}`}
                    aria-label={`Open ${o.name}`}
                    className="relative aspect-[3/4] w-24 shrink-0 overflow-hidden rounded-xl bg-canvas sm:w-28"
                  >
                    {thumbs[o.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed storage URL or freshly drawn blob
                      <img
                        src={thumbs[o.id]}
                        alt=""
                        onError={() =>
                          setThumbs((t) => {
                            const next = { ...t };
                            delete next[o.id];
                            return next;
                          })
                        }
                        className={`h-full w-full object-cover ${drawing ? "opacity-60" : ""}`} />
                    ) : (
                      <span className="flex h-full items-center justify-center text-2xl opacity-40">🧍</span>
                    )}
                    {drawing && <span className="absolute inset-x-0 bottom-1 text-center text-[10px] text-muted">Drawing…</span>}
                  </Link>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-semibold">{o.name}</p>
                      <Link href={`/studio?outfit=${o.id}`} className="shrink-0 text-sm font-semibold text-accent">
                        Open
                      </Link>
                    </div>
                    <p className="text-xs text-muted">{o.is_public ? "🔗 Anyone with the link can view" : "🔒 Private"}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-line" style={{ background: avatar.hairColor }} />
                      <span className="truncate">{hairLabel(avatar)}</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {inFolders.map((id) => {
                        const f = folders?.find((x) => x.id === id);
                        return f ? (
                          <button key={id} onClick={() => openFolder(id)} className="rounded-full bg-canvas px-2 py-0.5 text-xs">
                            📁 {f.name}
                          </button>
                        ) : null;
                      })}
                      <button
                        onClick={() => setEditing(editing === o.id ? null : o.id)}
                        className="rounded-full border border-dashed border-line px-2 py-0.5 text-xs text-muted"
                      >
                        {editing === o.id ? "Done" : inFolders.length ? "📁 Edit" : "📁 Add to folder"}
                      </button>
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto pt-0.5">
                      {o.outfit_items.map(({ item_id }) => {
                        const item = byId.get(item_id);
                        return (
                          <div key={item_id} className="checker h-11 w-11 shrink-0 rounded-lg border border-line p-0.5">
                            {item && <ItemPhoto item={item} className="h-full w-full object-contain" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {editing === o.id && folders && (
                  <div className="mt-3 rounded-xl bg-canvas p-3">
                    <p className="mb-2 text-xs text-muted">Folders for this outfit</p>
                    <FolderPicker folders={folders} value={inFolders} onChange={(next) => changeFolders(o, next)} onCreate={createFolder} />
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
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
            );
          })}
        </ul>
      )}

      {job && <OutfitSnapshots job={job} onShot={onShot} />}
    </div>
  );
}
