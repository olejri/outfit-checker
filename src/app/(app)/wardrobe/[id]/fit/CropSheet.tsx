"use client";

import { useEffect, useRef, useState } from "react";
import { FULL_CROP, drawRotated, loadImage } from "@/lib/fit";
import type { PhotoFit } from "@/lib/types";

type Crop = [number, number, number, number];
type Handle = "move" | "nw" | "ne" | "sw" | "se";

const MIN = 0.08;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Full-screen crop and straighten for one photo. */
export function CropSheet({
  url,
  value,
  onDone,
  onCancel,
}: {
  url: string;
  value: PhotoFit;
  onDone: (next: { rotate: number; crop: Crop }) => void;
  onCancel: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [rotate, setRotate] = useState(value.rotate ?? 0);
  const [crop, setCrop] = useState<Crop>(value.crop ?? FULL_CROP);
  const drag = useRef<{ handle: Handle; x: number; y: number; start: Crop } | null>(null);

  useEffect(() => {
    loadImage(url).then(setImg);
  }, [url]);

  useEffect(() => {
    if (img && canvas.current) drawRotated(canvas.current, img, rotate);
  }, [img, rotate]);

  function down(e: React.PointerEvent<HTMLElement>) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { handle: e.currentTarget.dataset.handle as Handle, x: e.clientX, y: e.clientY, start: crop };
  }

  function move(e: React.PointerEvent) {
    const d = drag.current;
    const box = canvas.current?.getBoundingClientRect();
    if (!d || !box) return;
    const dx = (e.clientX - d.x) / box.width;
    const dy = (e.clientY - d.y) / box.height;
    let [x, y, w, h] = d.start;
    if (d.handle === "move") {
      x = clamp(x + dx, 0, 1 - w);
      y = clamp(y + dy, 0, 1 - h);
    } else {
      let right = x + w;
      let bottom = y + h;
      if (d.handle.includes("w")) x = clamp(x + dx, 0, right - MIN);
      else right = clamp(right + dx, x + MIN, 1);
      if (d.handle.includes("n")) y = clamp(y + dy, 0, bottom - MIN);
      else bottom = clamp(bottom + dy, y + MIN, 1);
      w = right - x;
      h = bottom - y;
    }
    setCrop([x, y, w, h]);
  }

  function up() {
    drag.current = null;
  }

  const [x, y, w, h] = crop;
  const pct = (v: number) => `${v * 100}%`;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-ink text-white">
      <div className="flex items-center justify-between px-4 py-3">
        <button className="text-sm" onClick={onCancel}>
          Cancel
        </button>
        <p className="text-sm font-semibold">Crop & straighten</p>
        <button className="text-sm font-semibold text-accent" onClick={() => onDone({ rotate, crop })}>
          Done
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-6" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {!img && <p className="text-sm text-white/70">Loading photo…</p>}
        <div className={`relative touch-none ${img ? "" : "hidden"}`}>
          <canvas ref={canvas} className="checker block max-h-[60dvh] max-w-full" />
          {/* Dim everything outside the crop. */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
              style={{ left: pct(x), top: pct(y), width: pct(w), height: pct(h) }}
            />
          </div>
          <div
            className="absolute border-2 border-white"
            style={{ left: pct(x), top: pct(y), width: pct(w), height: pct(h) }}
            data-handle="move"
            onPointerDown={down}
          >
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} className="border border-white/25" />
              ))}
            </div>
            {(["nw", "ne", "sw", "se"] as const).map((c) => (
              <div
                key={c}
                data-handle={c}
                onPointerDown={down}
                className={`absolute h-11 w-11 ${c[0] === "n" ? "-top-5" : "-bottom-5"} ${c[1] === "w" ? "-left-5" : "-right-5"}`}
              >
                <span className="absolute inset-3 rounded-full border-2 border-ink bg-white" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3">
          <span className="w-16 text-xs text-white/70">Straighten</span>
          <input
            type="range"
            min={-45}
            max={45}
            step={0.5}
            value={clamp(normalise(rotate), -45, 45)}
            onChange={(e) => setRotate(quarter(rotate) + Number(e.target.value))}
            className="flex-1 accent-accent"
          />
          <span className="w-10 text-right text-xs tabular-nums">{Math.round(normalise(rotate))}°</span>
        </div>
        <div className="flex gap-2">
          <button className="btn flex-1 bg-white/10" onClick={() => setRotate((r) => wrap(r - 90))}>
            ↺ 90°
          </button>
          <button className="btn flex-1 bg-white/10" onClick={() => setRotate((r) => wrap(r + 90))}>
            ↻ 90°
          </button>
          <button
            className="btn flex-1 bg-white/10"
            onClick={() => {
              setRotate(0);
              setCrop(FULL_CROP);
            }}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

/** Rotation in (-180, 180]. */
const wrap = (r: number) => ((((r + 180) % 360) + 360) % 360) - 180 || 0;
/** The nearest quarter turn, which the straighten slider works around. */
const quarter = (r: number) => Math.round(r / 90) * 90;
const normalise = (r: number) => r - quarter(r);
