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
 * @module shared/cave The cave under the burrow of the wild dog: its
 *   passage and chambers, where its models stand, what its store rooms hold,
 *   and the ground they take up.
 *
 * The cave has a frame of its own, apart from the village.  X runs east
 * from the foot of the old well shaft, along the middle of the passage,
 * and Z runs south across it, so that north is -Z, as in the village.
 */

import type { ItemKindId } from './items.ts';
import { findYaw } from './movement.ts';
import type { GroundVector } from './movement.ts';
import { Terrain, placeShape } from './terrain.ts';
import type { Boundary, Pose, Shape } from './terrain.ts';
import type { Placement } from './village-layout.ts';

/** A stretch of floor on the ground, square with the axes of the cave. */
export interface CaveRoom {
  /** The least extent along X, in metres. */
  readonly west: number;
  /** The greatest extent along X, in metres. */
  readonly east: number;
  /** The least extent along Z, in metres. */
  readonly north: number;
  /** The greatest extent along Z, in metres. */
  readonly south: number;
}

/** The length of the passage, from the foot of the well shaft, in metres. */
export const CAVE_PASSAGE_LENGTH = 20;

/** Half the width of the passage, in metres. */
export const CAVE_PASSAGE_HALF_WIDTH = 1.5;

/** How deep each side chamber reaches from the passage, in metres. */
export const CAVE_CHAMBER_DEPTH = 3.5;

/**
 * The radius of the round bottom of the old well shaft at the west end of
 * the passage, around the foot of the shaft, in metres.
 */
export const CAVE_SHAFT_RADIUS: number = CAVE_PASSAGE_HALF_WIDTH;

/**
 * The passage, from the foot of the well shaft at its west end to the foot
 * of the slope down from the burrow at its east end.
 */
export const CAVE_PASSAGE: CaveRoom = {
  west: 0,
  east: CAVE_PASSAGE_LENGTH,
  north: -CAVE_PASSAGE_HALF_WIDTH,
  south: CAVE_PASSAGE_HALF_WIDTH,
};

/**
 * Makes the pair of side chambers that open off the passage between two
 * distances from the foot of the well shaft, one on either side.
 *
 * @param {number} west - The distance of their west walls, in metres.
 * @param {number} east - The distance of their east walls, in metres.
 * @returns {readonly [CaveRoom, CaveRoom]} The chamber on the north side,
 *   and the one on the south side.
 */
function makeChamberPair(
  west: number,
  east: number,
): readonly [CaveRoom, CaveRoom] {
  const edge: number = CAVE_PASSAGE_HALF_WIDTH;
  const far: number = edge + CAVE_CHAMBER_DEPTH;
  return [
    { west, east, north: -far, south: -edge },
    { west, east, north: edge, south: far },
  ];
}

/**
 * The pair of side chambers nearer the well shaft, which open wide onto the
 * passage, the one on the north first.
 */
export const CAVE_STORE_ROOMS: readonly [CaveRoom, CaveRoom] =
  makeChamberPair(3.5, 7.5);

/**
 * The pair of side chambers nearer the slope, the one on the north first,
 * which open onto the passage along their whole length.
 */
export const CAVE_CELLS: readonly [CaveRoom, CaveRoom] = makeChamberPair(
  11,
  15,
);

/** Every side chamber of the cave. */
export const CAVE_CHAMBERS: readonly CaveRoom[] = [
  ...CAVE_STORE_ROOMS,
  ...CAVE_CELLS,
];

/**
 * Where a player arrives in the cave, and which way it faces: at the foot
 * of the slope down from the burrow, on the middle of the passage, facing
 * west along it.
 */
export const CAVE_LANDING: Pose = { x: 18.2, z: 0, yaw: -90 };

/**
 * Where the wild dogs of the cave live and come back to life, and which way
 * each faces there: on the middle of the passage, facing east towards the
 * landing, the first by the cells, near enough to the landing to notice a
 * player who arrives there, and the second on the narrow stretch between
 * the cells and the store rooms.
 */
export const CAVE_DOG_HOMES: readonly Pose[] = [
  { x: 14.5, z: 0, yaw: 90 },
  { x: 9.25, z: 0, yaw: 90 },
];

/** Where the rope hangs down the old well shaft to the floor. */
export const CAVE_ROPE: GroundVector = { x: 0, z: 0 };

/** The radius of the coil of the rope on the floor, in metres. */
const ROPE_RADIUS = 0.12;

/** The height of the flames of the torches above the floor, in metres. */
export const CAVE_FLAME_HEIGHT = 1.95;

/**
 * How far a torch stands out from the wall it hangs on, from the wall to
 * the front of its bracket, in metres.  Its model stands at the middle of
 * that.
 */
export const CAVE_TORCH_DEPTH = 0.3;

/**
 * How far in front of the middle of its model the flame of a torch burns,
 * in metres.
 */
export const CAVE_FLAME_AHEAD = 0.06;

/** The distances of the pairs of torches from the foot of the well shaft. */
const TORCH_DISTANCES: readonly number[] = [2, 9.25, 17.2];

/**
 * Where the mouth of the burrow opens onto the world outside: the face of
 * the rock at the top of the slope at the east end of the passage, out of
 * the reach of the players, on the middle of the passage.
 */
export const CAVE_MOUTH: GroundVector = { x: 23, z: 0 };

/**
 * The outline of the opening of the mouth of the burrow in the face of the
 * rock, as it is seen from down the slope: points across the passage, from
 * north to south, and their heights, in metres, round the opening from the
 * foot of its north side over its top to the foot of its south side, the
 * foot lying on the top of the slope.
 */
export const CAVE_MOUTH_OUTLINE: readonly (readonly [
  across: number,
  height: number,
])[] = [
  [-1.15, 3.12],
  [-1.12, 3.65],
  [-0.95, 4.12],
  [-0.62, 4.44],
  [-0.2, 4.6],
  [0.25, 4.58],
  [0.66, 4.4],
  [0.98, 4.05],
  [1.14, 3.6],
  [1.15, 3.12],
];

/** The file name of the model of the rock, the floor and the stonework. */
export const CAVE_FILE = 'prop-cave.glb';

/** The file name of the model of a torch on a wall. */
export const CAVE_TORCH_FILE = 'prop-cave-torch.glb';

/**
 * The file name of the model of the row of iron bars that closes off a cell
 * from the passage, across its whole opening.
 */
export const CAVE_BARS_FILE = 'prop-cave-bars.glb';

/** The file name of the model of the prisoner in the north cell. */
export const CAVE_EDWIN_FILE = 'npc-edwin.glb';

/**
 * The file name of the model of the bones of a dead prisoner, slumped
 * against the back wall of the south cell.
 */
export const CAVE_SKELETON_FILE = 'prop-cave-skeleton.glb';

/**
 * How far the bars of a cell reach to either side of the edge of the
 * passage they stand on, in metres.
 */
export const CAVE_BARS_HALF_DEPTH = 0.05;

/**
 * How far behind the bars of his cell the prisoner stands, from their
 * middle to his, in metres: close enough for his hands to hold them.
 */
export const CAVE_EDWIN_BEHIND_BARS = 0.42;

/**
 * Half the depth of the bones of the dead prisoner, from the middle of
 * their model to the back wall they lean on, in metres.
 */
const SKELETON_HALF_DEPTH = 0.385;

/** A kind of container in the store rooms. */
export type CaveContainerKind = 'chest' | 'barrel';

/**
 * A container in a store room: where it stands, the way its front faces,
 * and what it holds while nobody has looted it.
 */
export interface CaveContainer extends Pose {
  /** Whether it is a chest or a barrel. */
  readonly kind: CaveContainerKind;
  /** The kind of item it holds, or `null` if it is empty. */
  readonly item: ItemKindId | null;
}

/** The file names of the models of a kind of container. */
export interface CaveContainerFiles {
  /** The model of the container shut, as it stands while it holds its item. */
  readonly closed: string;
  /** The model of the container open and empty. */
  readonly open: string;
}

/** The file names of the models of each kind of container. */
export const CAVE_CONTAINER_FILES: Readonly<
  Record<CaveContainerKind, CaveContainerFiles>
> = {
  chest: { closed: 'prop-cave-chest.glb', open: 'prop-cave-chest-open.glb' },
  barrel: {
    closed: 'prop-cave-barrel.glb',
    open: 'prop-cave-barrel-open.glb',
  },
};

/** The radius of a barrel, round the widest of its belly, in metres. */
const BARREL_RADIUS = 0.3;

/** Half the width of a chest, from its middle to the end of a handle. */
const CHEST_HALF_WIDTH = 0.52;

/** Half the depth of a chest, from its middle to its back or its lock. */
const CHEST_HALF_DEPTH = 0.3;

/**
 * Finds the way the front of a barrel in a corner faces: towards the middle
 * of its store room.
 *
 * @param {GroundVector} at - Where the barrel stands.
 * @param {CaveRoom} room - The store room.
 * @returns {number} The yaw, in degrees.
 */
function faceMiddle(at: GroundVector, room: CaveRoom): number {
  return findYaw({
    x: (room.west + room.east) / 2 - at.x,
    z: (room.north + room.south) / 2 - at.z,
  });
}

/**
 * The containers in the store rooms, numbered by their place in the list,
 * from 0, each along a wall with room to walk up to it: in the north store
 * room, a chest with a sword against its back wall, a barrel with a
 * four-leaved clover in its corner to the west of the chest, and an empty
 * barrel against its east wall near the passage; in the south store room,
 * a chest with a leather armour against its back wall, a barrel with a
 * healing potion in its corner to the east of the chest, and a barrel with
 * a four-leaved clover against its west wall near the passage.
 */
export const CAVE_CONTAINERS: readonly CaveContainer[] = (() => {
  const [north, south] = CAVE_STORE_ROOMS;
  const middle: number = (north.west + north.east) / 2;
  const back: number = CAVE_CHAMBER_DEPTH + CAVE_PASSAGE_HALF_WIDTH;
  const chestZ: number = back - CHEST_HALF_DEPTH - 0.05;
  const corner: number = back - 0.5;
  const nearZ: number = CAVE_PASSAGE_HALF_WIDTH + 1.2;
  const westX: number = north.west + 0.5;
  const eastX: number = north.east - 0.5;
  return [
    { kind: 'chest', x: middle, z: -chestZ, yaw: 0, item: 'sword' },
    {
      kind: 'barrel',
      x: westX,
      z: -corner,
      yaw: faceMiddle({ x: westX, z: -corner }, north),
      item: 'clover',
    },
    { kind: 'barrel', x: eastX, z: -nearZ, yaw: -90, item: null },
    {
      kind: 'chest',
      x: middle,
      z: chestZ,
      yaw: 180,
      item: 'leather-armour',
    },
    {
      kind: 'barrel',
      x: eastX,
      z: corner,
      yaw: faceMiddle({ x: eastX, z: corner }, south),
      item: 'healing-potion',
    },
    { kind: 'barrel', x: westX, z: nearZ, yaw: 90, item: 'clover' },
  ];
})();

/**
 * The middle of the ground the model of the cave covers, which it stands
 * on: from 2.75 m west of the foot of the well shaft to 23.25 m east of
 * it, and 6.5 m either side of the passage.
 */
export const CAVE_MODEL_CENTRE: GroundVector = { x: 10.25, z: 0 };

/**
 * Where each torch on the walls of the passage stands, as the wall it hangs
 * on faces: a pair by the well shaft, a pair between the two pairs of side
 * chambers, and a pair by the slope, one on either wall of each pair, each
 * facing across the passage.
 */
const TORCH_SPOTS: readonly Pose[] = TORCH_DISTANCES.flatMap(
  (x: number): Pose[] => {
    const z: number = CAVE_PASSAGE_HALF_WIDTH - CAVE_TORCH_DEPTH / 2;
    return [
      { x, z: -z, yaw: 0 },
      { x, z, yaw: 180 },
    ];
  },
);

/**
 * Where the models of the cave stand, but for its containers: the rock,
 * the floor and the stonework in one; the torches on the walls of the
 * passage; the bars across the opening of each cell, along the edge of the
 * passage; the prisoner in the north cell, right behind its bars, half way
 * along them, facing the passage; and the bones of a dead prisoner in the
 * south cell, slumped against its back wall, facing the passage.
 */
export const CAVE_PLACEMENTS: readonly Placement[] = (() => {
  const [northCell, southCell] = CAVE_CELLS;
  const middle: number = (northCell.west + northCell.east) / 2;
  const edge: number = CAVE_PASSAGE_HALF_WIDTH;
  return [
    {
      file: CAVE_FILE,
      x: CAVE_MODEL_CENTRE.x,
      z: CAVE_MODEL_CENTRE.z,
      yaw: 0,
    },
    ...TORCH_SPOTS.map(
      (spot: Pose): Placement => ({ file: CAVE_TORCH_FILE, ...spot }),
    ),
    { file: CAVE_BARS_FILE, x: middle, z: -edge, yaw: 0 },
    { file: CAVE_BARS_FILE, x: middle, z: edge, yaw: 180 },
    {
      file: CAVE_EDWIN_FILE,
      x: middle,
      z: northCell.south - CAVE_EDWIN_BEHIND_BARS,
      yaw: 0,
    },
    {
      file: CAVE_SKELETON_FILE,
      x: middle + 0.6,
      z: southCell.south - SKELETON_HALF_DEPTH,
      yaw: 180,
    },
  ];
})();

/** Where the flame of each torch burns, above the floor of the passage. */
export const CAVE_FLAMES: readonly GroundVector[] = TORCH_SPOTS.map(
  ({ x, z }: Pose): GroundVector => ({
    x,
    z: z - Math.sign(z) * CAVE_FLAME_AHEAD,
  }),
);

/**
 * Makes a box square with the axes of the cave, in the frame of the cave.
 *
 * @param {number} west - The least extent along X.
 * @param {number} east - The greatest extent along X.
 * @param {number} north - The least extent along Z.
 * @param {number} south - The greatest extent along Z.
 * @returns {Shape} The box.
 */
function makeBox(
  west: number,
  east: number,
  north: number,
  south: number,
): Shape {
  return {
    shape: 'box',
    x: (west + east) / 2,
    z: (north + south) / 2,
    halfWidth: (east - west) / 2,
    halfDepth: (south - north) / 2,
    yaw: 0,
  };
}

/**
 * Makes the square of rock that rounds off a corner of the bottom of the
 * well shaft, turned to face the foot of the shaft, its face meeting the
 * round of the shaft.
 *
 * @param {number} side - -1 for the corner on the north, 1 for the one on
 *   the south.
 * @returns {Shape} The square.
 */
function makeShaftCorner(side: number): Shape {
  const edge: number = CAVE_PASSAGE_HALF_WIDTH;
  const half: number = edge * Math.SQRT2 - CAVE_SHAFT_RADIUS;
  return {
    shape: 'box',
    x: -edge,
    z: side * edge,
    halfWidth: half,
    halfDepth: half,
    yaw: 45,
  };
}

/** How far the rock reaches out from the cave on every side, in metres. */
const ROCK_REACH = 4;

/**
 * The ground the models of the cave take up where nobody can walk, in the
 * frame of the cave: the rock all round the passage and its side chambers,
 * the stonework at the bottom of the well shaft, the slope up to the
 * burrow, which rises too steeply to climb, and the coil of the rope on
 * the floor.  The torches hang above the heads of the players.
 */
const CAVE_SHAPES: readonly Shape[] = (() => {
  const edge: number = CAVE_PASSAGE_HALF_WIDTH;
  const far: number = edge + CAVE_CHAMBER_DEPTH;
  const west: number = -edge - ROCK_REACH;
  const east: number = CAVE_PASSAGE_LENGTH + ROCK_REACH;
  const shapes: Shape[] = [
    makeBox(west, east, -far - ROCK_REACH * 2, -far),
    makeBox(west, east, far, far + ROCK_REACH * 2),
    // The bottom of the well shaft, and the slope up to the burrow.
    makeBox(west, -edge, -edge, edge),
    makeShaftCorner(-1),
    makeShaftCorner(1),
    makeBox(CAVE_PASSAGE_LENGTH, east, -edge, edge),
    { shape: 'circle', x: CAVE_ROPE.x, z: CAVE_ROPE.z, radius: ROPE_RADIUS },
  ];
  // The rock on either side of the passage, between the side chambers.
  const stretches: readonly (readonly [number, number])[] = [
    [west, CAVE_STORE_ROOMS[0].west],
    [CAVE_STORE_ROOMS[0].east, CAVE_CELLS[0].west],
    [CAVE_CELLS[0].east, east],
  ];
  for (const [from, to] of stretches) {
    shapes.push(makeBox(from, to, -far, -edge), makeBox(from, to, edge, far));
  }
  return shapes;
})();

/**
 * The ground each model that stands in the cave besides the rock takes up
 * where nobody can walk, as the model has it before it is placed: the bars
 * of a cell, the prisoner, and the chests and the barrels, open or not.
 * The torches hang above the heads of the players, and the bones of the
 * dead prisoner lie where nobody can come.
 */
export const CAVE_FIXTURE_FOOTPRINTS: Readonly<
  Record<string, readonly Shape[]>
> = (() => {
  const half: number = (CAVE_CELLS[0].east - CAVE_CELLS[0].west) / 2;
  const { chest, barrel } = CAVE_CONTAINER_FILES;
  const chestShape: Shape = makeBox(
    -CHEST_HALF_WIDTH,
    CHEST_HALF_WIDTH,
    -CHEST_HALF_DEPTH,
    CHEST_HALF_DEPTH,
  );
  const barrelShape: Shape = {
    shape: 'circle',
    x: 0,
    z: 0,
    radius: BARREL_RADIUS,
  };
  return {
    [CAVE_BARS_FILE]: [
      makeBox(-half, half, -CAVE_BARS_HALF_DEPTH, CAVE_BARS_HALF_DEPTH),
    ],
    [CAVE_EDWIN_FILE]: [{ shape: 'circle', x: 0, z: 0, radius: 0.3 }],
    [chest.closed]: [chestShape],
    [chest.open]: [chestShape],
    [barrel.closed]: [barrelShape],
    [barrel.open]: [barrelShape],
  };
})();

/**
 * The ground the bars, the prisoner and the containers take up where they
 * stand, in the frame of the cave.
 */
const FIXTURE_SHAPES: readonly Shape[] = [
  ...CAVE_PLACEMENTS,
  ...CAVE_CONTAINERS.map(
    (container: CaveContainer): Placement => ({
      ...container,
      file: CAVE_CONTAINER_FILES[container.kind].closed,
    }),
  ),
].flatMap((placement: Placement) =>
  (CAVE_FIXTURE_FOOTPRINTS[placement.file] ?? []).map((shape: Shape) =>
    placeShape(placement, shape),
  ),
);

/** The circle on the ground around the cave that players cannot leave. */
export const CAVE_BOUNDARY: Boundary = { x: 9.25, z: 0, radius: 12 };

/**
 * The ground of the cave: the rock, the stonework, the slope and the rope;
 * the bars of the cells, the prisoner and the containers; and the boundary.
 * Nothing but the passage, the store rooms off it and the round bottom of
 * the well shaft is clear to walk on; the cells are clear, but closed off
 * by their bars.
 */
export const CAVE_TERRAIN: Terrain = new Terrain(
  [...CAVE_SHAPES, ...FIXTURE_SHAPES],
  CAVE_BOUNDARY,
);

/**
 * The ground the model of the cave takes up where nobody can walk, as the
 * model has it before it is placed.
 */
export const CAVE_FOOTPRINT: readonly Shape[] = CAVE_SHAPES.map(
  (shape: Shape) =>
    placeShape(
      { x: -CAVE_MODEL_CENTRE.x, z: -CAVE_MODEL_CENTRE.z, yaw: 0 },
      shape,
    ),
);
