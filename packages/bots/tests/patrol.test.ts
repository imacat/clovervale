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
 * @module bots/tests/patrol Tests for where a bot walks to, and how.
 */

import { describe, expect, it } from 'vitest';

import {
  SPAWN_POINT_COUNT,
  VILLAGE_TERRAIN,
  applyInput,
  createMotion,
  findInteraction,
  findSpawnPoint,
  findVillagePath,
  stepMotion,
} from '@clovervale/shared';
import type { GroundVector, PlayerMotion } from '@clovervale/shared';

import {
  DRINKING_SPOT,
  ESCAPE_STEPS,
  POINTS_OF_INTEREST,
  STEP_DISTANCE,
  chooseNextPoint,
  planDrinkingWalk,
  planEscape,
  planLeg,
  planRoute,
} from '../src/patrol.ts';
import type { Leg } from '../src/patrol.ts';

/**
 * Walks a player along a leg by the rules of the server.
 *
 * @param {GroundVector} from - Where the player starts.
 * @param {Leg} leg - The leg.
 * @returns {GroundVector} Where the player ends.
 */
function walkLeg(from: GroundVector, leg: Leg): GroundVector {
  let motion: PlayerMotion = applyInput(createMotion(from, 0), {
    type: 'move',
    direction: leg.direction,
  });
  for (let step = 0; step < leg.steps; step++) {
    motion = stepMotion(motion);
  }
  return { x: motion.x, z: motion.z };
}

/**
 * Measures how far apart two points are.
 *
 * @param {GroundVector} a - One point.
 * @param {GroundVector} b - The other point.
 * @returns {number} The distance between them, in metres.
 */
function measureDistance(a: GroundVector, b: GroundVector): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

describe('POINTS_OF_INTEREST', () => {
  it('lets a player stand at every point', () => {
    for (const { position } of POINTS_OF_INTEREST) {
      expect(VILLAGE_TERRAIN.isClear(position)).toBe(true);
    }
  });
});

describe('planLeg', () => {
  it('walks to within half a step of where nothing is in the way', () => {
    const from: GroundVector = { x: -0.8, z: -3.5 };
    const to: GroundVector = { x: 2.3, z: -1.2 };
    const end: GroundVector = walkLeg(from, planLeg(from, to));
    expect(measureDistance(end, to)).toBeLessThanOrEqual(
      STEP_DISTANCE / 2 + 1e-9,
    );
  });

  it('takes no steps to where it already is', () => {
    const from: GroundVector = { x: 1, z: 2 };
    expect(planLeg(from, { x: 1.01, z: 2 }).steps).toBe(0);
  });
});

describe('planRoute', () => {
  it.each(
    POINTS_OF_INTEREST.flatMap(({ position: from }) =>
      POINTS_OF_INTEREST.map(({ position: to }) => [from, to]),
    ),
  )(
    'walks around the obstacles from %j to within half a step of %j',
    (from, to) => {
      const path: GroundVector[] | null = findVillagePath(from, to);
      expect(path).not.toBeNull();
      let end: GroundVector = from;
      for (const leg of planRoute(from, path ?? [])) {
        end = walkLeg(end, leg);
      }
      expect(measureDistance(end, to)).toBeLessThanOrEqual(
        STEP_DISTANCE / 2 + 1e-9,
      );
    },
  );

  it('walks from every spawn point to every point of interest', () => {
    for (let index = 0; index < SPAWN_POINT_COUNT; index++) {
      const from: GroundVector = findSpawnPoint(index);
      for (const { position: to } of POINTS_OF_INTEREST) {
        let end: GroundVector = from;
        for (const leg of planRoute(from, findVillagePath(from, to) ?? [])) {
          end = walkLeg(end, leg);
        }
        expect(measureDistance(end, to)).toBeLessThanOrEqual(
          STEP_DISTANCE / 2 + 1e-9,
        );
      }
    }
  });

  it('leaves out the points it is at already', () => {
    const from: GroundVector = { x: 1, z: 2 };
    const legs = planRoute(from, [{ x: 1.01, z: 2 }, { x: 1.01, z: 3 }]);
    expect(legs).toHaveLength(1);
  });
});

describe('planDrinkingWalk', () => {
  it('walks to the fountain, facing it, from everywhere a bot goes', () => {
    const starts: GroundVector[] = [
      ...POINTS_OF_INTEREST.map(({ position }) => position),
      findSpawnPoint(0),
      DRINKING_SPOT,
    ];
    for (const start of starts) {
      const legs: Leg[] | null = planDrinkingWalk(start, findVillagePath);
      expect(legs).not.toBeNull();
      let motion: PlayerMotion = createMotion(start, 0);
      for (const leg of legs ?? []) {
        motion = applyInput(motion, { type: 'move', direction: leg.direction });
        for (let step = 0; step < leg.steps; step++) {
          motion = stepMotion(motion);
        }
      }
      motion = stepMotion(
        applyInput(motion, { type: 'move', direction: { x: 0, z: 0 } }),
      );
      expect(measureDistance(motion, DRINKING_SPOT)).toBeLessThanOrEqual(
        STEP_DISTANCE / 2 + 1e-9,
      );
      expect(findInteraction(motion)).toBe('Drink');
    }
  });

  it('finds no walk where there is no way', () => {
    expect(planDrinkingWalk({ x: 0, z: 0 }, () => null)).toBeNull();
  });
});

describe('planEscape', () => {
  it('walks a short way in a direction chosen at random', () => {
    const north = planEscape(() => 0);
    const south = planEscape(() => 0.5);
    expect(north.steps).toBe(ESCAPE_STEPS);
    expect(north.direction.x).toBeCloseTo(0);
    expect(north.direction.z).toBeCloseTo(1);
    expect(south.direction.z).toBeCloseTo(-1);
  });
});

describe('chooseNextPoint', () => {
  /**
   * Makes a source of random numbers that gives the same number again and
   * again.
   *
   * @param {number} value - The number.
   * @returns {() => number} The source.
   */
  const repeat =
    (value: number): (() => number) =>
    () =>
      value;
  const randoms: number[] = [0, 0.2, 0.4, 0.6, 0.8, 0.999];

  it('chooses any point first', () => {
    const chosen = new Set<number>(
      randoms.map((value: number) => chooseNextPoint(4, null, repeat(value))),
    );
    expect([...chosen].sort()).toEqual([0, 1, 2, 3]);
  });

  it('chooses every point but the current one next', () => {
    for (let current = 0; current < 4; current++) {
      const chosen = new Set<number>(
        randoms.map((value: number) =>
          chooseNextPoint(4, current, repeat(value)),
        ),
      );
      expect([...chosen].sort()).toEqual(
        [0, 1, 2, 3].filter((index: number) => index !== current),
      );
    }
  });

  it('chooses the only point again', () => {
    expect(chooseNextPoint(1, 0, repeat(0.5))).toBe(0);
  });
});
