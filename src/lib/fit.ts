import type { PhotoFit } from "./types";

export const FULL_CROP: [number, number, number, number] = [0, 0, 1, 1];

export function loadImage(url: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Size of the box around a photo rotated by `degrees`. */
export function rotatedSize(width: number, height: number, degrees: number) {
  const a = (degrees * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return { width: width * c + height * s, height: width * s + height * c };
}

/**
 * Draws a photo with its fit applied, filling the whole canvas: the photo is rotated,
 * its crop is stretched over the canvas (the canvas stands for the garment area), then
 * shifted and scaled. Uncovered areas get `background`, or stay transparent.
 */
export function drawFitted(canvas: HTMLCanvasElement, img: HTMLImageElement, fit: PhotoFit = {}, background?: string) {
  const ctx = canvas.getContext("2d")!;
  const { width: W, height: H } = canvas;
  const [cx, cy, cw, ch] = fit.crop ?? FULL_CROP;
  const [ox, oy] = fit.offset ?? [0, 0];
  const scale = fit.scale ?? 1;
  const rotate = fit.rotate ?? 0;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const r = rotatedSize(iw, ih, rotate);

  ctx.save();
  ctx.clearRect(0, 0, W, H);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);
  }
  // Canvas centre, moved by the offset (+y is up on the garment).
  ctx.translate(W / 2 + ox * W, H / 2 - oy * H);
  ctx.scale((scale * W) / (cw * r.width), (scale * H) / (ch * r.height));
  // Now in the rotated photo's box, with the crop's centre at the origin.
  ctx.translate(-(cx + cw / 2) * r.width, -(cy + ch / 2) * r.height);
  ctx.beginPath();
  ctx.rect(cx * r.width, cy * r.height, cw * r.width, ch * r.height);
  ctx.clip();
  ctx.translate(r.width / 2, r.height / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.drawImage(img, -iw / 2, -ih / 2);
  ctx.restore();
}

/** Sizes `canvas` to the rotated photo (at most `max` px) and draws it uncropped. */
export function drawRotated(canvas: HTMLCanvasElement, img: HTMLImageElement, rotate: number, max = 1024) {
  const r = rotatedSize(img.naturalWidth, img.naturalHeight, rotate);
  const k = Math.min(1, max / Math.max(r.width, r.height));
  canvas.width = Math.max(1, Math.round(r.width * k));
  canvas.height = Math.max(1, Math.round(r.height * k));
  drawFitted(canvas, img, { rotate });
}
