"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { BeardStyle, HairStyle } from "@/lib/types";
import { beardParts, hairParts, strandTexture } from "./hairstyles";

// Under a hat only what shows below the crown is kept; the hat covers the rest.
const UNDER_HAT = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.705)];

export function Hair({
  style,
  beard = "none",
  color,
  skin,
  underHat,
}: {
  style: HairStyle;
  beard?: BeardStyle;
  color: string;
  skin: string;
  underHat: boolean;
}) {
  const parts = useMemo(() => [...hairParts(style), ...beardParts(beard)], [style, beard]);
  useEffect(() => () => parts.forEach((g) => g.dispose()), [parts]);

  const material = useMemo(() => {
    const strands = strandTexture();
    const m = new THREE.MeshStandardMaterial({
      color,
      map: strands,
      bumpMap: strands,
      bumpScale: 1.5,
      roughness: 0.55,
      side: THREE.DoubleSide,
      clippingPlanes: underHat ? UNDER_HAT : null,
    });
    // Short and clippered hair lets the scalp show through: each vertex says how much.
    const skinColor = new THREE.Color(skin);
    m.onBeforeCompile = (shader) => {
      shader.uniforms.skinColor = { value: skinColor };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float bare;\nvarying float vBare;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBare = bare;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 skinColor;\nvarying float vBare;")
        .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, skinColor, vBare);");
    };
    m.customProgramCacheKey = () => "hair-bare";
    return m;
  }, [color, skin, underHat]);
  useEffect(() => () => material.dispose(), [material]);

  return (
    <group>
      {parts.map((g, i) => (
        <mesh key={i} geometry={g} material={material} castShadow receiveShadow />
      ))}
    </group>
  );
}
