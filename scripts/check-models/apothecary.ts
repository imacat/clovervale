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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/23
// AI assistance: Claude Code (Anthropic)

/**
 * @module scripts/check-models/apothecary Checks the apothecary's, its props
 *   and Basil, as the village stands them.
 */

import type { AnimationClip, AnimationMixer, Object3D } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

import {
  PLAYER_RADIUS,
  SPAWN_POINT_COUNT,
  TOBY_ENDS,
  TOBY_RADIUS,
  VILLAGE_PLACEMENTS,
  VILLAGE_TERRAIN,
  findMapPath,
  findPlacement,
  findSpawnPoint,
  findTurn,
  findVillager,
  placePoint,
  turnVector,
} from '@clovervale/shared';
import type {
  GroundVector,
  ModelId,
  Placement,
  Shape,
} from '@clovervale/shared';
import { MODEL_FILES } from '../../packages/client/src/model-catalogue.ts';

import { FOOTPRINT_TOLERANCE } from './constants.ts';
import type { StrikeResult } from './constants.ts';
import { APOTHECARY_FILE, BASIL_FILE } from './files.ts';
import { listWorldVertices, loadAt, poseModel, resetModel } from './pose.ts';

/**
 * The models that stand about the front of the apothecary's: the herb
 * rack, the crates, the potted plant and the barrels.
 */
const APOTHECARY_PROPS: readonly ModelId[] = [
  'herb-rack',
  'potion-crate',
  'herb-crate',
  'potted-plant',
  'barrel',
];
/**
 * Where a player stands in front of the door of the apothecary's, a step
 * out from its doorstep, as the model of the shop has it.
 */
const BEFORE_SHOP_DOOR: GroundVector = { x: 0.9, z: 4.1 };
/**
 * The heights between which whatever a model has must lie within the
 * ground it takes up, in metres: above a doorstep, which a player steps
 * over, and below the eaves of a roof, which a player walks under.
 */
const SOLID_HEIGHTS: readonly [number, number] = [0.2, 2];
/** How many times in his idle clip Basil is looked at. */
const BASIL_SAMPLES = 40;
/**
 * The least room between the ground the props of the apothecary's take up
 * and a patch of clover, a spawn point or the course of Toby, in metres.
 */
const PATH_CLEARANCE = 1;

/**
 * Measures how far a point on the ground lies outside a shape on it.
 *
 * @param {GroundVector} point - The point.
 * @param {Shape} shape - The shape, in the world.
 * @returns {number} How far, in metres, or zero if it lies within.
 */
function measureOutside(point: GroundVector, shape: Shape): number {
  if (shape.shape === 'circle') {
    return Math.max(
      Math.hypot(point.x - shape.x, point.z - shape.z) - shape.radius,
      0,
    );
  }
  const local: GroundVector = turnVector(
    { x: point.x - shape.x, z: point.z - shape.z },
    findTurn(-shape.yaw),
  );
  return Math.hypot(
    Math.max(Math.abs(local.x) - shape.halfWidth, 0),
    Math.max(Math.abs(local.z) - shape.halfDepth, 0),
  );
}

/**
 * Measures how far the solid part of a model, standing in its place, reaches
 * out of the ground it takes up in the village: the farthest any of its
 * vertices between the heights of {@link SOLID_HEIGHTS} lies outside every
 * footprint of its own.
 *
 * @param {Object3D} root - The model, standing in its place.
 * @param {Placement} placement - Its place.
 * @returns {number} How far, in metres.
 */
function measureOverhang(root: Object3D, placement: Placement): number {
  const own: Shape[] = VILLAGE_TERRAIN.shapes.filter(
    (shape: Shape) =>
      Math.hypot(shape.x - placement.x, shape.z - placement.z) < 1e-9,
  );
  const [low, high] = SOLID_HEIGHTS;
  let farthest = 0;
  for (const point of listWorldVertices(root).positions) {
    if (point.y < low || point.y > high) {
      continue;
    }
    const outside: number = Math.min(
      ...own.map((shape: Shape) => measureOutside(point, shape)),
    );
    farthest = Math.max(farthest, outside);
  }
  return farthest;
}

/**
 * Checks that the house and the props of the apothecary's reach no
 * farther than {@link FOOTPRINT_TOLERANCE} out of the ground they take up.
 *
 * @param {readonly string[]} files - The file names of the models there
 *   are.
 * @param {string[]} failures - The requirements not met, to add to.
 * @returns {Promise<number>} The farthest any of them reaches out, in
 *   metres.
 */
async function checkShopOverhangs(
  files: readonly string[],
  failures: string[],
): Promise<number> {
  let widest = 0;
  for (const placement of VILLAGE_PLACEMENTS.filter(
    ({ model }: Placement) =>
      (model === 'apothecary' || APOTHECARY_PROPS.includes(model)) &&
      files.includes(MODEL_FILES[model]),
  )) {
    const model: GLTF = await loadAt(placement);
    const overhang: number = measureOverhang(model.scene, placement);
    widest = Math.max(widest, overhang);
    if (overhang > FOOTPRINT_TOLERANCE) {
      failures.push(
        `${MODEL_FILES[placement.model]} at (${placement.x.toFixed(2)}, ` +
          `${placement.z.toFixed(2)}) reaches ${overhang.toFixed(3)} m out ` +
          'of the ground it takes up',
      );
    }
  }
  return widest;
}

/**
 * Checks that Basil, through his idle clip, reaches no farther than
 * {@link FOOTPRINT_TOLERANCE} out of the ground he takes up.
 *
 * @param {Placement} placement - Where Basil stands.
 * @param {string[]} failures - The requirements not met, to add to.
 * @returns {Promise<number>} The farthest he reaches out, in metres.
 */
async function checkBasilOverhang(
  placement: Placement,
  failures: string[],
): Promise<number> {
  const basil: GLTF = await loadAt(placement);
  const clip: AnimationClip | undefined = basil.animations.find(
    (candidate: AnimationClip) => candidate.name === 'Idle',
  );
  let overhang = 0;
  if (clip === undefined) {
    failures.push(`${BASIL_FILE} does not idle`);
    return overhang;
  }
  for (let k = 0; k < BASIL_SAMPLES; k++) {
    const mixer: AnimationMixer = poseModel(
      basil,
      clip,
      (clip.duration * k) / BASIL_SAMPLES,
    );
    overhang = Math.max(overhang, measureOverhang(basil.scene, placement));
    resetModel(basil, mixer);
  }
  if (overhang > FOOTPRINT_TOLERANCE) {
    failures.push(
      `${BASIL_FILE} reaches ${overhang.toFixed(3)} m out of the ` +
        'ground he takes up as he idles',
    );
  }
  return overhang;
}

/**
 * Checks that the props of the apothecary's stand at least
 * {@link PATH_CLEARANCE} from every patch of clover and every spawn point,
 * and from the course Toby runs.
 *
 * @param {string[]} failures - The requirements not met, to add to.
 */
function checkPropClearance(failures: string[]): void {
  const props: Shape[] = VILLAGE_TERRAIN.shapes.filter((shape: Shape) =>
    VILLAGE_PLACEMENTS.some(
      (placement: Placement) =>
        APOTHECARY_PROPS.includes(placement.model) &&
        Math.hypot(shape.x - placement.x, shape.z - placement.z) < 1e-9,
    ),
  );
  const [first, second] = TOBY_ENDS;
  const course: GroundVector[] = Array.from(
    { length: 101 },
    (_: unknown, index: number): GroundVector => ({
      x: first.x + ((second.x - first.x) * index) / 100,
      z: first.z + ((second.z - first.z) * index) / 100,
    }),
  );
  const paths: readonly (readonly [string, GroundVector, number])[] = [
    ...VILLAGE_PLACEMENTS.filter(
      ({ model }: Placement) => model === 'clover',
    ).map((patch: Placement) => ['a patch of clover', patch, 0] as const),
    ...Array.from(
      { length: SPAWN_POINT_COUNT },
      (_: unknown, index: number) =>
        ['a spawn point', findSpawnPoint(index), PLAYER_RADIUS] as const,
    ),
    ...course.map(
      (point: GroundVector) =>
        ['the course of Toby', point, TOBY_RADIUS] as const,
    ),
  ];
  for (const [what, point, radius] of paths) {
    for (const prop of props) {
      if (measureOutside(point, prop) < PATH_CLEARANCE + radius) {
        failures.push(
          'a prop of the apothecary\'s stands within ' +
            `${String(PATH_CLEARANCE)} m of ${what} at ` +
            `(${point.x.toFixed(2)}, ${point.z.toFixed(2)})`,
        );
      }
    }
  }
}

/**
 * Checks that a player in front of the door of the apothecary's, facing
 * Basil, talks to him, and walks there from the plaza.
 *
 * @param {Placement} basil - Where Basil stands.
 * @param {string[]} failures - The requirements not met, to add to.
 */
function checkShopDoor(basil: Placement, failures: string[]): void {
  const spot: GroundVector = placePoint(
    findPlacement('apothecary'),
    BEFORE_SHOP_DOOR,
  );
  const yaw: number =
    (Math.atan2(basil.x - spot.x, basil.z - spot.z) * 180) / Math.PI;
  const isTalked: boolean =
    findVillager({ ...spot, yaw }, 0, 'village', [])?.id === 'basil';
  const isReached: boolean =
    VILLAGE_TERRAIN.isClear(spot) &&
    findMapPath('village', findSpawnPoint(0), spot) !== null;
  if (!isTalked) {
    failures.push(
      `a player in front of the door of ${APOTHECARY_FILE} does not talk ` +
        `to ${BASIL_FILE}`,
    );
  }
  if (!isReached) {
    failures.push(
      `a player cannot walk from the plaza to the door of ${APOTHECARY_FILE}`,
    );
  }
}

/**
 * Checks the apothecary's, its props and Basil, as the village stands them.
 *
 * The house, the herb rack, the crates, the potted plant and the barrels,
 * and Basil through his idle clip, each reach no farther than
 * {@link FOOTPRINT_TOLERANCE} out of the ground they take up, from the top
 * of the doorstep up to the eaves, so that nobody walks into what stands
 * there.  The props stand at least {@link PATH_CLEARANCE} from every
 * patch of clover and every spawn point, and from the course Toby runs.
 * A player in front of the door, facing Basil, talks to him, and walks
 * there from the plaza.
 *
 * @param {readonly string[]} files - The file names of the models there
 *   are.
 * @returns {Promise<StrikeResult>} The outcome.
 */
export async function checkApothecary(
  files: readonly string[],
): Promise<StrikeResult> {
  const failures: string[] = [];
  const widest: number = await checkShopOverhangs(files, failures);
  const basilPlacement: Placement = findPlacement('basil');
  const basilOverhang: number = await checkBasilOverhang(
    basilPlacement,
    failures,
  );
  checkPropClearance(failures);
  checkShopDoor(basilPlacement, failures);
  const summary =
    `${APOTHECARY_FILE} and its props reach ${(widest * 1000).toFixed(0)} ` +
    `mm out of their ground at the most, ${BASIL_FILE} ` +
    `${(basilOverhang * 1000).toFixed(0)} mm, the props stand clear of the ` +
    `clover, the spawn points and the course of Toby, and a player walks ` +
    `from the plaza to the door and talks to Basil there`;
  return { summary, failures };
}
