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
 * @module scripts/models/cave The cave under the burrow of the wild dog:
 *   its rock, its floor, the bottom of the old well shaft with its rope,
 *   the slope down from the burrow, and the torches on its walls.
 */

import {
  CAVE_CELLS,
  CAVE_CHAMBER_DEPTH,
  CAVE_FLAME_AHEAD,
  CAVE_FLAME_HEIGHT,
  CAVE_MODEL_CENTRE,
  CAVE_MOUTH,
  CAVE_MOUTH_OUTLINE,
  CAVE_PASSAGE,
  CAVE_PASSAGE_HALF_WIDTH,
  CAVE_ROPE,
  CAVE_SHAFT_RADIUS,
  CAVE_STORE_ROOMS,
  CAVE_TORCH_DEPTH,
} from '@clovervale/shared';

import {
  createBlob,
  createBlock,
  createBox,
  createCone,
  createExtrusion,
  createLathe,
  createRandom,
  place,
} from './geometry.ts';
import { getItem } from './items.ts';
import { Model } from './model.ts';
import type { BuiltModel } from './rig.ts';

/** A stretch of ground: its west, east, north and south edges. */
type Rect = readonly [west: number, east: number, north: number, south: number];

/**
 * Half the length of the ground the model of the cave covers, along X, in
 * metres, around the middle it stands on.
 */
const HALF_LENGTH = 13;

/** Half the width of the ground the model of the cave covers, along Z. */
const HALF_WIDTH = 6.5;

/** The lowest the rock walls stand, in metres. */
const WALL_HEIGHT = 2.1;

/** How much higher than the lowest a stretch of rock may stand. */
const WALL_RISE = 0.4;

/** The longest a stretch of rock wall runs before the next, in metres. */
const WALL_PIECE = 1.6;

/** The height of the stonework of the old well shaft, in metres. */
const SHAFT_HEIGHT = 3.2;

/** The number of courses of stones in the stonework of the shaft. */
const SHAFT_COURSES = 4;

/** The number of stones in each course, round the west half of the shaft. */
const SHAFT_STONES = 8;

/** How far the stonework of the shaft reaches into the rock, in metres. */
const SHAFT_DEPTH = 0.75;

/** The height the rope hangs down from, in metres. */
const ROPE_TOP = 4.4;

/** The height the face of the rock round the mouth of the burrow rises to. */
const MOUTH_ROCK_TOP = 4.9;

/** The height the slope from the burrow rises to, at its east end. */
const SLOPE_HEIGHT = 3.4;

/**
 * Finds the stretches of rock around the cave, within the ground the model
 * covers, in the frame of the cave: the rock beyond the side chambers on
 * either side, the rock between the chambers along either side of the
 * passage, and the rock west of the bottom of the well shaft.
 *
 * @returns {Rect[]} The stretches.
 */
function listRock(): Rect[] {
  const west: number = CAVE_MODEL_CENTRE.x - HALF_LENGTH;
  const east: number = CAVE_MODEL_CENTRE.x + HALF_LENGTH;
  const edge: number = CAVE_PASSAGE_HALF_WIDTH;
  const far: number = edge + CAVE_CHAMBER_DEPTH;
  const rock: Rect[] = [
    [west, east, -HALF_WIDTH, -far],
    [west, east, far, HALF_WIDTH],
    [west, -edge, -edge, edge],
  ];
  const stretches: readonly (readonly [number, number])[] = [
    [west, CAVE_STORE_ROOMS[0].west],
    [CAVE_STORE_ROOMS[0].east, CAVE_CELLS[0].west],
    [CAVE_CELLS[0].east, east],
  ];
  for (const [from, to] of stretches) {
    rock.push([from, to, -far, -edge], [from, to, edge, far]);
  }
  return rock;
}

/**
 * Adds a stretch of rock, as a row of blocks of uneven height with crags on
 * top, its faces standing straight on the edges of the stretch.
 *
 * @param {Model} model - The model.
 * @param {Rect} rect - The stretch.
 * @param {() => number} random - The source of random numbers.
 */
function addRock(model: Model, rect: Rect, random: () => number): void {
  const [west, east, north, south] = rect;
  const isLong: boolean = east - west >= south - north;
  const length: number = isLong ? east - west : south - north;
  const count: number = Math.ceil(length / WALL_PIECE);
  for (let index = 0; index < count; index++) {
    const from: number = (isLong ? west : north) + (length * index) / count;
    const to: number = (isLong ? west : north) + (length * (index + 1)) / count;
    const [x0, x1, z0, z1] = isLong
      ? [from, to, north, south]
      : [west, east, from, to];
    const height: number = WALL_HEIGHT + random() * WALL_RISE;
    const material: string = index % 2 === 0 ? 'rock' : 'rockDark';
    model.add(
      material,
      place(createBlock(x1 - x0, height, z1 - z0), {
        pos: [(x0 + x1) / 2, 0, (z0 + z1) / 2],
      }),
    );
    const crag: number = Math.min(x1 - x0, z1 - z0, 1.4) / 2;
    model.add(
      index % 2 === 0 ? 'rockDark' : 'rock',
      place(createBlob(0, 900 + Math.floor(random() * 1000), 0.25), {
        pos: [(x0 + x1) / 2, height, (z0 + z1) / 2],
        scale: [crag * 0.9, 0.15 + random() * 0.2, crag * 0.9],
      }),
    );
  }
}

/**
 * Adds the stonework at the bottom of the old well shaft: courses of stones
 * round the west half of the round end of the passage, each course set
 * half a stone round from the one below.
 *
 * @param {Model} model - The model.
 */
function addShaft(model: Model): void {
  const span: number = 180 / SHAFT_STONES;
  const course: number = SHAFT_HEIGHT / SHAFT_COURSES;
  const width: number =
    2 * (CAVE_SHAFT_RADIUS + SHAFT_DEPTH) * Math.tan((span * Math.PI) / 360);
  for (let row = 0; row < SHAFT_COURSES; row++) {
    const shift: number = row % 2 === 0 ? 0 : span / 2;
    for (let index = 0; index <= SHAFT_STONES; index++) {
      const yaw: number = 180 + shift + index * span - span / 2;
      const angle: number = (yaw * Math.PI) / 180;
      const out: number = CAVE_SHAFT_RADIUS + SHAFT_DEPTH / 2;
      model.add(
        (row + index) % 2 === 0 ? 'stone' : 'stoneDark',
        place(createBlock(width, course - 0.02, SHAFT_DEPTH), {
          pos: [
            CAVE_ROPE.x + out * Math.sin(angle),
            row * course,
            CAVE_ROPE.z + out * Math.cos(angle),
          ],
          rot: [0, yaw, 0],
        }),
      );
    }
  }
  // The rope, hanging down the middle of the shaft into a coil on the
  // floor.
  model.add(
    'rope',
    place(
      createLathe(
        [
          [0.11, 0],
          [0.12, 0.03],
          [0.1, 0.06],
          [0.03, 0.07],
          [0, 0.07],
        ],
        9,
      ),
      { pos: [CAVE_ROPE.x, 0, CAVE_ROPE.z] },
    ),
  );
  model.add(
    'rope',
    place(createBox(0.035, ROPE_TOP - 0.06, 0.035), {
      pos: [CAVE_ROPE.x, 0.06 + (ROPE_TOP - 0.06) / 2, CAVE_ROPE.z],
    }),
  );
  model.add(
    'ropeDark',
    place(createBox(0.05, 0.05, 0.05), {
      pos: [CAVE_ROPE.x, 0.9, CAVE_ROPE.z],
      rot: [0, 45, 0],
    }),
  );
}

/**
 * Adds the slope down from the burrow at the east end of the passage: a
 * steep chute of earth from the foot of the slope up into the rock, with
 * lumps of earth and stones on it and the dark mouth of the burrow at its
 * top.
 *
 * @param {Model} model - The model.
 * @param {() => number} random - The source of random numbers.
 */
function addSlope(model: Model, random: () => number): void {
  const foot: number = CAVE_PASSAGE.east;
  const top: number = CAVE_MODEL_CENTRE.x + HALF_LENGTH;
  const rise: number = SLOPE_HEIGHT / (top - foot);
  model.add(
    'earth',
    createExtrusion(
      [
        [foot, 0],
        [top, 0],
        [top, SLOPE_HEIGHT],
      ],
      2 * CAVE_PASSAGE_HALF_WIDTH,
    ),
  );
  for (let index = 0; index < 7; index++) {
    const x: number = foot + 0.6 + random() * (top - foot - 1);
    const z: number = (random() * 2 - 1) * (CAVE_PASSAGE_HALF_WIDTH - 0.4);
    model.add(
      index % 3 === 0 ? 'stoneDark' : 'earthDark',
      place(createBlob(0, 1300 + index, 0.2), {
        pos: [x, (x - foot) * rise, z],
        scale: [0.28, 0.14, 0.24],
      }),
    );
  }
  addMouth(model);
}

/**
 * Adds the face of the rock at the top of the slope, with the mouth of the
 * burrow open through it onto the world outside: two halves of rock, each
 * round one half of the opening, standing on the top of the slope and
 * rising above the walls around it.
 *
 * @param {Model} model - The model.
 */
function addMouth(model: Model): void {
  const top: number = CAVE_MODEL_CENTRE.x + HALF_LENGTH;
  const reach: number = CAVE_PASSAGE_HALF_WIDTH + 0.1;
  const foot: number = SLOPE_HEIGHT - 0.5;
  for (const side of [-1, 1]) {
    // The half of the outline on this side, from its foot to its top.
    const edge: [number, number][] = CAVE_MOUTH_OUTLINE.filter(
      ([across]) => across * side >= 0,
    ).map(([across, height]): [number, number] => [across * side, height]);
    edge.sort((a, b) => a[1] - b[1]);
    const outline: [number, number][] = [
      [0, MOUTH_ROCK_TOP],
      [reach, MOUTH_ROCK_TOP],
      [reach, foot],
      [getItem(edge, 0)[0], foot],
      ...edge,
      [0, Math.max(...edge.map(([, height]) => height))],
    ];
    model.add(
      side < 0 ? 'rock' : 'rockDark',
      place(createExtrusion(outline, top - CAVE_MOUTH.x), {
        pos: [(CAVE_MOUTH.x + top) / 2, 0, CAVE_MOUTH.z],
        rot: [0, side < 0 ? 90 : -90, 0],
      }),
    );
  }
}

/**
 * Adds the floor: bare earth all over the ground the model covers, with
 * flat stones here and there on the passage and in the chambers.
 *
 * @param {Model} model - The model.
 * @param {() => number} random - The source of random numbers.
 */
function addFloor(model: Model, random: () => number): void {
  model.add(
    'floor',
    place(createBlock(2 * HALF_LENGTH, 0.01, 2 * HALF_WIDTH), {
      pos: [CAVE_MODEL_CENTRE.x, 0, CAVE_MODEL_CENTRE.z],
    }),
  );
  for (let index = 0; index < 18; index++) {
    const x: number = 0.8 + random() * (CAVE_PASSAGE.east - 1.6);
    const z: number = (random() * 2 - 1) * (CAVE_PASSAGE_HALF_WIDTH + 2);
    model.add(
      index % 2 === 0 ? 'floorStone' : 'floorDark',
      place(createBlock(0.3 + random() * 0.4, 0.012, 0.25 + random() * 0.3), {
        pos: [x, 0.004, z],
        rot: [0, random() * 180, 0],
      }),
    );
  }
}

/**
 * Builds the cave in one: its rock, its floor, the bottom of the old well
 * shaft with its rope, and the slope down from the burrow.
 *
 * @returns {BuiltModel} The model.
 */
export function buildCave(): BuiltModel {
  const model = new Model('Cave');
  model.setMaterial('rock', '#5d5560');
  model.setMaterial('rockDark', '#4a4350');
  model.setMaterial('floor', '#4a3b30');
  model.setMaterial('floorDark', '#3b2f27');
  model.setMaterial('floorStone', '#615a55');
  model.setMaterial('stone', '#8c877c');
  model.setMaterial('stoneDark', '#6f6a62');
  model.setMaterial('rope', '#b08a55');
  model.setMaterial('ropeDark', '#8a6a3e');
  model.setMaterial('earth', '#7a5235');
  model.setMaterial('earthDark', '#5e3e28');
  const random: () => number = createRandom(2026);
  addFloor(model, random);
  for (const rect of listRock()) {
    addRock(model, rect, random);
  }
  addShaft(model);
  addSlope(model, random);
  // Nothing reaches beyond the ground the model covers, nor below it.
  const west: number = CAVE_MODEL_CENTRE.x - HALF_LENGTH;
  const east: number = CAVE_MODEL_CENTRE.x + HALF_LENGTH;
  for (const { point } of model.listCorners()) {
    point.x = Math.min(Math.max(point.x, west), east);
    point.z = Math.min(Math.max(point.z, -HALF_WIDTH), HALF_WIDTH);
    point.y = Math.max(point.y, 0);
  }
  model.centreFootprint();
  return { model };
}

/**
 * Builds a torch on a wall of the cave: a post of old timber standing
 * against the wall, an iron bracket at its top, and a torch in the bracket
 * with its flame, which faces +Z, away from the wall.
 *
 * @returns {BuiltModel} The model.
 */
export function buildCaveTorch(): BuiltModel {
  const model = new Model('CaveTorch');
  model.setMaterial('timber', '#6a4b32');
  model.setMaterial('iron', '#3d3b3a', { roughness: 0.6, metallic: 0.6 });
  model.setMaterial('pitch', '#2a1d14');
  model.setMaterial('stick', '#8a6440');
  model.setMaterial('flame', '#ff9a2e', { emissive: '#ff7a10' });
  model.setMaterial('flameCore', '#ffe38a', { emissive: '#ffc840' });
  const back: number = -CAVE_TORCH_DEPTH / 2;
  const flameBase: number = CAVE_FLAME_HEIGHT - 0.06;
  // The post, against the wall.
  model.add(
    'timber',
    place(createBlock(0.12, flameBase - 0.25, 0.08), {
      pos: [0, 0, back + 0.04],
    }),
  );
  // The bracket: a broad band round the post, and an arm out past the
  // torch, which it holds in a ring.
  model.add(
    'iron',
    place(createBox(0.2, 0.04, 0.08), {
      pos: [0, flameBase - 0.35, back + 0.04],
    }),
  );
  model.add(
    'iron',
    place(createBox(0.03, 0.03, -2 * back), {
      pos: [0, flameBase - 0.35, 0],
    }),
  );
  model.add(
    'iron',
    place(createLathe([[0.04, 0], [0.04, 0.04]], 6), {
      pos: [0, flameBase - 0.37, CAVE_FLAME_AHEAD],
    }),
  );
  // The torch, its head wrapped and soaked in pitch, and its flame.
  model.add(
    'stick',
    place(createCone(0.022, 0.028, 0.32, 6), {
      pos: [0, flameBase - 0.42, CAVE_FLAME_AHEAD],
    }),
  );
  model.add(
    'pitch',
    place(createCone(0.04, 0.045, 0.1, 7), {
      pos: [0, flameBase - 0.1, CAVE_FLAME_AHEAD],
    }),
  );
  model.add(
    'flame',
    place(createCone(0.08, 0, 0.3, 7), {
      pos: [0, flameBase, CAVE_FLAME_AHEAD],
    }),
  );
  model.add(
    'flameCore',
    place(createCone(0.05, 0, 0.16, 6), {
      pos: [0, flameBase, CAVE_FLAME_AHEAD],
    }),
  );
  model.centreFootprint();
  return { model };
}
