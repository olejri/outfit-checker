import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET } from "./data";
import type { AvatarSettings, Folder, ItemWithUrl } from "./types";

// Bump when the preview picture's look changes (camera, lights), to redraw them all.
const THUMB_VERSION = 1;

/** Short hash of everything that changes how an outfit looks on the model. */
export function thumbKey(avatar: Required<AvatarSettings>, items: ItemWithUrl[]) {
  const parts = [...items]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((i) => [i.id, i.color, i.image_path, i.views, i.fit]);
  const text = JSON.stringify([THUMB_VERSION, avatar, parts]);
  // FNV-1a, 32 bit: plenty to notice a change, and no async crypto needed.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/** Stores a new preview picture for an outfit and removes the old one. */
export async function saveThumb(
  supabase: SupabaseClient,
  outfit: { id: string; thumb_path: string | null },
  image: Blob,
  key: string,
) {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user.id;
  if (!user) throw new Error("Signed out");
  // Some browsers (older Safari) can't make WebP and hand back a PNG instead.
  const ext = image.type === "image/webp" ? "webp" : "png";
  const path = `${user}/outfits/${outfit.id}-${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, image, { contentType: image.type || "image/png" });
  if (up.error) throw up.error;
  const { error } = await supabase.from("outfits").update({ thumb_path: path, thumb_key: key }).eq("id", outfit.id);
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  if (outfit.thumb_path) await supabase.storage.from(BUCKET).remove([outfit.thumb_path]);
  return path;
}

export async function loadFolders(supabase: SupabaseClient): Promise<Folder[]> {
  const { data, error } = await supabase.from("outfit_folders").select("id, name").order("name");
  if (error) throw error;
  return data as Folder[];
}

export async function createFolder(supabase: SupabaseClient, name: string): Promise<Folder> {
  const { data, error } = await supabase.from("outfit_folders").insert({ name }).select("id, name").single();
  if (error) throw error.code === "23505" ? new Error(`You already have a folder called "${name}".`) : error;
  return data as Folder;
}

/** Puts an outfit in exactly these folders. */
export async function setOutfitFolders(supabase: SupabaseClient, outfitId: string, before: string[], after: string[]) {
  const added = after.filter((id) => !before.includes(id));
  const removed = before.filter((id) => !after.includes(id));
  if (added.length) {
    const { error } = await supabase
      .from("outfit_folder_items")
      .upsert(added.map((folder_id) => ({ folder_id, outfit_id: outfitId })), { ignoreDuplicates: true });
    if (error) throw error;
  }
  if (removed.length) {
    const { error } = await supabase.from("outfit_folder_items").delete().eq("outfit_id", outfitId).in("folder_id", removed);
    if (error) throw error;
  }
}
