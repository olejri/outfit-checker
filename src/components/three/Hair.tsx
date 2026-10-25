"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { HairStyle } from "@/lib/types";
import { hairParts, strandTexture } from "./hairstyles";

// Under a hat only what shows below the crown is kept; the hat covers the rest.
const UNDER_HAT = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.705)];

export function Hair({ style, color, underHat }: { style: HairStyle; color: string; underHat: boolean }) {
  const parts = useMemo(() => hairParts(style), [style]);
  useEffect(() => () => parts.forEach((g) => g.dispose()), [parts]);

  const material = useMemo(() => {
    const strands = strandTexture();
    return new THREE.MeshStandardMaterial({
      color,
      map: strands,
      bumpMap: strands,
      bumpScale: 1.5,
      roughness: 0.55,
      side: THREE.DoubleSide,
      clippingPlanes: underHat ? UNDER_HAT : null,
    });
  }, [color, underHat]);
  useEffect(() => () => material.dispose(), [material]);

  return (
    <group>
      {parts.map((g, i) => (
        <mesh key={i} geometry={g} material={material} castShadow receiveShadow />
      ))}
    </group>
  );
}
