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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/21
// AI assistance: Claude Code (Anthropic)

/**
 * @module scripts/models/ointment The jar of ointment Martha gives a player
 *   to take to Toby, as it stands on the ground once put down.
 */

import { createBlock, createLathe, place } from './geometry.ts';
import type { Pair } from './geometry.ts';
import { Model } from './model.ts';
import type { BuiltModel } from './rig.ts';

/** The number of sides of the jar, its cover and the string around it. */
const SIDES = 8;

/**
 * The outline of the jar, as [radius, height] pairs in meters, from the
 * middle of its bottom up: a squat round belly, a short neck and a thick
 * rolled lip around its mouth.
 */
const JAR_PROFILE: readonly Pair[] = [
  [0, 0],
  [0.05, 0],
  [0.07, 0.018],
  [0.08, 0.048],
  [0.078, 0.078],
  [0.062, 0.1],
  [0.046, 0.11],
  [0.046, 0.116],
  [0.055, 0.12],
  [0.055, 0.13],
  [0, 0.13],
];

/**
 * The outline of the band of darker clay around the shoulder of the jar,
 * raised slightly above its surface, as [radius, height] pairs in meters.
 */
const BAND_PROFILE: readonly Pair[] = [
  [0.074, 0.082],
  [0.08, 0.082],
  [0.075, 0.092],
  [0.068, 0.092],
  [0.074, 0.082],
];

/**
 * The outline of the cloth tied over the mouth of the jar, as
 * [radius, height] pairs in meters: a skirt hanging over the lip, flaring
 * a little at its hem, and a puffed top.
 */
const CLOTH_PROFILE: readonly Pair[] = [
  [0, 0.104],
  [0.062, 0.104],
  [0.058, 0.114],
  [0.06, 0.13],
  [0.05, 0.142],
  [0.026, 0.148],
  [0, 0.149],
];

/**
 * The outline of the string tied around the neck of the jar over the cloth,
 * as [radius, height] pairs in meters.
 */
const STRING_PROFILE: readonly Pair[] = [
  [0.054, 0.112],
  [0.065, 0.112],
  [0.065, 0.121],
  [0.054, 0.121],
  [0.054, 0.112],
];

/**
 * Builds the jar of Martha's ointment, standing on the ground: a small
 * squat earthenware jar with a band of darker clay around its shoulder, its
 * mouth covered with a cloth tied around the neck with string, knotted at
 * one side with its two ends hanging down.
 *
 * @returns {BuiltModel} The model.
 */
export function buildItemMarthaOintment(): BuiltModel {
  const model = new Model('ItemMarthaOintment');
  model.setMaterial('clay', '#b8653a', { roughness: 0.85 });
  model.setMaterial('band', '#7e3f22', { roughness: 0.85 });
  model.setMaterial('cloth', '#e8dcbc', { roughness: 0.95 });
  model.setMaterial('string', '#6b4a2b', { roughness: 0.9 });
  model.add('clay', createLathe(JAR_PROFILE, SIDES));
  model.add('band', createLathe(BAND_PROFILE, SIDES));
  model.add('cloth', createLathe(CLOTH_PROFILE, SIDES));
  model.add('string', createLathe(STRING_PROFILE, SIDES));
  model.add(
    'string',
    place(createBlock(0.016, 0.016, 0.016), { pos: [0.066, 0.108, 0] }),
  );
  for (const [z, turn] of [
    [-0.006, -14],
    [0.006, 14],
  ] as const) {
    model.add(
      'string',
      place(createBlock(0.007, 0.026, 0.007), {
        pos: [0.073, 0.088, z],
        rot: [turn, 0, 0],
      }),
    );
  }
  model.centerFootprint();
  return { model };
}
