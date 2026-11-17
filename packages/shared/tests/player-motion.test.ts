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
 * @module shared/tests/player-motion Tests for the rules that move a
 *   player.
 */

import { describe, expect, it } from 'vitest';

import {
  SIMULATION_RATE,
  SLASH_DURATION,
  SLASH_STEPS,
  WALK_SPEED,
  applyInput,
  createMotion,
  isResting,
  stepMotion,
} from '../src/index.ts';
import type { PlayerInput, PlayerMotion } from '../src/index.ts';

/** The input that makes a player interact. */
const INTERACT: PlayerInput = { type: 'interact' };

/**
 * Makes the input that steers a player.
 *
 * @param {number} x - The east-west component of the direction.
 * @param {number} z - The north-south component of the direction.
 * @returns {PlayerInput} The input.
 */
function steer(x: number, z: number): PlayerInput {
  return { type: 'move', direction: { x, z } };
}

/**
 * Moves a player several steps of the simulation forward.
 *
 * @param {PlayerMotion} motion - The motion of the player.
 * @param {number} count - The number of steps.
 * @returns {PlayerMotion} The motion after the steps.
 */
function stepTimes(motion: PlayerMotion, count: number): PlayerMotion {
  let stepped: PlayerMotion = motion;
  for (let step = 0; step < count; step++) {
    stepped = stepMotion(stepped);
  }
  return stepped;
}

describe('a new motion', () => {
  it('idles where it is told, facing the way it is told', () => {
    const motion: PlayerMotion = createMotion({ x: 2, z: -3 }, 180);
    expect(motion).toMatchObject({ x: 2, z: -3, yaw: 180, action: 'Idle' });
    expect(isResting(motion)).toBe(true);
  });

  it('stays as it is without input', () => {
    const motion: PlayerMotion = createMotion({ x: 2, z: -3 }, 180);
    expect(stepTimes(motion, SIMULATION_RATE)).toEqual(motion);
  });
});

describe('a player who wants to move', () => {
  it('stays put until the next step', () => {
    const start: PlayerMotion = createMotion({ x: 0, z: 0 }, 0);
    const steered: PlayerMotion = applyInput(start, steer(1, 0));
    expect(steered).toMatchObject({ x: 0, z: 0, yaw: 0, action: 'Idle' });
    expect(isResting(steered)).toBe(false);
  });

  it('walks at walking speed, facing the way it goes', () => {
    const start: PlayerMotion = createMotion({ x: 1, z: 2 }, 0);
    const walking: PlayerMotion = stepTimes(
      applyInput(start, steer(-30, 0)),
      SIMULATION_RATE * 2,
    );
    expect(walking.x).toBeCloseTo(1 - WALK_SPEED * 2);
    expect(walking.z).toBeCloseTo(2);
    expect(walking.yaw).toBeCloseTo(-90);
    expect(walking.action).toBe('Walk');
    expect(walking.actionCount).toBe(1);
  });

  it('stops where it is, facing the same way, and rests', () => {
    const start: PlayerMotion = createMotion({ x: 0, z: 0 }, 0);
    const walking: PlayerMotion = stepTimes(
      applyInput(start, steer(1, 0)),
      5,
    );
    const stopping: PlayerMotion = applyInput(walking, steer(0, 0));
    expect(isResting(stopping)).toBe(false);
    const stopped: PlayerMotion = stepMotion(stopping);
    expect(stopped).toMatchObject({ x: walking.x, yaw: 90, action: 'Idle' });
    expect(stopped.actionCount).toBe(2);
    expect(isResting(stopped)).toBe(true);
    expect(stepMotion(stopped)).toEqual(stopped);
  });

  it('is left as it was by an input', () => {
    const start: PlayerMotion = createMotion({ x: 0, z: 0 }, 0);
    const before: PlayerMotion = {
      ...start,
      direction: { ...start.direction },
    };
    stepMotion(applyInput(applyInput(start, steer(1, 0)), INTERACT));
    expect(start).toEqual(before);
  });
});

describe('a player who interacts', () => {
  it('slashes from the next step, for as long as a slash lasts', () => {
    expect(SLASH_STEPS / SIMULATION_RATE).toBeCloseTo(SLASH_DURATION);
    const asked: PlayerMotion = applyInput(
      createMotion({ x: 0, z: 0 }, 0),
      INTERACT,
    );
    expect(asked.action).toBe('Idle');
    expect(isResting(asked)).toBe(false);
    const slashing: PlayerMotion = stepMotion(asked);
    expect(slashing.action).toBe('Slash');
    expect(stepTimes(slashing, SLASH_STEPS - 1).action).toBe('Slash');
    const over: PlayerMotion = stepTimes(slashing, SLASH_STEPS);
    expect(over.action).toBe('Idle');
    expect(isResting(over)).toBe(true);
  });

  it('carries on with its slash alone when asked again during it', () => {
    const slashing: PlayerMotion = stepTimes(
      applyInput(createMotion({ x: 0, z: 0 }, 0), INTERACT),
      SLASH_STEPS / 2,
    );
    const again: PlayerMotion = applyInput(slashing, INTERACT);
    expect(again).toEqual(slashing);
    const over: PlayerMotion = stepTimes(again, SLASH_STEPS / 2 + 1);
    expect(over.action).toBe('Idle');
    expect(stepTimes(over, SLASH_STEPS).action).toBe('Idle');
  });

  it('stands still without turning while it slashes', () => {
    const walking: PlayerMotion = stepTimes(
      applyInput(createMotion({ x: 0, z: 0 }, 0), steer(1, 0)),
      4,
    );
    const slashing: PlayerMotion = stepTimes(
      applyInput(applyInput(walking, INTERACT), steer(0, 1)),
      SLASH_STEPS,
    );
    expect(slashing).toMatchObject({
      x: walking.x,
      z: walking.z,
      yaw: walking.yaw,
      action: 'Slash',
    });
  });

  it('walks on after the slash the way it wants to move by then', () => {
    const slashing: PlayerMotion = stepMotion(
      applyInput(createMotion({ x: 0, z: 0 }, 0), INTERACT),
    );
    const turned: PlayerMotion = applyInput(
      stepTimes(applyInput(slashing, steer(1, 0)), 3),
      steer(0, 1),
    );
    const walking: PlayerMotion = stepTimes(turned, SLASH_STEPS - 3);
    expect(walking.action).toBe('Walk');
    expect(walking.yaw).toBeCloseTo(0);
    expect(walking.x).toBeCloseTo(0);
    expect(walking.z).toBeCloseTo(WALK_SPEED / SIMULATION_RATE);
  });

  it('can slash again as soon as the slash is over', () => {
    const over: PlayerMotion = stepTimes(
      applyInput(createMotion({ x: 0, z: 0 }, 0), INTERACT),
      SLASH_STEPS + 1,
    );
    const again: PlayerMotion = stepMotion(applyInput(over, INTERACT));
    expect(again.action).toBe('Slash');
    expect(again.actionCount).toBe(3);
  });
});
