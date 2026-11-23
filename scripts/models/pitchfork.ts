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
 * @module scripts/models/pitchfork Martha's pitchfork, which she fights
 *   with, and which leans against the front wall of her house otherwise.
 */

import { createBox, createCone, createLathe, place } from './geometry.ts';
import type { Shape, Triple } from './geometry.ts';
import { Model } from './model.ts';
import type { BuiltModel } from './rig.ts';

/**
 * How far below where it is gripped the butt of the shaft of the pitchfork
 * ends, in meters: it is gripped near its butt, so that it reaches far.
 */
const PITCHFORK_BUTT = 0.2;

/** The length of the wooden shaft of the pitchfork, in meters. */
const SHAFT_LENGTH = 1.6;

/**
 * How far above where it is gripped the bar across the head of the
 * pitchfork is, in meters, at the top of its shaft.
 */
const HEAD: number = SHAFT_LENGTH - PITCHFORK_BUTT + 0.02;

/**
 * How far the pitchfork leans from upright, back toward the wall it leans
 * against, in degrees: its butt on the floor of the porch of Martha's
 * house, a little more than a quarter of a meter out from the wall, clear
 * of the stone base of the house, and the tips of its tines against the
 * wall.
 */
const LEAN = 8.25;

/** The color of the wood of the shaft. */
const WOOD_COLOR = '#7a5532';

/** The color of the iron of the head. */
const IRON_COLOR = '#5d6166';

/**
 * Lists the parts of the pitchfork, standing upright, with the point where
 * it is gripped at the origin: the long wooden shaft, an iron collar where
 * it meets the head, the bar across the head, and the three long, tapering
 * tines that rise from it.
 *
 * @returns {[string, Shape][]} Each part, with the name of its material,
 *   `wood` or `iron`.
 */
function listParts(): [string, Shape][] {
  const parts: [string, Shape][] = [
    [
      'wood',
      place(
        createLathe(
          [
            [0, 0],
            [0.017, 0],
            [0.017, SHAFT_LENGTH],
            [0, SHAFT_LENGTH],
          ],
          6,
        ),
        { pos: [0, -PITCHFORK_BUTT, 0] },
      ),
    ],
    [
      'iron',
      place(createCone(0.024, 0.02, 0.07, 6), { pos: [0, HEAD - 0.08, 0] }),
    ],
    ['iron', place(createBox(0.17, 0.025, 0.022), { pos: [0, HEAD, 0] })],
  ];
  for (const x of [-0.075, 0, 0.075]) {
    parts.push([
      'iron',
      place(createCone(0.011, 0.002, 0.3, 5), { pos: [x, HEAD + 0.01, 0] }),
    ]);
  }
  return parts;
}

/**
 * Adds the pitchfork to a model, in its materials `wood` and `iron`,
 * attached to a bone, level, with its tines forward, toward +Z, and the
 * point where it is gripped at a point of the model.
 *
 * @param {Model} model - The model, which defines neither material yet.
 * @param {string} bone - The bone the pitchfork follows.
 * @param {Triple} grip - Where it is gripped, in model space at rest.
 */
export function addPitchfork(model: Model, bone: string, grip: Triple): void {
  model.setMaterial('wood', WOOD_COLOR);
  model.setMaterial('iron', IRON_COLOR, { roughness: 0.5, metallic: 0.4 });
  for (const [material, shape] of listParts()) {
    model.add(material, place(shape, { pos: grip, rot: [90, 0, 0] }), bone);
  }
}

/**
 * Builds the pitchfork as it leans against the front wall of Martha's
 * house, while she does not hold it: its butt on the ground, and its head
 * leaning back, toward -Z, against the wall, with no tilt to either side,
 * and with the middle of the ground it stands over at the origin.
 *
 * @returns {BuiltModel} The model.
 */
export function buildPropPitchfork(): BuiltModel {
  const model = new Model('PropPitchfork');
  model.setMaterial('wood', WOOD_COLOR);
  model.setMaterial('iron', IRON_COLOR, { roughness: 0.5, metallic: 0.4 });
  for (const [material, shape] of listParts()) {
    model.add(
      material,
      place(place(shape, { pos: [0, PITCHFORK_BUTT + 0.004, 0] }), {
        rot: [-LEAN, 0, 0],
      }),
    );
  }
  model.centerFootprint();
  return { model };
}

/**
 * Builds the pitchfork as it lies on the ground where Martha has dropped
 * it, beaten: flat, its tines forward, toward +Z, with the middle of the
 * ground it lies on at the origin.
 *
 * @returns {BuiltModel} The model.
 */
export function buildPropPitchforkLying(): BuiltModel {
  const model = new Model('PropPitchforkLying');
  model.setMaterial('wood', WOOD_COLOR);
  model.setMaterial('iron', IRON_COLOR, { roughness: 0.5, metallic: 0.4 });
  for (const [material, shape] of listParts()) {
    model.add(material, place(shape, { rot: [90, 0, 0] }));
  }
  model.centerFootprint();
  return { model };
}
