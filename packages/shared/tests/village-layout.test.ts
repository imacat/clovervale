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
