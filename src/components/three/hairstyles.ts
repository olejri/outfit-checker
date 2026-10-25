import * as THREE from "three";
import type { BeardStyle, HairStyle } from "@/lib/types";
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
  /** Extra volume in metres at azimuth `a`, point `s` (0 crown to 1 tips) and height `y`. */
  volume?: (a: number, s: number, y: number) => number;
  /** How far hanging hair spreads outwards per metre it falls. */
  flare?: number;
  /** Small bumps for curls, in metres. */
  curl?: number;
  /** How much skin shows through everywhere, 0 to 1 (a buzz cut is mostly scalp). */
  bare?: number;
  /**
   * Clippered sides: below `y` the hair thins to `to` metres and lets `bare` skin
   * through. A small `soft` gives the hard line of an undercut, a large one a fade.
   */
  fade?: { y: number; soft?: number; to?: number; bare?: number };
  /** A parting `part` metres to the wearer's left of the middle (0 for a middle part). */
  part?: number;
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

/** Stores how much skin shows through each vertex; Hair.tsx mixes the skin colour in. */
function setBare(g: THREE.BufferGeometry, bare: number[] | number) {
  const n = g.attributes.position.count;
  const values = typeof bare === "number" ? new Array(n).fill(bare) : bare;
  g.setAttribute("bare", new THREE.Float32BufferAttribute(values, 1));
  return g;
}

/**
 * A hair "helmet": follows the head from the crown down to the ear line, then falls
 * straight down to wherever `end` says. UVs run around the head (u) and from crown
 * to tips (v), so the strand texture flows downwards.
 */
function shell({ thickness, end, volume, flare = 0, curl = 0, bare = 0, fade, part }: Shell, columns = 96, rows = 48) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const bares: number[] = [];
  const fadeSoft = fade?.soft ?? 0.03;
  const fadeTo = fade?.to ?? 0.0015;
  const fadeBare = fade?.bare ?? 0.7;
  for (let i = 0; i <= columns; i++) {
    // Start and finish at the back so the seam is out of sight.
    const a = -Math.PI + (i / columns) * Math.PI * 2;
    const endY = end(a);
    const tEnd = endY >= HEAD.y ? Math.acos(Math.min(1, (endY - HEAD.y) / (HEAD.ry + thickness))) : Math.PI / 2;
    const drop = Math.max(0, HEAD.y - endY);
    const domeLength = tEnd * (HEAD.rx + HEAD.ry + 2 * thickness) * 0.5;
    const total = domeLength + drop;
    for (let j = 0; j <= rows; j++) {
      const s = j / rows;
      const along = s * total;
      const onDome = along <= domeLength;
      const t = onDome ? (along / domeLength) * tEnd : Math.PI / 2;
      const d = onDome ? 0 : along - domeLength;
      const ring = onDome ? Math.sin(t) : 1 + (flare * d) / (HEAD.rx + thickness); // 1 = head size
      const baseY = onDome ? HEAD.y + (HEAD.ry + thickness) * Math.cos(t) : HEAD.y - d;

      // Clippered sides are thinner and show the scalp.
      const full = fade ? smooth(fade.y - fadeSoft, fade.y + fadeSoft * 0.25, baseY) : 1;
      const thick = lerp(fadeTo, thickness, full);
      const rx = HEAD.rx + thick;
      const rz = HEAD.rz + thick;
      const y = onDome ? HEAD.y + (HEAD.ry + thick) * Math.cos(t) : baseY;

      // Near the crown every direction meets in one point, so blend towards the average there.
      const crown = volume ? AROUND.reduce((sum, b) => sum + volume(b, s, y), 0) / AROUND.length : 0;
      const w = smooth(0, 0.3, s);
      let extra =
        (volume ? lerp(crown, volume(a, s, y), w) : 0) + (curl ? w * curl * Math.sin(a * 23) * Math.sin(s * 37 + a * 5) : 0);
      let skin = Math.max(bare, (1 - full) * fadeBare);
      if (part !== undefined) {
        // A narrow groove from the forehead back towards the crown.
        const x = Math.sin(a) * rx * ring;
        const z = Math.cos(a) * rz * ring;
        const groove = Math.exp(-(((x - part) / 0.005) ** 2)) * smooth(-0.07, 0.0, z) * smooth(1.71, 1.74, y);
        extra = lerp(extra, -thick * 0.6, groove);
        skin = Math.max(skin, groove * 0.55);
      }
      // A hairline on the scalp looks softer if the skin shows through its last few millimetres.
      if (!drop) skin = Math.max(skin, smooth(0.9, 1, s) * 0.45);
      // Volume pushes out along the surface, fading to nothing at the tips so edges stay neat.
      const grow = extra * (1 - s * s * 0.6) * full;
      const up = onDome ? Math.cos(t) : 0;
      positions.push(Math.sin(a) * (rx * ring + grow * ring), y + grow * up, Math.cos(a) * (rz * ring + grow * ring));
      uvs.push(i / columns, 1 - s);
      bares.push(skin);
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
  setBare(g, bares);
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
/** Clippered back and sides that blend into a longer top. */
const taper = { y: 1.675, soft: 0.035, to: 0.004, bare: 0.35 };
const skinFade = { y: 1.705, soft: 0.04, to: 0.0008, bare: 0.85 };

/** A cheap repeatable "random" number in 0..1 for the n-th thing. */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** A point just off the scalp in direction `a`, `t` down from the crown. */
const onHead = (a: number, t: number, out: number) =>
  new THREE.Vector3(
    Math.sin(a) * Math.sin(t) * (HEAD.rx + out),
    HEAD.y + Math.cos(t) * (HEAD.ry + out),
    Math.cos(a) * Math.sin(t) * (HEAD.rz + out),
  );

/** Shoulder-length locs, swept back from the face so they don't hang over it. */
function locs() {
  const parts: THREE.BufferGeometry[] = [];
  let n = 0;
  for (const [t, count] of [
    [0.3, 7],
    [0.7, 12],
    [1.05, 15],
    [1.4, 15],
  ] as const) {
    for (let k = 0; k < count; k++, n++) {
      const a = -Math.PI + ((k + (t > 1 ? 0.5 : 0)) / count) * Math.PI * 2;
      // Lower down, roots in front would have to cross the face.
      if (t > 0.5 && Math.abs(a) < 1.1) continue;
      // Locs from the front fall to the sides; the face stays clear.
      const fall = Math.sign(a || 1) * Math.max(Math.abs(a), 1.35 + 0.15 * hash(n));
      const r = 0.035 + 0.01 * hash(n + 50);
      const ring = (az: number, y: number, out: number) => {
        const at = onHead(az, Math.PI / 2, out);
        return new THREE.Vector3(at.x, y, at.z);
      };
      const length = 1.47 + 0.05 * hash(n + 100) + (Math.abs(fall) < 2 ? 0.03 : -0.02);
      parts.push(
        tail(
          [
            onHead(a, t, 0.006),
            onHead(lerp(a, fall, 0.5), t + 0.25, 0.025),
            onHead(fall, 1.3, r),
            ring(fall, 1.56, r + 0.01),
            ring(fall, length, r + 0.02),
          ],
          0.0095,
          0.8,
        ),
      );
    }
  }
  return parts;
}

/** Builds the meshes for one hairstyle, all in the mannequin's coordinates. */
export function hairParts(style: HairStyle): THREE.BufferGeometry[] {
  return buildHair(style).map((g) => (g.attributes.bare ? g : setBare(g, 0)));
}

function buildHair(style: HairStyle): THREE.BufferGeometry[] {
  switch (style) {
    case "none":
      return [];
    case "buzz":
      return [shell({ thickness: 0.0035, end: hairline(1.74, 1.65, 1.58), bare: 0.3, fade: { ...taper, to: 0.0015, bare: 0.55 } })];
    case "waves":
      return [
        shell(
          { thickness: 0.006, end: hairline(1.742, 1.65, 1.58), bare: 0.12, curl: 0.0022, fade: { ...taper, to: 0.002, bare: 0.4 } },
          160,
          64,
        ),
      ];
    case "crew":
      return [shell({ thickness: 0.012, end: short, volume: (a, s) => 0.012 * (1 - s) * (1 + fringe(a)), fade: taper })];
    case "fade":
      return [
        shell({
          thickness: 0.013,
          end: hairline(1.74, 1.65, 1.58),
          volume: (a, s) => 0.022 * (1 - s) * (1 + 0.5 * fringe(a)),
          curl: 0.0015,
          fade: skinFade,
        }),
      ];
    case "crop":
      return [
        shell(
          {
            thickness: 0.013,
            // A short, straight fringe pushed forward onto the forehead.
            end: (a) => hairline(1.742, 1.65, 1.58)(a) - 0.026 * Math.exp(-(a * a) / 0.35),
            volume: (a, s) => 0.016 * (1 - s) + 0.006 * fringe(a),
            curl: 0.0015,
            fade: { ...skinFade, y: 1.695 },
          },
          128,
          48,
        ),
      ];
    case "flattop":
      return [
        shell({
          thickness: 0.01,
          end: hairline(1.745, 1.65, 1.58),
          // Grow straight up to one flat level, but only where the head faces upwards.
          volume: (_, s, y) => {
            const up = Math.max(0.3, (y - HEAD.y) / HEAD.ry);
            return (Math.min(0.05, Math.max(0, (1.825 - y) / up)) * smooth(0.45, 0.8, up)) / (1 - s * s * 0.6);
          },
          fade: { ...skinFade, y: 1.7 },
        }),
      ];
    case "sidepart":
      return [
        shell({
          thickness: 0.013,
          // The fringe sweeps from the parting on the wearer's left over to the right.
          end: (a) => short(a) - (a < 0.2 && a > -1.3 ? 0.04 * Math.sin((0.2 - a) * 2.1) : 0),
          volume: (a, s) => 0.026 * (1 - s) * smooth(1, -0.6, a) + 0.006,
          fade: taper,
          part: 0.05,
        }),
      ];
    case "quiff":
      return [
        shell({
          thickness: 0.01,
          end: hairline(1.745, 1.65, 1.575),
          volume: (a, s) => 0.065 * fringe(a * 1.3) * Math.exp(-(((s - 0.68) / 0.28) ** 2)) + 0.006,
          fade: taper,
        }),
      ];
    case "slickback":
      return [
        shell({
          thickness: 0.011,
          end: hairline(1.75, 1.65, 1.565),
          // Combed straight back: lift at the front, flat over the crown.
          volume: (a, s) => 0.024 * fringe(a) * Math.exp(-(((s - 0.75) / 0.3) ** 2)) + 0.008 * (1 - s),
          fade: { ...taper, y: 1.665 },
        }),
      ];
    case "undercut":
      return [
        shell({
          thickness: 0.012,
          end: hairline(1.745, 1.65, 1.58),
          // A long top swept back, cut off in a hard line above clippered sides.
          volume: (a, s) => 0.03 * (1 - s) + 0.035 * fringe(a) * Math.exp(-(((s - 0.6) / 0.3) ** 2)),
          fade: { y: 1.722, soft: 0.006, to: 0.0012, bare: 0.75 },
        }),
      ];
    case "curls":
      return [
        shell({
          thickness: 0.016,
          end: hairline(1.73, 1.64, 1.57),
          volume: (_, s) => 0.018 * (1 - s),
          curl: 0.006,
          fade: { ...taper, to: 0.007, bare: 0.15 },
        }),
      ];
    case "mohawk": {
      const sides = shell({ thickness: 0.003, end: hairline(1.74, 1.65, 1.58), bare: 0.6 });
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
    case "curtains":
      return [
        shell(
          {
            thickness: 0.013,
            // Parted in the middle, falling either side of the forehead to the cheekbones.
            end: (a) => framed(1.705, 0.6, hairline(1.62, 1.6, 1.555))(a) + 0.03 * Math.exp(-((a / 0.25) ** 2)),
            volume: (_, s) => 0.014 * (1 - s) + 0.005,
            flare: 0.12,
            part: 0,
          },
          128,
          56,
        ),
      ];
    case "surfer":
      return [
        shell(
          {
            thickness: 0.014,
            // Layered, slightly uneven ends around the jaw and the nape.
            end: (a) => framed(1.715, 0.6, hairline(1.57, 1.56, 1.51))(a) + 0.01 * Math.sin(a * 11) * smooth(0.6, 1, Math.abs(a)),
            volume: (a, s) => 0.018 * (1 - s) + 0.006 * fringe(a),
            curl: 0.0012,
            flare: 0.22,
          },
          128,
          64,
        ),
      ];
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
    case "dreads":
      return [shell({ thickness: 0.01, end: hairline(1.745, 1.65, 1.58), curl: 0.003 }), ...locs()];
    case "afro":
      return [shell({ thickness: 0.02, end: hairline(1.725, 1.63, 1.57), volume: (a, s) => 0.085 * Math.sin(Math.PI * Math.min(1, 0.25 + s)), curl: 0.006 }, 128, 56)];
    case "manbun":
      return [
        shell({
          thickness: 0.009,
          end: hairline(1.75, 1.65, 1.58),
          volume: (a, s) => 0.008 * (1 - s) + 0.008 * fringe(a) * (1 - s),
          fade: { ...taper, y: 1.665, to: 0.005, bare: 0.2 },
        }),
        ball(0.04, [0, 1.765, -0.105], [1, 0.85, 0.9]),
        place(new THREE.TorusGeometry(0.022, 0.006, 8, 24), { pos: [0, 1.75, -0.085] }),
      ];
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

type Beard = {
  /** 0..1: where the beard grows, given the direction `a` and the height `y` on the face. */
  mask: (a: number, y: number) => number;
  /** How thick it is there, in metres. */
  thickness: (a: number, y: number) => number;
  /** How far it hangs below the chin, in metres. */
  length?: number;
  bare?: number;
};

const MOUTH = 1.583;
/** Upper edge of a beard: high at the sideburns, down along the cheeks to the mouth corners. */
const cheekLine = (a: number) => lerp(1.598, 1.678, smooth(0.35, 1.45, Math.abs(a)));
const band = (lo: number, hi: number, v: number, soft = 0.006) => smooth(lo - soft, lo + soft, v) * (1 - smooth(hi - soft, hi + soft, v));
/** The gap between the lips, so a full beard doesn't look like a mask. */
const lips = (a: number, y: number) => 1 - 0.9 * band(MOUTH - 0.004, MOUTH + 0.002, y, 0.003) * (1 - smooth(0.22, 0.36, Math.abs(a)));
const moustache = (a: number, y: number) =>
  band(lerp(MOUTH + 0.004, MOUTH - 0.01, smooth(0.15, 0.45, Math.abs(a))), MOUTH + 0.018 - 0.008 * smooth(0, 0.4, Math.abs(a)), y) *
  (1 - smooth(0.38, 0.52, Math.abs(a)));
const chin = (a: number, y: number) => (1 - smooth(MOUTH - 0.016, MOUTH - 0.004, y)) * (1 - smooth(0.3, 0.48, Math.abs(a)));
const jaw = (a: number, y: number) => (1 - smooth(cheekLine(a) - 0.01, cheekLine(a) + 0.004, y)) * (1 - smooth(1.45, 1.62, Math.abs(a)));

/**
 * Facial hair grows on the lower half of the head. Everything outside the mask sinks
 * just under the skin, where the head hides it, so the edges follow the mask exactly.
 */
function beard({ mask, thickness, length = 0, bare = 0 }: Beard, columns = 140, rows = 80) {
  const positions: number[] = [];
  const bares: number[] = [];
  const uvs: number[] = [];
  const n = new THREE.Vector3();
  for (let i = 0; i <= columns; i++) {
    const a = lerp(-1.7, 1.7, i / columns);
    for (let j = 0; j <= rows; j++) {
      const t = lerp(1.25, Math.PI - 0.01, j / rows);
      const y = HEAD.y + HEAD.ry * Math.cos(t);
      const m = mask(a, y);
      const surface = onHead(a, t, 0);
      n.set((Math.sin(a) * Math.sin(t)) / HEAD.rx, Math.cos(t) / HEAD.ry, (Math.cos(a) * Math.sin(t)) / HEAD.rz).normalize();
      // Sinks under the skin where there's no beard and tapers in over the soft edge.
      const out = m * thickness(a, y) - 0.006 * (1 - smooth(0, 0.3, m));
      // A longer beard grows down from the chin and jaw, most at the front.
      const hang = length * m * smooth(2.1, 2.8, t) * lerp(1, 0.3, smooth(0.3, 1.3, Math.abs(a)));
      positions.push(surface.x + n.x * out, surface.y + n.y * out - hang, surface.z + n.z * out + hang * 0.35);
      bares.push(Math.max(bare, 0.5 * (1 - smooth(0.4, 1, m))));
      uvs.push(i / columns, 1 - j / rows);
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
  setBare(g, bares);
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Builds the meshes for one facial hair style. */
export function beardParts(style: BeardStyle): THREE.BufferGeometry[] {
  switch (style) {
    case "none":
      return [];
    case "stubble":
      return [beard({ mask: (a, y) => Math.max(jaw(a, y), moustache(a, y)) * lips(a, y), thickness: () => 0.0012, bare: 0.55 })];
    case "moustache":
      return [beard({ mask: moustache, thickness: (a) => 0.006 * (1 - 0.5 * smooth(0.25, 0.5, Math.abs(a))) })];
    case "goatee":
      return [
        beard({
          mask: (a, y) => Math.max(moustache(a, y) * (1 - smooth(0.36, 0.46, Math.abs(a))), chin(a, y)) * lips(a, y),
          thickness: (_, y) => 0.006 + 0.004 * (1 - smooth(1.55, 1.575, y)),
          length: 0.01,
        }),
      ];
    case "short":
      return [
        beard({
          mask: (a, y) => Math.max(jaw(a, y), moustache(a, y)) * lips(a, y),
          thickness: (a, y) => 0.0045 + 0.003 * (1 - smooth(1.55, 1.6, y)) * (1 - smooth(0.4, 1.2, Math.abs(a))),
          length: 0.004,
        }),
      ];
    case "full":
      return [
        beard(
          {
            mask: (a, y) => Math.max(jaw(a, y), moustache(a, y)) * lips(a, y),
            thickness: (a, y) =>
              0.008 + 0.012 * (1 - smooth(1.54, 1.62, y)) * (1 - smooth(0.4, 1.3, Math.abs(a))) - 0.004 * smooth(1.6, 1.67, y),
            length: 0.035,
          },
          140,
          90,
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
