import * as THREE from "three";
import type { HairStyle } from "@/lib/types";
import { place } from "./geometry";

// The mannequin's head: an ellipsoid around this centre (see Mannequin.tsx).
const HEAD = { y: 1.66, rx: 0.105, ry: 0.121, rz: 0.11 };

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Hair is described per direction around the head. `a` is the azimuth: 0 faces
 * forward, +π/2 is the wearer's left (+x), ±π the back.
 */
type Shell = {
  /** Gap between scalp and the outside of the hair, in metres. */
  thickness: number;
  /** Height where the hair ends in direction `a`. Below the ear line it hangs straight down. */
  end: (a: number) => number;
  /** Extra volume in metres at azimuth `a` and point `s` (0 crown to 1 tips). */
  volume?: (a: number, s: number) => number;
  /** How far hanging hair spreads outwards per metre it falls. */
  flare?: number;
  /** Small bumps for curls, in metres. */
  curl?: number;
};

/** The usual hairline: forehead at the front, around the ears, nape at the back. */
const hairline = (front: number, side: number, back: number) => (a: number) => {
  const f = Math.abs(a) / Math.PI; // 0 front, 0.5 side, 1 back
  return f < 0.5 ? lerp(front, side, smooth(0, 0.5, f)) : lerp(side, back, smooth(0.5, 1, f));
};

/** Ends at `face` across the face (|a| < open) and at `rest` everywhere else. */
const framed = (face: number, open: number, rest: (a: number) => number) => (a: number) =>
  lerp(face, rest(a), smooth(open, open + 0.25, Math.abs(a)));

const AROUND = Array.from({ length: 12 }, (_, i) => -Math.PI + (i / 12) * Math.PI * 2);

/**
 * A hair "helmet": follows the head from the crown down to the ear line, then falls
 * straight down to wherever `end` says. UVs run around the head (u) and from crown
 * to tips (v), so the strand texture flows downwards.
 */
function shell({ thickness, end, volume, flare = 0, curl = 0 }: Shell, columns = 96, rows = 48) {
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let i = 0; i <= columns; i++) {
    // Start and finish at the back so the seam is out of sight.
    const a = -Math.PI + (i / columns) * Math.PI * 2;
    const rx = HEAD.rx + thickness;
    const ry = HEAD.ry + thickness;
    const rz = HEAD.rz + thickness;
    const endY = end(a);
    const tEnd = endY >= HEAD.y ? Math.acos(Math.min(1, (endY - HEAD.y) / ry)) : Math.PI / 2;
    const drop = Math.max(0, HEAD.y - endY);
    const domeLength = tEnd * (rx + ry) * 0.5;
    const total = domeLength + drop;
    for (let j = 0; j <= rows; j++) {
      const s = j / rows;
      const along = s * total;
      let ring: number; // how far out from the head's axis, 1 = head size
      let y: number;
      if (along <= domeLength) {
        const t = (along / domeLength) * tEnd;
        ring = Math.sin(t);
        y = HEAD.y + ry * Math.cos(t);
      } else {
        const d = along - domeLength;
        ring = 1 + (flare * d) / rx;
        y = HEAD.y - d;
      }
      // Near the crown every direction meets in one point, so blend towards the average there.
      const crown = volume ? AROUND.reduce((sum, b) => sum + volume(b, s), 0) / AROUND.length : 0;
      const w = smooth(0, 0.3, s);
      const extra =
        (volume ? lerp(crown, volume(a, s), w) : 0) + (curl ? w * curl * Math.sin(a * 23) * Math.sin(s * 37 + a * 5) : 0);
      // Volume pushes out along the surface, fading to nothing at the tips so edges stay neat.
      const grow = extra * (1 - s * s * 0.6);
      const up = along <= domeLength ? Math.cos((along / domeLength) * tEnd) : 0;
      positions.push(
        Math.sin(a) * (rx * ring + grow * ring),
        y + grow * up,
        Math.cos(a) * (rz * ring + grow * ring),
      );
      uvs.push(i / columns, 1 - s);
    }
  }
  const index: number[] = [];
  const stride = rows + 1;
  for (let i = 0; i < columns; i++) {
    for (let j = 0; j < rows; j++) {
      const p = i * stride + j;
      index.push(p, p + 1, p + stride, p + 1, p + stride + 1, p + stride);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** A point on the back of the scalp, `up` above the head's centre. */
const back = (up: number, out = 0.012) => -(HEAD.rz + out) * Math.sqrt(Math.max(0, 1 - (up / HEAD.ry) ** 2));

/** A tapering tube along `points`, e.g. a ponytail or braid. */
function tail(points: THREE.Vector3[], radius: number, taper = 0.35) {
  const curve = new THREE.CatmullRomCurve3(points);
  const tubular = 40;
  const radial = 16;
  const g = new THREE.TubeGeometry(curve, tubular, radius, radial, false);
  const p = g.attributes.position;
  const centre = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, centre);
    const k = lerp(1, taper, t) * (0.75 + 0.25 * Math.sin(Math.PI * Math.min(1, t * 3)));
    for (let j = 0; j <= radial; j++) {
      const n = i * (radial + 1) + j;
      v.fromBufferAttribute(p, n).sub(centre).multiplyScalar(k).add(centre);
      p.setXYZ(n, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  // Run the texture's streaks along the tail rather than around it.
  const uv = g.attributes.uv;
  for (let n = 0; n < uv.count; n++) uv.setXY(n, uv.getY(n), uv.getX(n));
  return g;
}

/** A braid: a row of overlapping, alternately tilted lumps. */
function braid(points: THREE.Vector3[], radius: number) {
  const curve = new THREE.CatmullRomCurve3(points);
  const count = Math.round(curve.getLength() / (radius * 1.3));
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const r = radius * lerp(1, 0.6, t);
    const g = new THREE.SphereGeometry(r, 16, 12);
    g.scale(1, 1.5, 0.85);
    g.rotateZ(i % 2 ? 0.45 : -0.45);
    const at = curve.getPointAt(t);
    g.translate(at.x, at.y, at.z);
    return g;
  });
}

const ball = (r: number, pos: [number, number, number], scale: [number, number, number] = [1, 1, 1]) =>
  place(new THREE.SphereGeometry(r, 32, 20), { pos, scale });

const short = hairline(1.735, 1.645, 1.575);
const fringe = (a: number) => Math.exp(-(a * a) / 0.5);

/** Builds the meshes for one hairstyle, all in the mannequin's coordinates. */
export function hairParts(style: HairStyle): THREE.BufferGeometry[] {
  switch (style) {
    case "none":
      return [];
    case "buzz":
      return [shell({ thickness: 0.004, end: hairline(1.74, 1.65, 1.58) })];
    case "crew":
      return [shell({ thickness: 0.012, end: short, volume: (a, s) => 0.012 * (1 - s) * (1 + fringe(a)) })];
    case "sidepart":
      return [
        shell({
          thickness: 0.013,
          // The fringe sweeps from the parting on the wearer's left over to the right.
          end: (a) => short(a) - (a < 0.2 && a > -1.3 ? 0.04 * Math.sin((0.2 - a) * 2.1) : 0),
          volume: (a, s) => 0.026 * (1 - s) * smooth(1, -0.6, a) + 0.006,
        }),
      ];
    case "quiff":
      return [
        shell({
          thickness: 0.01,
          end: hairline(1.745, 1.65, 1.575),
          volume: (a, s) => 0.065 * fringe(a * 1.3) * Math.exp(-(((s - 0.68) / 0.28) ** 2)) + 0.006,
        }),
      ];
    case "curls":
      return [shell({ thickness: 0.016, end: hairline(1.73, 1.64, 1.57), volume: (_, s) => 0.018 * (1 - s), curl: 0.006 })];
    case "mohawk": {
      const sides = shell({ thickness: 0.003, end: hairline(1.74, 1.65, 1.58) });
      const crest = Array.from({ length: 9 }, (_, i) => {
        const t = lerp(-1.15, 0.8, i / 8); // back of the head to the front
        const n = new THREE.Vector3(0, Math.cos(t), Math.sin(t));
        const pos = new THREE.Vector3(0, HEAD.y + n.y * HEAD.ry, n.z * HEAD.rz);
        const g = new THREE.SphereGeometry(0.05, 20, 14);
        g.scale(0.32, 1.1, 0.7);
        g.rotateX(t);
        g.translate(pos.x, pos.y + n.y * 0.03, pos.z + n.z * 0.03);
        return g;
      });
      return [sides, ...crest];
    }
    case "pixie":
      return [
        shell({
          thickness: 0.012,
          end: (a) => hairline(1.705, 1.64, 1.58)(a) - 0.01 * fringe(a + 0.4),
          volume: (a, s) => 0.016 * (1 - s) + 0.008 * fringe(a),
        }),
      ];
    case "bob":
      return [shell({ thickness: 0.016, end: framed(1.71, 0.65, () => 1.56), volume: (_, s) => 0.012 * (1 - s), flare: 0.25 }, 128, 56)];
    case "lob":
      return [shell({ thickness: 0.015, end: framed(1.735, 0.7, hairline(1.5, 1.5, 1.47)), volume: (_, s) => 0.01 * (1 - s), flare: 0.2 }, 128, 64)];
    case "long":
      return [
        shell(
          {
            thickness: 0.014,
            // Over the shoulders at the sides, down the back behind.
            end: framed(1.75, 0.7, hairline(1.47, 1.47, 1.2)),
            volume: (_, s) => 0.008 * (1 - s),
            flare: 0.18,
          },
          128,
          72,
        ),
      ];
    case "afro":
      return [shell({ thickness: 0.02, end: hairline(1.725, 1.63, 1.57), volume: (a, s) => 0.085 * Math.sin(Math.PI * Math.min(1, 0.25 + s)), curl: 0.006 }, 128, 56)];
    case "ponytail":
      return [
        shell({ thickness: 0.008, end: hairline(1.745, 1.65, 1.58) }),
        tail(
          [
            new THREE.Vector3(0, 1.69, back(0.03, 0.03)),
            new THREE.Vector3(0, 1.67, -0.175),
            new THREE.Vector3(0, 1.58, -0.19),
            new THREE.Vector3(0, 1.48, -0.17),
          ],
          0.04,
          0.5,
        ),
        place(new THREE.TorusGeometry(0.02, 0.006, 8, 24), { pos: [0, 1.69, back(0.03, 0.03) - 0.008] }),
      ];
    case "bun":
      return [shell({ thickness: 0.008, end: hairline(1.745, 1.65, 1.58) }), ball(0.05, [0, 1.71, -0.13], [1, 0.9, 0.9])];
    case "topknot":
      return [shell({ thickness: 0.008, end: hairline(1.745, 1.65, 1.58) }), ball(0.052, [0, 1.815, -0.02], [1, 0.85, 1])];
    case "spacebuns":
      return [
        shell({ thickness: 0.008, end: hairline(1.745, 1.65, 1.58) }),
        ball(0.04, [0.075, 1.78, -0.02]),
        ball(0.04, [-0.075, 1.78, -0.02]),
      ];
    case "braids":
      return [
        shell({ thickness: 0.008, end: hairline(1.745, 1.65, 1.58) }),
        ...([1, -1] as const).flatMap((s) =>
          braid(
            [
              new THREE.Vector3(s * 0.08, 1.63, -0.08),
              new THREE.Vector3(s * 0.1, 1.55, -0.13),
              new THREE.Vector3(s * 0.1, 1.4, -0.16),
              new THREE.Vector3(s * 0.09, 1.26, -0.155),
            ],
            0.022,
          ),
        ),
      ];
  }
}

/** Fine streaks that follow the strands; used as both colour variation and bump. */
let strands: THREE.CanvasTexture | null = null;
export function strandTexture() {
  if (strands) return strands;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#e6e6e6";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 1400; i++) {
    const shade = 170 + Math.floor(Math.random() * 85);
    ctx.strokeStyle = `rgba(${shade},${shade},${shade},0.5)`;
    ctx.lineWidth = 0.6 + Math.random();
    const x = Math.random() * canvas.width;
    ctx.beginPath();
    ctx.moveTo(x, -2);
    ctx.lineTo(x + (Math.random() - 0.5) * 6, canvas.height + 2);
    ctx.stroke();
  }
  strands = new THREE.CanvasTexture(canvas);
  strands.wrapS = strands.wrapT = THREE.RepeatWrapping;
  strands.colorSpace = THREE.SRGBColorSpace;
  return strands;
}
