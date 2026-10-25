"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET } from "./data";
import { trimAndAnalyse } from "./image";
import type { Category } from "./types";

// Simple drawn garments so a new wardrobe has something to try on right away.
export const SAMPLES: { category: Category; name: string; svg: string }[] = [
  {
    category: "tops",
    name: "Test striped tee",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 220">
      <defs><pattern id="s" width="20" height="20" patternUnits="userSpaceOnUse">
        <rect width="20" height="20" fill="#f4f1ea"/><rect width="20" height="7" fill="#1f3a68"/></pattern></defs>
      <path d="M80 10 Q120 34 160 10 L232 48 L208 98 L180 86 L180 214 L60 214 L60 86 L32 98 L8 48 Z" fill="url(#s)" stroke="#16294a" stroke-width="3"/>
      <path d="M92 12 Q120 40 148 12" fill="none" stroke="#16294a" stroke-width="5"/></svg>`,
  },
  {
    category: "bottoms",
    name: "Test blue jeans",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 320">
      <path d="M30 8 L170 8 L184 312 L114 312 L100 110 L86 312 L16 312 Z" fill="#3c5f94" stroke="#243c61" stroke-width="3"/>
      <rect x="30" y="8" width="140" height="22" fill="#33527f"/>
      <path d="M100 30 L100 110" stroke="#c9a14a" stroke-width="2" stroke-dasharray="5 4"/>
      <path d="M40 40 Q60 70 86 44 M160 40 Q140 70 114 44" fill="none" stroke="#c9a14a" stroke-width="2" stroke-dasharray="5 4"/></svg>`,
  },
  {
    category: "outerwear",
    name: "Test camel jacket",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 280">
      <path d="M90 8 L130 40 L170 8 L232 40 L254 270 L214 274 L206 120 L200 272 L60 272 L54 120 L46 274 L6 270 L28 40 Z" fill="#b98a55" stroke="#7d5a33" stroke-width="3"/>
      <path d="M90 8 L130 120 L170 8" fill="none" stroke="#7d5a33" stroke-width="4"/>
      <path d="M130 120 L130 272" stroke="#7d5a33" stroke-width="3"/>
      <circle cx="140" cy="150" r="5" fill="#4a341d"/><circle cx="140" cy="190" r="5" fill="#4a341d"/><circle cx="140" cy="230" r="5" fill="#4a341d"/>
      <rect x="72" y="190" width="40" height="8" fill="#7d5a33"/><rect x="148" y="190" width="40" height="8" fill="#7d5a33"/></svg>`,
  },
  {
    category: "dresses",
    name: "Test polka dress",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 320">
      <defs><pattern id="d" width="30" height="30" patternUnits="userSpaceOnUse">
        <rect width="30" height="30" fill="#b3263e"/><circle cx="8" cy="8" r="4" fill="#fff"/><circle cx="23" cy="23" r="4" fill="#fff"/></pattern></defs>
      <path d="M80 8 L100 8 Q120 30 140 8 L160 8 L172 120 L230 312 L10 312 L68 120 Z" fill="url(#d)" stroke="#7f1a2b" stroke-width="3"/>
      <rect x="66" y="112" width="108" height="12" fill="#7f1a2b"/></svg>`,
  },
  {
    category: "shoes",
    name: "Test white sneakers",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 140">
      <path d="M10 70 Q20 30 70 34 L130 20 Q170 60 230 66 Q290 74 290 106 L290 120 L10 120 Z" fill="#f7f7f5" stroke="#9a9a96" stroke-width="3"/>
      <rect x="10" y="108" width="280" height="22" rx="6" fill="#e2e0db" stroke="#9a9a96" stroke-width="3"/>
      <path d="M150 40 L120 70 M165 48 L135 78 M180 56 L150 86" stroke="#2f6fd0" stroke-width="5" stroke-linecap="round"/>
      <path d="M60 90 Q140 70 230 92" fill="none" stroke="#2f6fd0" stroke-width="8"/></svg>`,
  },
  {
    category: "hats",
    name: "Test blue cap",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 150">
      <path d="M30 110 Q30 14 120 14 Q210 14 210 110 Z" fill="#2c5aa0" stroke="#1b3866" stroke-width="3"/>
      <path d="M20 110 L220 110 Q232 136 120 140 Q8 136 20 110 Z" fill="#1b3866"/>
      <circle cx="120" cy="16" r="7" fill="#1b3866"/>
      <path d="M120 16 L120 110" stroke="#1b3866" stroke-width="2"/></svg>`,
  },
  {
    category: "accessories",
    name: "Test leather bag",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
      <path d="M70 80 Q70 16 120 16 Q170 16 170 80" fill="none" stroke="#5b3a1e" stroke-width="12"/>
      <rect x="20" y="76" width="200" height="150" rx="16" fill="#8a5a2b" stroke="#5b3a1e" stroke-width="3"/>
      <path d="M20 120 L220 120" stroke="#5b3a1e" stroke-width="3"/>
      <rect x="106" y="110" width="28" height="22" rx="4" fill="#d6b25e"/></svg>`,
  },
];

export async function svgToPng(svg: string): Promise<Blob> {
  // Size the SVG explicitly; browsers disagree on the size of viewBox-only images.
  const [, , w, h] = svg.match(/viewBox="([\d.\s]+)"/)![1].trim().split(/\s+/).map(Number);
  const scale = 600 / Math.max(w, h);
  const width = Math.round(w * scale);
  const height = Math.round(h * scale);
  const sized = svg.replace("<svg ", `<svg width="${width}" height="${height}" `);
  const url = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Adds one "test"-tagged item per category to the signed-in user's wardrobe, plus two
 * outfits that use them (a dress replaces a top and bottoms, so it gets its own outfit).
 */
export async function addSampleWardrobe(supabase: SupabaseClient) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("You are signed out. Please sign in again.");

  const ids = {} as Record<Category, string>;
  for (const sample of SAMPLES) {
    const { blob, color } = await trimAndAnalyse(await svgToPng(sample.svg));
    const path = `${auth.user.id}/${crypto.randomUUID()}.png`;
    const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/png" });
    if (up.error) throw up.error;
    const { data, error } = await supabase
      .from("items")
      .insert({ name: sample.name, category: sample.category, image_path: path, color, tags: ["test"] })
      .select("id")
      .single();
    if (error) throw error;
    ids[sample.category] = data.id as string;
  }

  const outfits: [string, Category[]][] = [
    ["Test outfit", ["tops", "bottoms", "shoes", "hats", "accessories"]],
    ["Test outfit (dress)", ["dresses", "outerwear", "shoes", "accessories"]],
  ];
  for (const [name, categories] of outfits) {
    const { data, error } = await supabase.from("outfits").insert({ name, avatar: {} }).select("id").single();
    if (error) throw error;
    const links = await supabase
      .from("outfit_items")
      .insert(categories.map((c) => ({ outfit_id: data.id, item_id: ids[c] })));
    if (links.error) throw links.error;
  }
}
