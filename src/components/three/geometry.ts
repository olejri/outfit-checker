import * as THREE from "three";

type Placement = { pos?: [number, number, number]; rotZ?: number; scale?: [number, number, number]; offsetY?: number };

/** Bakes a placement into the geometry so every part shares one "body" coordinate frame. */
export function place(g: THREE.BufferGeometry, { pos = [0, 0, 0], rotZ = 0, scale, offsetY = 0 }: Placement) {
  if (scale) g.scale(...scale);
  if (offsetY) g.translate(0, offsetY, 0);
  if (rotZ) g.rotateZ(rotZ);
  g.translate(...pos);
  return g;
}

/**
 * Projects the clothing photo straight on from the front (or the side), like a slide
 * projector. The back gets the mirror image, which reads fine for most garments.
 */
export function project(
  geometries: THREE.BufferGeometry[],
  box: { x: [number, number]; y: [number, number] },
  axis: "x" | "z" = "x",
) {
  for (const g of geometries) {
    const p = g.attributes.position;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const h = axis === "x" ? p.getX(i) : -p.getZ(i);
      uv[i * 2] = (h - box.x[0]) / (box.x[1] - box.x[0]);
      uv[i * 2 + 1] = (p.getY(i) - box.y[0]) / (box.y[1] - box.y[0]);
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }
  return geometries;
}

// Body measurements in metres; garments are built around the same numbers.
export const BODY = {
  shoulderX: 0.2,
  shoulderY: 1.42,
  armAngle: 0.12,
  armLength: 0.5,
  armRadius: 0.045,
  legX: 0.09,
  legRadius: 0.065,
  depth: 0.6, // torso is an ellipse, this much as deep as it is wide
};

const seg = 32;

/** A tube hanging from the shoulder along the arm, e.g. a sleeve. */
export function sleeve(side: 1 | -1, radius: number, length: number) {
  return place(new THREE.CylinderGeometry(radius, radius * 0.9, length, seg, 1, true), {
    offsetY: -length / 2,
    rotZ: side * BODY.armAngle,
    pos: [side * BODY.shoulderX, BODY.shoulderY, 0],
  });
}

export function shoulder(side: 1 | -1, radius: number) {
  return place(new THREE.SphereGeometry(radius, seg, 16), { pos: [side * BODY.shoulderX, BODY.shoulderY, 0] });
}

export function torsoShell(top: number, bottom: number, rTop: number, rBottom: number, closed = true) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, top - bottom, seg * 2, 4, !closed);
  return place(g, { scale: [1, 1, BODY.depth], pos: [0, (top + bottom) / 2, 0] });
}
