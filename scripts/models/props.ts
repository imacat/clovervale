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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/17
// AI assistance: Claude Code (Anthropic)

/**
 * @module scripts/models/props The optional static scenery.
 */

import type { Vector3 } from 'three';

import {
  createBlob,
  createBlock,
  createBox,
  createCone,
  createEllipsoid,
  createLathe,
  createRandom,
  createTube,
  place,
} from './geometry.ts';
import { getItem } from './items.ts';
import { Model } from './model.ts';
import type { Face } from './model.ts';
import type { BuiltModel } from './rig.ts';

/** A lump of leaves: its centre, its radius and its material. */
type Lump = readonly [number, number, number, number, string];

/**
 * Flattens whatever reaches below the ground onto the ground.
 *
 * @param {Model} model - The model.
 */
function flattenUnderside(model: Model): void {
  for (const { point } of model.listCorners()) {
    point.y = Math.max(point.y, 0);
  }
}

/**
 * Builds the great tree that stands in the middle of the town.
 *
 * @returns {BuiltModel} The model.
 */
export function buildGreatTree(): BuiltModel {
  const model = new Model('GreatTree');
  model.setMaterial('bark', '#a5633a');
  model.setMaterial('barkDark', '#8a4f2e');
  model.setMaterial('leafA', '#a9c940');
  model.setMaterial('leafB', '#7fb23c');
  model.setMaterial('leafC', '#c6d24e');
  model.add(
    'bark',
    createLathe(
      [
        [0, 0],
        [1.75, 0],
        [1.2, 0.8],
        [0.92, 2.2],
        [0.82, 3.6],
        [1.0, 4.9],
        [0, 5.2],
      ],
      8,
    ),
  );
  for (let i = 0; i < 6; i++) {
    const turn: number = i * 60 + 20;
    model.add(
      i % 2 ? 'bark' : 'barkDark',
      place(
        createTube(
          [
            [0, 1.5, 0.75],
            [0, 0.55, 1.5],
            [0, 0.12, 2.35],
            [0, 0, 2.9],
          ],
          [
            [0.36, 0.36],
            [0.4, 0.34],
            [0.3, 0.2],
            [0.14, 0.05],
          ],
          5,
          [0, 1, 0],
        ),
        { rot: [0, turn, 0] },
      ),
    );
  }
  const crowns: Lump[] = [
    [0, 9.3, -0.2, 2.9, 'leafA'],
    [-2.9, 7.6, 0.5, 2.4, 'leafB'],
    [3.0, 7.9, 0.2, 2.5, 'leafC'],
    [-1.3, 6.9, 2.1, 2.2, 'leafC'],
    [1.7, 6.6, 2.2, 2.1, 'leafB'],
    [0.2, 7.7, -2.5, 2.5, 'leafB'],
    [-4.0, 6.0, -0.8, 1.8, 'leafA'],
    [4.1, 6.1, -0.7, 1.9, 'leafA'],
    [-2.4, 9.0, -1.2, 1.9, 'leafC'],
    [2.2, 9.4, -1.0, 1.8, 'leafB'],
  ];
  crowns.forEach(([x, y, z, r, material]: Lump, index: number) => {
    model.add(
      material,
      place(createBlob(1, 100 + index, 0.1), {
        pos: [x, y, z],
        rot: [index * 37, index * 53, 0],
        scale: r,
      }),
    );
    model.add(
      index % 2 ? 'bark' : 'barkDark',
      createTube(
        [
          [x * 0.08, 4.3, z * 0.08],
          [x * 0.5, 4.6 + (y - 4.6) * 0.55, z * 0.5],
          [x * 0.9, y - r * 0.3, z * 0.9],
        ],
        [0.5, 0.36, 0.22],
        5,
        [0.3, 0, 1],
      ),
    );
  });
  model.centreFootprint();
  return { model };
}

/**
 * Builds a pine tree.
 *
 * @returns {BuiltModel} The model.
 */
export function buildPineTree(): BuiltModel {
  const model = new Model('PineTree');
  model.setMaterial('bark', '#8a5530');
  model.setMaterial('pineA', '#3f8f55');
  model.setMaterial('pineB', '#327a4a');
  model.add('bark', createCone(0.2, 0.14, 0.75, 6));
  model.add(
    'pineB',
    place(createCone(1.05, 0.3, 1.25, 6), { pos: [0, 0.6, 0] }),
  );
  model.add(
    'pineA',
    place(createCone(0.82, 0.2, 1.15, 6), {
      pos: [0, 1.5, 0],
      rot: [0, 30, 0],
    }),
  );
  model.add(
    'pineB',
    place(createCone(0.56, 0, 1.2, 6), { pos: [0, 2.35, 0] }),
  );
  model.centreFootprint();
  return { model };
}

/**
 * Builds a cluster of round bushes.
 *
 * @returns {BuiltModel} The model.
 */
export function buildBush(): BuiltModel {
  const model = new Model('Bush');
  model.setMaterial('leafA', '#a9c940');
  model.setMaterial('leafB', '#7fb23c');
  model.setMaterial('leafC', '#c6d24e');
  const lumps: Lump[] = [
    [0, 0.45, 0, 0.62, 'leafA'],
    [0.55, 0.32, 0.2, 0.44, 'leafB'],
    [-0.5, 0.3, 0.25, 0.42, 'leafC'],
    [0.1, 0.3, -0.5, 0.45, 'leafB'],
  ];
  lumps.forEach(([x, y, z, r, material]: Lump, index: number) => {
    model.add(
      material,
      place(createBlob(1, 200 + index, 0.12), {
        pos: [x, y, z],
        scale: [r, r * 0.85, r],
      }),
    );
  });
  for (const [material, faces] of [...model.faces]) {
    model.faces.set(
      material,
      faces.filter(({ tri }: Face) => tri.some((p: Vector3) => p.y > 0)),
    );
  }
  flattenUnderside(model);
  model.centreFootprint();
  return { model };
}

/**
 * Builds a boulder with a smaller stone beside it.
 *
 * @returns {BuiltModel} The model.
 */
export function buildRock(): BuiltModel {
  const model = new Model('Rock');
  model.setMaterial('rock', '#a3a4aa');
  model.setMaterial('rockDark', '#85868e');
  model.add(
    'rock',
    place(createBlob(1, 300, 0.2), {
      pos: [0, 0.3, 0],
      scale: [0.62, 0.45, 0.5],
    }),
  );
  model.add(
    'rockDark',
    place(createBlob(0, 301, 0.2), {
      pos: [0.55, 0.12, 0.3],
      scale: [0.3, 0.22, 0.26],
    }),
  );
  flattenUnderside(model);
  model.centreFootprint();
  return { model };
}

/**
 * Builds a two-metre stretch of wooden fence running along X.
 *
 * @returns {BuiltModel} The model.
 */
export function buildFence(): BuiltModel {
  const model = new Model('Fence');
  model.setMaterial('wood', '#b9763f');
  model.setMaterial('woodDark', '#9a5f33');
  for (const x of [-0.9, 0.9]) {
    model.add(
      'woodDark',
      place(createBlock(0.16, 0.95, 0.16, [0.8, 0.8]), { pos: [x, 0, 0] }),
    );
  }
  model.add(
    'wood',
    place(createBox(2, 0.12, 0.07), {
      pos: [0, 0.68, 0.02],
      rot: [0, 0, 1.5],
    }),
  );
  model.add(
    'wood',
    place(createBox(2, 0.12, 0.07), {
      pos: [0, 0.36, 0.02],
      rot: [0, 0, -1.5],
    }),
  );
  model.centreFootprint();
  return { model };
}

/**
 * Builds a patch of wild flowers.
 *
 * @returns {BuiltModel} The model.
 */
export function buildFlowers(): BuiltModel {
  const model = new Model('Flowers');
  model.setMaterial('stem', '#5fa646');
  model.setMaterial('white', '#ffffff');
  model.setMaterial('yellow', '#f7d23e');
  model.setMaterial('red', '#e2463c');
  model.setMaterial('violet', '#9b6fe0');
  model.setMaterial('blue', '#5fa8ec');
  const random: () => number = createRandom(7);
  const colours: string[] = ['white', 'yellow', 'red', 'violet', 'blue'];
  for (let i = 0; i < 11; i++) {
    const angle: number = i * 2.4;
    const reach: number = 0.12 + 0.62 * Math.sqrt(i / 11);
    const x: number = reach * Math.cos(angle);
    const z: number = reach * Math.sin(angle);
    const height: number = 0.22 + random() * 0.2;
    const colour: string = getItem(colours, i % colours.length);
    model.add(
      'stem',
      place(createCone(0.022, 0.014, height, 3), { pos: [x, 0, z] }),
    );
    model.add(
      'stem',
      place(createEllipsoid([0.07, 0.012, 0.035], 0), {
        pos: [x + 0.05, height * 0.4, z],
        rot: [0, i * 50, 25],
      }),
    );
    model.add(
      colour,
      place(
        createLathe(
          [
            [0, 0],
            [0.075, 0.035],
            [0.06, 0.06],
            [0, 0.04],
          ],
          5,
        ),
        { pos: [x, height, z], rot: [12, i * 40, 8] },
      ),
    );
    model.add(
      colour === 'yellow' ? 'white' : 'yellow',
      place(createEllipsoid([0.028, 0.02, 0.028], 0), {
        pos: [x, height + 0.05, z],
      }),
    );
  }
  model.centreFootprint();
  return { model };
}

/**
 * Builds the marker of the monster spawn point: a ring of dark standing
 * stones around a glowing rune stone.
 *
 * @returns {BuiltModel} The model.
 */
export function buildSpawnStones(): BuiltModel {
  const model = new Model('SpawnStones');
  model.setMaterial('rock', '#6f6a7c');
  model.setMaterial('rockDark', '#575266');
  model.setMaterial('rune', '#c58cff', { emissive: '#7a35c9' });
  model.setMaterial('slab', '#807a8e');
  model.add(
    'slab',
    createLathe(
      [
        [0, 0],
        [1.25, 0],
        [1.15, 0.1],
        [0, 0.1],
      ],
      7,
    ),
  );
  model.add(
    'rune',
    createLathe(
      [
        [0.62, 0.1],
        [0.74, 0.1],
        [0.74, 0.125],
        [0.62, 0.125],
      ],
      7,
    ),
  );
  model.add(
    'rune',
    place(
      createLathe(
        [
          [0, 0],
          [0.16, 0.14],
          [0.2, 0.42],
          [0, 0.62],
        ],
        5,
      ),
      { pos: [0, 0.1, 0] },
    ),
  );
  for (let i = 0; i < 5; i++) {
    const angle: number = ((i * 72 + 36) * Math.PI) / 180;
    const height: number = 1.5 + (i % 3) * 0.35;
    model.add(
      i % 2 ? 'rock' : 'rockDark',
      place(
        place(createBlock(0.55, height, 0.42, [0.55, 0.6]), {
          rot: [-6, 0, i % 2 ? 5 : -4],
        }),
        {
          pos: [1.75 * Math.sin(angle), 0, 1.75 * Math.cos(angle)],
          rot: [0, i * 72 + 36, 0],
        },
      ),
    );
    model.add(
      'rune',
      place(
        place(createBox(0.12, 0.3, 0.03), {
          pos: [0, height * 0.55, -0.19],
          rot: [-6, 0, 0],
        }),
        {
          pos: [1.75 * Math.sin(angle), 0, 1.75 * Math.cos(angle)],
          rot: [0, i * 72 + 36, 0],
        },
      ),
    );
  }
  flattenUnderside(model);
  model.centreFootprint();
  return { model };
}
