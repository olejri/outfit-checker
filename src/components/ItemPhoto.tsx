"use client";

import { useEffect, useRef } from "react";
import { FULL_CROP, drawFitted, loadImage, rotatedSize } from "@/lib/fit";
import { CAPTURE_STEPS, VIEWS, type ItemWithUrl, type View } from "@/lib/types";

/** The side the item's main photo was taken from. */
export function mainView(item: ItemWithUrl): View {
  return VIEWS.find((v) => item.views[v] === item.image_path) ?? CAPTURE_STEPS[item.category][0];
}

/**
 * An item's photo with its crop and straightening from Adjust fit applied. The stored
 * photo stays untouched, so the crop can always be changed again.
 */
export function ItemPhoto({ item, view, className }: { item: ItemWithUrl; view?: View; className?: string }) {
  const side = view ?? mainView(item);
  const url = item.viewUrls[side] ?? item.url;
  const fit = item.fit?.photos?.[side];
  const rotate = fit?.rotate ?? 0;
  const crop = (fit?.crop ?? FULL_CROP).join(",");
  const adjusted = rotate !== 0 || crop !== FULL_CROP.join(",");
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!adjusted) return;
    let cancelled = false;
    loadImage(url).then((img) => {
      const el = canvas.current;
      if (cancelled || !img || !el) return;
      const [cx, cy, cw, ch] = crop.split(",").map(Number);
      const r = rotatedSize(img.naturalWidth, img.naturalHeight, rotate);
      const k = Math.min(1, 600 / Math.max(cw * r.width, ch * r.height));
      el.width = Math.max(1, Math.round(cw * r.width * k));
      el.height = Math.max(1, Math.round(ch * r.height * k));
      drawFitted(el, img, { rotate, crop: [cx, cy, cw, ch] });
    });
    return () => {
      cancelled = true;
    };
  }, [url, adjusted, rotate, crop]);

  if (!adjusted) {
    // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
    return <img src={url} alt={item.name} className={className} />;
  }
  return <canvas ref={canvas} role="img" aria-label={item.name} className={className} />;
}
