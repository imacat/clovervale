// The Clovervale project.
// Copyright 2026 imacat.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Authors:
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/17
// AI assistance: Claude Code (Anthropic)

/**
 * @module scripts/models/geometry Low-poly triangle shapes for the models.
 */

import { Euler, Matrix4, Quaternion, Vector3 } from 'three';

import { getItem } from './items.ts';

/** Two numbers, such as a point of an outline. */
export type Pair = readonly [number, number];

/** Three numbers, such as a point, Euler angles or a scale. */
export type Triple = readonly [number, number, number];

/** The corners of a triangle, counter-clockwise seen from outside. */
export type Triangle = [Vector3, Vector3, Vector3];

/** The triangles of a shape. */
export type Shape = Triangle[];

/** Where to put a shape, and how. */
export interface Placement {
  /** The translation. */
  readonly pos?: Triple;
  /** The Euler rotation, in degrees. */
  readonly rot?: Triple;
  /** The uniform or per-axis scale. */
  readonly scale?: number | Triple;
}

/** Which part of a solid of revolution to create. */
interface LatheOptions {
  /** The rotation of the ring, in sides. */
  readonly phase?: number;
  /** The first side to create. */
  readonly from?: number;
  /** The side to stop before. */
  readonly to?: number;
}

/** A cross section of a tube. */
interface TubeRing {
  /** The corners of the cross section. */
  readonly ring: readonly Vector3[];
  /** The direction of the tube at the cross section. */
  readonly tangent: Vector3;
  /** The center of the cross section. */
  readonly center: Vector3;
}

/** One degree, in radians. */
const DEG: number = Math.PI / 180;

/**
 * Creates a seeded pseudo-random number generator.
 *
 * @param {number} seed - The integer seed.
 * @returns {() => number} A function returning numbers in [0, 1).
 */
export function createRandom(seed: number): () => number {
  let state: number = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t: number = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Creates a rotation from Euler angles, applied in the fixed order roll (Z),
 * pitch (X), then yaw (Y).
 *
 * @param {Triple} degrees - The X, Y and Z angles in degrees.
 * @returns {Quaternion} The rotation.
 */
export function createRotation(degrees: Triple): Quaternion {
  const [x, y, z] = degrees;
  return new Quaternion().setFromEuler(
    new Euler(x * DEG, y * DEG, z * DEG, 'YXZ'),
  );
}

/**
 * Creates the transform that scales, rotates, then translates.
 *
 * @param {Placement} placement - The scale, the rotation and the
 *   translation.
 * @returns {Matrix4} The transform.
 */
function createTransform({
  pos = [0, 0, 0],
  rot = [0, 0, 0],
  scale = 1,
}: Placement): Matrix4 {
  const s: Triple = typeof scale === 'number' ? [scale, scale, scale] : scale;
  return new Matrix4().compose(
    new Vector3(...pos),
    createRotation(rot),
    new Vector3(...s),
  );
}

/**
 * Transforms a shape, keeping its faces outward.
 *
 * @param {Shape} shape - The shape.
 * @param {Matrix4} matrix - The transform.
 * @returns {Shape} The transformed copy.
 */
function transformShape(shape: Shape, matrix: Matrix4): Shape {
  const flip: boolean = matrix.determinant() < 0;
  return shape.map((tri: Triangle): Triangle => {
    const a: Vector3 = tri[0].clone().applyMatrix4(matrix);
    const b: Vector3 = tri[1].clone().applyMatrix4(matrix);
    const c: Vector3 = tri[2].clone().applyMatrix4(matrix);
    return flip ? [a, c, b] : [a, b, c];
  });
}

/**
 * Places a shape with a scale, a rotation and a translation.
 *
 * @param {Shape} shape - The shape.
 * @param {Placement} placement - The scale, the rotation and the translation.
 * @returns {Shape} The transformed copy.
 */
export function place(shape: Shape, placement: Placement): Shape {
  return transformShape(shape, createTransform(placement));
}

/**
 * Mirrors a shape across the YZ plane.
 *
 * @param {Shape} shape - The shape.
 * @returns {Shape} The mirrored copy.
 */
export function mirrorShape(shape: Shape): Shape {
  return transformShape(shape, new Matrix4().makeScale(-1, 1, 1));
}

/**
 * Appends a triangle unless it is degenerate, turned to face along the
 * expected direction.
 *
 * @param {Shape} out - The shape to append to.
 * @param {Readonly<Triangle>} tri - The triangle.
 * @param {Vector3} expected - The rough outward direction.
 */
function pushTriangle(
  out: Shape,
  tri: Readonly<Triangle>,
  expected: Vector3,
): void {
  const normal: Vector3 = new Vector3()
    .subVectors(tri[1], tri[0])
    .cross(new Vector3().subVectors(tri[2], tri[0]));
  if (normal.length() < 1e-9) {
    return;
  }
  if (normal.dot(expected) < 0) {
    out.push([tri[0].clone(), tri[2].clone(), tri[1].clone()]);
  } else {
    out.push([tri[0].clone(), tri[1].clone(), tri[2].clone()]);
  }
}

/**
 * Appends a quad as two triangles.
 *
 * @param {Shape} out - The shape to append to.
 * @param {readonly [Vector3, Vector3, Vector3, Vector3]} quad - The four
 *   corners in ring order.
 * @param {Vector3} expected - The rough outward direction.
 */
function pushQuad(
  out: Shape,
  quad: readonly [Vector3, Vector3, Vector3, Vector3],
  expected: Vector3,
): void {
  pushTriangle(out, [quad[0], quad[1], quad[2]], expected);
  pushTriangle(out, [quad[0], quad[2], quad[3]], expected);
}

/**
 * Creates a box centered on the origin, optionally tapered toward the top.
 *
 * @param {number} width - The size along X.
 * @param {number} height - The size along Y.
 * @param {number} depth - The size along Z.
 * @param {Pair} [taper] - The X and Z scale of the top face.
 * @returns {Shape} The box.
 */
export function createBox(
  width: number,
  height: number,
  depth: number,
  taper: Pair = [1, 1],
): Shape {
  const [x, y, z]: Triple = [width / 2, height / 2, depth / 2];
  const [tx, tz]: Pair = [x * taper[0], z * taper[1]];
  const c: Vector3[] = [
    new Vector3(-x, -y, -z),
    new Vector3(x, -y, -z),
    new Vector3(x, -y, z),
    new Vector3(-x, -y, z),
    new Vector3(-tx, y, -tz),
    new Vector3(tx, y, -tz),
    new Vector3(tx, y, tz),
    new Vector3(-tx, y, tz),
  ];
  const faces: (readonly [number, number, number, number, Triple])[] = [
    [0, 1, 2, 3, [0, -1, 0]],
    [4, 5, 6, 7, [0, 1, 0]],
    [0, 1, 5, 4, [0, 0, -1]],
    [3, 2, 6, 7, [0, 0, 1]],
    [0, 3, 7, 4, [-1, 0, 0]],
    [1, 2, 6, 5, [1, 0, 0]],
  ];
  const out: Shape = [];
  for (const [a, b, d, e, n] of faces) {
    pushQuad(
      out,
      [getItem(c, a), getItem(c, b), getItem(c, d), getItem(c, e)],
      new Vector3(...n),
    );
  }
  return out;
}

/**
 * Creates a box whose base is centered on the origin.
 *
 * @param {number} width - The size along X.
 * @param {number} height - The size along Y.
 * @param {number} depth - The size along Z.
 * @param {Pair} [taper] - The X and Z scale of the top face.
 * @returns {Shape} The box.
 */
export function createBlock(
  width: number,
  height: number,
  depth: number,
  taper: Pair = [1, 1],
): Shape {
  return place(createBox(width, height, depth, taper), {
    pos: [0, height / 2, 0],
  });
}

/**
 * Creates a solid of revolution around the Y axis.
 *
 * The profile runs from bottom to top with the outside on its right; a
 * radius of zero closes the surface.
 *
 * @param {readonly Pair[]} profile - The [radius, y] pairs.
 * @param {number} sides - The number of sides.
 * @param {LatheOptions} [options] - Which part of the solid to create.
 * @returns {Shape} The solid.
 */
export function createLathe(
  profile: readonly Pair[],
  sides: number,
  { phase = 0.5, from = 0, to = sides }: LatheOptions = {},
): Shape {
  const findPoint = (r: number, y: number, i: number): Vector3 => {
    const angle: number = (2 * Math.PI * (i + phase)) / sides;
    return new Vector3(r * Math.sin(angle), y, r * Math.cos(angle));
  };
  const out: Shape = [];
  for (let j = 0; j + 1 < profile.length; j++) {
    const [r0, y0] = getItem(profile, j);
    const [r1, y1] = getItem(profile, j + 1);
    for (let i = from; i < to; i++) {
      const mid: number = (2 * Math.PI * (i + 0.5 + phase)) / sides;
      const expected = new Vector3(
        (y1 - y0) * Math.sin(mid),
        r0 - r1,
        (y1 - y0) * Math.cos(mid),
      );
      pushQuad(
        out,
        [
          findPoint(r0, y0, i),
          findPoint(r0, y0, i + 1),
          findPoint(r1, y1, i + 1),
          findPoint(r1, y1, i),
        ],
        expected,
      );
    }
  }
  return out;
}

/**
 * Creates a sphere of radius one by subdividing an icosahedron.
 *
 * @param {number} detail - The number of subdivisions.
 * @returns {Shape} The sphere.
 */
function createIcosphere(detail: number): Shape {
  const t: number = (1 + Math.sqrt(5)) / 2;
  const points: Triple[] = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ];
  const v: Vector3[] = points.map((p: Triple) =>
    new Vector3(...p).normalize(),
  );
  const f: Triple[] = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  let tris: Shape = f.map(
    ([a, b, c]: Triple): Triangle => [
      getItem(v, a),
      getItem(v, b),
      getItem(v, c),
    ],
  );
  for (let i = 0; i < detail; i++) {
    const next: Shape = [];
    for (const [a, b, c] of tris) {
      const ab: Vector3 = new Vector3().addVectors(a, b).normalize();
      const bc: Vector3 = new Vector3().addVectors(b, c).normalize();
      const ca: Vector3 = new Vector3().addVectors(c, a).normalize();
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    tris = next;
  }
  const out: Shape = [];
  for (const tri of tris) {
    const center: Vector3 = new Vector3().add(tri[0]).add(tri[1]).add(tri[2]);
    pushTriangle(out, tri, center);
  }
  return out;
}

/**
 * Creates an irregular faceted lump of roughly radius one.
 *
 * @param {number} detail - The number of subdivisions.
 * @param {number} seed - The random seed.
 * @param {number} jitter - The largest radial displacement.
 * @returns {Shape} The lump.
 */
export function createBlob(
  detail: number,
  seed: number,
  jitter: number,
): Shape {
  const random: () => number = createRandom(seed);
  const scales = new Map<string, number>();
  const displace = (p: Vector3): Vector3 => {
    const key = `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`;
    let scale: number | undefined = scales.get(key);
    if (scale === undefined) {
      scale = 1 + (random() * 2 - 1) * jitter;
      scales.set(key, scale);
    }
    return p.clone().multiplyScalar(scale);
  };
  return createIcosphere(detail).map((tri: Triangle): Triangle => {
    const a: Vector3 = displace(tri[0]);
    const b: Vector3 = displace(tri[1]);
    const c: Vector3 = displace(tri[2]);
    return [a, b, c];
  });
}

/**
 * Computes twice the signed area of a polygon.
 *
 * @param {readonly Pair[]} points - The polygon.
 * @returns {number} Twice the area, positive when counter-clockwise.
 */
function computeSignedArea(points: readonly Pair[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = getItem(points, i);
    const [x1, y1] = getItem(points, (i + 1) % points.length);
    area += x0 * y1 - x1 * y0;
  }
  return area;
}

/**
 * Triangulates a simple polygon.
 *
 * @param {readonly Pair[]} points - The counter-clockwise polygon.
 * @returns {Triple[]} The triangles as index triples.
 */
function triangulatePolygon(points: readonly Pair[]): Triple[] {
  const computeCross = (a: Pair, b: Pair, c: Pair): number =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const indices: number[] = points.map((_: Pair, i: number) => i);
  const out: Triple[] = [];
  while (indices.length > 3) {
    for (let i = 0; i < indices.length; i++) {
      const ia: number = getItem(
        indices,
        (i + indices.length - 1) % indices.length,
      );
      const ib: number = getItem(indices, i);
      const ic: number = getItem(indices, (i + 1) % indices.length);
      const a: Pair = getItem(points, ia);
      const b: Pair = getItem(points, ib);
      const c: Pair = getItem(points, ic);
      if (computeCross(a, b, c) <= 1e-12) {
        continue;
      }
      const blocked: boolean = indices.some((k: number) => {
        const p: Pair = getItem(points, k);
        return (
          k !== ia &&
          k !== ib &&
          k !== ic &&
          computeCross(a, b, p) > 0 &&
          computeCross(b, c, p) > 0 &&
          computeCross(c, a, p) > 0
        );
      });
      if (!blocked) {
        out.push([ia, ib, ic]);
        indices.splice(i, 1);
        break;
      }
    }
  }
  out.push([getItem(indices, 0), getItem(indices, 1), getItem(indices, 2)]);
  return out;
}

/**
 * Creates a flat polygon in the XY plane extruded along Z, centered on Z.
 *
 * @param {readonly Pair[]} points - The [x, y] outline.
 * @param {number} depth - The thickness along Z.
 * @returns {Shape} The solid.
 */
export function createExtrusion(points: readonly Pair[], depth: number): Shape {
  const outline: readonly Pair[] =
    computeSignedArea(points) < 0 ? [...points].reverse() : points;
  const z: number = depth / 2;
  const out: Shape = [];
  for (const [ia, ib, ic] of triangulatePolygon(outline)) {
    const a: Pair = getItem(outline, ia);
    const b: Pair = getItem(outline, ib);
    const c: Pair = getItem(outline, ic);
    pushTriangle(
      out,
      [
        new Vector3(a[0], a[1], z),
        new Vector3(b[0], b[1], z),
        new Vector3(c[0], c[1], z),
      ],
      new Vector3(0, 0, 1),
    );
    pushTriangle(
      out,
      [
        new Vector3(a[0], a[1], -z),
        new Vector3(b[0], b[1], -z),
        new Vector3(c[0], c[1], -z),
      ],
      new Vector3(0, 0, -1),
    );
  }
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = getItem(outline, i);
    const [x1, y1] = getItem(outline, (i + 1) % outline.length);
    pushQuad(
      out,
      [
        new Vector3(x0, y0, -z),
        new Vector3(x1, y1, -z),
        new Vector3(x1, y1, z),
        new Vector3(x0, y0, z),
      ],
      new Vector3(y1 - y0, x0 - x1, 0),
    );
  }
  return out;
}

/**
 * Creates a tube that follows a path, closed at both ends.
 *
 * @param {readonly Triple[]} path - The points along the center line.
 * @param {readonly (number | Pair)[]} radii - The radius at each point, or
 *   its [side, front] pair; zero makes a pointed end.
 * @param {number} sides - The number of sides.
 * @param {Triple} [reference] - The direction the front of the cross section
 *   faces, roughly.
 * @returns {Shape} The tube.
 */
export function createTube(
  path: readonly Triple[],
  radii: readonly (number | Pair)[],
  sides: number,
  reference: Triple = [0, 0, 1],
): Shape {
  const points: Vector3[] = path.map((p: Triple) => new Vector3(...p));
  const ref = new Vector3(...reference);
  const rings: TubeRing[] = points.map((p: Vector3, i: number): TubeRing => {
    const prev: Vector3 = getItem(points, Math.max(i - 1, 0));
    const next: Vector3 = getItem(points, Math.min(i + 1, points.length - 1));
    const tangent: Vector3 = new Vector3().subVectors(next, prev).normalize();
    const side: Vector3 = new Vector3().crossVectors(ref, tangent);
    if (side.length() < 1e-6) {
      side.crossVectors(new Vector3(1, 0, 0), tangent);
    }
    side.normalize();
    const front: Vector3 = new Vector3()
      .crossVectors(tangent, side)
      .normalize();
    const radius: number | Pair = getItem(radii, i);
    const [rs, rf]: Pair =
      typeof radius === 'number' ? [radius, radius] : radius;
    const ring: Vector3[] = [];
    for (let k = 0; k < sides; k++) {
      const angle: number = (2 * Math.PI * (k + 0.5)) / sides;
      ring.push(
        p
          .clone()
          .addScaledVector(side, rs * Math.cos(angle))
          .addScaledVector(front, rf * Math.sin(angle)),
      );
    }
    return { ring, tangent, center: p };
  });
  const out: Shape = [];
  for (let i = 0; i + 1 < rings.length; i++) {
    const a: TubeRing = getItem(rings, i);
    const b: TubeRing = getItem(rings, i + 1);
    const middle: Vector3 = new Vector3()
      .addVectors(a.center, b.center)
      .multiplyScalar(0.5);
    for (let k = 0; k < sides; k++) {
      const n: number = (k + 1) % sides;
      const quad: readonly [Vector3, Vector3, Vector3, Vector3] = [
        getItem(a.ring, k),
        getItem(a.ring, n),
        getItem(b.ring, n),
        getItem(b.ring, k),
      ];
      const center = new Vector3();
      for (const p of quad) {
        center.addScaledVector(p, 0.25);
      }
      pushQuad(out, quad, center.sub(middle));
    }
  }
  const ends: (readonly [TubeRing, number])[] = [
    [getItem(rings, 0), -1],
    [getItem(rings, rings.length - 1), 1],
  ];
  for (const [end, sign] of ends) {
    const expected: Vector3 = end.tangent.clone().multiplyScalar(sign);
    for (let k = 1; k + 1 < sides; k++) {
      pushTriangle(
        out,
        [getItem(end.ring, 0), getItem(end.ring, k), getItem(end.ring, k + 1)],
        expected,
      );
    }
  }
  return out;
}

/**
 * Creates a cone or a truncated cone standing on the origin.
 *
 * @param {number} bottom - The bottom radius.
 * @param {number} top - The top radius.
 * @param {number} height - The height.
 * @param {number} sides - The number of sides.
 * @returns {Shape} The closed cone.
 */
export function createCone(
  bottom: number,
  top: number,
  height: number,
  sides: number,
): Shape {
  return createLathe(
    [
      [0, 0],
      [bottom, 0],
      [top, height],
      [0, height],
    ],
    sides,
  );
}

/**
 * Creates an ellipsoid centered on the origin.
 *
 * @param {Triple} radii - The X, Y and Z radii.
 * @param {number} detail - The number of subdivisions.
 * @returns {Shape} The ellipsoid.
 */
export function createEllipsoid(radii: Triple, detail: number): Shape {
  return place(createIcosphere(detail), { scale: radii });
}
