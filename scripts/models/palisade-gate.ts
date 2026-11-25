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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/25
// AI assistance: Claude Code (Anthropic)

/**
 * @module scripts/models/palisade-gate The wooden palisade gate across the
 *   far end of the mountain road.
 */

import {
  createBlock,
  createBox,
  createLathe,
  createRandom,
  place,
} from './geometry.ts';
import type { Shape } from './geometry.ts';
import { Model } from './model.ts';
import type { BuiltModel } from './rig.ts';

/**
 * How far out from the middle the palisade reaches on either side, to the
 * middle of its last stake, in meters: well past the sides of the road, on
 * into the slopes.
 */
const WING_REACH = 7;

/**
 * How far out from the middle each post of the gate stands, to its middle,
 * in meters.
 */
const POST_REACH = 2.36;

/** How thick a post of the gate is, in meters. */
const POST_SIZE = 0.32;

/** How tall a post of the gate is, in meters. */
const POST_HEIGHT = 3.5;

/** How thick the beam across the tops of the posts is, in meters. */
const LINTEL_SIZE = 0.28;

/** The radius of a stake of the palisade, in meters. */
const STAKE_RADIUS = 0.13;

/** How far apart the stakes of the palisade stand, in meters. */
const STAKE_SPACING = 0.27;

/** How tall a stake of the palisade is to its point, at least, in meters. */
const STAKE_HEIGHT = 2.6;

/** How much taller than that a stake may be, at most, in meters. */
const STAKE_HEIGHT_SPREAD = 0.45;

/** How long the point of a stake is, in meters. */
const STAKE_POINT = 0.32;

/** The heights of the rails that bind the stakes together, in meters. */
const RAIL_HEIGHTS: readonly number[] = [0.7, 1.95];

/** The number of planks in a leaf of the gate. */
const PLANKS = 6;

/** How tall a leaf of the gate is, in meters. */
const LEAF_HEIGHT = 2.75;

/** How thick a plank of a leaf of the gate is, in meters. */
const PLANK_DEPTH = 0.1;

/** The heights of the battens across the front of each leaf, in meters. */
const BATTEN_HEIGHTS: readonly number[] = [0.45, 2.2];

/** The seed of the heights and the turns of the stakes. */
const SEED = 0x6a7e;

/**
 * Creates a stake of the palisade standing on the ground: a rough round
 * pole sharpened to a point at its top.
 *
 * @param {number} height - How tall it is to its point, in meters.
 * @returns {Shape} The stake.
 */
function createStake(height: number): Shape {
  return createLathe(
    [
      [0, 0],
      [STAKE_RADIUS, 0],
      [STAKE_RADIUS, height - STAKE_POINT],
      [0, height],
    ],
    5,
  );
}

/**
 * Adds a wing of the palisade, from beside a post of the gate out into the
 * slope on that side: a row of pointed stakes of uneven heights, each
 * turned its own way, bound by rails along their back.
 *
 * @param {Model} model - The model, with its materials defined.
 * @param {number} side - The side: 1 toward +X, or -1 toward -X.
 * @param {() => number} random - The source of numbers that seem random.
 */
function addWing(model: Model, side: number, random: () => number): void {
  const first: number = POST_REACH + POST_SIZE / 2 + STAKE_RADIUS;
  const count: number =
    Math.round((WING_REACH - first) / STAKE_SPACING) + 1;
  for (let index = 0; index < count; index++) {
    const height: number = STAKE_HEIGHT + random() * STAKE_HEIGHT_SPREAD;
    model.add(
      index % 2 === 0 ? 'stake' : 'stakeDark',
      place(createStake(height), {
        pos: [side * (first + index * STAKE_SPACING), 0, 0],
        rot: [0, random() * 72, 0],
      }),
    );
  }
  const length: number = WING_REACH - POST_REACH;
  for (const height of RAIL_HEIGHTS) {
    model.add(
      'beam',
      place(createBox(length, 0.12, 0.08), {
        pos: [side * (POST_REACH + length / 2), height, -STAKE_RADIUS - 0.04],
      }),
    );
  }
}

/**
 * Adds a leaf of the gate, closed, on one side of the middle: upright
 * planks side by side, held by battens across their front and a brace
 * slanting between the battens.
 *
 * @param {Model} model - The model, with its materials defined.
 * @param {number} side - The side: 1 toward +X, or -1 toward -X.
 */
function addLeaf(model: Model, side: number): void {
  const inner = 0.01;
  const outer: number = POST_REACH - POST_SIZE / 2;
  const width: number = (outer - inner) / PLANKS;
  for (let index = 0; index < PLANKS; index++) {
    model.add(
      index % 2 === 0 ? 'plank' : 'plankDark',
      place(createBlock(width - 0.01, LEAF_HEIGHT, PLANK_DEPTH), {
        pos: [side * (inner + width * (index + 0.5)), 0, 0],
      }),
    );
  }
  const middle: number = side * ((inner + outer) / 2);
  const across: number = outer - inner - 0.06;
  const front: number = PLANK_DEPTH / 2 + 0.03;
  for (const height of BATTEN_HEIGHTS) {
    model.add(
      'beam',
      place(createBox(across, 0.16, 0.06), { pos: [middle, height, front] }),
    );
  }
  const [low = 0, high = 0] = BATTEN_HEIGHTS;
  const rise: number = high - low;
  const angle: number = (Math.atan2(rise, across) * 180) / Math.PI;
  model.add(
    'beam',
    place(createBox(Math.hypot(rise, across) - 0.1, 0.14, 0.05), {
      pos: [middle, (low + high) / 2, front],
      rot: [0, 0, side * angle],
    }),
  );
}

/**
 * Builds the wooden palisade gate that closes the far end of the mountain
 * road out of the village: a gate of two closed leaves of upright planks
 * between two stout posts, with a beam across their tops, and on either
 * side a palisade of pointed stakes of uneven heights, bound by rails along
 * their back, reaching well past the sides of the road, on into the slopes.
 * It runs along X, its front, with the battens of the leaves, toward +Z.
 *
 * @returns {BuiltModel} The model.
 */
export function buildPalisadeGate(): BuiltModel {
  const model = new Model('PalisadeGate');
  model.setMaterial('stake', '#9a6a3f');
  model.setMaterial('stakeDark', '#86592f');
  model.setMaterial('post', '#6e4528');
  model.setMaterial('beam', '#7a4f2c');
  model.setMaterial('plank', '#b07a48');
  model.setMaterial('plankDark', '#a06c3e');
  const random: () => number = createRandom(SEED);
  for (const side of [-1, 1]) {
    model.add(
      'post',
      place(createBlock(POST_SIZE, POST_HEIGHT, POST_SIZE), {
        pos: [side * POST_REACH, 0, 0],
      }),
    );
    addLeaf(model, side);
    addWing(model, side, random);
  }
  model.add(
    'post',
    place(
      createBlock(
        2 * POST_REACH + POST_SIZE + 0.3,
        LINTEL_SIZE,
        LINTEL_SIZE,
      ),
      { pos: [0, POST_HEIGHT - LINTEL_SIZE / 2, 0] },
    ),
  );
  model.centerFootprint();
  return { model };
}
