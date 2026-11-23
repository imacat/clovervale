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
 * @module shared/village-layout Where the models of the village stand, and
 *   the ground they take up.
 */

import type { ModelId } from './models.ts';
import type { GroundVector } from './movement.ts';
import {
  Terrain,
  findTurn,
  placePoint,
  placeShape,
  turnVector,
} from './terrain.ts';
import type { Boundary, Pose, Shape } from './terrain.ts';
import { PLAZA_CENTER } from './village.ts';

/** Where a model stands on the ground, and which way it faces. */
export interface Placement extends Pose {
  /** The identifier of the model. */
  readonly model: ModelId;
}

/** A spot on the ground: its X and Z positions, and its yaw. */
type Spot = readonly [x: number, z: number, yaw: number];

/** The spot of the weapon shop, with the forge beside it. */
const WEAPON_SHOP_SPOT: Spot = [12, -4.3344, -90];

/**
 * Where Emma the smith stands at the forge of the weapon shop, and which way
 * she faces, as the model of the shop has it before it is placed: in front
 * of the mouth of the forge, a step out from it, with her back to the house
 * and the forge on her left, facing the anvil a step in front of her, with
 * the plaza on her right.
 */
const SMITH_AT_ANVIL: Spot = [2.37, 0.777, 90];

/**
 * The spot of the house of the village chief, at the back of the village on
 * the north-east, facing the plaza.
 */
const CHIEF_HOUSE_SPOT: Spot = [9.75, -17, -60];

/**
 * Where Martha, the village chief, stands on the porch of her house, and
 * which way she faces, as the model of the house has it: beside the door,
 * on the right of it as one faces the house, on the side of the well,
 * between the front wall and the posts of the porch, close enough to the
 * door that the post on the side of the well does not hide her face from
 * the middle of the plaza, turned a little toward the well so that she
 * faces the plaza.
 */
const CHIEF_ON_PORCH: Spot = [1.1, 2.7, 7];

/**
 * Where Martha's pitchfork leans against the front wall of her house while
 * she does not hold it, as the model of the house has it: the middle of
 * the ground it stands over, on the floor of the porch near its right-hand
 * end, as one faces the house, on the side of the well, just to the left
 * of the box of flowers under the window beside it, with its butt on the
 * floor a little out from the wall, and the tips of its tines against the
 * wall, clear of the box of flowers and of the posts of the porch.
 */
const PITCHFORK_AGAINST_WALL: Spot = [1.9, 1.947, 0];

/**
 * Where Martha stands to take up her pitchfork from the wall, or to lean
 * it there again, as the model of the house has it: on the porch, just in
 * front of it, between her place on the porch and the post on the side of
 * the well.
 */
const BEFORE_PITCHFORK: Spot = [1.9, 2.65, 0];

/**
 * Where the old well stands in the yard of the chief's house, as the model
 * of the house has it: beside the house on the side of the weapon shop, a
 * little forward of its front wall, in sight of the porch.
 */
const WELL_IN_YARD: Spot = [5.6, 3.1, 0];

/**
 * Where a player stands beside the old well in the yard of the chief's
 * house when it has climbed up out of the cave, and which way it faces, as
 * the model of the house has it: beside the well on the side of the porch
 * and of the gap in the low wall in front of the yard, clear of the
 * stonework and of the wall, facing the house with the porch a little to
 * its left.  Behind it lies the gap in the wall and the plaza beyond, with
 * the well off to one side, so that nothing tall stands between the player
 * and a camera behind it.
 */
const BESIDE_WELL: Spot = [4.4, 3.9, -120];

/**
 * Where the whole two-meter stretches of the old low stone wall of the yard
 * of the chief's house stand, as the model of the house has it, every other
 * one in a run turned around so that their worn stones do not repeat.  The
 * wall stands in short runs with wide gaps between, so that the yard is
 * open on every side.  One stretch runs along the front, between the house
 * and the plaza, 3 m in front of the front wall of the house: it stands in
 * front of the well, so that the well stands behind the wall as seen from
 * the plaza, and reaches on past it, by more than a meter, toward the
 * weapon shop.  One stretch runs along the side of the well, behind it, on
 * the side of the weapon shop.  At the corner behind the house away from
 * the well, one stretch runs along the back and two along the side; and at
 * the other corner behind it, one runs along the back and one slants
 * forward toward the side of the well.
 */
const YARD_WALL_ON_HOUSE: readonly Spot[] = [
  [6.24, 4.8, 0],
  [6.75, 1.1, 90],
  [-4.25, -3.75, 0],
  [-5.25, -2.75, 90],
  [-5.25, -0.75, 270],
  [3.75, -3.75, 0],
  [5.3028, -2.9167, -56.44],
];

/**
 * Where the ragged ends of the old low stone wall in front of the yard of
 * the chief's house stand, as the model of the house has it, on the line of
 * the whole stretch, with the broad opening in front of the porch, 5.15 m
 * wide, between them.  The short stretch on the left as one faces the house
 * is a ragged end alone, in front of the left part of the house, broken
 * down toward the opening, with its tall end beside the path to the back
 * of the village.  On the right, a ragged end stands in front of the right
 * part of the house, with its tall end beside the opening, broken down
 * toward a gap of a meter, wide enough to walk through, between it and the
 * whole stretch in front of the well.
 */
const YARD_WALL_ENDS_ON_HOUSE: readonly Spot[] = [
  [-3.37, 4.8, 0],
  [3.32, 4.8, 0],
];

/**
 * The spot of the apothecary shop, the cottage at the back of the village on
 * the north-west, facing the plaza.
 */
const APOTHECARY_SPOT: Spot = [-10.5, -16.5, 55];

/**
 * Where Basil the apothecary stands outside his shop, and which way he
 * faces, as the model of the shop has it: just off the step in front of the
 * closed door, on the side of the herb rack, half turned toward it.
 */
const APOTHECARY_AT_DOOR: Spot = [0.55, 2.95, -35];

/**
 * Where the herb rack of the apothecary stands, as the model of the shop
 * has it: in front of the front window, from near the front corner of the
 * house up to the step of the door, its back clear of the sill of the
 * window, so that the window shows over its top and between its shelves.
 */
const HERB_RACK_ON_SHOP: Spot = [-0.96, 2.36, 0];

/**
 * Where the crate of potion bottles of the apothecary stands, as the
 * model of the shop has it: on the ground at the end of the herb rack away
 * from the door, in front of the corner of the house.
 */
const POTION_CRATE_ON_SHOP: Spot = [-2.85, 2.35, 0];

/**
 * Where the crate planted with herbs stands, as the model of the shop has
 * it: on the ground in front of the left half of the herb rack, turned a
 * little askew.
 */
const HERB_CRATE_ON_SHOP: Spot = [-1.5, 2.95, -12];

/**
 * Where the potted plant stands, as the model of the shop has it: in front
 * of the herb rack, at its end by the door.
 */
const POTTED_PLANT_ON_SHOP: Spot = [-0.15, 2.85, 0];

/**
 * Where the barrels stand, as the model of the shop has it: one against the
 * front wall between the door and the corner of the house, and one against
 * the side wall beyond the window, by the front corner.
 */
const BARRELS_ON_SHOP: readonly Spot[] = [
  [2.05, 2.5, 20],
  [-2.95, 1.3, 70],
];

/**
 * Finds the spot in the world of something placed on a model.
 *
 * @param {Spot} model - The spot of the model.
 * @param {Spot} local - The spot of what is placed on it, as the model has
 *   it before it is placed.
 * @returns {Spot} The spot in the world.
 */
function placeSpot(model: Spot, local: Spot): Spot {
  const [x, z, yaw] = model;
  const point: GroundVector = placePoint({ x, z, yaw }, {
    x: local[0],
    z: local[1],
  });
  return [point.x, point.z, yaw + local[2]];
}

/**
 * Makes a pose of a spot.
 *
 * @param {Spot} spot - The spot.
 * @returns {Pose} Where the spot is on the ground, and which way it faces.
 */
function makePose([x, z, yaw]: Spot): Pose {
  return { x, z, yaw };
}

/**
 * Makes a spot of a pose.
 *
 * @param {Pose} pose - The pose.
 * @returns {Spot} The spot, where the pose is, facing the way it faces.
 */
function makeSpot({ x, z, yaw }: Pose): Spot {
  return [x, z, yaw];
}

/**
 * Where the spawn stones stand, around the burrow of the wild dog, a
 * little way outside the village gate, and which way they face.
 */
export const SPAWN_STONES_POSE: Pose = makePose([11.4, 9, -30]);

/**
 * Where Nancy the villager stands, by the fountain, and which way she
 * faces.
 */
export const NANCY_POST: Pose = makePose([3.2, -6.4, -25]);

/**
 * Where Emma the smith stands at the anvil by the forge of the weapon
 * shop, and which way she faces.
 */
export const EMMA_POST: Pose = makePose(
  placeSpot(WEAPON_SHOP_SPOT, SMITH_AT_ANVIL),
);

/**
 * Where Basil the apothecary stands by the door of his shop, and which way
 * he faces.
 */
export const BASIL_POST: Pose = makePose(
  placeSpot(APOTHECARY_SPOT, APOTHECARY_AT_DOOR),
);

/**
 * Where Martha, the village chief, stands on the porch of her house, and
 * which way she faces, while she is at home.
 */
export const MARTHA_POST: Pose = makePose(
  placeSpot(CHIEF_HOUSE_SPOT, CHIEF_ON_PORCH),
);

/** The spots of the models the village has a place for. */
const SPOTS: Readonly<Partial<Record<ModelId, readonly Spot[]>>> = {
  fountain: [[PLAZA_CENTER.x, PLAZA_CENTER.z, 0]],
  'weapon-shop': [WEAPON_SHOP_SPOT],
  nancy: [makeSpot(NANCY_POST)],
  emma: [makeSpot(EMMA_POST)],
  'spawn-stones': [makeSpot(SPAWN_STONES_POSE)],
  'great-tree': [[0, -14.5, 20]],
  'healing-stele': [[-2.1, -6.8, 20]],
  'village-sign': [[-3.1, 4.9, 0]],
  cottage: [[-11, -4.5, 90]],
  apothecary: [APOTHECARY_SPOT],
  basil: [makeSpot(BASIL_POST)],
  'herb-rack': [placeSpot(APOTHECARY_SPOT, HERB_RACK_ON_SHOP)],
  'potion-crate': [placeSpot(APOTHECARY_SPOT, POTION_CRATE_ON_SHOP)],
  'herb-crate': [placeSpot(APOTHECARY_SPOT, HERB_CRATE_ON_SHOP)],
  'potted-plant': [placeSpot(APOTHECARY_SPOT, POTTED_PLANT_ON_SHOP)],
  barrel: BARRELS_ON_SHOP.map((spot: Spot) =>
    placeSpot(APOTHECARY_SPOT, spot),
  ),
  'chief-house': [CHIEF_HOUSE_SPOT],
  martha: [makeSpot(MARTHA_POST)],
  pitchfork: [placeSpot(CHIEF_HOUSE_SPOT, PITCHFORK_AGAINST_WALL)],
  'old-well': [placeSpot(CHIEF_HOUSE_SPOT, WELL_IN_YARD)],
  'yard-wall': YARD_WALL_ON_HOUSE.map((spot: Spot) =>
    placeSpot(CHIEF_HOUSE_SPOT, spot),
  ),
  'yard-wall-end': YARD_WALL_ENDS_ON_HOUSE.map((spot: Spot) =>
    placeSpot(CHIEF_HOUSE_SPOT, spot),
  ),
  'pine-tree': [
    [-16.5, 0.5, 0],
    [-18.5, -6, 40],
    [-18, -13.5, 80],
    [-14.5, -21.5, 120],
    [-10, -24.5, 160],
    [0, -26, 200],
    [10, -24.5, 240],
    [14.5, -21.5, 280],
    [18, -14, 320],
    [18.5, -7, 0],
    [17.5, 0, 40],
    [-11, 7, 80],
    [-15, 4, 120],
    [17, 12, 160],
    [6, 16.5, 200],
    [-24, -18, 240],
    [24, -22, 280],
    [-3, -33, 320],
    [23, 5, 0],
    [-22, 9, 40],
  ],
  bush: [
    [-3.3, -11.2, 0],
    [3.4, -11.4, 70],
    [-4.7, -12.5, 140],
    [7.6, -24.2, 210],
    [-5, 4.6, 280],
    [-6.8, 6.2, 350],
    [-4.6, 7.6, 60],
    [-8.6, 4.6, 130],
    [-7, 9, 200],
    [4.4, 5, 270],
    [4.6, 13.6, 340],
    [4.3, 7.4, 50],
    [15.2, 1.4, 120],
    [-15, -10.5, 190],
    [15, -10.5, 260],
  ],
  clover: [
    // The patch Toby squats by at the end of his run by the gate, where the
    // second of TOBY_CLOVERS is.
    [-3.6, 3.4, 0],
    [-3.4, 6.4, 50],
    [-5.6, 9.2, 100],
    [3.4, 3.4, 150],
    [-3.6, 10.5, 200],
    [-2.6, -10.2, 250],
    [2.6, -10.3, 300],
    // The patch Toby squats by at the end of his run by the cottage, where
    // the first of TOBY_CLOVERS is.
    [-8, -0.2, 350],
    [7.4, 0.4, 40],
    [-13.5, -9.5, 90],
    [13.5, -10, 140],
  ],
  rock: [
    [6.6, 10.4, 30],
    [14.6, 6.4, 120],
    [-9.5, 8, 250],
    [-16, -11.5, 80],
  ],
  fence: [
    [-6, 3, 0],
    [-8, 3, 0],
    [-10, 3, 0],
    [6, 3, 0],
    [8, 3, 0],
    [10, 3, 0],
    [12, 3, 0],
    [14, 3, 0],
    [-16.5, -8.5, 90],
    [-16.5, -10.5, 90],
    [-16.5, -12.5, 90],
    [16.5, -8.5, 90],
    [16.5, -10.5, 90],
    [16.5, -12.5, 90],
    [-2, -23, 0],
    [0, -23, 0],
    [2, -23, 0],
  ],
};

/**
 * Where the models the village has a place for stand, model by model and,
 * for a model that stands in several places, place by place.
 */
export const VILLAGE_PLACEMENTS: readonly Placement[] = (
  Object.entries(SPOTS) as [ModelId, readonly Spot[]][]
).flatMap(([model, spots]: [ModelId, readonly Spot[]]) =>
  spots.map(([x, z, yaw]: Spot): Placement => ({ model, x, z, yaw })),
);

/**
 * Where a player stands beside the old well in the yard of the chief's
 * house when it has climbed up out of the cave, and which way it faces:
 * beside the well on the side of the porch, facing the house with the
 * porch a little to its left, and with the plaza behind it.
 */
export const WELL_STAND: Pose = makePose(
  placeSpot(CHIEF_HOUSE_SPOT, BESIDE_WELL),
);

/**
 * Where Martha stands to take up her pitchfork from the front wall of her
 * house, or to lean it there again: on the porch, just in front of it.
 */
export const PITCHFORK_STAND: GroundVector = (() => {
  const [x, z] = placeSpot(CHIEF_HOUSE_SPOT, BEFORE_PITCHFORK);
  return { x, z };
})();

/**
 * Makes a round footprint.
 *
 * @param {number} x - The center along the X axis of the model.
 * @param {number} z - The center along the Z axis of the model.
 * @param {number} radius - The radius.
 * @returns {Shape} The footprint.
 */
function makeCircle(x: number, z: number, radius: number): Shape {
  return { shape: 'circle', x, z, radius };
}

/**
 * Makes a rectangular footprint, square with the model.
 *
 * @param {number} left - The least extent along the X axis of the model.
 * @param {number} right - The greatest extent along the X axis.
 * @param {number} back - The least extent along the Z axis of the model.
 * @param {number} front - The greatest extent along the Z axis.
 * @returns {Shape} The footprint.
 */
function makeBox(
  left: number,
  right: number,
  back: number,
  front: number,
): Shape {
  return {
    shape: 'box',
    x: (left + right) / 2,
    z: (back + front) / 2,
    halfWidth: (right - left) / 2,
    halfDepth: (front - back) / 2,
    yaw: 0,
  };
}

/**
 * The radius of the rim of the basin of the fountain, inside the low step
 * around it, in meters.
 */
export const FOUNTAIN_RIM_RADIUS = 1.6;

/**
 * The ground each model takes up where nobody can walk, as the model has it
 * before it is placed.  The clover, which anyone can step over, takes up
 * none, and neither does Martha, who moves around as the monsters do, and
 * stands in nobody's way, as they do not.
 */
const FOOTPRINTS: Readonly<Partial<Record<ModelId, readonly Shape[]>>> = {
  // The rim of the basin, inside the low step around it.
  fountain: [makeCircle(0, 0, FOUNTAIN_RIM_RADIUS)],
  // The house; the forge beside it; the anvil out in front of the forge,
  // from the tip of its horn to its heel, and the stump it stands on; the
  // box of coal against the side of the forge away from the house; and the
  // stall in front of the house, with the barrel by its end.
  'weapon-shop': [
    makeBox(-3.7656, 1.6844, -2.95, 1.9),
    makeBox(1.6844, 3.57, -1.85, 0.13),
    makeBox(2.95, 3.21, 0.367, 1.227),
    makeCircle(3.08, 0.887, 0.34),
    makeBox(3.6, 3.98, -0.523, 0.077),
    makeBox(-1.5656, 1.8944, 1.9, 3.05),
  ],
  nancy: [makeCircle(0, 0, 0.35)],
  emma: [makeCircle(0, 0, 0.3)],
  // The five standing stones, and not the burrow they stand around.
  'spawn-stones': Array.from({ length: 5 }, (_, index: number) => {
    const { x, z } = turnVector({ x: 0, z: 1.75 }, findTurn(index * 72 + 36));
    return makeCircle(x, z, 0.35);
  }),
  // The trunk, and not the roots.
  'great-tree': [makeCircle(-0.15, 0.41, 1.6)],
  // The foot of the boulder.
  'healing-stele': [makeBox(-0.355, 0.355, -0.24, 0.24)],
  // The post, and not the board nailed to it above the ground.
  'village-sign': [makeCircle(0.005, -0.02, 0.07)],
  cottage: [makeBox(-2.55, 2.55, -2.35, 2.35)],
  // A cottage, with another roof and a sign in its gable.
  apothecary: [makeBox(-2.55, 2.55, -2.35, 2.35)],
  // Basil, and the writing board he holds out in front of him.
  basil: [makeCircle(0, 0, 0.45)],
  // The frame of the rack, with what stands on it and hangs from it.
  'herb-rack': [makeBox(-1.05, 1.05, -0.21, 0.21)],
  'potion-crate': [makeBox(-0.25, 0.25, -0.18, 0.18)],
  'herb-crate': [makeBox(-0.3, 0.3, -0.2, 0.2)],
  // The pot, and the leaves that spread over its rim.
  'potted-plant': [makeCircle(0, 0, 0.22)],
  barrel: [makeCircle(0, 0, 0.37)],
  // The house on its stone base, and the two posts of the porch in front
  // of it, and not the floor of the porch.
  'chief-house': [
    makeBox(-3.75, 3.75, -3.35, 1.95),
    makeCircle(-2, 3.45, 0.12),
    makeCircle(2, 3.45, 0.12),
  ],
  // The round stonework.
  'old-well': [makeCircle(0, 0, 0.7)],
  // The body of the stretch, which reaches a little past each end, and the
  // slabs on top of it.
  'yard-wall': [makeBox(-1.15, 1.15, -0.21, 0.21)],
  // The body of the ragged end, from its tall end to the low stones it
  // steps down to, the slab askew on top of it, and the two stones fallen
  // from it, on either side.
  'yard-wall-end': [
    makeBox(-0.77, 0.77, -0.21, 0.21),
    makeCircle(0.05, 0.42, 0.29),
    makeCircle(0.55, -0.55, 0.16),
  ],
  // The trunk and the lowest branches.
  'pine-tree': [makeCircle(0, 0, 0.6)],
  bush: [makeCircle(0, 0, 0.8)],
  rock: [makeCircle(0, 0, 0.65)],
  fence: [makeBox(-1, 1, -0.08, 0.08)],
};

/** The circle on the ground around the village that players cannot leave. */
export const VILLAGE_BOUNDARY: Boundary = { x: 0, z: -5, radius: 28 };

/**
 * The ground of the village: what stands where it is placed, and the
 * boundary.  Only the models the village has a place for stand in the way.
 */
export const VILLAGE_TERRAIN: Terrain = new Terrain(
  VILLAGE_PLACEMENTS.flatMap((placement: Placement) =>
    (FOOTPRINTS[placement.model] ?? []).map((shape: Shape) =>
      placeShape(placement, shape),
    ),
  ),
  VILLAGE_BOUNDARY,
);

/**
 * Finds where a model of the village stands.
 *
 * @param {ModelId} model - The identifier of the model.
 * @returns {Placement} The first place the model stands in.
 * @throws {Error} If the village has no place for the model.
 */
export function findPlacement(model: ModelId): Placement {
  const found: Placement | undefined = VILLAGE_PLACEMENTS.find(
    (placement: Placement) => placement.model === model,
  );
  if (found === undefined) {
    throw new Error(`The village has no place for ${model}.`);
  }
  return found;
}
