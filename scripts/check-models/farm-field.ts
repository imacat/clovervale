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
 * @module scripts/check-models/farm-field Checks the farm fields behind
 *   the houses, as the village lays them out.
 */

import { Raycaster, Vector3 } from 'three';
import type { Intersection, Object3D } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

import {
  FARM_FIELDS,
  FARM_FIELD_IDS,
  FIELD_BED_WIDTH,
  FIELD_FLOOR_HEIGHT,
  PLAYER_RADIUS,
  VILLAGE_TERRAIN,
  findPlacement,
  placePoint,
} from '@clovervale/shared';
import type {
  FarmFieldId,
  GroundVector,
  Placement,
} from '@clovervale/shared';
import { MODEL_FILES } from '../../packages/client/src/model-catalog.ts';

import { FOOTPRINT_TOLERANCE } from './constants.ts';
import type { StrikeResult } from './constants.ts';
import { isMesh, loadAt, measureOverhang } from './pose.ts';

/**
 * The heights between which every vertex of a farm field must lie within
 * the ground it takes up, in meters: all of them above its bare earth, so
 * that nothing but that earth lies in the lanes where players walk and
 * items lie.
 */
const FIELD_HEIGHTS: readonly [number, number] = [
  FIELD_FLOOR_HEIGHT + 1e-6,
  Infinity,
];

/**
 * The materials of the fence of a field, which may stand between the
 * camera and what is in the field, as any fence of the village may.
 */
const FENCE_MATERIALS: ReadonlySet<string> = new Set(['post', 'rail']);

/**
 * How high above the bare earth of a field the top of the flattest item
 * lying on it is, in meters: a lying four-leaf clover, or Edwin's message.
 */
const ITEM_TOP: number = FIELD_FLOOR_HEIGHT + 0.02;

/**
 * The angle at which the camera looks down at a player when it starts
 * out, in degrees: from 7.5 m up and 13 m back.
 */
const CAMERA_ELEVATION: number = (Math.atan2(7.5, 13) * 180) / Math.PI;

/** How many ways around a point the camera is looked for from. */
const CAMERA_HEADINGS = 24;

/** The distance between two points of a lane looked at, in meters. */
const LANE_STEP = 0.25;

/**
 * Lists the points of a field where a player may stand and an item may
 * lie: points of its lanes, {@link LANE_STEP} apart, and points along
 * every side of every bed as close as a player can get, where the beds
 * and the crops come closest to hiding them.
 *
 * @param {FarmFieldId} id - The field.
 * @returns {GroundVector[]} The points, in the world.
 */
function listLanePoints(id: FarmFieldId): GroundVector[] {
  const field: Placement = findPlacement(id);
  const { length, width, beds } = FARM_FIELDS[id];
  const local: GroundVector[] = [];
  for (let u = -length / 2; u <= length / 2; u += LANE_STEP) {
    for (let v = -width / 2; v <= width / 2; v += LANE_STEP) {
      local.push({ x: u, z: v });
    }
  }
  const out: number = PLAYER_RADIUS + 1e-3;
  for (const bed of beds) {
    const halfLength: number = bed.length / 2 + out;
    const halfWidth: number = FIELD_BED_WIDTH / 2 + out;
    for (let u = -halfLength; u <= halfLength; u += LANE_STEP) {
      local.push(
        { x: bed.x + u, z: bed.z - halfWidth },
        { x: bed.x + u, z: bed.z + halfWidth },
      );
    }
    for (let v = -halfWidth; v <= halfWidth; v += LANE_STEP) {
      local.push(
        { x: bed.x - halfLength, z: bed.z + v },
        { x: bed.x + halfLength, z: bed.z + v },
      );
    }
  }
  return local
    .map((point: GroundVector) => placePoint(field, point))
    .filter((point: GroundVector) => VILLAGE_TERRAIN.isClear(point));
}

/**
 * Counts the points of the lanes of a field where an item lying on the
 * ground is hidden by the beds or the crops from the camera, as the camera
 * starts out, looking from any direction.
 *
 * @param {GLTF} model - The field, lying in its place.
 * @param {FarmFieldId} id - The field.
 * @returns {readonly [number, number]} The number of points hidden, and of
 *   points looked at.
 */
function countHiddenPoints(
  model: GLTF,
  id: FarmFieldId,
): readonly [number, number] {
  const meshes: Object3D[] = [];
  model.scene.updateMatrixWorld(true);
  model.scene.traverse((node: Object3D) => {
    if (
      isMesh(node) &&
      !Array.isArray(node.material) &&
      !FENCE_MATERIALS.has(node.material.name)
    ) {
      meshes.push(node);
    }
  });
  const points: GroundVector[] = listLanePoints(id);
  const raycaster = new Raycaster();
  const rise: number = Math.sin((CAMERA_ELEVATION * Math.PI) / 180);
  const run: number = Math.cos((CAMERA_ELEVATION * Math.PI) / 180);
  let hidden = 0;
  for (const point of points) {
    const origin = new Vector3(point.x, ITEM_TOP, point.z);
    const isHidden: boolean = Array.from(
      { length: CAMERA_HEADINGS },
      (_, index: number) => (2 * Math.PI * index) / CAMERA_HEADINGS,
    ).some((heading: number) => {
      raycaster.set(
        origin,
        new Vector3(Math.sin(heading) * run, rise, Math.cos(heading) * run),
      );
      const hits: Intersection[] = raycaster.intersectObjects(meshes, false);
      return hits.length > 0;
    });
    if (isHidden) {
      hidden++;
    }
  }
  return [hidden, points.length];
}

/**
 * Checks the farm fields behind the houses, as the village lays them out.
 *
 * Above its bare earth at {@link FIELD_FLOOR_HEIGHT}, each field reaches
 * no more than {@link FOOTPRINT_TOLERANCE} beyond the ground its fence and
 * its beds take up, so that nothing but that earth lies in its lanes,
 * where players walk and items lie, to sink them into it.  And an item
 * lying on the earth anywhere in a lane can be seen over the beds and the
 * crops by the camera as it starts out, looking from any direction.
 *
 * @param {readonly string[]} files - The file names of the models there
 *   are.
 * @returns {Promise<StrikeResult>} The outcome.
 */
export async function checkFarmFields(
  files: readonly string[],
): Promise<StrikeResult> {
  const failures: string[] = [];
  const ids: FarmFieldId[] = FARM_FIELD_IDS.filter((id: FarmFieldId) =>
    files.includes(MODEL_FILES[id]),
  );
  const loaded: (readonly [FarmFieldId, GLTF])[] = await Promise.all(
    ids.map(
      async (id: FarmFieldId) =>
        [id, await loadAt(findPlacement(id))] as const,
    ),
  );
  let widest = 0;
  let looked = 0;
  let unseen = 0;
  for (const [id, model] of loaded) {
    const overhang: number = measureOverhang(
      model.scene,
      findPlacement(id),
      FIELD_HEIGHTS,
    );
    widest = Math.max(widest, overhang);
    if (overhang > FOOTPRINT_TOLERANCE) {
      failures.push(
        `${MODEL_FILES[id]} reaches ${overhang.toFixed(3)} m out of the ` +
          'ground its fence and its beds take up',
      );
    }
    const [hidden, count] = countHiddenPoints(model, id);
    looked += count;
    unseen += hidden;
    if (hidden > 0) {
      failures.push(
        `${MODEL_FILES[id]} hides an item lying in its lanes from the ` +
          `camera at ${String(hidden)} of ${String(count)} points`,
      );
    }
  }
  const summary =
    `the ${String(ids.length)} farm fields reach ` +
    `${(widest * 1000).toFixed(0)} mm out of their fences and beds at the ` +
    `most, and hide an item at ${String(unseen)} of ${String(looked)} ` +
    'points of their lanes';
  return { summary, failures };
}
