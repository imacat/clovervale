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

import { applyInput, createMotion, stepMotion } from '@clovervale/shared';
import type { GroundVector, PlayerMotion } from '@clovervale/shared';

import {
  POINTS_OF_INTEREST,
  STEP_DISTANCE,
  chooseNextPoint,
  planLeg,
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

describe('planLeg', () => {
  it.each(
    POINTS_OF_INTEREST.flatMap(({ position: from }) =>
      POINTS_OF_INTEREST.map(({ position: to }) => [from, to]),
    ),
  )('walks from %j to within half a step of %j', (from, to) => {
    const end: GroundVector = walkLeg(from, planLeg(from, to));
    expect(Math.hypot(end.x - to.x, end.z - to.z)).toBeLessThanOrEqual(
      STEP_DISTANCE / 2 + 1e-9,
    );
  });

  it('takes no steps to where it already is', () => {
    const from: GroundVector = { x: 1, z: 2 };
    expect(planLeg(from, { x: 1.01, z: 2 }).steps).toBe(0);
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
