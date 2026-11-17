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
 * @module shared/tests/authoritative-player Tests for a player as the
 *   server moves it.
 */

import { describe, expect, it } from 'vitest';

import {
  AuthoritativePlayer,
  INPUT_WAIT_LIMIT,
  SIMULATION_RATE,
  WAITING_INPUT_LIMIT,
  WALK_SPEED,
  createMotion,
} from '../src/index.ts';
import type { StampedInput } from '../src/index.ts';

/** How far a player walks in one step, in metres. */
const STEP_LENGTH: number = WALK_SPEED / SIMULATION_RATE;

/**
 * Makes the input that steers a player along the X axis, or stops it.
 *
 * @param {number} sequence - The number of the input.
 * @param {number} after - The number of steps the previous input is to
 *   have been in effect for.
 * @param {number} x - The direction along the X axis, or 0 to stop.
 * @returns {StampedInput} The input.
 */
function steer(sequence: number, after: number, x: number): StampedInput {
  return { type: 'move', sequence, after, direction: { x, z: 0 } };
}

/**
 * Moves a player several steps of the simulation forward.
 *
 * @param {AuthoritativePlayer} player - The player.
 * @param {number} count - The number of steps.
 */
function stepTimes(player: AuthoritativePlayer, count: number): void {
  for (let step = 0; step < count; step++) {
    player.step();
  }
}

/**
 * Creates a player that idles at the origin.
 *
 * @returns {AuthoritativePlayer} The player.
 */
function createPlayer(): AuthoritativePlayer {
  return new AuthoritativePlayer(createMotion({ x: 0, z: 0 }, 0));
}

describe('an input of a player', () => {
  it('shows from the next step, not before', () => {
    const player: AuthoritativePlayer = createPlayer();
    stepTimes(player, 3);
    expect(player.receiveInput(steer(1, 0, 1))).toBe(true);
    expect(player.motion.action).toBe('Idle');
    expect(player.progress).toMatchObject({ sequence: 0, steps: 3 });
    player.step();
    expect(player.motion.action).toBe('Walk');
    expect(player.motion.x).toBeCloseTo(STEP_LENGTH);
    expect(player.progress).toEqual({
      sequence: 1,
      steps: 1,
      motion: player.motion,
    });
  });

  it('waits until the previous one has had the steps it tells', () => {
    const player: AuthoritativePlayer = createPlayer();
    player.receiveInput(steer(1, 0, 1));
    player.receiveInput(steer(2, 4, 0));
    stepTimes(player, 4);
    expect(player.progress).toMatchObject({ sequence: 1, steps: 4 });
    expect(player.motion.action).toBe('Walk');
    player.step();
    expect(player.progress).toMatchObject({ sequence: 2, steps: 1 });
    expect(player.motion.action).toBe('Idle');
    expect(player.motion.x).toBeCloseTo(STEP_LENGTH * 4);
  });

  it('comes into effect at the next step if its turn has passed', () => {
    const player: AuthoritativePlayer = createPlayer();
    player.receiveInput(steer(1, 0, 1));
    stepTimes(player, 6);
    player.receiveInput(steer(2, 4, 0));
    player.step();
    expect(player.progress).toMatchObject({ sequence: 2, steps: 1 });
    expect(player.motion.x).toBeCloseTo(STEP_LENGTH * 6);
  });

  it('comes into effect with the previous one if it tells no steps', () => {
    const player: AuthoritativePlayer = createPlayer();
    player.receiveInput(steer(1, 0, 1));
    player.receiveInput(steer(2, 0, -1));
    player.step();
    expect(player.progress).toMatchObject({ sequence: 2, steps: 1 });
    expect(player.motion.x).toBeCloseTo(-STEP_LENGTH);
  });

  it('keeps its turn behind an input that waits', () => {
    const player: AuthoritativePlayer = createPlayer();
    player.receiveInput(steer(1, 0, 1));
    player.receiveInput(steer(2, 3, -1));
    player.receiveInput(steer(3, 2, 0));
    stepTimes(player, 10);
    expect(player.progress.sequence).toBe(3);
    expect(player.motion.x).toBeCloseTo(STEP_LENGTH * (3 - 2));
    expect(player.motion.action).toBe('Idle');
  });

  it('does not wait longer than the limit', () => {
    const player: AuthoritativePlayer = createPlayer();
    player.receiveInput(steer(1, 0, 1));
    player.step();
    player.receiveInput(steer(2, 1_000_000, 0));
    stepTimes(player, INPUT_WAIT_LIMIT);
    expect(player.progress.sequence).toBe(1);
    player.step();
    expect(player.progress).toMatchObject({ sequence: 2, steps: 1 });
    expect(player.motion.x).toBeCloseTo(STEP_LENGTH * (INPUT_WAIT_LIMIT + 1));
  });

  it('is refused unless its number is higher than the last', () => {
    const player: AuthoritativePlayer = createPlayer();
    expect(player.receiveInput(steer(3, 0, 1))).toBe(true);
    expect(player.receiveInput(steer(3, 0, 0))).toBe(false);
    expect(player.receiveInput(steer(2, 0, 0))).toBe(false);
    expect(player.receiveInput(steer(7, 0, 1))).toBe(true);
    stepTimes(player, 2);
    expect(player.progress.sequence).toBe(7);
    expect(player.motion.action).toBe('Walk');
  });

  it('is refused when too many are waiting already', () => {
    const player: AuthoritativePlayer = createPlayer();
    for (let sequence = 1; sequence <= WAITING_INPUT_LIMIT; sequence++) {
      expect(player.receiveInput(steer(sequence, 5, 1))).toBe(true);
    }
    const late: StampedInput = steer(WAITING_INPUT_LIMIT + 1, 0, 1);
    expect(player.receiveInput(late)).toBe(false);
    stepTimes(player, 6);
    expect(player.receiveInput(late)).toBe(true);
  });
});
