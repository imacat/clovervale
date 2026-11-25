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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/25
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/clover-cover Scattering drifts of low clover among
 *   the grass, over the open ground between the village and the low
 *   hills around it.
 */

import {
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
} from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';

import {
  FARM_FIELDS,
  PLAYER_RADIUS,
  Terrain,
  VILLAGE_PLACEMENTS,
  VILLAGE_TERRAIN,
  measureBoundaryReach,
  placeShape,
} from '@clovervale/shared';
import type {
  Boundary,
  FarmField,
  GroundVector,
  ModelId,
  Placement,
  Pose,
  Shape,
} from '@clovervale/shared';

import { BARE_EARTH } from './bare-earth.ts';
import type { EarthPatch } from './bare-earth.ts';
import { createRandom, pickInRange } from './mountains.ts';
import type { Range } from './mountains.ts';

/**
 * Where a patch of the clover cover lies on the ground, which way it is
 * turned, and how large it is.
 */
export interface CloverSpot extends Pose {
  /**
   * How far the patch spreads, as a share of how far a patch of clover
   * spreads.
   */
  readonly size: number;
}

/**
 * How far the leaves of a patch of clover reach out from its middle, at
 * most, in meters.
 */
export const CLOVER_REACH = 0.64;

/**
 * How far in from the boundary the cover reaches, at most, in meters: over
 * the open grass between the hills and the houses and fields.
 */
export const COVER_BAND = 12;

/**
 * The least room between the edge of a patch of the cover and anything
 * else on the ground, in meters: whatever stands there, the bare earth,
 * the farm fields, and the foot of the hills.
 */
export const COVER_CLEARANCE = 0.5;

/** How much a patch spreads, as a share of a patch of clover. */
const SIZE: Range = [0.8, 1.3];

/** How many drifts of clover are tried. */
const DRIFT_TRIES = 600;

/** How far apart the middles of two drifts lie, at least, in meters. */
const DRIFT_SPACING = 5.5;

/** How many patches a drift tries to hold besides its first. */
const DRIFT_TRIES_EACH = 4;

/**
 * How far out from the first patch of a drift the others lie, at most, in
 * meters.
 */
const DRIFT_SPREAD = 2.2;

/** The seed of the scattering, so that it is the same every time. */
const SEED = 0xc10e;

/**
 * How far the ground of each model spreads out from where it stands, in
 * meters, for the models that spread wider over the ground than the ground
 * they take up where nobody can walk, if any.
 */
const SPREADS: Readonly<Partial<Record<ModelId, number>>> = {
  clover: CLOVER_REACH,
  'spawn-stones': 1.95,
  'pine-tree': 1.05,
  bush: 0.94,
  rock: 0.69,
};

/**
 * Finds the ground of a farm field, from its fence on one side to its
 * fence on the other, its lanes and all.
 *
 * @param {Placement} placement - Where a model stands.
 * @returns {Shape[]} The ground of the field, none if the model is not a
 *   farm field.
 */
function findFieldGround(placement: Placement): Shape[] {
  const fields: Readonly<Partial<Record<ModelId, FarmField>>> = FARM_FIELDS;
  const field: FarmField | undefined = fields[placement.model];
  if (field === undefined) {
    return [];
  }
  return [
    placeShape(placement, {
      shape: 'box',
      x: 0,
      z: 0,
      halfWidth: field.length / 2,
      halfDepth: field.width / 2,
      yaw: 0,
    }),
  ];
}

/**
 * Finds the ground a model spreads over beyond the ground it takes up.
 *
 * @param {Placement} placement - Where the model stands.
 * @returns {Shape[]} The ground, none for a model that spreads no wider.
 */
function findSpread(placement: Placement): Shape[] {
  const radius: number | undefined = SPREADS[placement.model];
  if (radius === undefined) {
    return [];
  }
  return [{ shape: 'circle', x: placement.x, z: placement.z, radius }];
}

/**
 * Finds the ground of a patch of bare earth.
 *
 * @param {EarthPatch} patch - The patch.
 * @returns {Shape} A box around the patch.
 */
function findEarthGround([x, z, radiusX, radiusZ, yaw]: EarthPatch): Shape {
  return { shape: 'box', x, z, halfWidth: radiusX, halfDepth: radiusZ, yaw };
}

/**
 * The ground the clover cover keeps off: whatever stands in the village,
 * with the ground it spreads over, the farm fields, the bare earth, and
 * beyond the boundary, where the hills rise.
 */
const KEPT_OFF: Terrain = new Terrain(
  [
    ...VILLAGE_TERRAIN.shapes,
    ...VILLAGE_PLACEMENTS.flatMap(findFieldGround),
    ...VILLAGE_PLACEMENTS.flatMap(findSpread),
    ...BARE_EARTH.map(findEarthGround),
  ],
  VILLAGE_TERRAIN.boundary,
);

/**
 * Finds a point on the ground some way in from the boundary.
 *
 * @param {number} turn - The direction from the middle of the boundary,
 *   around the Y axis from +Z toward +X, in radians.
 * @param {number} depth - How far in from the boundary, in meters.
 * @returns {GroundVector} The point.
 */
function findInward(turn: number, depth: number): GroundVector {
  const boundary: Boundary = VILLAGE_TERRAIN.boundary;
  const direction: GroundVector = { x: Math.sin(turn), z: Math.cos(turn) };
  const distance: number = measureBoundaryReach(boundary, direction) - depth;
  return {
    x: boundary.x + direction.x * distance,
    z: boundary.z + direction.z * distance,
  };
}

/**
 * Measures how far in from the boundary a point lies.
 *
 * @param {GroundVector} point - The point.
 * @returns {number} The distance, in meters, less than 0 beyond the
 *   boundary.
 */
function measureDepth(point: GroundVector): number {
  const boundary: Boundary = VILLAGE_TERRAIN.boundary;
  const offset: GroundVector = {
    x: point.x - boundary.x,
    z: point.z - boundary.z,
  };
  return (
    measureBoundaryReach(boundary, offset) - Math.hypot(offset.x, offset.z)
  );
}

/**
 * Tells whether a patch of the cover can lie on a spot: clear of all the
 * cover keeps off, and of the patches already there.
 *
 * @param {CloverSpot} spot - The spot.
 * @param {readonly CloverSpot[]} spots - The patches already there.
 * @returns {boolean} Whether it can.
 */
function canLie(spot: CloverSpot, spots: readonly CloverSpot[]): boolean {
  const reach: number = CLOVER_REACH * spot.size;
  if (!KEPT_OFF.isClear(spot, reach + COVER_CLEARANCE - PLAYER_RADIUS)) {
    return false;
  }
  return spots.every(
    (other: CloverSpot) =>
      Math.hypot(other.x - spot.x, other.z - spot.z) >
      reach + CLOVER_REACH * other.size,
  );
}

/**
 * Scatters the patches of the clover cover in drifts over the open grass
 * all around the village, within {@link COVER_BAND} of the boundary: at
 * least {@link COVER_CLEARANCE} clear of whatever stands in the village
 * and the ground it spreads over, of the farm fields, of the bare earth of
 * the plaza and the paths, and of the foot of the hills, and none over
 * another.  They are the same every time.
 *
 * @returns {CloverSpot[]} Where the patches lie, which way each is turned,
 *   in degrees, and how large.
 */
export function scatterCloverCover(): CloverSpot[] {
  const random: () => number = createRandom(SEED);
  const pickSpot = (x: number, z: number): CloverSpot => ({
    x,
    z,
    yaw: random() * 360,
    size: pickInRange(SIZE, random()),
  });
  const drifts: GroundVector[] = [];
  const spots: CloverSpot[] = [];
  for (let index = 0; index < DRIFT_TRIES; index++) {
    const middle: GroundVector = findInward(
      random() * 2 * Math.PI,
      random() * COVER_BAND,
    );
    const first: CloverSpot = pickSpot(middle.x, middle.z);
    if (
      drifts.some(
        (drift: GroundVector) =>
          Math.hypot(drift.x - middle.x, drift.z - middle.z) < DRIFT_SPACING,
      ) ||
      !canLie(first, spots)
    ) {
      continue;
    }
    drifts.push(middle);
    spots.push(first);
    for (let more = 0; more < DRIFT_TRIES_EACH; more++) {
      const turn: number = random() * 2 * Math.PI;
      const out: number = Math.sqrt(random()) * DRIFT_SPREAD;
      const spot: CloverSpot = pickSpot(
        middle.x + Math.sin(turn) * out,
        middle.z + Math.cos(turn) * out,
      );
      if (measureDepth(spot) <= COVER_BAND && canLie(spot, spots)) {
        spots.push(spot);
      }
    }
  }
  return spots;
}

/** A part of the model of a patch of clover, ready to be drawn many times. */
interface CoverPart {
  /** Its shape, as the patch has it. */
  readonly geometry: BufferGeometry;
  /** Its material, or materials. */
  readonly material: Material | Material[];
}

/**
 * Tells whether a node of a model is a mesh.
 *
 * @param {Object3D} node - The node.
 * @returns {boolean} Whether it is.
 */
function isMesh(node: Object3D): node is Mesh {
  return node instanceof Mesh;
}

/**
 * Takes the parts of the model of a patch of clover.
 *
 * @param {Object3D} patch - The root of the model of a patch of clover,
 *   which is left as it is.
 * @returns {CoverPart[]} The parts, around the root of the model.
 */
function takeParts(patch: Object3D): CoverPart[] {
  patch.updateWorldMatrix(true, true);
  const fromWorld: Matrix4 = patch.matrixWorld.clone().invert();
  const parts: CoverPart[] = [];
  patch.traverse((node: Object3D) => {
    if (isMesh(node)) {
      parts.push({
        geometry: node.geometry
          .clone()
          .applyMatrix4(fromWorld.clone().multiply(node.matrixWorld)),
        material: node.material,
      });
    }
  });
  return parts;
}

/**
 * Creates the clover cover from the model of a patch of clover: patches of
 * it in the grass where {@link scatterCloverCover} scatters them, each
 * turned and spread as it tells, as high as the model.  They take up no
 * ground, cast no shadow, and are drawn all at once, a part of the patch
 * at a time.
 *
 * @param {Object3D} patch - The root of the model of a patch of clover,
 *   which is left as it is.
 * @returns {Group} The cover, named `clover-cover`.
 */
export function createCloverCover(patch: Object3D): Group {
  const spots: CloverSpot[] = scatterCloverCover();
  const places: Matrix4[] = spots.map((spot: CloverSpot) =>
    new Matrix4().compose(
      new Vector3(spot.x, 0, spot.z),
      new Quaternion().setFromAxisAngle(
        new Vector3(0, 1, 0),
        (spot.yaw * Math.PI) / 180,
      ),
      new Vector3(spot.size, 1, spot.size),
    ),
  );
  const cover = new Group();
  cover.name = 'clover-cover';
  for (const { geometry, material } of takeParts(patch)) {
    const part = new InstancedMesh(geometry, material, places.length);
    places.forEach((place: Matrix4, index: number) => {
      part.setMatrixAt(index, place);
    });
    part.castShadow = false;
    part.receiveShadow = true;
    part.computeBoundingBox();
    part.computeBoundingSphere();
    cover.add(part);
  }
  return cover;
}
