import type { SupabaseClient } from "@supabase/supabase-js";
import type { Item, ItemWithUrl } from "./types";

export const BUCKET = "wardrobe";

/** Private bucket: turn storage paths into short-lived signed URLs. */
export async function withUrls(supabase: SupabaseClient, items: Item[]): Promise<ItemWithUrl[]> {
  if (items.length === 0) return [];
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(items.map((i) => i.image_path), 60 * 60);
  if (error) throw error;
  const byPath = new Map(data.map((d) => [d.path, d.signedUrl]));
  return items
    .map((i) => ({ ...i, url: byPath.get(i.image_path) ?? "" }))
    .filter((i) => i.url);
}

export async function loadItems(supabase: SupabaseClient): Promise<ItemWithUrl[]> {
  const { data, error } = await supabase
    .from("items")
    .select("id, name, category, image_path, color, tags, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return withUrls(supabase, data as Item[]);
}
