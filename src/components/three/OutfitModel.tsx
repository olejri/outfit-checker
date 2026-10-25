"use client";

import { ContactShadows } from "@react-three/drei";
import { CATEGORIES, type AvatarSettings, type Category, type Worn } from "@/lib/types";
import { Garment } from "./Garment";
import { Hair } from "./Hair";
import { Mannequin } from "./Mannequin";

// Layering order matters only for readability; meshes are sized not to overlap.
const ORDER = CATEGORIES.map((c) => c.id);

/** The lit, dressed mannequin, shared by the studio and the outfit preview pictures. */
export function OutfitModel({
  worn,
  avatar,
  onGarmentReady,
}: {
  worn: Worn;
  avatar: Required<AvatarSettings>;
  onGarmentReady?: (category: Category) => void;
}) {
  return (
    <>
      <hemisphereLight args={["#ffffff", "#d8cfc4", 1.1]} />
      <directionalLight position={[2, 4, 3]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-3, 2, -2]} intensity={0.5} />
      <Mannequin skin={avatar.skin} />
      <Hair style={avatar.hair} beard={avatar.beard} color={avatar.hairColor} skin={avatar.skin} underHat={!!worn.hats} />
      {ORDER.map((c) => {
        const item = worn[c];
        return item ? <Garment key={item.id} item={item} onReady={onGarmentReady && (() => onGarmentReady(c))} /> : null;
      })}
      <ContactShadows position={[0, 0, 0]} opacity={0.45} scale={3} blur={2.4} far={2} />
    </>
  );
}
