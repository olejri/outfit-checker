import type { SupabaseClient } from "@supabase/supabase-js";
import { itemViews, type Item, type ItemWithUrl, type View } from "./types";

export const BUCKET = "wardrobe";

/** Every storage path an item uses: its main photo and the photos from each side. */
export function itemPaths(item: Item) {
  return [...new Set([item.image_path, ...Object.values(item.views ?? {})])];
}

/** Private bucket: turn storage paths into short-lived signed URLs. */
export async function withUrls(supabase: SupabaseClient, items: Item[]): Promise<ItemWithUrl[]> {
  if (items.length === 0) return [];
  const normalized = items.map((i) => ({ ...i, tags: i.tags ?? [], views: i.views ?? {} }));
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls([...new Set(normalized.flatMap(itemPaths))], 60 * 60);
  if (error) throw error;
  const byPath = new Map(data.map((d) => [d.path, d.signedUrl]));
  return normalized
    .map((i) => {
      const viewUrls: Partial<Record<View, string>> = {};
      for (const [view, path] of Object.entries(itemViews(i)) as [View, string][]) {
        const url = byPath.get(path);
        if (url) viewUrls[view] = url;
      }
      return { ...i, url: byPath.get(i.image_path) ?? "", viewUrls };
    })
    .filter((i) => i.url);
}

export async function loadItems(supabase: SupabaseClient): Promise<ItemWithUrl[]> {
  const { data, error } = await supabase
    .from("items")
    .select("id, name, category, image_path, color, tags, views, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return withUrls(supabase, data as Item[]);
}
