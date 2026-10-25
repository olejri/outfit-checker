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

/** Sides an item can be photographed from. Left and right are the wearer's. */
export const VIEWS = ["front", "back", "left", "right"] as const;
export type View = (typeof VIEWS)[number];

/**
 * Photo steps when adding an item, in order. The first is required and becomes the
 * item's main photo. Shoes start with a side view because that is how shoes are
 * recognised, and older shoe photos are side views too.
 */
export const CAPTURE_STEPS: Record<Category, View[]> = {
  tops: ["front", "back", "left", "right"],
  bottoms: ["front", "back", "left", "right"],
  outerwear: ["front", "back", "left", "right"],
  dresses: ["front", "back", "left", "right"],
  shoes: ["left", "right", "front", "back"],
  hats: ["front", "back", "left", "right"],
  accessories: ["front", "back"],
};

export type Item = {
  id: string;
  name: string;
  category: Category;
  image_path: string;
  color: string;
  tags: string[];
  /** Storage paths of photos from each side; empty on items added before this existed. */
  views: Partial<Record<View, string>>;
  created_at?: string;
};

/** An item with ready-to-use (signed) image URLs. */
export type ItemWithUrl = Item & { url: string; viewUrls: Partial<Record<View, string>> };

/** Photos of an item by side. Older items only have their main photo. */
export function itemViews(item: Pick<Item, "category" | "image_path" | "views">) {
  const views = { ...item.views };
  if (Object.keys(views).length === 0) views[CAPTURE_STEPS[item.category][0]] = item.image_path;
  return views;
}

export const HAIR_STYLES = [
  { id: "none", label: "Bald" },
  { id: "buzz", label: "Buzz cut" },
  { id: "crew", label: "Crew cut" },
  { id: "sidepart", label: "Side part" },
  { id: "quiff", label: "Quiff" },
  { id: "curls", label: "Short curls" },
  { id: "mohawk", label: "Mohawk" },
  { id: "pixie", label: "Pixie" },
  { id: "bob", label: "Bob" },
  { id: "lob", label: "Shoulder length" },
  { id: "long", label: "Long" },
  { id: "afro", label: "Afro" },
  { id: "ponytail", label: "Ponytail" },
  { id: "bun", label: "Bun" },
  { id: "topknot", label: "Top knot" },
  { id: "spacebuns", label: "Space buns" },
  { id: "braids", label: "Braids" },
] as const;
export type HairStyle = (typeof HAIR_STYLES)[number]["id"];

export const HAIR_COLORS = [
  { id: "#2b231e", label: "Black" },
  { id: "#55392a", label: "Dark brown" },
  { id: "#86603f", label: "Brown" },
  { id: "#a24a25", label: "Auburn" },
  { id: "#cc8443", label: "Copper" },
  { id: "#ddbb7c", label: "Blonde" },
  { id: "#f0e7d3", label: "Platinum" },
  { id: "#a9a49d", label: "Grey" },
  { id: "#e58fac", label: "Pink" },
  { id: "#5676bd", label: "Blue" },
];

export type AvatarSettings = { skin?: string; hair?: HairStyle; hairColor?: string };

export const DEFAULT_AVATAR: Required<AvatarSettings> = {
  skin: "#e8b896",
  hair: "crew",
  hairColor: HAIR_COLORS[1].id,
};

/** Fills in anything an older saved outfit doesn't have. */
export function avatarWithDefaults(avatar: AvatarSettings | null | undefined): Required<AvatarSettings> {
  const hair = HAIR_STYLES.some((h) => h.id === avatar?.hair) ? avatar!.hair! : DEFAULT_AVATAR.hair;
  return { skin: avatar?.skin ?? DEFAULT_AVATAR.skin, hair, hairColor: avatar?.hairColor ?? DEFAULT_AVATAR.hairColor };
}

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
