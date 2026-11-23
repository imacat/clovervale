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
 * @module client/figure-copies Making the figures of the players, the
 *   villagers and the monsters, each from a copy of its model, ready to
 *   stand in any map.
 */

import type { Object3D } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

import type { MonsterKindId } from '@clovervale/shared';

import { CHARACTER_FILES, MONSTER_MODELS } from './model-catalogue.ts';
import type { LoadedModel } from './model-loader.ts';
import type { Figure } from './player-figures.ts';

/**
 * Makes a model cast and receive shadows, wherever its animation takes it.
 *
 * @param {Object3D} model - The root of the model.
 */
export function prepareModel(model: Object3D): void {
  model.traverse((node: Object3D) => {
    node.castShadow = true;
    node.receiveShadow = true;
    // An animated model moves out of the bounds of its resting pose.
    node.frustumCulled = false;
  });
}

/**
 * Makes a copy of a model to show a figure with, ready to stand in any map.
 *
 * @param {readonly LoadedModel[]} models - The models.
 * @param {string | undefined} file - The file name of the model.
 * @returns {Figure | null} A copy of the model, or `null` if the model is
 *   not among the models.
 */
function copyFigure(
  models: readonly LoadedModel[],
  file: string | undefined,
): Figure | null {
  const model: LoadedModel | undefined = models.find(
    (candidate: LoadedModel) => candidate.file === file,
  );
  if (model === undefined) {
    return null;
  }
  const root: Object3D = clone(model.root);
  prepareModel(root);
  return { root, clips: model.clips };
}

/**
 * Makes a model to show a player with, ready to stand in any map.
 *
 * @param {readonly LoadedModel[]} models - The models.
 * @param {number} appearance - The number of the appearance of the player,
 *   from 1.
 * @returns {Figure | null} A copy of the character of that appearance, or
 *   `null` if that character is not among the models.
 */
export function createPlayerFigure(
  models: readonly LoadedModel[],
  appearance: number,
): Figure | null {
  return copyFigure(models, CHARACTER_FILES[appearance - 1]);
}

/**
 * Makes a model to show a villager who goes about its map with, ready to
 * stand in it.
 *
 * @param {readonly LoadedModel[]} models - The models.
 * @param {string} file - The file name of the model of the villager.
 * @returns {Figure | null} A copy of the model, or `null` if the model is
 *   not among the models.
 */
export function createVillagerFigure(
  models: readonly LoadedModel[],
  file: string,
): Figure | null {
  return copyFigure(models, file);
}

/**
 * Makes a model to show a monster with, ready to stand in any map, as
 * {@link MONSTER_MODELS} tells for its kind.
 *
 * @param {readonly LoadedModel[]} models - The models.
 * @param {MonsterKindId} kind - The kind of the monster.
 * @returns {Figure | null} A copy of the model of the kind, or `null` if
 *   that model is not among the models.
 */
export function createMonsterFigure(
  models: readonly LoadedModel[],
  kind: MonsterKindId,
): Figure | null {
  return copyFigure(models, MONSTER_MODELS[kind].file);
}
