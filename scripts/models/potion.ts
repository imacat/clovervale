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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/20
// AI assistance: Claude Code (Anthropic)

/**
 * @module scripts/models/potion The healing potion from a barrel of the
 *   cave, as it stands on the ground once put down.
 */

import { createLathe } from './geometry.ts';
import type { Pair } from './geometry.ts';
import { Model } from './model.ts';
import type { BuiltModel } from './rig.ts';

/** The number of sides of the bottle and its cork. */
const SIDES = 10;

/**
 * The outline of the lower part of the round belly of the bottle, drawn in
 * the red of the liquid it holds, as [radius, height] pairs in metres, from
 * the middle of its bottom up to where the glass above it starts.
 */
const LIQUID_PROFILE: readonly Pair[] = [
  [0, 0],
  [0.045, 0],
  [0.07, 0.03],
  [0.078, 0.06],
  [0.074, 0.085],
];

/**
 * The outline of the glass above the liquid, as [radius, height] pairs in
 * metres: the shoulder of the belly, the narrow neck and the lip round its
 * mouth.
 */
const GLASS_PROFILE: readonly Pair[] = [
  [0.074, 0.085],
  [0.06, 0.115],
  [0.032, 0.135],
  [0.022, 0.145],
  [0.022, 0.19],
  [0.028, 0.193],
  [0.028, 0.2],
  [0, 0.2],
];

/**
 * The outline of the cork that stops the mouth of the bottle, as
 * [radius, height] pairs in metres, a little wider at its top.
 */
const CORK_PROFILE: readonly Pair[] = [
  [0, 0.2],
  [0.02, 0.2],
  [0.023, 0.235],
  [0, 0.235],
];

/**
 * Builds the healing potion, standing on the ground: a small round bottle
 * of red liquid with a narrow neck of pale glass, stopped with a cork.
 *
 * @returns {BuiltModel} The model.
 */
export function buildItemHealingPotion(): BuiltModel {
  const model = new Model('ItemHealingPotion');
  model.setMaterial('liquid', '#c81e32', { roughness: 0.3 });
  model.setMaterial('glass', '#cfe3e8', { roughness: 0.15 });
  model.setMaterial('cork', '#b0844f');
  model.add('liquid', createLathe(LIQUID_PROFILE, SIDES));
  model.add('glass', createLathe(GLASS_PROFILE, SIDES));
  model.add('cork', createLathe(CORK_PROFILE, SIDES));
  model.centreFootprint();
  return { model };
}
