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
 * @module scripts/models/gear The sword and the leather armour from the
 *   chests of the cave, as they lie on the ground once put down.
 */

import { createSword } from './buildings.ts';
import { createBox, createExtrusion, place } from './geometry.ts';
import type { Pair, Shape } from './geometry.ts';
import { getItem } from './items.ts';
import { Model } from './model.ts';
import type { BuiltModel } from './rig.ts';

/**
 * The materials of the sword, by the names the sword of the weapon shop
 * gives them.
 */
const SWORD_MATERIALS: Readonly<Record<string, string>> = {
  steel: 'steel',
  gold: 'brass',
  door: 'grip',
};

/**
 * The outline of the leather armour, seen from the front, in metres from
 * its middle: cut low at the neck, round at the arms, and down to the
 * waist.
 */
const ARMOUR_OUTLINE: readonly Pair[] = [
  [-0.12, 0.26],
  [-0.055, 0.26],
  [-0.033, 0.21],
  [0, 0.2],
  [0.033, 0.21],
  [0.055, 0.26],
  [0.12, 0.26],
  [0.23, 0.18],
  [0.2, 0.065],
  [0.165, 0.055],
  [0.155, 0.01],
  [0.155, -0.23],
  [0.09, -0.26],
  [0, -0.265],
  [-0.09, -0.26],
  [-0.155, -0.23],
  [-0.155, 0.01],
  [-0.165, 0.055],
  [-0.2, 0.065],
  [-0.23, 0.18],
];

/**
 * Builds the sword, as it lies on the ground on the flat of its blade: the
 * same sword as those in the barrel of the weapon shop, its point towards
 * +Z.
 *
 * @returns {BuiltModel} The model.
 */
export function buildItemSword(): BuiltModel {
  const model = new Model('ItemSword');
  model.setMaterial('steel', '#dfe6ee', { roughness: 0.35, metallic: 0.4 });
  model.setMaterial('brass', '#c99a45', { roughness: 0.5, metallic: 0.4 });
  model.setMaterial('grip', '#5a3a22');
  for (const [material, shape] of createSword(0.62)) {
    model.add(
      SWORD_MATERIALS[material] ?? material,
      place(shape, { rot: [90, 0, 0] }),
    );
  }
  model.centreFootprint();
  return { model };
}

/**
 * Builds the leather armour for the upper body, as it lies on its back on
 * the ground: a front of stiff leather over a darker back, laced up its
 * middle, belted at its waist with a brass buckle, and with a strap over
 * either shoulder, its neck towards -Z.
 *
 * @returns {BuiltModel} The model.
 */
export function buildItemLeatherArmour(): BuiltModel {
  const model = new Model('ItemLeatherArmour');
  model.setMaterial('leather', '#a06a3c');
  model.setMaterial('leatherDark', '#6e4426');
  model.setMaterial('lace', '#e2cca0');
  model.setMaterial('brass', '#c99a45', { roughness: 0.5, metallic: 0.4 });
  const lie = (shape: Shape, height: number): Shape =>
    place(shape, { pos: [0, height, 0], rot: [-90, 0, 0] });
  model.add('leatherDark', lie(createExtrusion(ARMOUR_OUTLINE, 0.03), 0.015));
  model.add(
    'leather',
    lie(
      place(createExtrusion(ARMOUR_OUTLINE, 0.04), { scale: [0.94, 0.95, 1] }),
      0.045,
    ),
  );
  // The belt across the waist, and its buckle.
  model.add(
    'leatherDark',
    lie(place(createBox(0.32, 0.045, 0.012), { pos: [0, -0.17, 0] }), 0.07),
  );
  model.add(
    'brass',
    lie(place(createBox(0.05, 0.055, 0.014), { pos: [0, -0.17, 0] }), 0.078),
  );
  // The lacing up the middle.
  for (let index = 0; index < 5; index++) {
    model.add(
      'lace',
      lie(
        place(createBox(0.045, 0.012, 0.008), {
          pos: [0, 0.14 - index * 0.055, 0],
          rot: [0, 0, index % 2 === 0 ? 25 : -25],
        }),
        0.068,
      ),
    );
  }
  // The straps over the shoulders.
  for (const side of [-1, 1]) {
    const [x, y] = getItem(ARMOUR_OUTLINE, side < 0 ? 0 : 6);
    model.add(
      'leatherDark',
      lie(
        place(createBox(0.05, 0.08, 0.01), {
          pos: [x + side * 0.02, y - 0.03, 0],
          rot: [0, 0, side * 28],
        }),
        0.07,
      ),
    );
  }
  model.centreFootprint();
  return { model };
}
