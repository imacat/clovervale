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
  FARM_FIELDS,
  FARM_FIELD_IDS,
  FIELD_BED_WIDTH,
  FIELD_FENCE_THICKNESS,
  FIELD_GATE_WIDTH,
  FOUNTAIN_REACH,
  FOUNTAIN_RIM_RADIUS,
  PLAYER_RADIUS,
  PLAZA_CENTER,
  SPAWN_POINT_COUNT,
  TOBY_ENDS,
  TOBY_RADIUS,
  Terrain,
  VILLAGE_PLACEMENTS,
  VILLAGE_TERRAIN,
  findFootprints,
  findInteraction,
  findPlacement,
  findSpawnPoint,
  findMapPath,
  findVillager,
  placePoint,
  placeShape,
} from '../src/index.ts';
import type {
  FarmFieldId,
  FieldBed,
  GroundVector,
  ModelId,
  Placement,
  Shape,
} from '../src/index.ts';
import { NavigationGraph } from '../src/navigation.ts';
import {
  findTurn,
  measureBoundaryReach,
  turnVector,
} from '../src/terrain.ts';
import { VILLAGE_BOUNDARY } from '../src/village-layout.ts';
import type { CircleShape } from '../src/terrain.ts';

/**
 * The models a player can walk over or into the middle of, including the
 * farm fields, Martha, who stands in the way of nobody, and her pitchfork,
 * which leans against the wall of her house.
 */
const OPEN_MODELS: readonly ModelId[] = [
  'clover',
  'spawn-stones',
  'chief-field',
  'cottage-field',
  'apothecary-field',
  'martha',
  'pitchfork',
];

/** A gap in a fence that the way goes through. */
interface Gate extends GroundVector {
  /** Half the width of the gap, in meters. */
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
  const stones: Placement = findPlacement('spawn-stones');
  const fences: Placement[] = VILLAGE_PLACEMENTS.filter(
    (placement: Placement) =>
      placement.model === 'fence' &&
      placement.yaw === 0 &&
      placement.z > PLAZA_CENTER.z &&
      placement.z < stones.z,
  );
  const left: number = Math.max(
    ...fences
      .filter((fence: Placement) => fence.x < PLAZA_CENTER.x)
      .map((fence: Placement) => fence.x + 1),
  );
  const right: number = Math.min(
    ...fences
      .filter((fence: Placement) => fence.x > PLAZA_CENTER.x)
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
 * @returns {number} The gap, in meters, negative where they overlap.
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
 * Walks over a square of points on the ground of the village, a step
 * apart, from its edge to every point a player can walk to from there, from
 * one point to a neighboring one at a time.
 *
 * @param {GroundVector} center - The middle of the square.
 * @param {number} reach - Half the width of the square, in meters.
 * @param {number} step - The distance between neighboring points.
 * @returns {GridPoint[]} The points of the square.
 */
function walkGrid(
  center: GroundVector,
  reach: number,
  step: number,
): GridPoint[] {
  const count: number = Math.round((2 * reach) / step) + 1;
  const points: GridPoint[] = Array.from(
    { length: count * count },
    (_, index: number): GridPoint => {
      const column: number = index % count;
      const row: number = Math.floor(index / count);
      const point: GroundVector = {
        x: center.x - reach + column * step,
        z: center.z - reach + row * step,
      };
      return {
        ...point,
        isEdge:
          column === 0 ||
          column === count - 1 ||
          row === 0 ||
          row === count - 1,
        isOpen: VILLAGE_TERRAIN.isClear(point),
        isReached: false,
      };
    },
  );
  const queue: number[] = [];
  points.forEach((point: GridPoint, index: number) => {
    if (point.isOpen && point.isEdge) {
      points[index] = { ...point, isReached: true };
      queue.push(index);
    }
  });
  // The queue grows as the walk goes on, and the loop takes in what is
  // added to it.
  for (const index of queue) {
    const column: number = index % count;
    const neighbors: number[] = [
      column > 0 ? index - 1 : -1,
      column < count - 1 ? index + 1 : -1,
      index - count,
      index + count,
    ];
    const here: GridPoint | undefined = points[index];
    for (const other of neighbors) {
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

/** The model of the house of the village chief. */
const CHIEF_HOUSE: ModelId = 'chief-house';

/** The model of the old well in the yard of the chief's house. */
const WELL: ModelId = 'old-well';

/** The models of the pieces of the low wall of the chief's yard. */
const YARD_WALLS: readonly ModelId[] = ['yard-wall', 'yard-wall-end'];

/**
 * How far in front of the chief's house its low wall runs, as the model of
 * the house has it, in meters.
 */
const YARD_WALL_LINE = 4.8;

/** The model of Martha, the village chief. */
const MARTHA: ModelId = 'martha';

/**
 * The place on the porch of the chief's house where Martha the chief
 * stands, as the model of the house has it: beside the door, on the side of
 * the well, between the front wall and the posts of the porch.
 */
const PORCH_PLACE: GroundVector = { x: 1.1, z: 2.7 };

/**
 * The radius of the ground Martha takes up, as much as Nancy takes up, in
 * meters.
 */
const MARTHA_RADIUS = 0.35;

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
 * Walks a neighbor takes straight into the yard of the chief's house from
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
      'from beside the weapon shop, around the wall by the well, to its side',
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
  return placePoint(findPlacement(CHIEF_HOUSE), local);
}

/**
 * Finds the ground the low wall of the chief's yard takes up, and nothing
 * else: the footprints that lie within a meter of where a piece of the wall
 * stands.
 *
 * @returns {Terrain} The ground the wall takes up.
 */
function findYardWallTerrain(): Terrain {
  const pieces: Placement[] = VILLAGE_PLACEMENTS.filter(
    (placement: Placement) => YARD_WALLS.includes(placement.model),
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
      if (!OPEN_MODELS.includes(placement.model)) {
        expect(VILLAGE_TERRAIN.isClear(placement), placement.model).toBe(
          false,
        );
      }
    }
  });

  it('keeps everything within the boundary, clear of the hills', () => {
    for (const placement of VILLAGE_PLACEMENTS) {
      expect(measureFromEdge(placement), placement.model).toBeGreaterThan(0);
      for (const shape of findFootprints(placement)) {
        const reach: number = shape.shape === 'circle' ? shape.radius : 0;
        for (const point of listPointsWithin(shape)) {
          expect(measureFromEdge(point), placement.model).toBeGreaterThan(
            reach,
          );
        }
      }
    }
  });

  it('lets players walk over the clover', () => {
    for (const placement of VILLAGE_PLACEMENTS) {
      if (placement.model === 'clover') {
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
    const stones: Placement = findPlacement('spawn-stones');
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
    const fountain: Placement = findPlacement('fountain');
    const stele: Placement = findPlacement('healing-stele');
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
    expect(findInteraction(front, 0)).toBe('Drink');
  });

  it('takes up the ground the foot of the healing stele stands on', () => {
    const stele: Placement = findPlacement('healing-stele');
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
    const shop: Placement = findPlacement('weapon-shop');
    const isClear = (x: number, z: number): boolean =>
      VILLAGE_TERRAIN.isClear(placePoint(shop, { x, z }));
    // As the model of the shop has it, the stump of the anvil is an octagon
    // centered at (3.08, 0.887), 0.34 m from its center to its corners and
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
    const shop: Placement = findPlacement('weapon-shop');
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

  it('leaves a way around the fountain between its rim and the stele', () => {
    const fountain: Placement = findPlacement('fountain');
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
    const stones: Placement = findPlacement('spawn-stones');
    const sign: Placement = findPlacement('village-sign');
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
          placement.model,
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
    const emma: Placement = findPlacement('emma');
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
    const emma: Placement = findPlacement('emma');
    const shop: Placement = findPlacement('weapon-shop');
    // The house stands along the -X axis of the shop from the forge.
    const away: GroundVector = turnVector({ x: 1, z: 0 }, findTurn(shop.yaw));
    const front: GroundVector = turnVector({ x: 0, z: 1 }, findTurn(emma.yaw));
    const right: GroundVector = turnVector(
      { x: -1, z: 0 },
      findTurn(emma.yaw),
    );
    expect(front.x * away.x + front.z * away.z).toBeGreaterThan(0.99);
    const toPlaza: GroundVector = {
      x: PLAZA_CENTER.x - emma.x,
      z: PLAZA_CENTER.z - emma.z,
    };
    const ahead: number = front.x * toPlaza.x + front.z * toPlaza.z;
    const aside: number = right.x * toPlaza.x + right.z * toPlaza.z;
    expect(aside).toBeGreaterThan(Math.abs(ahead));
  });

  it('turns her front or side, not her back, to the camera along -Z', () => {
    const emma: Placement = findPlacement('emma');
    const front: GroundVector = turnVector({ x: 0, z: 1 }, findTurn(emma.yaw));
    expect(front.z).toBeGreaterThanOrEqual(0);
  });

  it('leaves no ground by the smithy to stand on that cannot be reached', () => {
    // A square of points around the weapon shop, a tenth of a meter apart.
    // From those on its edge, which open onto the rest of the village, a
    // player can walk to every point it can stand on.
    const shop: Placement = findPlacement('weapon-shop');
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
      const neighbors: number[] = [
        column > 0 ? index - 1 : -1,
        column < count - 1 ? index + 1 : -1,
        index - count,
        index + count,
      ];
      for (const other of neighbors) {
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
 * @returns {GroundVector} The way, a meter long.
 */
function findChiefHouseFront(): GroundVector {
  const house: Placement = findPlacement(CHIEF_HOUSE);
  return turnVector({ x: 0, z: 1 }, findTurn(house.yaw));
}

/**
 * Finds the way from one point to another.
 *
 * @param {GroundVector} from - The one point.
 * @param {GroundVector} to - The other point.
 * @returns {GroundVector} The way, a meter long.
 */
function findWay(from: GroundVector, to: GroundVector): GroundVector {
  const length: number = Math.hypot(to.x - from.x, to.z - from.z);
  return { x: (to.x - from.x) / length, z: (to.z - from.z) / length };
}

/**
 * Measures the cosine of the angle between two ways.
 *
 * @param {GroundVector} a - One way, a meter long.
 * @param {GroundVector} b - The other way, a meter long.
 * @returns {number} The cosine.
 */
function measureAlignment(a: GroundVector, b: GroundVector): number {
  return a.x * b.x + a.z * b.z;
}

describe('the house of the village chief', () => {
  it('stands in place of the cottage at the back on the north-east', () => {
    const house: Placement = findPlacement(CHIEF_HOUSE);
    expect(Math.hypot(house.x - 10.5, house.z + 16.5)).toBeLessThan(1.5);
    const toPlaza: GroundVector = findWay(house, PLAZA_CENTER);
    expect(measureAlignment(findChiefHouseFront(), toPlaza)).toBeGreaterThan(
      Math.cos((15 * Math.PI) / 180),
    );
  });

  it('lets someone coming in from the plaza see Martha on the porch', () => {
    // From in front of the porch, nothing stands between a player and
    // Martha on the porch, who faces the player.
    const place: GroundVector = placeOnChiefHouse(PORCH_PLACE);
    const before: GroundVector = placeOnChiefHouse(BEFORE_PORCH);
    const toBefore: GroundVector = findWay(place, before);
    expect(measureAlignment(findChiefHouseFront(), toBefore)).toBeGreaterThan(
      Math.cos((60 * Math.PI) / 180),
    );
    const near: number = MARTHA_RADIUS + PLAYER_RADIUS;
    expect(
      VILLAGE_TERRAIN.isPathClear(before, {
        x: place.x + toBefore.x * near,
        z: place.z + toBefore.z * near,
      }),
    ).toBe(true);
  });

  it.each(YARD_WALKS)(
    'lets a neighbor walk straight into its yard %s',
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
    const tree: Placement = findPlacement('great-tree');
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
      findPlacement(CHIEF_HOUSE),
      10,
      0.1,
    );
    expect(
      points.filter((point: GridPoint) => point.isOpen && !point.isReached),
    ).toEqual([]);
  });
});

/**
 * Finds the way Martha faces.
 *
 * @returns {GroundVector} The way, a meter long.
 */
function findMarthaFront(): GroundVector {
  return turnVector({ x: 0, z: 1 }, findTurn(findPlacement(MARTHA).yaw));
}

describe('Martha the village chief', () => {
  it('faces the plaza', () => {
    const martha: Placement = findPlacement(MARTHA);
    expect(
      measureAlignment(findMarthaFront(), findWay(martha, PLAZA_CENTER)),
    ).toBeGreaterThan(Math.cos((5 * Math.PI) / 180));
  });

  it('turns her front or side, not her back, to the camera along -Z', () => {
    expect(findMarthaFront().z).toBeGreaterThanOrEqual(0);
  });

  it('stands in the way of nobody, as the monsters do', () => {
    expect(VILLAGE_TERRAIN.isClear(findPlacement(MARTHA))).toBe(true);
  });

  it('stands out of the way from the plaza to the door', () => {
    expect(
      VILLAGE_TERRAIN.isPathClear(
        placeOnChiefHouse(BEFORE_PORCH),
        placeOnChiefHouse(DOOR_FRONT),
      ),
    ).toBe(true);
  });

  it('lets a player walk up onto the porch and stand in front of her', () => {
    const martha: Placement = findPlacement(MARTHA);
    const front: GroundVector = findMarthaFront();
    const reach: number = MARTHA_RADIUS + PLAYER_RADIUS + 0.1;
    const spot: GroundVector = {
      x: martha.x + front.x * reach,
      z: martha.z + front.z * reach,
    };
    expect(VILLAGE_TERRAIN.isClear(spot)).toBe(true);
    expect(
      VILLAGE_TERRAIN.isPathClear(placeOnChiefHouse(BEFORE_PORCH), spot),
    ).toBe(true);
  });
});

describe('the old well', () => {
  it('stands behind the wall of the yard, seen from the plaza', () => {
    // As the model of the house has it, the well stands at x = 5.6, and the
    // plaza reaches the wall in front of it.
    const wall: Terrain = findYardWallTerrain();
    const well: Placement = findPlacement(WELL);
    const plaza: GroundVector[] = [
      findPlacement('fountain'),
      placeOnChiefHouse({ x: 5.6, z: 7 }),
      placeOnChiefHouse({ x: 7.5, z: 6.5 }),
    ];
    for (const point of plaza) {
      expect(wall.isPathClear(well, point), JSON.stringify(point)).toBe(false);
    }
  });

  it('is open to the side of the weapon shop', () => {
    const wall: Terrain = findYardWallTerrain();
    const well: Placement = findPlacement(WELL);
    expect(wall.isPathClear(well, findPlacement('weapon-shop'))).toBe(
      true,
    );
  });

  it('stands beside the house of the chief, toward the weapon shop', () => {
    const well: Placement = findPlacement(WELL);
    const house: Placement = findPlacement(CHIEF_HOUSE);
    const shop: Placement = findPlacement('weapon-shop');
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
    const well: Placement = findPlacement(WELL);
    const place: GroundVector = placeOnChiefHouse(PORCH_PLACE);
    const toPlace: GroundVector = findWay(well, place);
    // The stonework of the well reaches 0.7 m out from its middle.
    const reach: number = 0.7 + PLAYER_RADIUS + 0.05;
    const beside: GroundVector = {
      x: well.x + toPlace.x * reach,
      z: well.z + toPlace.z * reach,
    };
    expect(VILLAGE_TERRAIN.isClear(beside)).toBe(true);
    // Up to a player standing next to Martha on the porch.
    const near: number = MARTHA_RADIUS + PLAYER_RADIUS;
    expect(
      VILLAGE_TERRAIN.isPathClear(beside, {
        x: place.x - toPlace.x * near,
        z: place.z - toPlace.z * near,
      }),
    ).toBe(true);
  });
});

/** The model of the apothecary shop. */
const APOTHECARY: ModelId = 'apothecary';

/** The model of Basil the apothecary. */
const BASIL: ModelId = 'basil';

/**
 * The models of what stands around the front of the apothecary: the herb
 * rack, the crates, the potted plant and the barrels.
 */
const APOTHECARY_PROPS: readonly ModelId[] = [
  'herb-rack',
  'potion-crate',
  'herb-crate',
  'potted-plant',
  'barrel',
];

/**
 * Where a player stands in front of the door of the apothecary, a step
 * out from its doorstep, as the model of the shop has it.
 */
const BEFORE_SHOP_DOOR: GroundVector = { x: 0.9, z: 4.1 };

/**
 * Finds where a point of the apothecary shop stands in the world.
 *
 * @param {GroundVector} local - The point, as the model of the shop has it
 *   before it is placed.
 * @returns {GroundVector} The point in the world.
 */
function placeOnApothecary(local: GroundVector): GroundVector {
  return placePoint(findPlacement(APOTHECARY), local);
}

/**
 * Finds the footprints of the models that stand in some places.
 *
 * @param {(placement: Placement) => boolean} isWanted - Tells whether a
 *   place is one of them.
 * @returns {Shape[]} The footprints there, in the world.
 */
function findFootprintsAt(
  isWanted: (placement: Placement) => boolean,
): Shape[] {
  const places: Placement[] = VILLAGE_PLACEMENTS.filter(isWanted);
  return VILLAGE_TERRAIN.shapes.filter((shape: Shape) =>
    places.some(
      (place: Placement) => place.x === shape.x && place.z === shape.z,
    ),
  );
}

describe('the apothecary shop', () => {
  it('stands in place of the cottage at the back on the north-west', () => {
    const shop: Placement = findPlacement(APOTHECARY);
    const front: GroundVector = turnVector({ x: 0, z: 1 }, findTurn(shop.yaw));
    const toPlaza: GroundVector = findWay(shop, PLAZA_CENTER);
    expect(measureAlignment(front, toPlaza)).toBeGreaterThan(
      Math.cos((15 * Math.PI) / 180),
    );
  });

  it('stands its rack and its props around it, in the way', () => {
    const shop: Placement = findPlacement(APOTHECARY);
    for (const model of APOTHECARY_PROPS) {
      const props: Placement[] = VILLAGE_PLACEMENTS.filter(
        (placement: Placement) => placement.model === model,
      );
      expect(props.length, model).toBeGreaterThan(0);
      for (const prop of props) {
        expect(VILLAGE_TERRAIN.isClear(prop), model).toBe(false);
        expect(Math.hypot(prop.x - shop.x, prop.z - shop.z), model).toBeLessThan(
          4,
        );
      }
    }
  });

  it('stands its herb rack across its front window, clear of the sill', () => {
    // As the model of the shop has it, the front window is 0.95 m wide
    // centered on x = -1.1, and its sill reaches 2.12 m out from the middle.
    const rack: Shape[] = findFootprintsAt(
      (placement: Placement) => placement.model === 'herb-rack',
    );
    for (let u = -1.6; u <= -0.6; u += 0.1) {
      const point: GroundVector = placeOnApothecary({ x: u, z: 2.35 });
      expect(new Terrain(rack, VILLAGE_BOUNDARY).isClear(point, -0.3)).toBe(
        false,
      );
    }
    for (let u = -1.8; u <= -0.4; u += 0.1) {
      const point: GroundVector = placeOnApothecary({ x: u, z: 2.12 });
      expect(new Terrain(rack, VILLAGE_BOUNDARY).isClear(point, -0.3)).toBe(
        true,
      );
    }
  });

  it('keeps its props clear of the clover and the spawn points', () => {
    const props: Shape[] = findFootprintsAt((placement: Placement) =>
      APOTHECARY_PROPS.includes(placement.model),
    );
    const points: GroundVector[] = [
      ...VILLAGE_PLACEMENTS.filter(
        (placement: Placement) => placement.model === 'clover',
      ),
      ...Array.from({ length: SPAWN_POINT_COUNT }, (_, index: number) =>
        findSpawnPoint(index),
      ),
    ];
    for (const point of points) {
      for (const prop of props) {
        expect(
          measureGap({ shape: 'circle', ...point, radius: 1 }, prop),
        ).toBeGreaterThan(0);
      }
    }
  });

  it('leaves the way open from the plaza to the front of its door', () => {
    const spot: GroundVector = placeOnApothecary(BEFORE_SHOP_DOOR);
    expect(VILLAGE_TERRAIN.isClear(spot)).toBe(true);
    expect(findMapPath('village', findSpawnPoint(0), spot)).not.toBeNull();
  });

  it('leaves no ground in or around it that cannot be reached', () => {
    const points: GridPoint[] = walkGrid(
      findPlacement(APOTHECARY),
      6,
      0.1,
    );
    expect(
      points.filter((point: GridPoint) => point.isOpen && !point.isReached),
    ).toEqual([]);
  });
});

describe('Basil the apothecary', () => {
  it('stands outside the door of his shop, facing out', () => {
    const basil: Placement = findPlacement(BASIL);
    const shop: Placement = findPlacement(APOTHECARY);
    const front: GroundVector = turnVector({ x: 0, z: 1 }, findTurn(basil.yaw));
    const shopFront: GroundVector = turnVector(
      { x: 0, z: 1 },
      findTurn(shop.yaw),
    );
    expect(measureAlignment(front, shopFront)).toBeGreaterThan(
      Math.cos((45 * Math.PI) / 180),
    );
    const door: GroundVector = placeOnApothecary({ x: 0.9, z: 2.6 });
    expect(Math.hypot(basil.x - door.x, basil.z - door.z)).toBeLessThan(0.6);
  });

  it('turns his front or side, not his back, to the camera along -Z', () => {
    const basil: Placement = findPlacement(BASIL);
    expect(
      turnVector({ x: 0, z: 1 }, findTurn(basil.yaw)).z,
    ).toBeGreaterThanOrEqual(0);
  });

  it('takes up the ground he stands on, overlapping no other footprint', () => {
    const basil: Placement = findPlacement(BASIL);
    expect(VILLAGE_TERRAIN.isClear(basil)).toBe(false);
    const own: CircleShape[] = VILLAGE_TERRAIN.shapes.filter(
      (shape: Shape): shape is CircleShape =>
        shape.shape === 'circle' && shape.x === basil.x && shape.z === basil.z,
    );
    expect(own).toHaveLength(1);
    const [footprint] = own;
    for (const shape of VILLAGE_TERRAIN.shapes) {
      if (footprint !== undefined && shape !== footprint) {
        expect(measureGap(footprint, shape)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('is talked to by a player in front of the door, facing him', () => {
    const basil: Placement = findPlacement(BASIL);
    const spot: GroundVector = placeOnApothecary(BEFORE_SHOP_DOOR);
    const yaw: number =
      (Math.atan2(basil.x - spot.x, basil.z - spot.z) * 180) / Math.PI;
    expect(findVillager({ ...spot, yaw }, 0, 'village', [])?.id).toBe('basil');
  });
});

/**
 * The houses with a farm field behind them, and their fields: the house of
 * Martha the village chief, the cottage of Toby and the apothecary shop of
 * Basil.
 */
const FARMED_HOUSES: readonly (readonly [ModelId, FarmFieldId])[] = [
  ['chief-house', 'chief-field'],
  ['cottage', 'cottage-field'],
  ['apothecary', 'apothecary-field'],
];

/**
 * How far inside the fence of a farm field a player stands, just inside
 * its gate or just inside its back, in meters.
 */
const INSIDE_FENCE = 0.5;

/**
 * Tells whether a model is a farm field.
 *
 * @param {ModelId} model - The model.
 * @returns {boolean} Whether it is.
 */
function isField(model: ModelId): model is FarmFieldId {
  return (FARM_FIELD_IDS as readonly ModelId[]).includes(model);
}

/**
 * The ways a player walks along the back of each house with a farm field,
 * between the house and its field, as the model of the house has them: the
 * house, and where each way starts and ends.
 */
const FIELD_WAYS: readonly (readonly [ModelId, GroundVector, GroundVector])[] =
  [
    ['chief-house', { x: -2.5, z: -4.51 }, { x: 4.5, z: -4.51 }],
    ['cottage', { x: -2.5, z: -2.85 }, { x: 2.5, z: -2.85 }],
    ['apothecary', { x: -4, z: -2.85 }, { x: 2.5, z: -2.85 }],
  ];

/**
 * Lists the farm fields behind a house: those within 12 m of it, on the
 * side of it away from the way it faces.
 *
 * @param {Placement} house - Where the house stands.
 * @returns {ModelId[]} The fields.
 */
function listFieldsBehind(house: Placement): ModelId[] {
  const front: GroundVector = turnVector({ x: 0, z: 1 }, findTurn(house.yaw));
  return VILLAGE_PLACEMENTS.filter(
    (placement: Placement) =>
      isField(placement.model) &&
      Math.hypot(placement.x - house.x, placement.z - house.z) < 12 &&
      measureAlignment(front, findWay(house, placement)) <
        -Math.cos(Math.PI / 4),
  ).map((placement: Placement) => placement.model);
}

/**
 * Finds where a point of a farm field lies in the world.
 *
 * @param {FarmFieldId} id - The field.
 * @param {GroundVector} local - The point, as the model of the field has
 *   it before it is placed.
 * @returns {GroundVector} The point in the world.
 */
function placeOnField(id: FarmFieldId, local: GroundVector): GroundVector {
  return placePoint(findPlacement(id), local);
}

/**
 * Finds where a player stands just inside the gate of a farm field, and
 * just inside its back, at the two ends of the lane from the gate.
 *
 * @param {FarmFieldId} id - The field.
 * @returns {readonly [GroundVector, GroundVector]} The two places.
 */
function findMainLane(id: FarmFieldId): readonly [GroundVector, GroundVector] {
  const inside: number =
    FARM_FIELDS[id].width / 2 - FIELD_FENCE_THICKNESS - INSIDE_FENCE;
  return [
    placeOnField(id, { x: 0, z: inside }),
    placeOnField(id, { x: 0, z: -inside }),
  ];
}

/**
 * Lists the points of the ground a rectangular footprint takes up, five
 * centimeters apart.
 *
 * @param {Shape} shape - The footprint, a box.
 * @returns {GroundVector[]} The points.
 */
function listPointsWithin(shape: Shape): GroundVector[] {
  if (shape.shape !== 'box') {
    return [shape];
  }
  const step = 0.05;
  const points: GroundVector[] = [];
  for (let u = -shape.halfWidth; u <= shape.halfWidth + 1e-9; u += step) {
    for (let v = -shape.halfDepth; v <= shape.halfDepth + 1e-9; v += step) {
      points.push(placePoint(shape, { x: u, z: v }));
    }
  }
  return points;
}

/**
 * Measures how far a point lies within the edge of the boundary of the
 * village, along the way out from its middle.
 *
 * @param {GroundVector} point - The point.
 * @returns {number} The distance, in meters, negative outside the edge.
 */
function measureFromEdge(point: GroundVector): number {
  const offset: GroundVector = {
    x: point.x - VILLAGE_BOUNDARY.x,
    z: point.z - VILLAGE_BOUNDARY.z,
  };
  return (
    measureBoundaryReach(VILLAGE_BOUNDARY, offset) -
    Math.hypot(offset.x, offset.z)
  );
}

describe('the farm fields', () => {
  it('lie behind the houses of Martha, Toby and Basil, not Emma', () => {
    const fields: Placement[] = VILLAGE_PLACEMENTS.filter(
      (placement: Placement) => isField(placement.model),
    );
    expect(fields).toHaveLength(FARMED_HOUSES.length);
    for (const [house, field] of FARMED_HOUSES) {
      expect(listFieldsBehind(findPlacement(house))).toEqual([field]);
    }
    expect(listFieldsBehind(findPlacement('weapon-shop'))).toEqual([]);
  });

  it('fill their depth with rows of beds and lanes of one width', () => {
    for (const id of FARM_FIELD_IDS) {
      const { width, beds } = FARM_FIELDS[id];
      const rows: number[] = [
        ...new Set(beds.map((bed: FieldBed) => bed.z)),
      ].sort((a: number, b: number) => b - a);
      const inside: number = width / 2 - FIELD_FENCE_THICKNESS;
      const lanes: number[] = [];
      let front: number = inside;
      for (const z of rows) {
        lanes.push(front - (z + FIELD_BED_WIDTH / 2));
        front = z - FIELD_BED_WIDTH / 2;
      }
      lanes.push(front + inside);
      expect(rows.length, id).toBeGreaterThan(1);
      const [first] = lanes;
      for (const lane of lanes) {
        expect(lane, id).toBeCloseTo(first ?? NaN, 6);
      }
    }
  });

  it('fence and bed their ground, overlapping no other footprint', () => {
    for (const field of VILLAGE_PLACEMENTS) {
      if (!isField(field.model)) {
        continue;
      }
      const own: Shape[] = findFootprints(field);
      expect(own).toHaveLength(5 + FARM_FIELDS[field.model].beds.length);
      const others = new Terrain(
        VILLAGE_PLACEMENTS.filter(
          (placement: Placement) => placement !== field,
        ).flatMap(findFootprints),
        VILLAGE_BOUNDARY,
      );
      for (const point of own.flatMap(listPointsWithin)) {
        expect(others.isClear(point, -PLAYER_RADIUS), field.model).toBe(true);
      }
    }
  });

  it('hold nothing inside their fences but their own beds', () => {
    for (const id of FARM_FIELD_IDS) {
      const field: Placement = findPlacement(id);
      const { length, width } = FARM_FIELDS[id];
      const inside = new Terrain(
        [
          {
            shape: 'box',
            x: field.x,
            z: field.z,
            halfWidth: length / 2,
            halfDepth: width / 2,
            yaw: field.yaw,
          },
        ],
        // A boundary far out of the way.
        { x: field.x, z: field.z, radius: 1000 },
      );
      for (const other of VILLAGE_PLACEMENTS) {
        if (other === field) {
          continue;
        }
        for (const shape of findFootprints(other)) {
          for (const point of listPointsWithin(shape)) {
            expect(
              inside.isClear(point, -PLAYER_RADIUS),
              `${other.model} in ${id}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it('lie well within the boundary of the village', () => {
    const fields: Shape[] = VILLAGE_PLACEMENTS.filter(
      (placement: Placement) => isField(placement.model),
    ).flatMap(findFootprints);
    for (const point of fields.flatMap(listPointsWithin)) {
      expect(measureFromEdge(point)).toBeGreaterThan(1);
    }
  });

  it('leave a way open along the back of each house, before its field', () => {
    for (const [model, from, to] of FIELD_WAYS) {
      const house: Placement = findPlacement(model);
      const start: GroundVector = placePoint(house, from);
      const end: GroundVector = placePoint(house, to);
      expect(VILLAGE_TERRAIN.isPathClear(start, end), model).toBe(true);
      expect(
        findMapPath('village', findSpawnPoint(0), start),
        model,
      ).not.toBeNull();
    }
  });

  it('let a player in through the gate, and up the lane to the back', () => {
    for (const id of FARM_FIELD_IDS) {
      const [gate, back] = findMainLane(id);
      expect(VILLAGE_TERRAIN.isClear(gate), id).toBe(true);
      expect(VILLAGE_TERRAIN.isPathClear(gate, back), id).toBe(true);
      expect(findMapPath('village', findSpawnPoint(0), back), id).not.toBe(
        null,
      );
    }
  });

  it('let nobody into a field but through its gate', () => {
    for (const id of FARM_FIELD_IDS) {
      const field: Placement = findPlacement(id);
      const across: Shape = placeShape(field, {
        shape: 'box',
        x: 0,
        z: FARM_FIELDS[id].width / 2 - FIELD_FENCE_THICKNESS / 2,
        halfWidth: FIELD_GATE_WIDTH / 2,
        halfDepth: FIELD_FENCE_THICKNESS / 2,
        yaw: 0,
      });
      const shut = new Terrain(
        [...VILLAGE_TERRAIN.shapes, across],
        VILLAGE_BOUNDARY,
      );
      const [, back] = findMainLane(id);
      expect(
        new NavigationGraph(shut).findPath(findSpawnPoint(0), back),
        id,
      ).toBeNull();
    }
  });

  it('keep clear of the clover, the spawn points and the run of Toby', () => {
    const fields: Shape[] = VILLAGE_PLACEMENTS.filter(
      (placement: Placement) => isField(placement.model),
    ).flatMap(findFootprints);
    const [first, second] = TOBY_ENDS;
    const run: CircleShape[] = Array.from(
      { length: 101 },
      (_, index: number): CircleShape => ({
        shape: 'circle',
        x: first.x + ((second.x - first.x) * index) / 100,
        z: first.z + ((second.z - first.z) * index) / 100,
        radius: 1 + TOBY_RADIUS,
      }),
    );
    const points: CircleShape[] = [
      ...VILLAGE_PLACEMENTS.filter(
        (placement: Placement) => placement.model === 'clover',
      ).map((patch: Placement): CircleShape => ({
        shape: 'circle',
        x: patch.x,
        z: patch.z,
        radius: 1,
      })),
      ...Array.from(
        { length: SPAWN_POINT_COUNT },
        (_, index: number): CircleShape => ({
          shape: 'circle',
          ...findSpawnPoint(index),
          radius: 1 + PLAYER_RADIUS,
        }),
      ),
      ...run,
    ];
    for (const point of points) {
      for (const field of fields) {
        expect(measureGap(point, field)).toBeGreaterThan(0);
      }
    }
  });

  it('leave no ground in or around them that cannot be reached', () => {
    for (const id of FARM_FIELD_IDS) {
      const { length, width } = FARM_FIELDS[id];
      const reach: number = Math.ceil(Math.max(length, width) / 2) + 2;
      const points: GridPoint[] = walkGrid(findPlacement(id), reach, 0.1);
      expect(
        points.filter((point: GridPoint) => point.isOpen && !point.isReached),
      ).toEqual([]);
    }
  });
});

describe('findPlacement', () => {
  it('finds where a model of the village stands', () => {
    expect(findPlacement('weapon-shop')).toMatchObject({
      model: 'weapon-shop',
    });
  });

  it('fails for a model the village has no place for', () => {
    expect(() => findPlacement('cave-torch')).toThrow();
  });
});
