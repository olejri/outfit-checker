export const CATEGORIES = [
  { id: "tops", label: "Tops", emoji: "👕" },
  { id: "bottoms", label: "Bottoms", emoji: "👖" },
  { id: "outerwear", label: "Outerwear", emoji: "🧥" },
  { id: "dresses", label: "Dresses", emoji: "👗" },
  { id: "shoes", label: "Shoes", emoji: "👟" },
  { id: "hats", label: "Hats", emoji: "🧢" },
  { id: "accessories", label: "Accessories", emoji: "👜" },
] as const;

export type Category = (typeof CATEGORIES)[number]["id"];

export type Item = {
  id: string;
  name: string;
  category: Category;
  image_path: string;
  color: string;
  tags: string[];
  created_at?: string;
};

/** An item with a ready-to-use (signed) image URL. */
export type ItemWithUrl = Item & { url: string };

export type AvatarSettings = { skin?: string };

export type Outfit = {
  id: string;
  name: string;
  is_public: boolean;
  share_token: string;
  avatar: AvatarSettings;
  created_at: string;
  outfit_items: { item_id: string }[];
};

/** One item per category is worn; dresses replace tops and bottoms. */
export type Worn = Partial<Record<Category, ItemWithUrl>>;

export function wear(worn: Worn, item: ItemWithUrl): Worn {
  const next: Worn = { ...worn };
  if (next[item.category]?.id === item.id) {
    delete next[item.category];
    return next;
  }
  next[item.category] = item;
  if (item.category === "dresses") {
    delete next.tops;
    delete next.bottoms;
  } else if (item.category === "tops" || item.category === "bottoms") {
    delete next.dresses;
  }
  return next;
}

export const SKIN_TONES = ["#f5d6c6", "#e8b896", "#c68a62", "#8d5a3b", "#5c3a24"];

export const SUGGESTED_TAGS = ["summer", "winter", "spring", "autumn", "work", "casual", "party", "sport"];

export function normalizeTag(raw: string) {
  return raw.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, " ").slice(0, 24);
}

/** Every tag in use, most used first. */
export function allTags(items: { tags: string[] }[]) {
  const counts = new Map<string, number>();
  for (const i of items) for (const t of i.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}
