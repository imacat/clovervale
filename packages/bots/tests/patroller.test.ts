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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/23
// AI assistance: Claude Code (Anthropic)

/**
 * @module bots/tests/patroller Tests for what a bot has its player do.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PLAYER_HEALTH, createMotion } from '@clovervale/shared';
import type {
  ClientMessage,
  GroundVector,
  InputProgress,
} from '@clovervale/shared';

import { Patroller } from '../src/patroller.ts';
import type { PatrolSettings } from '../src/patroller.ts';

/** Where the player starts. */
const START: GroundVector = { x: 0, z: 0 };

/** The point the player walks to first. */
const FIRST: GroundVector = { x: 5, z: 0 };

/**
 * A patrol that walks straight from {@link START} to {@link FIRST} first,
 * and always speaks where it has something to say.
 */
const PATROL: PatrolSettings = {
  points: [{ ...FIRST, lines: [['swordPrice']] }, START],
  minPause: 500,
  maxPause: 500,
  drawRandom: () => 0,
  findPath: (from: GroundVector, to: GroundVector) => [to],
};

/**
 * Tells how far a player resting at a point has gotten with its inputs.
 *
 * @param {GroundVector} position - Where the player rests.
 * @param {number} sequence - The number of its last input in effect.
 * @returns {InputProgress} How far it has gotten.
 */
function describeRest(
  position: GroundVector,
  sequence: number,
): InputProgress {
  return { sequence, steps: 0, motion: createMotion(position, 0) };
}

/**
 * Tells how far a player that has died has gotten with its inputs.
 *
 * @param {InputProgress} progress - How far it had gotten before it died.
 * @returns {InputProgress} How far it has gotten.
 */
function describeDeath(progress: InputProgress): InputProgress {
  return { ...progress, motion: { ...progress.motion, action: 'Die' } };
}

describe('Patroller', () => {
  let sent: ClientMessage[];
  let patroller: Patroller;

  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
    patroller = new Patroller(PATROL, (message: ClientMessage) => {
      sent.push(message);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops its player at once, and for good, when it dies on a walk', () => {
    patroller.observe(describeRest(START, 0), PLAYER_HEALTH, 0, 0);
    const dead: InputProgress = describeDeath(describeRest(START, 1));
    patroller.observe(dead, PLAYER_HEALTH, 1, 0);
    vi.runAllTimers();

    expect(sent).toEqual([
      { type: 'move', sequence: 1, after: 0, direction: { x: 5, z: 0 } },
      { type: 'move', sequence: 2, after: 0, direction: { x: 0, z: 0 } },
    ]);
  });

  it('says nothing when its player dies before it speaks', () => {
    patroller.observe(describeRest(START, 0), PLAYER_HEALTH, 0, 0);
    vi.runAllTimers();
    patroller.observe(describeRest(FIRST, 2), PLAYER_HEALTH, 10, 0);
    const dead: InputProgress = describeDeath(describeRest(FIRST, 2));
    patroller.observe(dead, PLAYER_HEALTH, 11, 0);
    vi.runAllTimers();

    expect(sent.map((message: ClientMessage) => message.type)).toEqual([
      'move',
      'move',
    ]);
  });

  it('keeps its own count of tries for a point it heads for again after dying on the way to the fountain', () => {
    const observeRest = (health: number): void => {
      patroller.observe(describeRest(START, sent.length), health, 0, 0);
      vi.runAllTimers();
    };
    for (let attempt = 1; attempt <= 4; attempt++) {
      observeRest(PLAYER_HEALTH);
    }
    observeRest(1);
    const dead: InputProgress = describeDeath(describeRest(START, sent.length));
    patroller.observe(dead, 1, 0, 0);
    observeRest(PLAYER_HEALTH);
    const count: number = sent.length;
    observeRest(PLAYER_HEALTH);

    expect(sent).toHaveLength(count);
  });

  it('sends nothing more once halted', () => {
    patroller.observe(describeRest(START, 0), PLAYER_HEALTH, 0, 0);
    patroller.halt();
    vi.runAllTimers();

    expect(sent).toHaveLength(1);
  });
});
