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
 * @module scripts/models/apothecary-props What stands around the front
 *   of the apothecary: the herb rack, a crate of potion bottles, a crate
 *   planted with herbs, a potted plant and a barrel.
 */

import {
  createBlob,
  createBlock,
  createBox,
  createCone,
  createEllipsoid,
  createLathe,
  place,
} from './geometry.ts';
import type { Pair, Triple } from './geometry.ts';
import { getItem } from './items.ts';
import { Model } from './model.ts';
import type { BuiltModel } from './rig.ts';

/** The colors of the herbs that grow in the pots and the crates. */
const HERB_COLORS: Readonly<Record<string, string>> = {
  herbA: '#4f9a45',
  herbB: '#7cb64e',
  herbC: '#3f7f5a',
};

/** The names of the materials of the herbs, in the order they are used. */
const HERB_MATERIALS: readonly string[] = Object.keys(HERB_COLORS);

/**
 * The outline of a small clay pot of herbs, as [radius, height] pairs in
 * meters: narrow at its foot, flaring to a thick rim.
 */
const HERB_POT_PROFILE: readonly Pair[] = [
  [0, 0],
  [0.055, 0],
  [0.072, 0.1],
  [0.082, 0.1],
  [0.082, 0.125],
  [0, 0.125],
];

/**
 * The outline of the belly of a potion bottle, drawn in the color of what
 * it holds, as [radius, height] pairs in meters, from the middle of its
 * bottom up.
 */
const POTION_LIQUID_PROFILE: readonly Pair[] = [
  [0, 0],
  [0.04, 0],
  [0.062, 0.027],
  [0.069, 0.053],
  [0.066, 0.076],
];

/**
 * The outline of the glass of a potion bottle above what it holds, as
 * [radius, height] pairs in meters: the shoulder, the neck and the lip.
 */
const POTION_BOTTLE_PROFILE: readonly Pair[] = [
  [0.066, 0.076],
  [0.053, 0.102],
  [0.028, 0.12],
  [0.02, 0.13],
  [0.02, 0.17],
  [0.025, 0.173],
  [0.025, 0.178],
  [0, 0.178],
];

/** The outline of the cork of a potion bottle, as [radius, height] pairs. */
const POTION_CORK_PROFILE: readonly Pair[] = [
  [0, 0.178],
  [0.018, 0.178],
  [0.021, 0.21],
  [0, 0.21],
];

/** The outline of a barrel, as [radius, height] pairs in meters. */
const BARREL_PROFILE: readonly Pair[] = [
  [0, 0],
  [0.3, 0],
  [0.37, 0.4],
  [0.3, 0.8],
  [0.24, 0.8],
  [0.24, 0.72],
  [0, 0.72],
];

/**
 * Defines the materials of the herbs.
 *
 * @param {Model} model - The model.
 */
function setHerbMaterials(model: Model): void {
  for (const [name, color] of Object.entries(HERB_COLORS)) {
    model.setMaterial(name, color);
  }
}

/**
 * Finds the material of the herb of a number, the materials taking turns.
 *
 * @param {number} index - The number.
 * @returns {string} The name of the material.
 */
function findHerbMaterial(index: number): string {
  return getItem(HERB_MATERIALS, index % HERB_MATERIALS.length);
}

/**
 * Adds an open wooden crate, standing on the ground about the origin, its
 * planks marked by darker seams.
 *
 * @param {Model} model - The model, with the materials `crate` and
 *   `crateDark` defined.
 * @param {Triple} size - Its width, height and depth, outside.
 */
function addCrate(model: Model, size: Triple): void {
  const [width, height, depth] = size;
  const plank = 0.03;
  for (const side of [-1, 1]) {
    model.add(
      'crate',
      place(createBlock(width, height, plank), {
        pos: [0, 0, side * (depth - plank) * 0.5],
      }),
    );
    model.add(
      'crate',
      place(createBlock(plank, height, depth - 2 * plank), {
        pos: [side * (width - plank) * 0.5, 0, 0],
      }),
    );
    model.add(
      'crateDark',
      place(createBox(width - 0.01, 0.012, plank + 0.004), {
        pos: [0, height * 0.5, side * (depth - plank) * 0.5],
      }),
    );
  }
  model.add(
    'crate',
    createBlock(width - 2 * plank, plank, depth - 2 * plank),
  );
}

/**
 * Builds the herb rack of the apothecary, which stands in front of the
 * front window, about two meters wide: a wooden frame of three shelves of
 * small clay pots of herbs, with a post in its middle, and bunches of dried
 * herbs hung upside down from a bar across the front of its top.  Its
 * front faces +Z.
 *
 * @returns {BuiltModel} The model.
 */
export function buildHerbRack(): BuiltModel {
  const model = new Model('HerbRack');
  model.setMaterial('frame', '#8a5530');
  model.setMaterial('shelf', '#b98045');
  model.setMaterial('pot', '#c46a3c');
  model.setMaterial('twine', '#d8c08a');
  model.setMaterial('driedA', '#a3a35a');
  model.setMaterial('driedB', '#b8894a');
  model.setMaterial('lavender', '#9a80d4');
  setHerbMaterials(model);
  const width = 2.08;
  const depth = 0.4;
  const post = 0.06;
  const height = 1.9;
  const posts: readonly number[] = [-(width - post) / 2, 0, (width - post) / 2];
  for (const x of posts) {
    for (const z of [-1, 1]) {
      model.add(
        'frame',
        place(createBlock(post, height, post), {
          pos: [x, 0, z * (depth - post) * 0.5],
        }),
      );
    }
    model.add(
      'frame',
      place(createBox(post, post, depth), {
        pos: [x, height - post * 0.5, 0],
      }),
    );
  }
  for (const z of [-1, 1]) {
    model.add(
      'frame',
      place(createBox(width, post, post), {
        pos: [0, height - post * 0.5, z * (depth - post) * 0.5],
      }),
    );
  }
  const shelves: readonly number[] = [0.3, 0.75, 1.2];
  const pots: readonly number[] = [-0.85, -0.55, -0.25, 0.25, 0.55, 0.85];
  shelves.forEach((y: number, row: number) => {
    model.add(
      'shelf',
      place(createBlock(width, 0.035, depth), { pos: [0, y, 0] }),
    );
    pots.forEach((x: number, i: number) => {
      const index: number = row * pots.length + i;
      const top: number = y + 0.035 + 0.125;
      const at: number = x + (row === 1 ? 0.04 : 0);
      model.add(
        'pot',
        place(createLathe(HERB_POT_PROFILE, 8), {
          pos: [at, y + 0.035, -0.03],
        }),
      );
      model.add(
        findHerbMaterial(index),
        index % 4 === 3
          ? place(createEllipsoid([0.05, 0.12, 0.05], 0), {
              pos: [at, top + 0.08, -0.03],
            })
          : place(createBlob(0, 300 + index, 0.2), {
              pos: [at, top + 0.04, -0.03],
              scale: [0.085, 0.075, 0.085],
            }),
      );
    });
  });
  // The bunches of dried herbs, hung upside down on twine from the bar
  // across the front of the top.
  const bunches: readonly (readonly [number, string])[] = [
    [-0.87, 'driedA'],
    [-0.58, 'lavender'],
    [-0.29, 'driedB'],
    [0.29, 'driedA'],
    [0.58, 'lavender'],
    [0.87, 'driedB'],
  ];
  const bar: number = (depth - post) * 0.5;
  for (const [x, material] of bunches) {
    model.add(
      'twine',
      place(createBox(0.012, 0.1, 0.012), {
        pos: [x, height - post - 0.05, bar],
      }),
    );
    model.add(
      'twine',
      place(createEllipsoid([0.022, 0.018, 0.022], 0), {
        pos: [x, height - post - 0.1, bar],
      }),
    );
    model.add(
      material,
      place(createCone(0.065, 0.016, 0.22, 6), {
        pos: [x, height - post - 0.32, bar],
      }),
    );
  }
  model.centerFootprint();
  return { model };
}

/**
 * Builds the crate of potion bottles of the apothecary: an open wooden
 * crate bedded with straw, in which stand six corked bottles, most of them
 * red with healing potion.
 *
 * @returns {BuiltModel} The model.
 */
export function buildPotionCrate(): BuiltModel {
  const model = new Model('PotionCrate');
  model.setMaterial('crate', '#b98045');
  model.setMaterial('crateDark', '#7a4f2a');
  model.setMaterial('straw', '#e2c46a');
  model.setMaterial('bottle', '#cfe3e8', { roughness: 0.15 });
  model.setMaterial('cork', '#b0844f');
  model.setMaterial('red', '#c81e32', { roughness: 0.3 });
  model.setMaterial('blue', '#3a7bd5', { roughness: 0.3 });
  model.setMaterial('green', '#4fae5a', { roughness: 0.3 });
  const size: Triple = [0.5, 0.2, 0.36];
  addCrate(model, size);
  model.add(
    'straw',
    place(createBlock(size[0] - 0.06, 0.1, size[2] - 0.06), {
      pos: [0, 0.03, 0],
    }),
  );
  const liquids: readonly string[] = [
    'red',
    'red',
    'blue',
    'red',
    'green',
    'red',
  ];
  liquids.forEach((liquid: string, index: number) => {
    const column: number = index % 3;
    const row: number = Math.floor(index / 3);
    const pos: Triple = [(column - 1) * 0.14, 0.12, (row - 0.5) * 0.15];
    model.add(liquid, place(createLathe(POTION_LIQUID_PROFILE, 8), { pos }));
    model.add('bottle', place(createLathe(POTION_BOTTLE_PROFILE, 8), { pos }));
    model.add('cork', place(createLathe(POTION_CORK_PROFILE, 8), { pos }));
  });
  model.centerFootprint();
  return { model };
}

/**
 * Builds the crate planted with herbs of the apothecary: an open wooden
 * crate filled with earth, in which grow two rows of herbs, a few of them
 * in flower.
 *
 * @returns {BuiltModel} The model.
 */
export function buildHerbCrate(): BuiltModel {
  const model = new Model('HerbCrate');
  model.setMaterial('crate', '#a8703d');
  model.setMaterial('crateDark', '#6f4524');
  model.setMaterial('soil', '#5a3e2b');
  model.setMaterial('flower', '#f4e06a');
  setHerbMaterials(model);
  const size: Triple = [0.6, 0.22, 0.4];
  addCrate(model, size);
  model.add(
    'soil',
    place(createBlock(size[0] - 0.06, 0.16, size[2] - 0.06), {
      pos: [0, 0.03, 0],
    }),
  );
  for (let i = 0; i < 8; i++) {
    const x: number = ((i % 4) - 1.5) * 0.14;
    const z: number = (Math.floor(i / 4) - 0.5) * 0.16;
    model.add(
      findHerbMaterial(i + 1),
      place(createBlob(0, 320 + i, 0.15), {
        pos: [x, 0.24, z],
        scale: [0.07, 0.07, 0.065],
      }),
    );
    if (i % 3 === 0) {
      model.add(
        'flower',
        place(createEllipsoid([0.022, 0.018, 0.022], 0), {
          pos: [x + 0.02, 0.32, z + 0.02],
        }),
      );
    }
  }
  model.centerFootprint();
  return { model };
}

/**
 * Builds the potted plant of the apothecary: a round, leafy plant in a
 * big clay pot with a thick rim.
 *
 * @returns {BuiltModel} The model.
 */
export function buildPottedPlant(): BuiltModel {
  const model = new Model('PottedPlant');
  model.setMaterial('pot', '#c46a3c');
  model.setMaterial('potRim', '#a8552d');
  setHerbMaterials(model);
  model.add(
    'pot',
    createLathe(
      [
        [0, 0],
        [0.12, 0],
        [0.15, 0.26],
        [0, 0.26],
      ],
      10,
    ),
  );
  model.add(
    'potRim',
    createLathe(
      [
        [0, 0.25],
        [0.165, 0.25],
        [0.165, 0.31],
        [0, 0.31],
      ],
      10,
    ),
  );
  const lumps: readonly (readonly [number, number, number, number])[] = [
    [0, 0.5, 0, 0.16],
    [0.08, 0.42, 0.06, 0.11],
    [-0.07, 0.44, -0.03, 0.12],
    [0.02, 0.66, -0.02, 0.1],
    [-0.04, 0.4, 0.08, 0.1],
  ];
  lumps.forEach(([x, y, z, r], index: number) => {
    model.add(
      findHerbMaterial(index),
      place(createBlob(1, 340 + index, 0.12), {
        pos: [x, y, z],
        scale: [r, r * 0.9, r],
      }),
    );
  });
  model.centerFootprint();
  return { model };
}

/**
 * Builds a barrel of the apothecary: wooden staves bound by two iron
 * hoops, with a lid sunk a little into its top.
 *
 * @returns {BuiltModel} The model.
 */
export function buildBarrel(): BuiltModel {
  const model = new Model('Barrel');
  model.setMaterial('stave', '#b98045');
  model.setMaterial('lid', '#8f5f33');
  model.setMaterial('hoop', '#4a4d58', { roughness: 0.6 });
  model.add('stave', createLathe(BARREL_PROFILE, 8));
  model.add(
    'lid',
    createLathe(
      [
        [0, 0.72],
        [0.24, 0.72],
        [0.24, 0.73],
        [0, 0.73],
      ],
      8,
    ),
  );
  for (const y of [0.16, 0.62]) {
    model.add(
      'hoop',
      createLathe(
        [
          [0.33, y],
          [0.36, y],
          [0.36, y + 0.07],
          [0.33, y + 0.07],
        ],
        8,
      ),
    );
  }
  model.centerFootprint();
  return { model };
}
