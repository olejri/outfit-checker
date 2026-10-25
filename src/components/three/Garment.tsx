"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { drawFitted, loadImage } from "@/lib/fit";
import {
  VIEWS,
  shapeWithDefaults,
  type Category,
  type ItemFit,
  type ItemWithUrl,
  type LegCut,
  type Shape,
  type View,
} from "@/lib/types";
import { BODY, place, projectViews, shoulder, sleeve, torsoShell, type ProjectionBox, type Range } from "./geometry";


type Template = {
  parts: (shape: Shape) => THREE.BufferGeometry[];
  /** The area (in metres) each side's photo is stretched across. */
  box: (shape: Shape) => ProjectionBox;
  /** Height of the collar, where a neckline is cut from. */
  neck?: number;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 1 at the middle of a slider, `min` and `max` at its ends. */
const around1 = (t: number, min: number, max: number) => (t < 0.5 ? lerp(min, 1, t * 2) : lerp(1, max, (t - 0.5) * 2));
const looseness = (s: Shape) => around1(s.looseness, 0.96, 1.25);
const size = (s: Shape, min = 0.85) => around1(s.looseness, min, 1.25);
const MAX_SLEEVE = 0.56;

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Radius of a trouser leg at the knee and at the hem, and the crotch height, by cut. */
const CUTS: Record<LegCut, { knee: number; hem: number; crotch: number }> = {
  skinny: { knee: 0.07, hem: 0.067, crotch: 0.78 },
  straight: { knee: 0.08, hem: 0.075, crotch: 0.78 },
  flared: { knee: 0.074, hem: 0.118, crotch: 0.78 },
  wide: { knee: 0.1, hem: 0.125, crotch: 0.77 },
  baggy: { knee: 0.115, hem: 0.112, crotch: 0.72 },
};

const WAIST = 1.04;
/** Below this the hips start turning into legs. */
const HIP = 0.87;

/** Half width of the trousers' hip section (an ellipse, BODY.depth as deep as wide). */
const hipHalfWidth = (y: number, k: number) => lerp(0.165, 0.172, smooth(Math.min(1, Math.max(0, (WAIST - y) / 0.14)))) * k;

/**
 * Outline of a trouser leg at height `y`: its centre's distance from the middle of the
 * body and its radius. Above the crotch the leg's inner edge stays on the middle line,
 * so the two legs meet without a gap or overlap; below it they part, and from the
 * knee down they follow the cut, made tighter or looser by `loose` (0.5 is the cut as
 * is). Wide legs move outwards so they stay apart.
 */
function legOutline(y: number, cut: LegCut, loose: number, k: number) {
  const shape = CUTS[cut];
  // Never tighter than the mannequin's leg.
  const fit = (r: number) => Math.max(0.068, r * around1(loose, 0.9, 1.3));
  const knee = fit(shape.knee);
  const hem = fit(shape.hem);
  const atCrotch = Math.max(BODY.legX, Math.min(knee, 0.1));
  if (y >= shape.crotch) {
    const t = smooth(Math.min(1, (HIP - Math.min(y, HIP)) / (HIP - shape.crotch)));
    const r = lerp(hipHalfWidth(HIP, k) / 2, atCrotch, t);
    return { r, cx: r };
  }
  const r =
    y >= 0.5
      ? lerp(atCrotch, knee, smooth((shape.crotch - y) / (shape.crotch - 0.5)))
      : lerp(knee, hem, smooth(Math.min(1, (0.5 - y) / 0.48)));
  // Ease the legs apart below the crotch, further for wide legs.
  const apart = smooth(Math.min(1, (shape.crotch - y) / 0.12));
  const cx = lerp(atCrotch, Math.max(BODY.legX, r + 0.006), apart);
  return { r, cx };
}

/**
 * The trousers as one surface per leg, from the waist to `bottom`. At the hips each
 * leg is half of the hip ellipse (the two halves meet on the middle line), and it
 * morphs into a round leg by the crotch, so there are no separate parts or seams.
 */
function trousers(bottom: number, cut: LegCut, loose: number, k: number) {
  const rows = 90;
  const cols = 48;
  const crotch = CUTS[cut].crotch;
  return ([1, -1] as const).map((side) => {
    const positions: number[] = [];
    const index: number[] = [];
    for (let i = 0; i <= rows; i++) {
      const y = lerp(WAIST, bottom, i / rows);
      const hx = hipHalfWidth(y, k);
      const hz = hx * BODY.depth;
      const t = smooth(Math.min(1, Math.max(0, (HIP - y) / (HIP - crotch))));
      const { r, cx } = legOutline(y, cut, loose, k);
      for (let j = 0; j <= cols; j++) {
        // θ = 0 faces outwards, ±π is the middle line (front and back).
        const a = -Math.PI + (2 * Math.PI * j) / cols;
        const hipX = hx * Math.cos(a / 2);
        const hipZ = -hz * Math.sin(a / 2);
        const legX = cx + r * Math.cos(a);
        const legZ = -r * Math.sin(a);
        positions.push(side * lerp(hipX, legX, t), y, lerp(hipZ, legZ, t));
      }
    }
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const p = i * (cols + 1) + j;
        const q = p + cols + 1;
        if (side === 1) index.push(p, q, p + 1, p + 1, q, q + 1);
        else index.push(p, p + 1, q, p + 1, q + 1, q);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  });
}

/** Widest point of the trousers from the middle, so the photo covers both legs. */
function trouserHalfWidth(bottom: number, cut: LegCut, loose: number, k: number) {
  let widest = hipHalfWidth(HIP, k);
  for (let y = bottom; y <= CUTS[cut].crotch; y += 0.02) {
    const { r, cx } = legOutline(y, cut, loose, k);
    widest = Math.max(widest, cx + r);
  }
  return widest;
}

/** Shoulders and sleeves, or nothing for a sleeveless garment. */
const arms = (shoulderR: number, sleeveR: number, sleeveShare: number) => {
  const length = sleeveShare * MAX_SLEEVE;
  if (length < 0.02) return [];
  return [shoulder(1, shoulderR), shoulder(-1, shoulderR), sleeve(1, sleeveR, length), sleeve(-1, sleeveR, length)];
};

/**
 * One template per category, sized to sit just outside the mannequin and shaped by
 * the item's fit. At the default shape (DEFAULT_SHAPE) each matches the original
 * fixed template.
 */
const TEMPLATES: Record<Category, Template> = {
  tops: {
    parts: (s) => {
      const k = looseness(s);
      return [torsoShell(1.47, lerp(1.14, 0.74, s.length), 0.205 * k, 0.172 * k), ...arms(0.068 * k, 0.062 * k, s.sleeve)];
    },
    box: (s) => ({ x: [-0.3 * looseness(s), 0.3 * looseness(s)], y: [lerp(1.14, 0.74, s.length), 1.49] }),
    neck: 1.47,
  },
  outerwear: {
    parts: (s) => {
      const k = looseness(s);
      return [torsoShell(1.48, lerp(1.1, 0.5, s.length), 0.222 * k, 0.2 * k), ...arms(0.078 * k, 0.072 * k, s.sleeve)];
    },
    box: (s) => ({ x: [-0.34 * looseness(s), 0.34 * looseness(s)], y: [lerp(1.1, 0.5, s.length), 1.5] }),
    neck: 1.48,
  },
  dresses: {
    parts: (s) => {
      const k = looseness(s);
      const hem = lerp(0.85, 0.05, s.length);
      return [
        torsoShell(1.47, 1.0, 0.203 * k, 0.168 * k),
        torsoShell(1.0, hem, 0.17 * k, skirtFlare(s), false),
        ...arms(0.068 * k, 0.062 * k, s.sleeve),
      ];
    },
    box: (s) => {
      const half = Math.max(0.32 * looseness(s), skirtFlare(s));
      return { x: [-half, half], y: [lerp(0.85, 0.05, s.length), 1.49] };
    },
    neck: 1.47,
  },
  bottoms: {
    parts: (s) => {
      const k = looseness(s);
      return trousers(lerp(0.66, 0.02, s.length), s.cut, s.looseness, k);
    },
    box: (s) => {
      const bottom = lerp(0.66, 0.02, s.length);
      const half = Math.max(0.18 * looseness(s), trouserHalfWidth(bottom, s.cut, s.looseness, looseness(s)));
      return { x: [-half, half], y: [bottom, WAIST] };
    },
  },
  shoes: {
    parts: (s) => {
      const k = size(s);
      return ([1, -1] as const).map((side) =>
        place(new THREE.BoxGeometry(0.11 * k, 0.1 * k, 0.27 * k, 2, 2, 4), { pos: [side * BODY.legX, 0.05 * k, 0.05] }),
      );
    },
    box: (s) => {
      const k = size(s);
      return { x: [-0.06 * k, 0.06 * k], y: [0, 0.1 * k], z: [0.05 - 0.14 * k, 0.05 + 0.14 * k], perPart: true };
    },
  },
  hats: {
    parts: (s) => {
      const k = size(s, 0.9);
      return [
        place(new THREE.SphereGeometry(0.118 * k, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), { pos: [0, 1.7, 0] }),
        place(new THREE.CylinderGeometry(0.17 * k, 0.17 * k, 0.01, 48), { pos: [0, 1.7, 0.02] }),
      ];
    },
    box: (s) => {
      const k = size(s, 0.9);
      return { x: [-0.17 * k, 0.17 * k], y: [1.69, 1.7 + 0.12 * k] };
    },
  },
  accessories: {
    parts: (s) => {
      const k = size(s, 0.6);
      return [place(new THREE.BoxGeometry(0.22 * k, 0.2 * k, 0.07 * k), { pos: [0.34, 0.9, 0.02] })];
    },
    box: (s) => {
      const k = size(s, 0.6);
      return { x: [0.34 - 0.11 * k, 0.34 + 0.11 * k], y: [0.9 - 0.1 * k, 0.9 + 0.1 * k] };
    },
  },
};

/** A dress skirt flares more the longer it is. */
function skirtFlare(s: Shape) {
  const hem = lerp(0.85, 0.05, s.length);
  return (0.17 + (0.15 * (1 - hem)) / 0.55) * looseness(s);
}

/**
 * Builds an item's garment meshes for a shape, with each side's photo projected on.
 * Also returns the photo area (with its depth filled in) and the overall bounds, for
 * framing the camera; pass `keep = false` when only those measurements are needed.
 */
export function buildGarment(category: Category, shape: Shape, keep = true) {
  const template = TEMPLATES[category];
  const box = template.box(shape);
  const geometries = projectViews(template.parts(shape), box);
  const bounds = new THREE.Box3();
  for (const g of geometries) bounds.union(g.boundingBox!);
  const z: Range = box.z ?? [bounds.min.z, bounds.max.z];
  // Measuring only: free the meshes straight away.
  if (!keep) geometries.forEach((g) => g.dispose());
  return { geometries, box: { ...box, z }, bounds };
}

/** Loads each side's photo once; fitting them is redone on the canvas without reloading. */
function useViewImages(urls: Partial<Record<View, string>>) {
  const [images, setImages] = useState<Partial<Record<View, HTMLImageElement>> | null>(null);
  const key = VIEWS.map((v) => urls[v] ?? "").join("|");

  useEffect(() => {
    let cancelled = false;
    const urlList = key.split("|");
    Promise.all(VIEWS.map((v, i) => (urlList[i] ? loadImage(urlList[i]) : null))).then((loaded) => {
      if (cancelled) return;
      const next: Partial<Record<View, HTMLImageElement>> = {};
      VIEWS.forEach((v, i) => { if (loaded[i]) next[v] = loaded[i]!; });
      setImages(Object.keys(next).length ? next : null);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return images;
}

/**
 * One texture per side. Each photo is painted over the garment's dominant colour, so
 * transparent areas of the cut-out (around sleeves, between legs) show cloth instead
 * of holes, and redrawn in place whenever its crop, rotation or placement changes.
 */
function useViewTextures(urls: Partial<Record<View, string>>, color: string, photos: ItemFit["photos"]) {
  const images = useViewImages(urls);

  const textures = useMemo(() => {
    if (!images) return null;
    const made: Partial<Record<View, THREE.CanvasTexture>> = {};
    for (const [view, img] of Object.entries(images) as [View, HTMLImageElement][]) {
      const canvas = document.createElement("canvas");
      // The canvas size never changes, so the GPU texture can be updated in place.
      const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      made[view] = texture;
    }
    return made;
  }, [images]);
  useEffect(() => () => Object.values(textures ?? {}).forEach((t) => t.dispose()), [textures]);

  const photosKey = JSON.stringify(photos ?? {});
  useEffect(() => {
    if (!images || !textures) return;
    const fits = JSON.parse(photosKey) as NonNullable<ItemFit["photos"]>;
    for (const [view, texture] of Object.entries(textures) as [View, THREE.CanvasTexture][]) {
      drawFitted(texture.image as HTMLCanvasElement, images[view]!, fits[view], color);
      texture.needsUpdate = true;
    }
  }, [images, textures, photosKey, color]);

  return textures;
}

const OPPOSITE: Record<View, View> = { front: "back", back: "front", left: "right", right: "left" };

const BLANK = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
BLANK.needsUpdate = true;

type NeckUniforms = { neckTop: { value: number }; neckDepth: { value: number }; neckWidth: { value: number } };

/**
 * Blends the four photos by which way the surface faces, so the chest shows the front
 * photo, the shoulder blades the back one and the sleeves the side ones, with soft
 * seams in between. A missing side borrows the opposite photo, seen through the
 * garment (which is how single-photo items always looked); if both are missing, that
 * axis is left out and the other one covers it. Without photos it is plain colour.
 * A neckline is cut out of the front below `neckTop`.
 */
function viewMaterial(textures: Partial<Record<View, THREE.CanvasTexture>> | null, color: string) {
  const neck: NeckUniforms = { neckTop: { value: 0 }, neckDepth: { value: 0 }, neckWidth: { value: 1 } };
  const maps: THREE.Texture[] = [];
  const uvIndex: number[] = [];
  const enabled: number[] = [];
  VIEWS.forEach((view) => {
    const source = textures?.[view] ? view : textures?.[OPPOSITE[view]] ? OPPOSITE[view] : null;
    maps.push(source ? textures![source]! : BLANK);
    uvIndex.push(source ? VIEWS.indexOf(source) : 0);
    enabled.push(source ? 1 : 0);
  });

  const material = new THREE.MeshStandardMaterial({
    color: textures ? "#ffffff" : color,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  material.userData.neck = neck;
  material.customProgramCacheKey = () => "garment-views";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, neck, {
      mapFront: { value: maps[0] },
      mapBack: { value: maps[1] },
      mapLeft: { value: maps[2] },
      mapRight: { value: maps[3] },
      viewUv: { value: new THREE.Vector4(...uvIndex) },
      viewOn: { value: new THREE.Vector4(...enabled) },
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec2 uvBack;
        attribute vec2 uvLeft;
        attribute vec2 uvRight;
        varying vec2 vUvViews[4];
        varying vec3 vBodyNormal;
        varying vec3 vBodyPos;`,
      )
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        vUvViews[0] = uv;
        vUvViews[1] = uvBack;
        vUvViews[2] = uvLeft;
        vUvViews[3] = uvRight;
        vBodyNormal = normal;
        vBodyPos = position;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform sampler2D mapFront;
        uniform sampler2D mapBack;
        uniform sampler2D mapLeft;
        uniform sampler2D mapRight;
        uniform vec4 viewUv;
        uniform vec4 viewOn;
        uniform float neckTop;
        uniform float neckDepth;
        uniform float neckWidth;
        varying vec2 vUvViews[4];
        varying vec3 vBodyNormal;
        varying vec3 vBodyPos;
        vec2 viewCoord(float i) {
          return i < 0.5 ? vUvViews[0] : i < 1.5 ? vUvViews[1] : i < 2.5 ? vUvViews[2] : vUvViews[3];
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `if (neckDepth > 0.0 && vBodyPos.z > 0.0) {
          float t = abs(vBodyPos.x) / neckWidth;
          if (t < 1.0 && vBodyPos.y > neckTop - neckDepth * (1.0 - t * t)) discard;
        }
        if (dot(viewOn, vec4(1.0)) > 0.0) {
          vec3 bn = normalize(vBodyNormal);
          // +z is the front, +x the wearer's left.
          vec4 w = viewOn * exp(8.0 * vec4(bn.z, -bn.z, bn.x, -bn.x));
          w /= max(dot(w, vec4(1.0)), 1e-5);
          diffuseColor *=
            texture2D(mapFront, viewCoord(viewUv.x)) * w.x +
            texture2D(mapBack, viewCoord(viewUv.y)) * w.y +
            texture2D(mapLeft, viewCoord(viewUv.z)) * w.z +
            texture2D(mapRight, viewCoord(viewUv.w)) * w.w;
        }
        // The inside of the garment, seen through a neckline, is a little darker.
        if (!gl_FrontFacing) diffuseColor.rgb *= 0.75;`,
      );
  };
  return material;
}

/** Neckline from 0 (high, nothing cut) to 1 (deep scoop); garments without a collar have none. */
function setNeckline(material: THREE.Material, top: number | undefined, depth: number) {
  const neck = material.userData.neck as NeckUniforms;
  neck.neckTop.value = top ?? 0;
  neck.neckDepth.value = top ? 0.2 * depth : 0;
  neck.neckWidth.value = 0.05 + 0.05 * depth;
}

/** `onReady` is called once the photos are on the garment (used for preview pictures). */
export function Garment({ item, onReady }: { item: ItemWithUrl; onReady?: () => void }) {
  const shape = shapeWithDefaults(item.category, item.fit);
  const shapeKey = JSON.stringify(shape);
  const geometries = useMemo(
    () => buildGarment(item.category, JSON.parse(shapeKey) as Shape).geometries,
    [item.category, shapeKey],
  );
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);

  const textures = useViewTextures(item.viewUrls, item.color, item.fit?.photos);
  // Uniforms are shared with the compiled shader, so the neckline updates without a rebuild.
  const material = useMemo(() => viewMaterial(textures, item.color), [textures, item.color]);
  const neckTop = TEMPLATES[item.category].neck;
  useEffect(() => setNeckline(material, neckTop, shape.neckline), [material, neckTop, shape.neckline]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    if (textures) onReady?.();
  }, [textures, onReady]);

  return (
    <group>
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g} material={material} castShadow />
      ))}
    </group>
  );
}
