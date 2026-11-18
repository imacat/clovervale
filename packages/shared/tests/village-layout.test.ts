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
import type { GroundVector, Placement } from '../src/index.ts';

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
