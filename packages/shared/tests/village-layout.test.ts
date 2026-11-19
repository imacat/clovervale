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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/18
// AI assistance: Claude Code (Anthropic)

/**
 * @module shared/tests/village-layout Tests for where the models of the
 *   village stand, and the ground they take up.
 */

import { describe, expect, it } from 'vitest';

import {
  FOUNTAIN_REACH,
  FOUNTAIN_RIM_RADIUS,
  PLAYER_RADIUS,
  PLAZA_CENTRE,
  SPAWN_POINT_COUNT,
  Terrain,
  VILLAGE_BOUNDARY,
  VILLAGE_PLACEMENTS,
  VILLAGE_TERRAIN,
  findInteraction,
  findPlacement,
  findSpawnPoint,
  findTurn,
  placePoint,
  turnVector,
} from '../src/index.ts';
import type {
  CircleShape,
  GroundVector,
  Placement,
  Shape,
} from '../src/index.ts';

/** The models a player can walk over or into the middle of. */
const OPEN_FILES: readonly string[] = [
  'prop-clover.glb',
  'prop-spawn-stones.glb',
];

/** A gap in a fence that the way goes through. */
interface Gate extends GroundVector {
  /** Half the width of the gap, in metres. */
  readonly halfWidth: number;
}

/**
 * Finds the gate of the village on the way out to the spawn stones: the gap
 * across from the plaza in the fence that runs between the plaza and the
 * spawn stones.
 *
 * @returns {Gate} The gap.
 * @throws {Error} If no fence with a gap runs between the plaza and the
 *   spawn stones.
 */
function findGate(): Gate {
  const stones: Placement = findPlacement('prop-spawn-stones.glb');
  const fences: Placement[] = VILLAGE_PLACEMENTS.filter(
    (placement: Placement) =>
      placement.file === 'prop-fence.glb' &&
      placement.yaw === 0 &&
      placement.z > PLAZA_CENTRE.z &&
      placement.z < stones.z,
  );
  const left: number = Math.max(
    ...fences
      .filter((fence: Placement) => fence.x < PLAZA_CENTRE.x)
      .map((fence: Placement) => fence.x + 1),
  );
  const right: number = Math.min(
    ...fences
      .filter((fence: Placement) => fence.x > PLAZA_CENTRE.x)
      .map((fence: Placement) => fence.x - 1),
  );
  const [fence] = fences;
  if (fence === undefined || !(left < right)) {
    throw new Error('No fence with a gap runs out to the spawn stones.');
  }
  return { x: (left + right) / 2, z: fence.z, halfWidth: (right - left) / 2 };
}

/**
 * Measures the gap between a round footprint and another footprint.
 *
 * @param {CircleShape} circle - The round footprint.
 * @param {Shape} other - The other footprint.
 * @returns {number} The gap, in metres, negative where they overlap.
 */
function measureGap(circle: CircleShape, other: Shape): number {
  if (other.shape === 'circle') {
    return (
      Math.hypot(circle.x - other.x, circle.z - other.z) -
      circle.radius -
      other.radius
    );
  }
  const local: GroundVector = turnVector(
    { x: circle.x - other.x, z: circle.z - other.z },
    findTurn(-other.yaw),
  );
  const outX: number = Math.max(Math.abs(local.x) - other.halfWidth, 0);
  const outZ: number = Math.max(Math.abs(local.z) - other.halfDepth, 0);
  return Math.hypot(outX, outZ) - circle.radius;
}

/** A point of a square of points on the ground, and how a walk found it. */
interface GridPoint extends GroundVector {
  /** Whether the point lies on the edge of the square. */
  readonly isEdge: boolean;
  /** Whether a player may stand at the point. */
  readonly isOpen: boolean;
  /** Whether a player can walk to the point from where the walk starts. */
  readonly isReached: boolean;
}

/**
 * Walks over a square of points on the ground, a step apart, from where the
 * walk starts to every point a player can walk to from there, from one
 * point to a neighbouring one at a time.
 *
 * @param {GroundVector} centre - The middle of the square.
 * @param {number} reach - Half the width of the square, in metres.
 * @param {number} step - The distance between neighbouring points.
 * @param {(point: GroundVector) => boolean} isOpen - Tells whether a player
 *   may stand at a point.
 * @param {(point: GridPoint) => boolean} isStart - Tells whether the walk
 *   starts at a point a player may stand at.
 * @returns {GridPoint[]} The points of the square.
 */
function walkGrid(
  centre: GroundVector,
  reach: number,
  step: number,
  isOpen: (point: GroundVector) => boolean,
  isStart: (point: GridPoint) => boolean,
): GridPoint[] {
  const count: number = Math.round((2 * reach) / step) + 1;
  const points: GridPoint[] = Array.from(
    { length: count * count },
    (_, index: number): GridPoint => {
      const column: number = index % count;
      const row: number = Math.floor(index / count);
      const point: GroundVector = {
        x: centre.x - reach + column * step,
        z: centre.z - reach + row * step,
      };
      return {
        ...point,
        isEdge:
          column === 0 ||
          column === count - 1 ||
          row === 0 ||
          row === count - 1,
        isOpen: isOpen(point),
        isReached: false,
      };
    },
  );
  const queue: number[] = [];
  points.forEach((point: GridPoint, index: number) => {
    if (point.isOpen && isStart(point)) {
      points[index] = { ...point, isReached: true };
      queue.push(index);
    }
  });
  // The queue grows as the walk goes on, and the loop takes in what is
  // added to it.
  for (const index of queue) {
    const column: number = index % count;
    const neighbours: number[] = [
      column > 0 ? index - 1 : -1,
      column < count - 1 ? index + 1 : -1,
      index - count,
      index + count,
    ];
    const here: GridPoint | undefined = points[index];
    for (const other of neighbours) {
      const there: GridPoint | undefined = points[other];
      if (
        here !== undefined &&
        there?.isOpen === true &&
        !there.isReached &&
        VILLAGE_TERRAIN.isPathClear(here, there)
      ) {
        points[other] = { ...there, isReached: true };
        queue.push(other);
      }
    }
  }
  return points;
}

/** The file name of the house of the village chief. */
const CHIEF_HOUSE_FILE = 'prop-chief-house.glb';

/** The file name of the old well in the yard of the chief's house. */
const WELL_FILE = 'prop-old-well.glb';

/** The file names of the pieces of the low wall of the chief's yard. */
const YARD_WALL_FILES: readonly string[] = [
  'prop-yard-wall.glb',
  'prop-yard-wall-end.glb',
];

/**
 * How far in front of the chief's house its low wall runs, as the model of
 * the house has it, in metres.
 */
const YARD_WALL_LINE = 4.8;

/**
 * The place kept on the porch of the chief's house for a person to stand,
 * as the model of the house has it: beside the door, on the side of the
 * well, between the front wall and the posts of the porch.
 */
const PORCH_PLACE: GroundVector = { x: 1.25, z: 2.35 };

/**
 * The radius of the ground a person standing on the porch would take up,
 * as much as Nancy takes up, in metres.
 */
const PERSON_RADIUS = 0.35;

/**
 * Where a player stands in front of the door of the chief's house, just
 * off its step, as the model of the house has it.
 */
const DOOR_FRONT: GroundVector = { x: 0, z: 2.8 };

/**
 * Where a player coming from the plaza stands in front of the porch of the
 * chief's house, as the model of the house has it.
 */
const BEFORE_PORCH: GroundVector = { x: 0, z: 6.25 };

/**
 * Walks a neighbour takes straight into the yard of the chief's house from
 * outside it, as the model of the house has them: what each is, where it
 * starts and where it ends.
 */
const YARD_WALKS: readonly (readonly [string, GroundVector, GroundVector])[] =
  [
    [
      'from the plaza through the opening in front of the porch to the well',
      { x: -1.5, z: 7.25 },
      { x: 4.3, z: 2.7 },
    ],
    [
      'from the plaza through the gap in the wall beside the well',
      { x: 4.6, z: 6.25 },
      { x: 4.6, z: 3.9 },
    ],
    [
      'from the path beside the house onto the porch, past the wall',
      { x: -6.25, z: 2.25 },
      { x: -1.25, z: 2.9 },
    ],
    [
      'from beside the weapon shop, round the wall by the well, to its side',
      { x: 9.5, z: 0.25 },
      { x: 7.3, z: 3.3 },
    ],
    [
      'from behind the house to the ground between it and the well',
      { x: 7.3, z: -2.6 },
      { x: 4.75, z: 0.5 },
    ],
  ];

/**
 * Finds where a point of the chief's house stands in the world.
 *
 * @param {GroundVector} local - The point, as the model of the house has
 *   it before it is placed.
 * @returns {GroundVector} The point in the world.
 */
function placeOnChiefHouse(local: GroundVector): GroundVector {
  return placePoint(findPlacement(CHIEF_HOUSE_FILE), local);
}

/**
 * Finds the ground the low wall of the chief's yard takes up, and nothing
 * else: the footprints that lie within a metre of where a piece of the wall
 * stands.
 *
 * @returns {Terrain} The ground the wall takes up.
 */
function findYardWallTerrain(): Terrain {
  const pieces: Placement[] = VILLAGE_PLACEMENTS.filter(
    (placement: Placement) => YARD_WALL_FILES.includes(placement.file),
  );
  return new Terrain(
    VILLAGE_TERRAIN.shapes.filter((shape: Shape) =>
      pieces.some(
        (piece: Placement) =>
          Math.hypot(piece.x - shape.x, piece.z - shape.z) < 1,
      ),
    ),
    VILLAGE_BOUNDARY,
  );
}

describe('VILLAGE_TERRAIN', () => {
  it('stands in the way where the scenery stands', () => {
    for (const placement of VILLAGE_PLACEMENTS) {
      if (!OPEN_FILES.includes(placement.file)) {
        expect(VILLAGE_TERRAIN.isClear(placement), placement.file).toBe(false);
      }
    }
  });

  it('lets players walk over the clover', () => {
    for (const placement of VILLAGE_PLACEMENTS) {
      if (placement.file === 'prop-clover.glb') {
        const isOverlapped: boolean = VILLAGE_PLACEMENTS.some(
          (other: Placement) =>
            other !== placement &&
            Math.hypot(other.x - placement.x, other.z - placement.z) < 2.5,
        );
        if (!isOverlapped) {
          expect(VILLAGE_TERRAIN.isClear(placement)).toBe(true);
        }
      }
    }
  });

  it('rings the spawn point of the monster with standing stones', () => {
    const stones: Placement = findPlacement('prop-spawn-stones.glb');
    expect(VILLAGE_TERRAIN.isClear(stones)).toBe(true);
    let blocked = 0;
    for (let degrees = 0; degrees < 360; degrees += 5) {
      const angle: number = (degrees * Math.PI) / 180;
      const point = {
        x: stones.x + 1.75 * Math.sin(angle),
        z: stones.z + 1.75 * Math.cos(angle),
      };
      if (!VILLAGE_TERRAIN.isClear(point)) {
        blocked++;
      }
    }
    expect(blocked).toBeGreaterThan(0);
    expect(blocked).toBeLessThan(72);
  });

  it('stands the healing stele by the fountain, clear of its front', () => {
    const fountain: Placement = findPlacement('fountain.glb');
    const stele: Placement = findPlacement('prop-healing-stele.glb');
    const distance: number = Math.hypot(
      stele.x - fountain.x,
      stele.z - fountain.z,
    );
    expect(distance).toBeLessThan(3.5);
    // On the side of the spawn points, and to the left as a player arriving
    // there faces the fountain.
    expect(stele.z).toBeGreaterThan(fountain.z);
    expect(stele.x).toBeLessThan(fountain.x);
    const front = {
      x: fountain.x,
      z: fountain.z + FOUNTAIN_RIM_RADIUS + PLAYER_RADIUS + FOUNTAIN_REACH,
      yaw: 180,
    };
    expect(VILLAGE_TERRAIN.isClear(front)).toBe(true);
    expect(findInteraction(front)).toBe('Drink');
  });

  it('takes up the ground the foot of the healing stele stands on', () => {
    const stele: Placement = findPlacement('prop-healing-stele.glb');
    // The foot of the boulder is 0.71 m wide and 0.48 m deep.  A player a
    // little closer than touching to a side of it is in its way, and one a
    // little farther is not.
    const sides: readonly GroundVector[] = [
      { x: -0.355, z: 0 },
      { x: 0.355, z: 0 },
      { x: 0, z: -0.24 },
      { x: 0, z: 0.24 },
    ];
    for (const { x, z } of sides) {
      const findSpot = (gap: number): GroundVector => {
        const length: number = Math.hypot(x, z);
        const reach: number = length + PLAYER_RADIUS + gap;
        return placePoint(stele, {
          x: (x / length) * reach,
          z: (z / length) * reach,
        });
      };
      expect(VILLAGE_TERRAIN.isClear(findSpot(-0.05))).toBe(false);
      expect(VILLAGE_TERRAIN.isClear(findSpot(0.02))).toBe(true);
    }
  });

  it('takes up the ground the anvil of the smithy stands on', () => {
    const shop: Placement = findPlacement('weapon-shop.glb');
    const isClear = (x: number, z: number): boolean =>
      VILLAGE_TERRAIN.isClear(placePoint(shop, { x, z }));
    // As the model of the shop has it, the stump of the anvil is an octagon
    // centred at (3.08, 0.887), 0.34 m from its centre to its corners and
    // 0.314 m to its sides, and the anvil on it runs along the Z axis from
    // the tip of its horn at z = 0.367 to its heel at z = 1.227, between
    // x = 2.95 and x = 3.21.  A player a little closer than touching either
    // is in its way.
    for (let degrees = 0; degrees < 360; degrees += 15) {
      const angle: number = (degrees * Math.PI) / 180;
      const reach: number = 0.314 + PLAYER_RADIUS - 0.01;
      const x: number = 3.08 + reach * Math.sin(angle);
      const z: number = 0.887 + reach * Math.cos(angle);
      expect(isClear(x, z), String(degrees)).toBe(false);
    }
    for (let step = 0; step <= 20; step++) {
      const z: number = 0.367 + (step * (1.227 - 0.367)) / 20;
      expect(isClear(3.21 + PLAYER_RADIUS - 0.005, z), String(z)).toBe(false);
      expect(isClear(2.95 - PLAYER_RADIUS + 0.005, z), String(z)).toBe(false);
    }
    // A player a little farther off, on the side away from the house or on
    // the side of the plaza, is not.
    const reach: number = 0.34 + PLAYER_RADIUS + 0.04;
    expect(isClear(3.08 + reach, 0.887)).toBe(true);
    expect(isClear(3.08, 0.887 + reach)).toBe(true);
  });

  it('takes up the ground the box of coal by the forge stands on', () => {
    const shop: Placement = findPlacement('weapon-shop.glb');
    const isClear = (x: number, z: number): boolean =>
      VILLAGE_TERRAIN.isClear(placePoint(shop, { x, z }));
    // As the model of the shop has it, the box stands between x = 3.6 and
    // x = 3.98, and between z = -0.523 and z = 0.077.
    for (let step = 0; step <= 10; step++) {
      const z: number = -0.523 + (step * 0.6) / 10;
      expect(isClear(3.98 + PLAYER_RADIUS - 0.005, z), String(z)).toBe(false);
      expect(isClear(3.98 + PLAYER_RADIUS + 0.02, z), String(z)).toBe(true);
    }
  });

  it('leaves a way round the fountain between its rim and the stele', () => {
    const fountain: Placement = findPlacement('fountain.glb');
    const radius: number = FOUNTAIN_RIM_RADIUS + PLAYER_RADIUS + 0.05;
    const findPoint = (degrees: number): GroundVector => ({
      x: fountain.x + radius * Math.sin((degrees * Math.PI) / 180),
      z: fountain.z + radius * Math.cos((degrees * Math.PI) / 180),
    });
    for (let degrees = 0; degrees < 360; degrees += 5) {
      expect(
        VILLAGE_TERRAIN.isPathClear(findPoint(degrees), findPoint(degrees + 5)),
        String(degrees),
      ).toBe(true);
    }
  });

  it('stands the village sign outside the gate, beside the way', () => {
    const gate: Gate = findGate();
    const stones: Placement = findPlacement('prop-spawn-stones.glb');
    const sign: Placement = findPlacement('prop-village-sign.glb');
    // Just outside the gap in the fence, on the side of the way away from
    // the stones.
    expect(Math.abs(sign.x - gate.x)).toBeLessThan(gate.halfWidth);
    expect(sign.z).toBeGreaterThan(gate.z);
    expect(sign.z).toBeLessThan(gate.z + 3);
    expect(Math.sign(sign.x - gate.x)).toBe(-Math.sign(stones.x - gate.x));
    // Its board faces someone walking back in through the gate.
    const front: GroundVector = turnVector({ x: 0, z: 1 }, findTurn(sign.yaw));
    expect(front.z).toBeGreaterThan(0.99);
    expect(VILLAGE_TERRAIN.isClear(sign)).toBe(false);
    // The way through the gate stays open.
    expect(
      VILLAGE_TERRAIN.isPathClear(
        { x: gate.x, z: gate.z + 8 },
        { x: gate.x, z: gate.z - 1 },
        1,
      ),
    ).toBe(true);
    for (const placement of VILLAGE_PLACEMENTS) {
      if (placement !== sign) {
        expect(
          Math.hypot(placement.x - sign.x, placement.z - sign.z),
          placement.file,
        ).toBeGreaterThan(1.5);
      }
    }
  });

  it('keeps every spawn point clear', () => {
    for (let index = 0; index < SPAWN_POINT_COUNT; index++) {
      expect(VILLAGE_TERRAIN.isClear(findSpawnPoint(index), 0.1)).toBe(true);
    }
  });
});

describe('Emma the smith', () => {
  it('takes up the ground she stands on, overlapping no other footprint', () => {
    const emma: Placement = findPlacement('npc-emma.glb');
    expect(VILLAGE_TERRAIN.isClear(emma)).toBe(false);
    const own: CircleShape[] = VILLAGE_TERRAIN.shapes.filter(
      (shape: Shape): shape is CircleShape =>
        shape.shape === 'circle' && shape.x === emma.x && shape.z === emma.z,
    );
    expect(own).toHaveLength(1);
    const [footprint] = own;
    for (const shape of VILLAGE_TERRAIN.shapes) {
      if (footprint !== undefined && shape !== footprint) {
        expect(measureGap(footprint, shape)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('faces away from the house, with the plaza on her right', () => {
    const emma: Placement = findPlacement('npc-emma.glb');
    const shop: Placement = findPlacement('weapon-shop.glb');
    // The house stands along the -X axis of the shop from the forge.
    const away: GroundVector = turnVector({ x: 1, z: 0 }, findTurn(shop.yaw));
    const front: GroundVector = turnVector({ x: 0, z: 1 }, findTurn(emma.yaw));
    const right: GroundVector = turnVector(
      { x: -1, z: 0 },
      findTurn(emma.yaw),
    );
    expect(front.x * away.x + front.z * away.z).toBeGreaterThan(0.99);
    const toPlaza: GroundVector = {
      x: PLAZA_CENTRE.x - emma.x,
      z: PLAZA_CENTRE.z - emma.z,
    };
    const ahead: number = front.x * toPlaza.x + front.z * toPlaza.z;
    const aside: number = right.x * toPlaza.x + right.z * toPlaza.z;
    expect(aside).toBeGreaterThan(Math.abs(ahead));
  });

  it('turns her front or side, not her back, to the camera along -Z', () => {
    const emma: Placement = findPlacement('npc-emma.glb');
    const front: GroundVector = turnVector({ x: 0, z: 1 }, findTurn(emma.yaw));
    expect(front.z).toBeGreaterThanOrEqual(0);
  });

  it('leaves no ground by the smithy to stand on that cannot be reached', () => {
    // A square of points around the weapon shop, a tenth of a metre apart.
    // From those on its edge, which open onto the rest of the village, a
    // player can walk to every point it can stand on.
    const shop: Placement = findPlacement('weapon-shop.glb');
    const reach = 6;
    const step = 0.1;
    const count: number = Math.round((2 * reach) / step) + 1;
    const findPoint = (index: number): GroundVector => ({
      x: shop.x - reach + (index % count) * step,
      z: shop.z - reach + Math.floor(index / count) * step,
    });
    const isClear: boolean[] = Array.from(
      { length: count * count },
      (_, index: number) => VILLAGE_TERRAIN.isClear(findPoint(index)),
    );
    const isReached: boolean[] = isClear.map(
      (clear: boolean, index: number) =>
        clear &&
        (index % count === 0 ||
          index % count === count - 1 ||
          index < count ||
          index >= count * (count - 1)),
    );
    const queue: number[] = [];
    isReached.forEach((reached: boolean, index: number) => {
      if (reached) {
        queue.push(index);
      }
    });
    // The queue grows as the walk goes on, and the loop takes in what is
    // added to it.
    for (const index of queue) {
      const column: number = index % count;
      const neighbours: number[] = [
        column > 0 ? index - 1 : -1,
        column < count - 1 ? index + 1 : -1,
        index - count,
        index + count,
      ];
      for (const other of neighbours) {
        if (
          isClear[other] === true &&
          isReached[other] === false &&
          VILLAGE_TERRAIN.isPathClear(findPoint(index), findPoint(other))
        ) {
          isReached[other] = true;
          queue.push(other);
        }
      }
    }
    const stranded: GroundVector[] = [];
    isClear.forEach((clear: boolean, index: number) => {
      if (clear && isReached[index] !== true) {
        stranded.push(findPoint(index));
      }
    });
    expect(stranded).toEqual([]);
  });
});

/**
 * Finds the way the front of the chief's house faces.
 *
 * @returns {GroundVector} The way, a metre long.
 */
function findChiefHouseFront(): GroundVector {
  const house: Placement = findPlacement(CHIEF_HOUSE_FILE);
  return turnVector({ x: 0, z: 1 }, findTurn(house.yaw));
}

/**
 * Finds the way from one point to another.
 *
 * @param {GroundVector} from - The one point.
 * @param {GroundVector} to - The other point.
 * @returns {GroundVector} The way, a metre long.
 */
function findWay(from: GroundVector, to: GroundVector): GroundVector {
  const length: number = Math.hypot(to.x - from.x, to.z - from.z);
  return { x: (to.x - from.x) / length, z: (to.z - from.z) / length };
}

/**
 * Measures the cosine of the angle between two ways.
 *
 * @param {GroundVector} a - One way, a metre long.
 * @param {GroundVector} b - The other way, a metre long.
 * @returns {number} The cosine.
 */
function measureAlignment(a: GroundVector, b: GroundVector): number {
  return a.x * b.x + a.z * b.z;
}

describe('the house of the village chief', () => {
  it('stands in place of the cottage at the back on the north-east', () => {
    const house: Placement = findPlacement(CHIEF_HOUSE_FILE);
    expect(Math.hypot(house.x - 10.5, house.z + 16.5)).toBeLessThan(1.5);
    const cottages: number[][] = VILLAGE_PLACEMENTS.filter(
      (placement: Placement) => placement.file === 'prop-cottage.glb',
    ).map(({ x, z, yaw }: Placement) => [x, z, yaw]);
    expect(cottages).toEqual([
      [-11, -4.5, 90],
      [-10.5, -16.5, 55],
    ]);
    const toPlaza: GroundVector = findWay(house, PLAZA_CENTRE);
    expect(measureAlignment(findChiefHouseFront(), toPlaza)).toBeGreaterThan(
      Math.cos((15 * Math.PI) / 180),
    );
  });

  it('keeps a place on the porch beside the door for a person', () => {
    const place: GroundVector = placeOnChiefHouse(PORCH_PLACE);
    expect(VILLAGE_TERRAIN.isClear(place, PERSON_RADIUS - PLAYER_RADIUS)).toBe(
      true,
    );
    // A person who stands there facing the plaza faces the way the house
    // does, give or take.
    expect(
      measureAlignment(findChiefHouseFront(), findWay(place, PLAZA_CENTRE)),
    ).toBeGreaterThan(Math.cos((20 * Math.PI) / 180));
    // The person stands out of the way from the plaza to the door.
    const person: Shape = { shape: 'circle', ...place, radius: PERSON_RADIUS };
    const terrain = new Terrain(
      [...VILLAGE_TERRAIN.shapes, person],
      VILLAGE_BOUNDARY,
    );
    expect(
      terrain.isPathClear(
        placeOnChiefHouse(BEFORE_PORCH),
        placeOnChiefHouse(DOOR_FRONT),
      ),
    ).toBe(true);
  });

  it('lets someone coming in from the plaza see the person on the porch', () => {
    // From in front of the porch, nothing stands between a player and a
    // person on the porch, who faces the player.
    const place: GroundVector = placeOnChiefHouse(PORCH_PLACE);
    const before: GroundVector = placeOnChiefHouse(BEFORE_PORCH);
    const toBefore: GroundVector = findWay(place, before);
    expect(measureAlignment(findChiefHouseFront(), toBefore)).toBeGreaterThan(
      Math.cos((60 * Math.PI) / 180),
    );
    const near: number = PERSON_RADIUS + PLAYER_RADIUS;
    expect(
      VILLAGE_TERRAIN.isPathClear(before, {
        x: place.x + toBefore.x * near,
        z: place.z + toBefore.z * near,
      }),
    ).toBe(true);
  });

  it.each(YARD_WALKS)(
    'lets a neighbour walk straight into its yard %s',
    (_, from: GroundVector, to: GroundVector) => {
      expect(
        VILLAGE_TERRAIN.isPathClear(
          placeOnChiefHouse(from),
          placeOnChiefHouse(to),
          0.1,
        ),
      ).toBe(true);
    },
  );

  it('leaves no gap in the wall too narrow to walk through', () => {
    // Along the line of the wall, from beyond its end on the side of the
    // path to the weapon shop, every stretch of open ground between two
    // things that stand in the way has room for a player.
    let isInGap = false;
    let hasRoom = false;
    for (let u = -6; u <= 10; u += 0.01) {
      const point: GroundVector = placeOnChiefHouse({ x: u, z: YARD_WALL_LINE });
      if (VILLAGE_TERRAIN.isClear(point, -PLAYER_RADIUS)) {
        isInGap = true;
        hasRoom ||= VILLAGE_TERRAIN.isClear(point);
      } else {
        if (isInGap) {
          expect(hasRoom, `the gap ending at ${u.toFixed(2)}`).toBe(true);
        }
        isInGap = false;
        hasRoom = false;
      }
    }
  });

  it('leaves a broad opening in the wall in front of the porch', () => {
    // As the model of the house has it, the porch is 4.4 m wide, and the
    // posts of the porch stand along its front at z = 3.45.
    for (let u = -2.2; u <= 2.2; u += 0.2) {
      for (let out = 0.5; out <= 2.5; out += 0.25) {
        const point: GroundVector = placeOnChiefHouse({ x: u, z: 3.45 + out });
        expect(
          VILLAGE_TERRAIN.isClear(point),
          `${String(u)} ${String(out)}`,
        ).toBe(true);
      }
    }
  });

  it('leaves the ground open from the porch to the great tree', () => {
    const tree: Placement = findPlacement('prop-great-tree.glb');
    const porch: GroundVector = placeOnChiefHouse({ x: 0, z: 3.75 });
    const toPorch: GroundVector = findWay(tree, porch);
    // The trunk reaches no farther than 2.1 m from the middle of the tree.
    const trunk: GroundVector = {
      x: tree.x + toPorch.x * (2.1 + PLAYER_RADIUS),
      z: tree.z + toPorch.z * (2.1 + PLAYER_RADIUS),
    };
    expect(VILLAGE_TERRAIN.isPathClear(porch, trunk)).toBe(true);
  });

  it('leaves no ground in or around its yard that cannot be reached', () => {
    const points: GridPoint[] = walkGrid(
      findPlacement(CHIEF_HOUSE_FILE),
      10,
      0.1,
      (point: GroundVector) => VILLAGE_TERRAIN.isClear(point),
      (point: GridPoint) => point.isEdge,
    );
    expect(
      points.filter((point: GridPoint) => point.isOpen && !point.isReached),
    ).toEqual([]);
  });
});

describe('the old well', () => {
  it('stands behind the wall of the yard, seen from the plaza', () => {
    // As the model of the house has it, the well stands at x = 5.6, and the
    // plaza reaches the wall in front of it.
    const wall: Terrain = findYardWallTerrain();
    const well: Placement = findPlacement(WELL_FILE);
    const plaza: GroundVector[] = [
      findPlacement('fountain.glb'),
      placeOnChiefHouse({ x: 5.6, z: 7 }),
      placeOnChiefHouse({ x: 7.5, z: 6.5 }),
    ];
    for (const point of plaza) {
      expect(wall.isPathClear(well, point), JSON.stringify(point)).toBe(false);
    }
  });

  it('is open to the side of the weapon shop', () => {
    const wall: Terrain = findYardWallTerrain();
    const well: Placement = findPlacement(WELL_FILE);
    expect(wall.isPathClear(well, findPlacement('weapon-shop.glb'))).toBe(
      true,
    );
  });

  it('stands beside the house of the chief, towards the weapon shop', () => {
    const well: Placement = findPlacement(WELL_FILE);
    const house: Placement = findPlacement(CHIEF_HOUSE_FILE);
    const shop: Placement = findPlacement('weapon-shop.glb');
    expect(Math.hypot(well.x - shop.x, well.z - shop.z)).toBeLessThan(
      Math.hypot(house.x - shop.x, house.z - shop.z),
    );
    // On the open ground between the house and the shop.
    expect(well.x).toBeGreaterThan(9);
    expect(well.x).toBeLessThan(16);
    expect(well.z).toBeGreaterThan(-13);
    expect(well.z).toBeLessThan(-8);
  });

  it('lets a player beside it see the porch, with nothing between', () => {
    const well: Placement = findPlacement(WELL_FILE);
    const place: GroundVector = placeOnChiefHouse(PORCH_PLACE);
    const toPlace: GroundVector = findWay(well, place);
    // The stonework of the well is 0.7 m round from its middle.
    const reach: number = 0.7 + PLAYER_RADIUS + 0.05;
    const beside: GroundVector = {
      x: well.x + toPlace.x * reach,
      z: well.z + toPlace.z * reach,
    };
    expect(VILLAGE_TERRAIN.isClear(beside)).toBe(true);
    expect(VILLAGE_TERRAIN.isPathClear(beside, place)).toBe(true);
  });
});

describe('findPlacement', () => {
  it('finds where a model of the village stands', () => {
    expect(findPlacement('weapon-shop.glb')).toMatchObject({
      file: 'weapon-shop.glb',
    });
  });

  it('fails for a model the village has no place for', () => {
    expect(() => findPlacement('prop-windmill.glb')).toThrow();
  });
});
