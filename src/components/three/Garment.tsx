"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { Category, ItemWithUrl } from "@/lib/types";
import { BODY, place, project, shoulder, sleeve, torsoShell } from "./geometry";

type Template = {
  parts: () => THREE.BufferGeometry[];
  box: { x: [number, number]; y: [number, number] };
  axis?: "x" | "z";
};

const legs = (bottom: number, r: number) =>
  ([1, -1] as const).map((s) =>
    place(new THREE.CylinderGeometry(r, r * 0.92, 0.94 - bottom, 32, 4, true), {
      pos: [s * BODY.legX, (0.94 + bottom) / 2, 0],
    }),
  );

/**
 * One template mesh per category, sized to sit just outside the mannequin.
 * `box` is the area (in metres, seen from the front) the photo is stretched across.
 */
const TEMPLATES: Record<Category, Template> = {
  tops: {
    parts: () => [
      torsoShell(1.47, 0.94, 0.205, 0.172),
      shoulder(1, 0.068),
      shoulder(-1, 0.068),
      sleeve(1, 0.062, 0.22),
      sleeve(-1, 0.062, 0.22),
    ],
    box: { x: [-0.3, 0.3], y: [0.94, 1.49] },
  },
  outerwear: {
    parts: () => [
      torsoShell(1.48, 0.8, 0.222, 0.2),
      shoulder(1, 0.078),
      shoulder(-1, 0.078),
      sleeve(1, 0.072, 0.56),
      sleeve(-1, 0.072, 0.56),
    ],
    box: { x: [-0.34, 0.34], y: [0.8, 1.5] },
  },
  dresses: {
    parts: () => [
      torsoShell(1.47, 1.0, 0.203, 0.168),
      torsoShell(1.0, 0.45, 0.17, 0.32, false),
    ],
    box: { x: [-0.32, 0.32], y: [0.45, 1.49] },
  },
  bottoms: {
    parts: () => [torsoShell(1.04, 0.86, 0.165, 0.172), ...legs(0.1, 0.079)],
    box: { x: [-0.18, 0.18], y: [0.1, 1.04] },
  },
  shoes: {
    parts: () =>
      ([1, -1] as const).map((s) =>
        place(new THREE.BoxGeometry(0.11, 0.1, 0.27, 2, 2, 4), { pos: [s * BODY.legX, 0.05, 0.05] }),
      ),
    box: { x: [-0.19, 0.09], y: [0, 0.1] },
    axis: "z",
  },
  hats: {
    parts: () => [
      place(new THREE.SphereGeometry(0.118, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), { pos: [0, 1.7, 0] }),
      place(new THREE.CylinderGeometry(0.17, 0.17, 0.01, 48), { pos: [0, 1.7, 0.02] }),
    ],
    box: { x: [-0.17, 0.17], y: [1.69, 1.82] },
  },
  accessories: {
    parts: () => [place(new THREE.BoxGeometry(0.22, 0.2, 0.07), { pos: [0.34, 0.9, 0.02] })],
    box: { x: [0.23, 0.45], y: [0.8, 1.0] },
  },
};

/**
 * Paints the photo over the garment's dominant colour, so transparent areas of the
 * cut-out (around sleeves, between legs) show cloth instead of holes.
 */
function useGarmentTexture(url: string, color: string) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    let cancelled = false;
    let made: THREE.CanvasTexture | null = null;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      made = new THREE.CanvasTexture(canvas);
      made.colorSpace = THREE.SRGBColorSpace;
      made.anisotropy = 4;
      setTexture(made);
    };
    img.src = url;
    return () => {
      cancelled = true;
      made?.dispose();
    };
  }, [url, color]);

  return texture;
}

export function Garment({ item }: { item: ItemWithUrl }) {
  const template = TEMPLATES[item.category];
  const geometries = useMemo(
    () => project(template.parts(), template.box, template.axis),
    [template],
  );
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);

  const texture = useGarmentTexture(item.url, item.color);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: texture ? "#ffffff" : item.color,
        map: texture,
        roughness: 0.85,
        side: THREE.DoubleSide,
      }),
    [texture, item.color],
  );
  useEffect(() => () => material.dispose(), [material]);

  return (
    <group>
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g} material={material} castShadow />
      ))}
    </group>
  );
}
