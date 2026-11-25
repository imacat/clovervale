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
 * @module client/fortress Raising the border fortress that guards the
 *   mountain pass on the way out of the valley, far off beyond the way out
 *   through the village gate.
 */

import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import type { BufferAttribute, Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import {
  GATE_TURN,
  createRandom,
  createRing,
  pickInRange,
} from './mountains.ts';
import type { Range, RidgePoint } from './mountains.ts';
import { GLASS_MATERIAL } from './window-glow.ts';

/**
 * A window on the side of a block that faces the village: how far to the
 * side of the middle of the block, and how high its middle is above the
 * crag, in meters.
 */
type BlockWindow = readonly [across: number, height: number];

/**
 * A square block of the fortress standing on the crag: its curtain wall,
 * a tower, the gate between the towers of the gatehouse, or the keep.
 */
interface Block {
  /**
   * Where its middle stands, to the right of the middle of the fortress as
   * seen from the village, in meters.
   */
  readonly x: number;
  /**
   * Where its middle stands, away from the village from the middle of the
   * fortress, in meters.
   */
  readonly z: number;
  /** How wide it is, across the way to the village, in meters. */
  readonly width: number;
  /** How deep it is, along the way to the village, in meters. */
  readonly depth: number;
  /** How high its top is above the crag, in meters. */
  readonly height: number;
  /**
   * The number of merlons along the top of its side that faces the
   * village, from one end to the other, or 0 for none.
   */
  readonly merlons: number;
  /** Its windows. */
  readonly windows: readonly BlockWindow[];
}

/** A row of merlons along the top of a wall, on its side to the village. */
interface Battlement {
  /** Where the left end of the row is, in meters. */
  readonly left: number;
  /** Where the right end of the row is, in meters. */
  readonly right: number;
  /** Where the face of the wall toward the village is, in meters. */
  readonly front: number;
  /** How high the top of the wall is above the crag, in meters. */
  readonly height: number;
  /** The number of merlons, from one end to the other. */
  readonly count: number;
}

/**
 * A point on the edge of the top of the crag, and which way is out from
 * it: across and along the way to the village, from the middle of the top
 * of the crag, in meters, then which way it faces across and along, each
 * -1, 0 or 1: to the left or the right as seen from the village, and to
 * the front or the back.
 */
type CragEdge = readonly [x: number, z: number, outX: number, outZ: number];

/**
 * A row of points around the crag, from its top down to its foot, each
 * spread out beyond the edge of the top of the crag, at least and at most,
 * in meters: across, on its steep left and its gentle right as seen from
 * the village, and along, toward the village and away from it.
 */
interface CragRow {
  /** How far out its points on the left are, in meters. */
  readonly left: Range;
  /** How far out its points on the right are, in meters. */
  readonly right: Range;
  /**
   * How far out its points toward the village at its front corners are,
   * in meters.
   */
  readonly front: Range;
  /**
   * How far out its point toward the village in the middle of its front
   * is, in meters: farther than its front corners, so that the front of
   * the crag breaks into two faces along a spine down its middle.
   */
  readonly spine: Range;
  /** How far out its points away from the village are, in meters. */
  readonly back: Range;
  /** How high its points are, at least and at most, in meters. */
  readonly height: Range;
}

/** How a part of the fortress looks, and how it melts into the sky. */
interface FortressLook {
  /** Its color, which tints the colors of its corners, if it has any. */
  readonly color: string;
  /**
   * How much it glows in the color of the sky in full daylight, hazed by
   * the air between it and the village, as a share of the brightness of
   * the sky, or `null` for the windows, which glow with the light in them
   * instead.
   */
  readonly haze: number | null;
  /**
   * How bright it is when it takes on the color of the sky, as a share of
   * the brightness of the sky, or `null` for the windows, which glow with
   * the light in them instead.
   */
  readonly skyShade: number | null;
}

/**
 * How far the middle of the fortress is from the middle of the valley,
 * straight out through the village gate, in meters: just beyond the crest
 * of the nearest ridge, which hides the foot of its crag, at the foot of
 * the next.
 */
export const FORTRESS_DISTANCE = 262;

/**
 * How the walls look: pale and blue-gray, hazed with the sky as the far
 * ridges are, yet darker than the sky, and between the nearer and the
 * farther ridges in brightness when they take on the color of the sky.
 */
const STONE_LOOK: FortressLook = {
  color: '#c6d4e0',
  haze: 0.3,
  skyShade: 0.72,
};
/**
 * How the roof of the keep and the doors of the gate look: a hazed slate
 * blue, darker than the walls.
 */
const SLATE_LOOK: FortressLook = {
  color: '#97abbf',
  haze: 0.26,
  skyShade: 0.66,
};
/** How the windows look while unlit. */
const WINDOW_LOOK: FortressLook = {
  color: '#6a7888',
  haze: null,
  skyShade: null,
};
/**
 * How the crag looks: in the colors of its corners, from those of the
 * ridges, unhazed as the ridges are, and as bright as the ridge it rises
 * out of when it takes on the color of the sky.
 */
const ROCK_LOOK: FortressLook = {
  color: '#ffffff',
  haze: 0,
  skyShade: 0.74,
};
/**
 * How the walls, the slate, the windows and then the crag look, as the
 * fortress has them.
 */
const LOOKS: readonly FortressLook[] = [
  STONE_LOOK,
  SLATE_LOOK,
  WINDOW_LOOK,
  ROCK_LOOK,
];

/** How deep the crag sinks into the ground, in meters. */
const BASE_DEPTH = 3;
/**
 * How high the top of the crag is, where the fortress stands, in meters:
 * high enough to lift its walls above the ridges behind it, seen from the
 * plaza.
 */
const CRAG_HEIGHT = 26.5;
/**
 * How far either side of the top of the crag is from the middle, in
 * meters: at the outer sides of the corner towers, so that they stand
 * right at its edge.
 */
const CRAG_SIDE = 16.2;
/**
 * Where the front of the top of the crag is, from the middle, in meters:
 * just in front of the towers.
 */
const CRAG_FRONT = -8.8;
/**
 * Where the back of the top of the crag is, from the middle, in meters:
 * just behind the curtain wall.
 */
const CRAG_BACK = 7.5;
/** Where the middle of the top of the crag is, from the middle, in meters. */
const CRAG_MIDDLE: number = (CRAG_FRONT + CRAG_BACK) / 2;
/**
 * How far the front and the back of the top of the crag are from its
 * middle, in meters.
 */
const CRAG_HALF_DEPTH: number = (CRAG_BACK - CRAG_FRONT) / 2;
/**
 * The points on the edge of the top of the crag, in order around it from
 * the middle of its back, past its right side as seen from the village:
 * its corners, and the middle of each side, few enough that its slopes
 * are as large and plain as those of the ridges around it.
 */
const CRAG_EDGES: readonly CragEdge[] = [
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
].map(
  ([across = 0, along = 0]: number[]): CragEdge => [
    across * CRAG_SIDE,
    along * CRAG_HALF_DEPTH,
    Math.trunc(across),
    along,
  ],
);
/**
 * The rows of points around the crag, from its top down to its foot: its
 * top, where the fortress stands, then a broken shoulder and a wide foot
 * sunk into the ground, each spread out farther than the one above, so
 * that it slopes out to its foot without hanging over.  It
 * falls away steeply on its left and spreads out gently on its right, far
 * out to either side, so that it rises out of the slopes of the ridge
 * behind it as a knob of the ridge.  Its front falls steeply toward the
 * village in two faces that meet along a spine down its middle, its front
 * corners drawn back, so that it reads as an edge of rock.  It spreads far
 * back, sinking into the ridge behind it.
 */
const CRAG_ROWS: readonly CragRow[] = [
  {
    left: [0, 0.3],
    right: [0, 0.3],
    front: [0, 0.3],
    spine: [0, 0.3],
    back: [0, 0.3],
    height: [CRAG_HEIGHT, CRAG_HEIGHT],
  },
  {
    left: [1.5, 3],
    right: [12, 16],
    front: [-3, -1],
    spine: [10, 13],
    back: [22, 30],
    height: [CRAG_HEIGHT - 12, CRAG_HEIGHT - 5],
  },
  {
    left: [12, 16],
    right: [21, 23],
    front: [6, 9],
    spine: [21, 24],
    back: [32, 40],
    height: [-BASE_DEPTH, -BASE_DEPTH],
  },
];
/** The seed of the random roughness of the crag. */
const CRAG_SEED = 0xc4a601;
/**
 * The color of the foot of the crag, as the nearest ridge, in front of
 * it, has.
 */
const CRAG_FOOT_COLOR = '#6f9476';
/**
 * The color of the top of the crag: a blue-gray rock, a touch lighter than
 * the ridge behind it that it rises out of, so that its steep slopes,
 * facing away from the sun more, do not look much darker than that ridge.
 */
const CRAG_TOP_COLOR = '#8fa9b5';
/**
 * How high the crag starts to turn from the color of its foot to that of
 * its top, and how high it has, as shares of its height: all in the color
 * of its top above the crest of the nearest ridge, seen from the plaza.
 */
const CRAG_COLOR_TURN: Range = [0.2, 0.55];
/**
 * How large the fortress stands on the crag, as a share of the sizes and
 * places its blocks, battlements, roof, windows and doors are given in
 * below, so that it leaves the slopes of the pass room to stand as
 * mountains.
 */
const FORTRESS_SCALE = 0.72;
/** How deep the blocks sink into the crag, in meters. */
const BLOCK_DEPTH = 1;
/** How wide a merlon is, in meters. */
const MERLON_WIDTH = 1.4;
/** How tall a merlon is, in meters. */
const MERLON_HEIGHT = 1.6;
/** How thick a merlon is, in meters. */
const MERLON_DEPTH = 1.2;
/** How tall the roof of the keep is, in meters. */
const ROOF_HEIGHT = 5;
/** How far the roof of the keep reaches out beyond it, as a share. */
const ROOF_OVERHANG = 1.12;
/** How wide a window is, in meters. */
const WINDOW_WIDTH = 1.1;
/** How tall a window is, in meters. */
const WINDOW_HEIGHT = 1.8;
/** How far a window or a door stands out from its wall, in meters. */
const FACE_LIFT = 0.05;
/** How wide the doors of the gate are, in meters. */
const DOOR_WIDTH = 3;
/** How tall the doors of the gate are, in meters. */
const DOOR_HEIGHT = 6;

/** The curtain wall: low, long and thick. */
const CURTAIN: Block = {
  x: 0,
  z: 1,
  width: 38,
  depth: 18,
  height: 14,
  merlons: 0,
  windows: [],
};
/** Where the front of the curtain wall is, from the middle, in meters. */
const CURTAIN_FRONT: number = CURTAIN.z - CURTAIN.depth / 2;
/** How far either side of the curtain wall is from the middle, in meters. */
const CURTAIN_SIDE: number = CURTAIN.width / 2;

/** The gate between the towers of the gatehouse, facing the village. */
const GATE: Block = {
  x: 0,
  z: -8.5,
  width: 5,
  depth: 5,
  height: 15,
  merlons: 2,
  windows: [],
};

/**
 * The keep in the middle, stout and square, the only one with a roof, its
 * windows high enough to show above the gatehouse.
 */
const KEEP: Block = {
  x: 0,
  z: 3,
  width: 11,
  depth: 11,
  height: 22,
  merlons: 0,
  windows: [
    [-1.8, 19],
    [1.8, 19],
  ],
};

/**
 * The squat towers with flat, crenellated tops: one at each front corner
 * of the curtain wall, and the two of the gatehouse flanking the gate.
 */
const TOWERS: readonly Block[] = [-1, 1].flatMap((side: number) => [
  {
    x: side * CURTAIN_SIDE,
    z: CURTAIN_FRONT,
    width: 7,
    depth: 7,
    height: 18,
    merlons: 3,
    windows: [[0, 14]],
  },
  {
    x: side * 5.5,
    z: -9,
    width: 6,
    depth: 6,
    height: 17,
    merlons: 3,
    windows: [[0, 12]],
  },
]);

/** All the blocks of the fortress. */
const BLOCKS: readonly Block[] = [CURTAIN, GATE, KEEP, ...TOWERS];

/**
 * The battlements: along the front of each tower and of the gate, and of
 * the curtain wall between the corner towers and the gatehouse.
 */
const BATTLEMENTS: readonly Battlement[] = [
  ...BLOCKS.filter((block: Block) => block.merlons > 0).map(
    (block: Block): Battlement => ({
      left: block.x - block.width / 2,
      right: block.x + block.width / 2,
      front: block.z - block.depth / 2,
      height: block.height,
      count: block.merlons,
    }),
  ),
  ...[-1, 1].map(
    (side: number): Battlement => ({
      left: side < 0 ? -15.5 : 8.5,
      right: side < 0 ? -8.5 : 15.5,
      front: CURTAIN_FRONT,
      height: CURTAIN.height,
      count: 2,
    }),
  ),
];

/**
 * Sets a shape of the fortress, given at the size its parts are given in
 * and standing on the ground, on the top of the crag, at the size the
 * fortress stands, and lifts it toward the village.
 *
 * @param {BufferGeometry} shape - The shape, which is changed.
 * @param {number} lift - How far to lift it toward the village, in meters.
 * @returns {BufferGeometry} The shape, in the fortress.
 */
function raiseOntoCrag(shape: BufferGeometry, lift: number): BufferGeometry {
  shape.scale(FORTRESS_SCALE, FORTRESS_SCALE, FORTRESS_SCALE);
  shape.translate(0, CRAG_HEIGHT, -lift);
  return shape;
}

/**
 * Creates the shape of a block standing on the ground.
 *
 * @param {Block} block - The block.
 * @returns {BufferGeometry} The block, at the size its parts are given in.
 */
function createBlockShape(block: Block): BufferGeometry {
  const shape = new BoxGeometry(
    block.width,
    block.height + BLOCK_DEPTH,
    block.depth,
  );
  shape.translate(block.x, (block.height - BLOCK_DEPTH) / 2, block.z);
  return shape;
}

/**
 * Creates the shapes of the merlons of a battlement.
 *
 * @param {Battlement} battlement - The battlement.
 * @returns {BufferGeometry[]} The merlons, at the size their parts are
 *   given in, standing on the ground.
 */
function createMerlonShapes(battlement: Battlement): BufferGeometry[] {
  const room: number = battlement.right - battlement.left - MERLON_WIDTH;
  return Array.from({ length: battlement.count }, (_, index: number) => {
    const shape = new BoxGeometry(MERLON_WIDTH, MERLON_HEIGHT, MERLON_DEPTH);
    shape.translate(
      battlement.left +
        MERLON_WIDTH / 2 +
        (room * index) / Math.max(battlement.count - 1, 1),
      battlement.height + MERLON_HEIGHT / 2,
      battlement.front + MERLON_DEPTH / 2,
    );
    return shape;
  });
}

/**
 * Creates the shape of the stone of the fortress: its curtain wall, its
 * towers, its gate and its keep, with their battlements.
 *
 * @returns {BufferGeometry} The stone, in the fortress.
 */
function createStoneShape(): BufferGeometry {
  const shape: BufferGeometry = mergeGeometries([
    ...BLOCKS.map(createBlockShape),
    ...BATTLEMENTS.flatMap(createMerlonShapes),
  ]);
  return raiseOntoCrag(shape, 0);
}

/**
 * Creates a flat face on the side of the fortress that faces the village,
 * standing out from its wall.
 *
 * @param {number} width - How wide it is, in meters.
 * @param {number} height - How tall it is, in meters.
 * @param {number} x - Where its middle is across, in meters.
 * @param {number} y - How high its middle is above the crag, in meters.
 * @param {number} front - Where the face of the wall it is on is.
 * @returns {BufferGeometry} The face, in the fortress, facing the village.
 */
function createFace(
  width: number,
  height: number,
  x: number,
  y: number,
  front: number,
): BufferGeometry {
  const shape = new PlaneGeometry(width, height);
  shape.rotateY(Math.PI);
  shape.translate(x, y, front);
  return raiseOntoCrag(shape, FACE_LIFT);
}

/**
 * Creates the shape of the slate of the fortress: the low pyramid roof of
 * the keep, and the doors of the gate.
 *
 * @returns {BufferGeometry} The slate, in the fortress.
 */
function createSlateShape(): BufferGeometry {
  const roof = new ConeGeometry(
    (KEEP.width / 2) * Math.SQRT2 * ROOF_OVERHANG,
    ROOF_HEIGHT,
    4,
    1,
    true,
    Math.PI / 4,
  );
  roof.translate(KEEP.x, KEEP.height + ROOF_HEIGHT / 2, KEEP.z);
  const door: BufferGeometry = createFace(
    DOOR_WIDTH,
    DOOR_HEIGHT,
    GATE.x,
    DOOR_HEIGHT / 2,
    GATE.z - GATE.depth / 2,
  );
  return mergeGeometries([raiseOntoCrag(roof, 0), door]);
}

/**
 * Creates the shape of the windows of the blocks, each on the side of its
 * block that faces the village.
 *
 * @returns {BufferGeometry} The windows, in the fortress, facing the
 *   village.
 */
function createWindowShape(): BufferGeometry {
  return mergeGeometries(
    BLOCKS.flatMap((block: Block) =>
      block.windows.map(([across, height]: BlockWindow) =>
        createFace(
          WINDOW_WIDTH,
          WINDOW_HEIGHT,
          block.x + across,
          height,
          block.z - block.depth / 2,
        ),
      ),
    ),
  );
}

/**
 * Finds the rows of points around the crag, from its top down to its
 * foot, each spread out at random beyond the edge of its top, and at a
 * random height, the same every time.
 *
 * @returns {RidgePoint[][]} The rows, each with a point an edge of the
 *   top of the crag, around the middle of the top of the crag.
 */
function findCragPoints(): RidgePoint[][] {
  const random: () => number = createRandom(CRAG_SEED);
  return CRAG_ROWS.map((row: CragRow) =>
    CRAG_EDGES.map(([x, z, outX, outZ]: CragEdge): RidgePoint => {
      const side: Range = outX < 0 ? row.left : row.right;
      const front: Range = outX === 0 ? row.spine : row.front;
      const end: Range = outZ < 0 ? front : row.back;
      const across: number = x + outX * pickInRange(side, random());
      const along: number = z + outZ * pickInRange(end, random());
      const height: number = pickInRange(row.height, random());
      return [Math.atan2(across, along), Math.hypot(across, along), height];
    }),
  );
}

/**
 * Creates the shape of the flat top of the crag, where the fortress
 * stands, facing up.
 *
 * @param {readonly RidgePoint[]} edge - The points on its edge, in order
 *   around the middle of the top of the crag.
 * @returns {BufferGeometry} The top, around the middle of the top of the
 *   crag.
 */
function createCragTop(edge: readonly RidgePoint[]): BufferGeometry {
  const positions: number[] = [];
  edge.forEach(([turn, distance, height]: RidgePoint, index: number) => {
    const [nextTurn = 0, nextDistance = 0, nextHeight = 0] =
      edge[(index + 1) % edge.length] ?? [];
    positions.push(
      0,
      CRAG_HEIGHT,
      0,
      Math.sin(turn) * distance,
      height,
      Math.cos(turn) * distance,
      Math.sin(nextTurn) * nextDistance,
      nextHeight,
      Math.cos(nextTurn) * nextDistance,
    );
  });
  const shape = new BufferGeometry();
  shape.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return shape;
}

/**
 * Colors the corners of the crag by how high they are: in the color of the
 * nearest ridge at its foot, turning to a blue-gray rock a touch lighter
 * than the ridge behind it toward its top.
 *
 * @param {BufferGeometry} shape - The crag.
 */
function colorCrag(shape: BufferGeometry): void {
  const foot = new Color(CRAG_FOOT_COLOR);
  const top = new Color(CRAG_TOP_COLOR);
  const color = new Color();
  const position = shape.getAttribute('position') as BufferAttribute;
  const colors: number[] = [];
  for (let index = 0; index < position.count; index++) {
    const [low, high] = CRAG_COLOR_TURN;
    const share: number = MathUtils.smoothstep(
      position.getY(index) / CRAG_HEIGHT,
      low,
      high,
    );
    color.lerpColors(foot, top, share);
    colors.push(color.r, color.g, color.b);
  }
  shape.setAttribute('color', new Float32BufferAttribute(colors, 3));
}

/**
 * Creates the shape of the crag that the fortress stands on: a rough,
 * low-poly knob of rock with a top no wider than the fortress, which
 * stands right at its edge, its broken sides falling steeply on its left
 * and spreading out gently on its right, as seen from the village, to a
 * wide foot, in the color of the nearest ridge at its foot, turning to a
 * blue-gray rock a touch lighter than the ridge behind it toward its top.
 * It is the same every time.
 *
 * @returns {BufferGeometry} The crag, in the fortress, with the colors of
 *   its corners.
 */
function createCragShape(): BufferGeometry {
  const rows: RidgePoint[][] = findCragPoints();
  const ring: Mesh = createRing(rows, CRAG_TOP_COLOR);
  (ring.material as MeshStandardMaterial).dispose();
  const shape: BufferGeometry = mergeGeometries([
    ring.geometry.deleteAttribute('normal'),
    createCragTop(rows[0] ?? []),
  ]);
  shape.translate(0, 0, CRAG_MIDDLE);
  colorCrag(shape);
  return shape;
}

/**
 * Creates a part of the fortress, with flat facets in the color it looks,
 * tinting the colors of the corners of its shape, if it has any.
 *
 * @param {BufferGeometry} shape - The shape of the part.
 * @param {FortressLook} look - How it looks.
 * @param {string} name - The name of its material.
 * @returns {Mesh} The part.
 */
function createPart(
  shape: BufferGeometry,
  look: FortressLook,
  name: string,
): Mesh {
  const material = new MeshStandardMaterial({
    color: look.color,
    roughness: 1,
    flatShading: true,
    vertexColors: shape.hasAttribute('color'),
  });
  material.name = name;
  return new Mesh(shape, material);
}

/**
 * Creates the border fortress that guards the mountain pass on the way out
 * of the valley: a low-poly silhouette of a low, thick curtain wall with
 * squat, flat-topped towers and battlements, a gatehouse facing the
 * village and a stout keep with a low roof, pale and blue-gray, on a
 * rough crag in the colors of the ridges, a knob rising out of the ridge
 * behind it that lifts the fortress above the ridges behind it, standing
 * far off straight out through the village gate, beyond the crest of the
 * nearest ridge, which hides the foot of the crag.  It is hazed with the
 * sky only once {@link tintFortress} tints it.  Its towers and its keep
 * have a few windows toward the village, of the material that the light
 * in the windows of the houses lights.  It is the same every time.
 *
 * @returns {Group} The fortress, named `fortress`, with its walls, its
 *   slate, its windows and its crag as its children, in that order.
 */
export function createFortress(): Group {
  const fortress = new Group();
  fortress.name = 'fortress';
  fortress.add(
    createPart(createStoneShape(), STONE_LOOK, 'fortress-stone'),
    createPart(createSlateShape(), SLATE_LOOK, 'fortress-slate'),
    createPart(createWindowShape(), WINDOW_LOOK, GLASS_MATERIAL),
    createPart(createCragShape(), ROCK_LOOK, 'fortress-rock'),
  );
  fortress.position.set(
    Math.sin(GATE_TURN) * FORTRESS_DISTANCE,
    0,
    Math.cos(GATE_TURN) * FORTRESS_DISTANCE,
  );
  fortress.rotation.y = GATE_TURN;
  return fortress;
}

/**
 * Has the fortress take on the color of the sky instead of its own, as far
 * as told, as the mountains do, its walls, its slate and its crag glowing
 * in the color of the sky as their own colors fade, as bright as a ridge
 * between the nearest and the farthest.  Untinted, its walls and its slate
 * glow a little in the color of the sky still, hazed by the air between
 * the fortress and the village, while its crag, as the ridges, does not.
 * Its windows only darken, leaving their glow to the light in them.
 *
 * @param {Object3D} fortress - The fortress, as {@link createFortress}
 *   creates it.
 * @param {Color} sky - The color of the sky.
 * @param {number} share - How far it takes on the color of the sky, from 0
 *   for its own colors to 1 for the color of the sky alone.
 */
export function tintFortress(
  fortress: Object3D,
  sky: Color,
  share: number,
): void {
  fortress.children.forEach((child: Object3D, index: number) => {
    const look: FortressLook | undefined = LOOKS[index];
    if (look === undefined || !(child instanceof Mesh)) {
      return;
    }
    const material = child.material as MeshStandardMaterial;
    material.color.set(look.color).multiplyScalar(1 - share);
    if (look.haze !== null && look.skyShade !== null) {
      material.emissive
        .copy(sky)
        .multiplyScalar(MathUtils.lerp(look.haze, look.skyShade, share));
    }
  });
}
