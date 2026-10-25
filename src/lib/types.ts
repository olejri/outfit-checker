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
  /** How the photos sit on the 3D garment and its shape; empty means template defaults. */
  fit: ItemFit;
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

/**
 * How one side's photo is prepared and placed. Rotation (degrees, clockwise) is
 * applied first, then the crop, given as [x, y, width, height] fractions of the
 * rotated photo. `offset` shifts the photo on the garment in fractions of the
 * garment's width and height (+x right, +y up, as seen from that side), and `scale`
 * grows it around its centre.
 */
export type PhotoFit = {
  rotate?: number;
  crop?: [number, number, number, number];
  offset?: [number, number];
  scale?: number;
};

/** Garment shape controls, each from 0 to 1. */
export const SHAPE_KEYS = ["length", "looseness", "sleeve", "neckline"] as const;
export type ShapeKey = (typeof SHAPE_KEYS)[number];

/**
 * Per-item fit, saved in items.fit. `source` says who set it, so an automatic fitter
 * can later prefill it ("auto") without overwriting what a person adjusted ("manual").
 */
export type ItemFit = {
  photos?: Partial<Record<View, PhotoFit>>;
  shape?: Partial<Record<ShapeKey, number>>;
  /** How trouser legs are cut; only used by bottoms. */
  cut?: LegCut;
  source?: "manual" | "auto";
};

/** Trouser leg cuts. The Fit slider then makes any of them tighter or looser. */
export const LEG_CUTS = [
  { id: "skinny", label: "Skinny" },
  { id: "straight", label: "Straight" },
  { id: "flared", label: "Flared" },
  { id: "wide", label: "Wide" },
  { id: "baggy", label: "Baggy" },
] as const;
export type LegCut = (typeof LEG_CUTS)[number]["id"];

type ShapeControl = { key: ShapeKey; label: string; low: string; high: string };

const LENGTH = { key: "length", label: "Length", low: "Short", high: "Long" } as const;
const LOOSE = { key: "looseness", label: "Fit", low: "Tight", high: "Loose" } as const;
const SIZE = { key: "looseness", label: "Size", low: "Smaller", high: "Bigger" } as const;
const SLEEVE = { key: "sleeve", label: "Sleeves", low: "None", high: "Long" } as const;
const NECK = { key: "neckline", label: "Neckline", low: "High", high: "Deep" } as const;

/** Which shape controls each category has. */
export const SHAPE_CONTROLS: Record<Category, ShapeControl[]> = {
  tops: [LENGTH, LOOSE, SLEEVE, NECK],
  outerwear: [LENGTH, LOOSE, SLEEVE, NECK],
  dresses: [LENGTH, LOOSE, SLEEVE, NECK],
  bottoms: [LENGTH, LOOSE],
  shoes: [SIZE],
  hats: [SIZE],
  accessories: [SIZE],
};

/** Shape values that reproduce each category's standard template. */
export const DEFAULT_SHAPE: Record<Category, Record<ShapeKey, number>> = {
  tops: { length: 0.5, looseness: 0.5, sleeve: 0.4, neckline: 0 },
  outerwear: { length: 0.5, looseness: 0.5, sleeve: 1, neckline: 0 },
  dresses: { length: 0.5, looseness: 0.5, sleeve: 0, neckline: 0 },
  bottoms: { length: 0.875, looseness: 0.5, sleeve: 0, neckline: 0 },
  shoes: { length: 0.5, looseness: 0.5, sleeve: 0, neckline: 0 },
  hats: { length: 0.5, looseness: 0.5, sleeve: 0, neckline: 0 },
  accessories: { length: 0.5, looseness: 0.5, sleeve: 0, neckline: 0 },
};

export type Shape = Record<ShapeKey, number> & { cut: LegCut };

export function shapeWithDefaults(category: Category, fit: ItemFit | null | undefined): Shape {
  const cut = LEG_CUTS.some((c) => c.id === fit?.cut) ? fit!.cut! : "straight";
  return { ...DEFAULT_SHAPE[category], ...fit?.shape, cut };
}

export const HAIR_GROUPS = [
  { id: "short", label: "Short" },
  { id: "medium", label: "Medium" },
  { id: "long", label: "Long" },
  { id: "tied", label: "Tied up" },
] as const;

export const HAIR_STYLES = [
  { id: "none", label: "Bald", group: "short" },
  { id: "buzz", label: "Buzz cut", group: "short" },
  { id: "waves", label: "Waves", group: "short" },
  { id: "crew", label: "Crew cut", group: "short" },
  { id: "fade", label: "Skin fade", group: "short" },
  { id: "crop", label: "French crop", group: "short" },
  { id: "flattop", label: "Flat top", group: "short" },
  { id: "sidepart", label: "Side part", group: "short" },
  { id: "quiff", label: "Quiff", group: "short" },
  { id: "slickback", label: "Slick back", group: "short" },
  { id: "undercut", label: "Undercut", group: "short" },
  { id: "curls", label: "Short curls", group: "short" },
  { id: "mohawk", label: "Mohawk", group: "short" },
  { id: "pixie", label: "Pixie", group: "short" },
  { id: "curtains", label: "Curtains", group: "medium" },
  { id: "surfer", label: "Shaggy", group: "medium" },
  { id: "bob", label: "Bob", group: "medium" },
  { id: "afro", label: "Afro", group: "medium" },
  { id: "lob", label: "Shoulder length", group: "long" },
  { id: "long", label: "Long", group: "long" },
  { id: "dreads", label: "Locs", group: "long" },
  { id: "manbun", label: "Man bun", group: "tied" },
  { id: "topknot", label: "Top knot", group: "tied" },
  { id: "ponytail", label: "Ponytail", group: "tied" },
  { id: "bun", label: "Bun", group: "tied" },
  { id: "spacebuns", label: "Space buns", group: "tied" },
  { id: "braids", label: "Braids", group: "tied" },
] as const;
export type HairStyle = (typeof HAIR_STYLES)[number]["id"];

export const BEARD_STYLES = [
  { id: "none", label: "None" },
  { id: "stubble", label: "Stubble" },
  { id: "moustache", label: "Moustache" },
  { id: "goatee", label: "Goatee" },
  { id: "short", label: "Short beard" },
  { id: "full", label: "Full beard" },
] as const;
export type BeardStyle = (typeof BEARD_STYLES)[number]["id"];

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

export type AvatarSettings = { skin?: string; hair?: HairStyle; hairColor?: string; beard?: BeardStyle };

export const DEFAULT_AVATAR: Required<AvatarSettings> = {
  skin: "#e8b896",
  hair: "crew",
  hairColor: HAIR_COLORS[1].id,
  beard: "none",
};

/** Fills in anything an older saved outfit doesn't have. */
export function avatarWithDefaults(avatar: AvatarSettings | null | undefined): Required<AvatarSettings> {
  const hair = HAIR_STYLES.some((h) => h.id === avatar?.hair) ? avatar!.hair! : DEFAULT_AVATAR.hair;
  const beard = BEARD_STYLES.some((b) => b.id === avatar?.beard) ? avatar!.beard! : DEFAULT_AVATAR.beard;
  return { skin: avatar?.skin ?? DEFAULT_AVATAR.skin, hair, hairColor: avatar?.hairColor ?? DEFAULT_AVATAR.hairColor, beard };
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
