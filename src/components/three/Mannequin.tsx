"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { BODY, place, shoulder, torsoShell } from "./geometry";

export function Mannequin({ skin }: { skin: string }) {
  const parts = useMemo(() => {
    const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 8, 24);
    return [
      // head and neck
      place(new THREE.SphereGeometry(0.105, 32, 24), { scale: [1, 1.15, 1.05], pos: [0, 1.66, 0] }),
      place(new THREE.CylinderGeometry(0.048, 0.055, 0.12, 24), { pos: [0, 1.5, 0] }),
      // torso and hips
      torsoShell(1.46, 1.02, 0.19, 0.15),
      torsoShell(1.02, 0.88, 0.155, 0.16),
      // arms and hands
      shoulder(1, 0.058),
      shoulder(-1, 0.058),
      ...([1, -1] as const).flatMap((s) => [
        place(capsule(BODY.armRadius, BODY.armLength), {
          offsetY: -BODY.armLength / 2 - 0.02,
          rotZ: s * BODY.armAngle,
          pos: [s * BODY.shoulderX, BODY.shoulderY, 0],
        }),
        place(new THREE.SphereGeometry(0.05, 16, 12), {
          scale: [0.8, 1.3, 0.5],
          offsetY: -BODY.armLength - 0.13,
          rotZ: s * BODY.armAngle,
          pos: [s * BODY.shoulderX, BODY.shoulderY, 0],
        }),
      ]),
      // legs and feet
      ...([1, -1] as const).flatMap((s) => [
        place(capsule(BODY.legRadius, 0.76), { pos: [s * BODY.legX, 0.5, 0] }),
        place(new THREE.BoxGeometry(0.09, 0.06, 0.22), { pos: [s * BODY.legX, 0.04, 0.05] }),
      ]),
    ];
  }, []);

  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: skin, roughness: 0.65 }), [skin]);

  return (
    <group>
      {parts.map((g, i) => (
        <mesh key={i} geometry={g} material={material} castShadow receiveShadow />
      ))}
    </group>
  );
}
