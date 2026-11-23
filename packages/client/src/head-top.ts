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
 * @module client/head-top Where the top of the head of a villager or a
 *   player is, for a speech bubble to stand above.
 */

import { Box3, Vector3 } from 'three';
import type { Object3D } from 'three';

import { locateVillager } from '@clovervale/shared';
import type { MonsterState, Villager } from '@clovervale/shared';

/** The height of the top of a villager whose model is missing, in metres. */
const DEFAULT_HEAD_TOP = 1.8;

/**
 * Finds the top of the head of a villager, where it stands in its map at a
 * step of the simulation.
 *
 * @param {Villager} villager - The villager.
 * @param {Object3D | null} root - The root of the model of the villager,
 *   as it stands in its map, or `null` if it has no model.
 * @param {number} step - The number of the step, which may fall between
 *   two steps.
 * @param {readonly MonsterState[]} monsters - The monsters of its map, as
 *   they are shown, which tell where a villager who fights as a monster
 *   stands.
 * @returns {Vector3} The point above where the villager stands at the
 *   height of the top of its model, or at a usual height without one.
 */
export function findHeadTop(
  villager: Villager,
  root: Object3D | null,
  step: number,
  monsters: readonly MonsterState[],
): Vector3 {
  const { x, z } = locateVillager(villager, step, monsters);
  const top: number =
    root === null ? NaN : new Box3().setFromObject(root).max.y;
  return new Vector3(x, Number.isFinite(top) ? top : DEFAULT_HEAD_TOP, z);
}

/**
 * Finds the top of the head of a player as it is shown.
 *
 * @param {Object3D} root - The root of the model of the player, where it
 *   stands.
 * @returns {Vector3} The point above where the player stands at the height
 *   of the top of its model, with whatever is shown above it.
 */
export function findFigureTop(root: Object3D): Vector3 {
  return new Vector3(
    root.position.x,
    new Box3().setFromObject(root).max.y,
    root.position.z,
  );
}
