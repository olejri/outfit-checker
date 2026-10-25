"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { AvatarSettings, Worn } from "@/lib/types";
import { OutfitModel } from "./OutfitModel";

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
      <OutfitModel worn={worn} avatar={avatar} />
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
