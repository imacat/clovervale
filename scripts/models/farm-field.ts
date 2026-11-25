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
 * @module scripts/models/farm-field The farm fields behind the houses: a
 *   wooden fence with a gate, around raised beds of tilled earth planted
 *   with cabbages, lettuces, carrots and pumpkins, and lanes of bare earth
 *   between them.
 */

import {
  FARM_FIELDS,
  FIELD_BED_WIDTH,
  FIELD_FENCE_THICKNESS,
  FIELD_FLOOR_HEIGHT,
  FIELD_GATE_WIDTH,
} from '@clovervale/shared';
import type { FarmField, FarmFieldId, FieldBed } from '@clovervale/shared';

import {
  createBlob,
  createBlock,
  createBox,
  createCone,
  createEllipsoid,
  createRandom,
  place,
} from './geometry.ts';
import { getItem } from './items.ts';
import { Model } from './model.ts';
import type { BuiltModel } from './rig.ts';

/** The farthest apart two posts of the fence stand, in meters. */
const POST_SPACING = 2;

/** The width of a post of the fence, in meters. */
const POST_WIDTH = 0.14;

/** The height of a post of the fence, in meters. */
const POST_HEIGHT = 0.9;

/** The height of a post on either side of the gate, in meters. */
const GATE_POST_HEIGHT = 1.15;

/** The heights of the middles of the two rails of the fence, in meters. */
const RAIL_HEIGHTS: readonly number[] = [0.32, 0.66];

/** The height of the earth of a bed, in meters. */
const BED_HEIGHT = 0.1;

/** The height of a ridge on top of a bed, in meters. */
const RIDGE_HEIGHT = 0.05;

/** How far from the middle of a bed each of its two rows is, in meters. */
const ROW_OFFSET = 0.35;

/** The distance between two neighboring crops in a row, in meters. */
const CROP_SPACING = 0.5;

/** How far in from either end of a bed its first crop grows, in meters. */
const CROP_INSET = 0.3;

/** A crop that grows on a bed of a field. */
type Crop = 'cabbage' | 'lettuce' | 'carrot' | 'pumpkin';

/** The crops of the beds, bed after bed, in turn. */
const CROPS: readonly Crop[] = ['cabbage', 'carrot', 'lettuce', 'pumpkin'];

/** A length of the fence along a straight line on the ground. */
interface FenceLength {
  /** Where the length starts along the line, in meters. */
  readonly from: number;
  /** Where it ends along the line, in meters. */
  readonly to: number;
  /** Where the line runs across it, in meters. */
  readonly at: number;
  /** Whether the line runs along X, not Z. */
  readonly isAlongX: boolean;
  /**
   * Whether the length has its own posts at its ends, or meets posts that
   * another length or the gate has there.
   */
  readonly hasEndPosts: readonly [start: boolean, end: boolean];
}

/**
 * Adds a length of the fence: two rails along it, and posts no farther
 * apart than {@link POST_SPACING} between its ends, and at each end that
 * has a post of its own.
 *
 * @param {Model} model - The model, with the materials `post` and `rail`
 *   defined.
 * @param {FenceLength} fence - The length.
 */
function addFenceLength(model: Model, fence: FenceLength): void {
  const { from, to, at, isAlongX, hasEndPosts } = fence;
  const length: number = to - from;
  const spans: number = Math.ceil(length / POST_SPACING);
  const yaw: number = isAlongX ? 0 : 90;
  const findPos = (along: number, y: number): [number, number, number] =>
    isAlongX ? [along, y, at] : [at, y, along];
  const [first, last] = hasEndPosts;
  for (let i = first ? 0 : 1; i <= (last ? spans : spans - 1); i++) {
    const along: number =
      from + POST_WIDTH / 2 + ((length - POST_WIDTH) * i) / spans;
    model.add(
      'post',
      place(createBlock(POST_WIDTH, POST_HEIGHT, POST_WIDTH, [0.8, 0.8]), {
        pos: findPos(along, 0),
      }),
    );
  }
  for (const height of RAIL_HEIGHTS) {
    model.add(
      'rail',
      place(createBox(length, 0.1, 0.06), {
        pos: findPos((from + to) / 2, height),
        rot: [0, yaw, 0],
      }),
    );
  }
}

/**
 * Adds the fence around a field, just inside the edge of the field, with
 * the gate in the middle of its front and a taller post on either side of
 * the gate.
 *
 * @param {Model} model - The model, with the materials `post` and `rail`
 *   defined.
 * @param {FarmField} field - The field.
 */
function addFence(model: Model, field: FarmField): void {
  const halfLength: number = field.length / 2;
  const halfWidth: number = field.width / 2;
  const line: number = FIELD_FENCE_THICKNESS / 2;
  const gate: number = FIELD_GATE_WIDTH / 2;
  // The front and the back carry the corner posts, and the gate has its
  // own posts on either side, so the sides have no posts at their ends.
  const lengths: readonly FenceLength[] = [
    {
      from: -halfLength,
      to: -gate,
      at: halfWidth - line,
      isAlongX: true,
      hasEndPosts: [true, false],
    },
    {
      from: gate,
      to: halfLength,
      at: halfWidth - line,
      isAlongX: true,
      hasEndPosts: [false, true],
    },
    {
      from: -halfLength,
      to: halfLength,
      at: -halfWidth + line,
      isAlongX: true,
      hasEndPosts: [true, true],
    },
    ...[-1, 1].map(
      (side: number): FenceLength => ({
        from: -halfWidth,
        to: halfWidth,
        at: side * (halfLength - line),
        isAlongX: false,
        hasEndPosts: [false, false],
      }),
    ),
  ];
  for (const fence of lengths) {
    addFenceLength(model, fence);
  }
  for (const side of [-1, 1]) {
    model.add(
      'post',
      place(createBlock(POST_WIDTH, GATE_POST_HEIGHT, POST_WIDTH), {
        pos: [side * (gate + POST_WIDTH / 2), 0, halfWidth - line],
      }),
    );
  }
}

/**
 * Adds a cabbage: a round, pale head on the ridge.
 *
 * @param {Model} model - The model, with the material `cabbage` defined.
 * @param {number} x - Where it grows along X.
 * @param {number} z - Where it grows along Z.
 * @param {() => number} random - The source of its little differences.
 */
function addCabbage(
  model: Model,
  x: number,
  z: number,
  random: () => number,
): void {
  const size: number = 0.85 + random() * 0.15;
  model.add(
    'cabbage',
    place(createBlob(0, 600 + Math.floor(random() * 1000), 0.1), {
      pos: [x, BED_HEIGHT + RIDGE_HEIGHT + 0.06 * size, z],
      scale: [0.13 * size, 0.09 * size, 0.13 * size],
    }),
  );
}

/**
 * Adds a lettuce: a low, broad rosette of leaves on the ridge.
 *
 * @param {Model} model - The model, with the materials `lettuce` and
 *   `lettuceDark` defined.
 * @param {number} x - Where it grows along X.
 * @param {number} z - Where it grows along Z.
 * @param {() => number} random - The source of its little differences.
 */
function addLettuce(
  model: Model,
  x: number,
  z: number,
  random: () => number,
): void {
  model.add(
    random() < 0.5 ? 'lettuce' : 'lettuceDark',
    place(createEllipsoid([0.12, 0.06, 0.12], 0), {
      pos: [x, BED_HEIGHT + RIDGE_HEIGHT + 0.03, z],
      rot: [0, random() * 72, 0],
    }),
  );
}

/**
 * Adds a carrot: the orange top of its root, showing above the earth,
 * under a tuft of two thin leaves.
 *
 * @param {Model} model - The model, with the materials `carrot` and
 *   `carrotTop` defined.
 * @param {number} x - Where it grows along X.
 * @param {number} z - Where it grows along Z.
 * @param {() => number} random - The source of its little differences.
 */
function addCarrot(
  model: Model,
  x: number,
  z: number,
  random: () => number,
): void {
  const top: number = BED_HEIGHT + RIDGE_HEIGHT;
  model.add(
    'carrot',
    place(createCone(0.035, 0.022, 0.03, 5), { pos: [x, top - 0.01, z] }),
  );
  const turn: number = random() * 180;
  for (let i = 0; i < 2; i++) {
    model.add(
      'carrotTop',
      place(createCone(0.03, 0, 0.14, 4), {
        pos: [x, top + 0.01, z],
        rot: [20, turn + i * 180, 0],
      }),
    );
  }
}

/**
 * Adds a pumpkin, lying on the ridge, beside a broad leaf of its vine.
 *
 * @param {Model} model - The model, with the materials `pumpkin` and
 *   `vine` defined.
 * @param {number} x - Where it grows along X.
 * @param {number} z - Where it grows along Z.
 * @param {() => number} random - The source of its little differences.
 */
function addPumpkin(
  model: Model,
  x: number,
  z: number,
  random: () => number,
): void {
  const top: number = BED_HEIGHT + RIDGE_HEIGHT;
  if (random() < 0.6) {
    model.add(
      'pumpkin',
      place(createEllipsoid([0.13, 0.09, 0.12], 0), {
        pos: [x, top + 0.07, z],
        rot: [0, random() * 72, 0],
      }),
    );
  }
  model.add(
    'vine',
    place(createEllipsoid([0.1, 0.02, 0.08], 0), {
      pos: [x + 0.12, top + 0.01, z],
      rot: [0, random() * 40 - 20, 0],
    }),
  );
}

/** How each crop is added to a model, by the crop. */
const CROP_ADDERS: Readonly<
  Record<
    Crop,
    (model: Model, x: number, z: number, random: () => number) => void
  >
> = {
  cabbage: addCabbage,
  lettuce: addLettuce,
  carrot: addCarrot,
  pumpkin: addPumpkin,
};

/**
 * Adds a raised bed of tilled earth, with two ridges along it, each
 * planted with a row of a crop.
 *
 * @param {Model} model - The model, with the materials `soil`, `ridge`,
 *   and those of the crop defined.
 * @param {FieldBed} bed - The bed.
 * @param {Crop} crop - What grows on it.
 * @param {() => number} random - The source of the little differences of
 *   the crops.
 */
function addBed(
  model: Model,
  bed: FieldBed,
  crop: Crop,
  random: () => number,
): void {
  model.add(
    'soil',
    place(
      createBlock(bed.length, BED_HEIGHT, FIELD_BED_WIDTH, [0.98, 0.94]),
      { pos: [bed.x, 0, bed.z] },
    ),
  );
  const count: number =
    Math.floor((bed.length - 2 * CROP_INSET) / CROP_SPACING) + 1;
  const start: number = bed.x - ((count - 1) * CROP_SPACING) / 2;
  for (const side of [-1, 1]) {
    const z: number = bed.z + side * ROW_OFFSET;
    model.add(
      'ridge',
      place(
        createBlock(bed.length - 0.1, RIDGE_HEIGHT, 0.4, [0.97, 0.5]),
        { pos: [bed.x, BED_HEIGHT, z] },
      ),
    );
    for (let i = 0; i < count; i++) {
      CROP_ADDERS[crop](model, start + i * CROP_SPACING, z, random);
    }
  }
}

/**
 * Builds a farm field of the size the village lays out: a wooden fence
 * around its edge, with the gate in the middle of its front, toward +Z,
 * and inside, bare earth all over at the height {@link FIELD_FLOOR_HEIGHT}
 * gives, with raised beds of tilled earth on it and lanes between them.
 * Each bed has two ridges along it, planted with a row of cabbages,
 * carrots, lettuces or pumpkins, the crop changing from bed to bed.  Every
 * crop grows low, so that anything lying or walking in a lane stays in
 * plain sight.
 *
 * @param {FarmFieldId} id - The field.
 * @returns {BuiltModel} The model.
 */
export function buildFarmField(id: FarmFieldId): BuiltModel {
  const field: FarmField = FARM_FIELDS[id];
  const model = new Model('FarmField');
  model.setMaterial('post', '#9a5f33');
  model.setMaterial('rail', '#b9763f');
  model.setMaterial('floor', '#9c7048');
  model.setMaterial('soil', '#7b5236');
  model.setMaterial('ridge', '#946443');
  model.setMaterial('cabbage', '#bcd86e');
  model.setMaterial('lettuce', '#8cc84f');
  model.setMaterial('lettuceDark', '#5f9e3c');
  model.setMaterial('carrot', '#e8812f');
  model.setMaterial('carrotTop', '#6fb546');
  model.setMaterial('pumpkin', '#e98a2a');
  model.setMaterial('vine', '#4f9a3f');
  addFence(model, field);
  model.add(
    'floor',
    createBlock(
      field.length - 2 * FIELD_FENCE_THICKNESS,
      FIELD_FLOOR_HEIGHT,
      field.width - 2 * FIELD_FENCE_THICKNESS,
    ),
  );
  const random: () => number = createRandom(25);
  field.beds.forEach((bed: FieldBed, index: number) => {
    addBed(model, bed, getItem(CROPS, index % CROPS.length), random);
  });
  model.centerFootprint();
  return { model };
}
