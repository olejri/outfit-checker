"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { CATEGORIES, type AvatarSettings, type Worn } from "@/lib/types";
import { Garment } from "./Garment";
import { Hair } from "./Hair";
import { Mannequin } from "./Mannequin";

// Layering order matters only for readability; meshes are sized not to overlap.
const ORDER = CATEGORIES.map((c) => c.id);

export default function AvatarScene({ worn, avatar }: { worn: Worn; avatar: Required<AvatarSettings> }) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 1.05, 3.2], fov: 38 }}
      gl={{ preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true; // hair tucks under hats
      }}
    >
      <color attach="background" args={["#f4f1ec"]} />
      <hemisphereLight args={["#ffffff", "#d8cfc4", 1.1]} />
      <directionalLight
        position={[2, 4, 3]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-3, 2, -2]} intensity={0.5} />
      <Mannequin skin={avatar.skin} />
      <Hair style={avatar.hair} color={avatar.hairColor} underHat={!!worn.hats} />
      {ORDER.map((c) => {
        const item = worn[c];
        return item ? <Garment key={item.id} item={item} /> : null;
      })}
      <ContactShadows position={[0, 0, 0]} opacity={0.45} scale={3} blur={2.4} far={2} />
      <OrbitControls
        target={[0, 0.95, 0]}
        enablePan={false}
        minDistance={1.2}
        maxDistance={4.5}
        minPolarAngle={0.3}
        maxPolarAngle={Math.PI / 2}
      />
    </Canvas>
  );
}
