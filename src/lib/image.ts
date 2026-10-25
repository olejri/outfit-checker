"use client";

const MAX_SIDE = 1024;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Image export failed"))), type, quality),
  );
}

/** Phone photos are huge; shrink before running the model. */
export async function downscale(file: Blob): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvasToBlob(canvas, "image/jpeg", 0.92);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Runs entirely in the browser. The model (~40 MB) is downloaded once and cached. */
export async function removeBackground(
  file: Blob,
  onProgress?: (label: string, fraction: number) => void,
): Promise<Blob> {
  const { removeBackground } = await import("@imgly/background-removal");
  return removeBackground(file, {
    model: "isnet_fp16",
    output: { format: "image/png" },
    progress: (key, current, total) => {
      const label = key.startsWith("fetch") ? "Downloading model (first time only)" : "Removing background";
      onProgress?.(label, total ? current / total : 0);
    },
  });
}

/**
 * Crops transparent edges away and finds the garment's dominant colour,
 * which is used to paint the 3D garment underneath the photo.
 */
export async function trimAndAnalyse(png: Blob): Promise<{ blob: Blob; color: string }> {
  const url = URL.createObjectURL(png);
  try {
    const img = await loadImage(url);
    const src = document.createElement("canvas");
    src.width = img.width;
    src.height = img.height;
    const ctx = src.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);

    let minX = width, minY = height, maxX = -1, maxY = -1;
    const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (data[i + 3] < 128) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
        bucket.n++; bucket.r += r; bucket.g += g; bucket.b += b;
        buckets.set(key, bucket);
      }
    }
    if (maxX < 0) return { blob: png, color: "#888888" }; // nothing opaque, keep as is

    let best = { n: 0, r: 136, g: 136, b: 136 };
    for (const b of buckets.values()) if (b.n > best.n) best = b;
    const hex = (v: number) => Math.round(v / Math.max(best.n, 1)).toString(16).padStart(2, "0");
    const color = best.n ? `#${hex(best.r)}${hex(best.g)}${hex(best.b)}` : "#888888";

    const pad = 4;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);
    const out = document.createElement("canvas");
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    out.getContext("2d")!.drawImage(src, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return { blob: await canvasToBlob(out, "image/png"), color };
  } finally {
    URL.revokeObjectURL(url);
  }
}
