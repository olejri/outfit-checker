"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { VIEWS, type Category, type ItemWithUrl, type View } from "@/lib/types";
import { BODY, place, projectViews, shoulder, sleeve, torsoShell, type ProjectionBox } from "./geometry";

type Template = {
  parts: () => THREE.BufferGeometry[];
  box: ProjectionBox;
};

const legs = (bottom: number, r: number) =>
  ([1, -1] as const).map((s) =>
    place(new THREE.CylinderGeometry(r, r * 0.92, 0.94 - bottom, 32, 4, true), {
      pos: [s * BODY.legX, (0.94 + bottom) / 2, 0],
    }),
  );

/**
 * One template mesh per category, sized to sit just outside the mannequin.
 * `box` is the area (in metres) each side's photo is stretched across.
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
    box: { x: [-0.06, 0.06], y: [0, 0.1], z: [-0.09, 0.19], perPart: true },
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
 * Paints each photo over the garment's dominant colour, so transparent areas of the
 * cut-out (around sleeves, between legs) show cloth instead of holes.
 */
function useViewTextures(urls: Partial<Record<View, string>>, color: string) {
  const [textures, setTextures] = useState<Partial<Record<View, THREE.CanvasTexture>> | null>(null);
  const key = VIEWS.map((v) => urls[v] ?? "").join("|");

  useEffect(() => {
    let cancelled = false;
    const made: THREE.CanvasTexture[] = [];
    const load = (url: string) =>
      new Promise<THREE.CanvasTexture | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = 4;
          made.push(texture);
          resolve(texture);
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });

    const urlList = key.split("|");
    Promise.all(VIEWS.map((v, i) => (urlList[i] ? load(urlList[i]) : null))).then((loaded) => {
      if (cancelled) return;
      const next: Partial<Record<View, THREE.CanvasTexture>> = {};
      VIEWS.forEach((v, i) => { if (loaded[i]) next[v] = loaded[i]!; });
      setTextures(Object.keys(next).length ? next : null);
    });
    return () => {
      cancelled = true;
      made.forEach((t) => t.dispose());
    };
  }, [key, color]);

  return textures;
}

const OPPOSITE: Record<View, View> = { front: "back", back: "front", left: "right", right: "left" };

/**
 * Blends the four photos by which way the surface faces, so the chest shows the front
 * photo, the shoulder blades the back one and the sleeves the side ones, with soft
 * seams in between. A missing side borrows the opposite photo, seen through the
 * garment (which is how single-photo items always looked); if both are missing, that
 * axis is left out and the other one covers it.
 */
function viewMaterial(textures: Partial<Record<View, THREE.CanvasTexture>>) {
  const fallback = Object.values(textures)[0]!;
  const maps: THREE.Texture[] = [];
  const uvIndex: number[] = [];
  const enabled: number[] = [];
  VIEWS.forEach((view) => {
    const source = textures[view] ? view : textures[OPPOSITE[view]] ? OPPOSITE[view] : null;
    maps.push(source ? textures[source]! : fallback);
    uvIndex.push(source ? VIEWS.indexOf(source) : 0);
    enabled.push(source ? 1 : 0);
  });

  const material = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide });
  material.customProgramCacheKey = () => "garment-views";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
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
        varying vec3 vBodyNormal;`,
      )
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        vUvViews[0] = uv;
        vUvViews[1] = uvBack;
        vUvViews[2] = uvLeft;
        vUvViews[3] = uvRight;
        vBodyNormal = normal;`,
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
        varying vec2 vUvViews[4];
        varying vec3 vBodyNormal;
        vec2 viewCoord(float i) {
          return i < 0.5 ? vUvViews[0] : i < 1.5 ? vUvViews[1] : i < 2.5 ? vUvViews[2] : vUvViews[3];
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `vec3 bn = normalize(vBodyNormal);
        // +z is the front, +x the wearer's left.
        vec4 w = viewOn * exp(8.0 * vec4(bn.z, -bn.z, bn.x, -bn.x));
        w /= max(dot(w, vec4(1.0)), 1e-5);
        diffuseColor *=
          texture2D(mapFront, viewCoord(viewUv.x)) * w.x +
          texture2D(mapBack, viewCoord(viewUv.y)) * w.y +
          texture2D(mapLeft, viewCoord(viewUv.z)) * w.z +
          texture2D(mapRight, viewCoord(viewUv.w)) * w.w;`,
      );
  };
  return material;
}

export function Garment({ item }: { item: ItemWithUrl }) {
  const template = TEMPLATES[item.category];
  const geometries = useMemo(() => projectViews(template.parts(), template.box), [template]);
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);

  const textures = useViewTextures(item.viewUrls, item.color);
  const material = useMemo(
    () =>
      textures
        ? viewMaterial(textures)
        : new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.85, side: THREE.DoubleSide }),
    [textures, item.color],
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
