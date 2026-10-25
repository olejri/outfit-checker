"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { DEFAULT_AVATAR, shapeWithDefaults, type ItemWithUrl, type View } from "@/lib/types";
import { Garment, buildGarment } from "./Garment";
import { Mannequin } from "./Mannequin";

const FOV = 38;
/** Share of the view the garment fills when facing one side. */
const FILL = 0.7;

/** Where the camera looks from for each side; left and right are the wearer's. */
const DIRECTION: Record<View, [number, number, number]> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [1, 0, 0],
  right: [-1, 0, 0],
};

type Frame = { centre: THREE.Vector3; height: number; across: number };

const viewHeight = (distance: number) => 2 * distance * Math.tan(((FOV / 2) * Math.PI) / 180);

/** Camera distance at which the garment fills the view. */
function fitDistance(frame: Frame, aspect: number) {
  const needed = Math.max(frame.height, frame.across / aspect) / FILL;
  return Math.max(0.6, needed / viewHeight(1));
}

type Props = {
  item: ItemWithUrl;
  side: View;
  /** "place": dragging moves and pinching scales the photo. "orbit": dragging turns the model. */
  mode: "place" | "orbit";
  /** Called while placing, with the change in offset (photo widths/heights) and a scale factor. */
  onPlace: (dx: number, dy: number, scale: number) => void;
};

/** A mannequin wearing one item, facing the side being fitted. */
export default function FitScene({ item, side, mode, onPlace }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const shape = shapeWithDefaults(item.category, item.fit);
  const shapeKey = JSON.stringify(shape);

  // Camera framing and the photo's size on screen, from the garment's current shape.
  const frame = useMemo(() => {
    const { box } = buildGarment(item.category, JSON.parse(shapeKey), false);
    // Turning the model frames the garment at its largest, so it stays in view while the shape changes.
    const largest = { ...JSON.parse(shapeKey), ...(mode === "orbit" ? { length: 1, looseness: 1, sleeve: 1 } : {}) };
    const { bounds } = buildGarment(item.category, largest, false);
    const centre = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const across = side === "front" || side === "back" ? size.x : size.z;
    const photoWidth = side === "front" || side === "back" ? box.x[1] - box.x[0] : box.z[1] - box.z[0];
    return { centre, height: size.y, across, photoWidth, photoHeight: box.y[1] - box.y[0] };
  }, [item.category, shapeKey, side, mode]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());

  function pointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  function pointerMove(e: React.PointerEvent) {
    const all = pointers.current;
    const prev = all.get(e.pointerId);
    if (!prev || !container.current) return;
    const before = [...all.values()];
    all.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const after = [...all.values()];
    const { clientWidth: w, clientHeight: h } = container.current;
    const metresPerPx = viewHeight(fitDistance(frame, w / h)) / h;
    // Move by the average finger movement; with two fingers, also scale by their spread.
    const mid = (ps: { x: number; y: number }[]) => ({
      x: ps.reduce((a, p) => a + p.x, 0) / ps.length,
      y: ps.reduce((a, p) => a + p.y, 0) / ps.length,
    });
    const a = mid(before);
    const b = mid(after);
    let scale = 1;
    if (after.length >= 2) {
      const spread = (ps: { x: number; y: number }[]) => Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      const s0 = spread(before);
      if (s0 > 10) scale = spread(after) / s0;
    }
    onPlace(
      ((b.x - a.x) * metresPerPx) / frame.photoWidth,
      (-(b.y - a.y) * metresPerPx) / frame.photoHeight,
      scale,
    );
  }

  function pointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
  }

  function wheel(e: React.WheelEvent) {
    onPlace(0, 0, e.deltaY < 0 ? 1.03 : 1 / 1.03);
  }

  return (
    <div ref={container} className="relative h-full w-full">
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 1.05, 3.2], fov: FOV }}>
        <color attach="background" args={["#f4f1ec"]} />
        <hemisphereLight args={["#ffffff", "#d8cfc4", 1.1]} />
        <directionalLight position={[2, 4, 3]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-3, 2, -2]} intensity={0.5} />
        <directionalLight position={[0, 2, -3]} intensity={0.4} />
        <Mannequin skin={DEFAULT_AVATAR.skin} />
        <Garment item={item} />
        <Rig side={side} frame={frame} orbit={mode === "orbit"} />
      </Canvas>
      {mode === "place" && (
        <div
          className="absolute inset-0 touch-none cursor-move"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
          onWheel={wheel}
        />
      )}
    </div>
  );
}

/** Points the camera at the garment from the chosen side whenever the side or mode changes. */
function Rig({ side, frame, orbit }: { side: View; frame: Frame; orbit: boolean }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useRef<OrbitControlsImpl>(null);
  const distance = fitDistance(frame, size.width / Math.max(1, size.height));
  const { x, y, z } = frame.centre;
  // Placing re-frames as the shape changes; orbiting leaves the camera where the user put it.
  const reframe = orbit ? "" : `${x},${y},${z},${distance}`;
  const latest = useRef({ x, y, z, distance });

  useEffect(() => {
    latest.current = { x, y, z, distance };
  });

  useEffect(() => {
    const c = latest.current;
    const [dx, dy, dz] = DIRECTION[side];
    const target = new THREE.Vector3(c.x, c.y, c.z);
    camera.position.set(c.x + dx * c.distance, c.y + dy * c.distance, c.z + dz * c.distance);
    camera.lookAt(target);
    controls.current?.target.copy(target);
    controls.current?.update();
  }, [camera, side, orbit, reframe]);

  return <OrbitControls ref={controls} enabled={orbit} enablePan={false} minDistance={0.4} maxDistance={4.5} />;
}
