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
 * @module scripts/check-models/chief Checks that the face of the chief on
 *   the porch of her house is seen from the plaza.
 */

import { Raycaster, Vector3 } from 'three';
import type { AnimationClip, AnimationMixer, Object3D } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

import {
  VILLAGE_PLACEMENTS,
  findPlacement,
  placePoint,
} from '@clovervale/shared';
import type { GroundVector, ModelId } from '@clovervale/shared';
import { MODEL_FILES } from '../../packages/client/src/model-catalog.ts';

import type { StrikeResult } from './constants.ts';
import { CHIEF_FILE } from './files.ts';
import {
  listMaterialVertices,
  loadAt,
  poseModel,
  resetModel,
} from './pose.ts';

/**
 * The models that stand around the porch of the house of the chief, any of
 * which could hide her face: the house, with the posts, the banner and the
 * roof of its porch, the low wall of its yard, and the old well.
 */
const PORCH_SURROUNDINGS: readonly ModelId[] = [
  'chief-house',
  'yard-wall',
  'yard-wall-end',
  'old-well',
];
/**
 * The materials of the face of the chief, which must be seen, and what
 * they are.
 */
const FACE_PARTS: readonly (readonly [material: string, part: string])[] = [
  ['eye', 'eyes'],
  ['mouth', 'mouth'],
];
/** The height of the eyes of a player, in meters. */
const PLAYER_EYE_HEIGHT = 1.3;
/**
 * Where the camera starts from a player, in meters: up, and back toward
 * +Z.
 */
const CAMERA_OFFSET: readonly [up: number, back: number] = [7.5, 13];
/**
 * Where a player coming from the plaza stands in front of the porch of the
 * house of the chief, as the model of the house has it.
 */
const BEFORE_PORCH: GroundVector = { x: 0, z: 6.25 };
/**
 * Where a player stands at the rim of the fountain on the side of the
 * spawn points, to drink from it, as the model of the fountain has it.
 */
const AT_FOUNTAIN: GroundVector = { x: 0, z: 2.6 };
/** How many times in her idle clip the face of the chief is looked at. */
const SIGHT_SAMPLES = 12;

/**
 * Lists the points the face of the chief is looked at from: the eyes of a
 * player in front of her porch, and the camera as it starts behind that
 * player and behind a player at the fountain.
 *
 * @returns {[string, Vector3][]} What each point is, and where it is.
 */
function listChiefViewpoints(): [string, Vector3][] {
  const before: GroundVector = placePoint(
    findPlacement('chief-house'),
    BEFORE_PORCH,
  );
  const fountain: GroundVector = placePoint(
    findPlacement('fountain'),
    AT_FOUNTAIN,
  );
  const [up, back] = CAMERA_OFFSET;
  return [
    [
      'a player in front of the porch',
      new Vector3(before.x, PLAYER_EYE_HEIGHT, before.z),
    ],
    [
      'the camera behind a player in front of the porch',
      new Vector3(before.x, up, before.z + back),
    ],
    [
      'the camera behind a player at the fountain',
      new Vector3(fountain.x, up, fountain.z + back),
    ],
  ];
}

/**
 * Loads the models around the porch of the house of the chief, each
 * standing in every place the village has for it.
 *
 * @param {readonly string[]} files - The file names of the models there
 *   are.
 * @returns {Promise<Object3D[]>} The models there are, standing in their
 *   places.
 */
async function loadPorchSurroundings(
  files: readonly string[],
): Promise<Object3D[]> {
  const roots: Object3D[] = [];
  for (const model of PORCH_SURROUNDINGS.filter((id: ModelId) =>
    files.includes(MODEL_FILES[id]),
  )) {
    for (const placement of VILLAGE_PLACEMENTS) {
      if (placement.model === model) {
        roots.push((await loadAt(placement)).scene);
      }
    }
  }
  return roots;
}

/**
 * Checks that the face of the chief on the porch of her house is seen from
 * the plaza, as the village stands them: that from each point listed by
 * {@link listChiefViewpoints}, neither her house, with the posts, the
 * banner and the roof of its porch, nor the wall of the yard nor the well
 * stands in front of two points of her face, one between her eyes and one
 * at her mouth, each the mean of the vertices of its material, at each of
 * {@link SIGHT_SAMPLES} evenly spaced moments of her idle clip.  The check
 * fails if she has no idle clip, or no vertices of the material of her
 * eyes or of her mouth.
 *
 * @param {readonly string[]} files - The file names of the models there
 *   are.
 * @returns {Promise<StrikeResult>} The outcome.
 */
export async function checkChiefInSight(
  files: readonly string[],
): Promise<StrikeResult> {
  const chief: GLTF = await loadAt(findPlacement('martha'));
  const clip: AnimationClip | undefined = chief.animations.find(
    (candidate: AnimationClip) => candidate.name === 'Idle',
  );
  if (clip === undefined) {
    return { summary: '', failures: [`${CHIEF_FILE} does not idle`] };
  }
  const faceless: string[] = FACE_PARTS.filter(
    ([material]: readonly [string, string]) =>
      listMaterialVertices(chief.scene, material).length === 0,
  ).map(
    ([material, part]: readonly [string, string]) =>
      `${CHIEF_FILE} has no vertices of the material "${material}" of ` +
      `her ${part}, so whether they are seen cannot be checked`,
  );
  if (faceless.length > 0) {
    return { summary: '', failures: faceless };
  }
  const surroundings: Object3D[] = await loadPorchSurroundings(files);
  const raycaster = new Raycaster();
  const hidden = new Set<string>();
  for (let k = 0; k < SIGHT_SAMPLES; k++) {
    const mixer: AnimationMixer = poseModel(
      chief,
      clip,
      (clip.duration * k) / SIGHT_SAMPLES,
    );
    for (const [material, part] of FACE_PARTS) {
      const points: Vector3[] = listMaterialVertices(chief.scene, material);
      const middle = new Vector3();
      for (const point of points) {
        middle.add(point);
      }
      middle.divideScalar(points.length);
      for (const [name, viewpoint] of listChiefViewpoints()) {
        const way: Vector3 = new Vector3().subVectors(middle, viewpoint);
        const distance: number = way.length();
        raycaster.set(viewpoint, way.normalize());
        raycaster.far = distance;
        if (raycaster.intersectObjects(surroundings, true).length > 0) {
          hidden.add(`the ${part} of ${CHIEF_FILE} from ${name}`);
        }
      }
    }
    resetModel(chief, mixer);
  }
  const failures: string[] = [...hidden].map(
    (what: string) => `something hides ${what}`,
  );
  const summary =
    `the face of ${CHIEF_FILE} on the porch is ` +
    (failures.length === 0 ? 'seen from the plaza' : 'hidden from the plaza');
  return { summary, failures };
}
