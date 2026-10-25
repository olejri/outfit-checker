"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { AvatarSettings, Category, Worn } from "@/lib/types";
import { OutfitModel } from "./OutfitModel";

export type SnapshotJob = { key: string; worn: Worn; avatar: Required<AvatarSettings> };

// Preview pictures are 3:4 portraits of the whole body, seen a little from the side.
const WIDTH = 240;
const HEIGHT = 320;
// Photos that fail to load never report ready; take the picture anyway after this.
const TIMEOUT_MS = 6000;

/**
 * One hidden canvas that draws outfits one at a time and hands back a picture of each,
 * so a list of outfits needs a single WebGL context instead of one per outfit.
 */
export default function SnapshotScene({ job, onShot }: { job: SnapshotJob | null; onShot: (key: string, image: Blob | null) => void }) {
  return (
    <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, width: WIDTH, height: HEIGHT, pointerEvents: "none" }}>
      <Canvas
        shadows
        dpr={1.5}
        camera={{ fov: 34 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true; // hair tucks under hats
        }}
      >
        <color attach="background" args={["#f4f1ec"]} />
        {job && <Shot key={job.key} job={job} onShot={onShot} />}
      </Canvas>
    </div>
  );
}

function Shot({ job, onShot }: { job: SnapshotJob; onShot: (key: string, image: Blob | null) => void }) {
  const { gl, camera } = useThree();
  const waiting = useRef(new Set(Object.keys(job.worn) as Category[]));
  const [ready, setReady] = useState(() => Object.keys(job.worn).length === 0);
  const frames = useRef(0);
  const taken = useRef(false);

  useEffect(() => {
    camera.position.set(0.8, 1.0, 3.2);
    camera.lookAt(0, 0.91, 0);
    camera.updateProjectionMatrix();
    const timer = setTimeout(() => setReady(true), TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [camera]);

  const garmentReady = useCallback((c: Category) => {
    waiting.current.delete(c);
    if (waiting.current.size === 0) setReady(true);
  }, []);

  // Give the textures and contact shadow a few frames to land on screen first.
  useFrame(() => {
    if (!ready || taken.current || ++frames.current < 4) return;
    taken.current = true;
    requestAnimationFrame(() => gl.domElement.toBlob((b) => onShot(job.key, b), "image/webp", 0.85));
  });

  return <OutfitModel worn={job.worn} avatar={job.avatar} onGarmentReady={garmentReady} />;
}
