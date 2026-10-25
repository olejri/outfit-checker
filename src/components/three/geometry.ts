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

export type Range = [number, number];

/**
 * Where each photo is stretched across, in metres. `x`/`y` is the area seen from the
 * front (and back), `z` the depth seen from the sides; it defaults to the garment's own
 * depth. With `perPart`, front and back are measured from each part's centre, so a
 * pair of shoes each get the whole photo.
 */
export type ProjectionBox = { x: Range; y: Range; z?: Range; perPart?: boolean };

const at = (v: number, [a, b]: Range) => (v - a) / (b - a);

/**
 * Projects each side's photo straight on, like four slide projectors around the body.
 * Writes one UV set per side: `uv` (front), `uvBack`, `uvLeft` and `uvRight`. Left
 * and right are the wearer's: the left photo is taken from +x with the front of the
 * garment pointing at the left edge of the picture.
 */
export function projectViews(geometries: THREE.BufferGeometry[], box: ProjectionBox) {
  const bounds = new THREE.Box3();
  for (const g of geometries) {
    g.computeBoundingBox();
    bounds.union(g.boundingBox!);
  }
  const z: Range = box.z ?? [bounds.min.z - 0.005, bounds.max.z + 0.005];

  for (const g of geometries) {
    const centre = box.perPart ? (g.boundingBox!.min.x + g.boundingBox!.max.x) / 2 : 0;
    const p = g.attributes.position;
    const sets = { uv: new Float32Array(p.count * 2), uvBack: new Float32Array(p.count * 2), uvLeft: new Float32Array(p.count * 2), uvRight: new Float32Array(p.count * 2) };
    for (let i = 0; i < p.count; i++) {
      const u = at(p.getX(i) - centre, box.x);
      const w = at(p.getZ(i), z);
      const v = at(p.getY(i), box.y);
      sets.uv.set([u, v], i * 2);
      sets.uvBack.set([1 - u, v], i * 2);
      sets.uvLeft.set([1 - w, v], i * 2);
      sets.uvRight.set([w, v], i * 2);
    }
    for (const [name, data] of Object.entries(sets)) g.setAttribute(name, new THREE.BufferAttribute(data, 2));
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
