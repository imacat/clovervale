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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/20
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/tests/edwin-call Tests for when Edwin calls out for help.
 */

import { describe, expect, it } from 'vitest';

import type { MonsterState } from '@clovervale/shared';

import {
  CALL_BREATHER,
  CALL_INTERVAL,
  EdwinCall,
  areDogsDead,
} from '../src/edwin-call.ts';
import type { EdwinSituation } from '../src/edwin-call.ts';

/** How long a frame lasts in these tests, in seconds, exact in binary. */
const FRAME = 0.125;

/** A situation in which Edwin calls whenever it is his time. */
const CALLING: EdwinSituation = {
  areDogsDead: true,
  isAcquainted: false,
  isInDialogue: false,
  isOnScreen: () => true,
};

/**
 * Runs frames of a call, and tells at which of them Edwin calls.
 *
 * @param {EdwinCall} call - The call.
 * @param {number} frames - How many frames to run.
 * @param {EdwinSituation} situation - How things stand at each of them.
 * @returns {number[]} The positions of the frames at which he calls, from 0.
 */
function runFrames(
  call: EdwinCall,
  frames: number,
  situation: EdwinSituation,
): number[] {
  const calls: number[] = [];
  for (let frame = 0; frame < frames; frame++) {
    if (call.update(FRAME, situation)) {
      calls.push(frame);
    }
  }
  return calls;
}

/**
 * Makes a dog of the cave.
 *
 * @param {MonsterState['mode']} mode - What the dog is up to.
 * @returns {MonsterState} The dog.
 */
function makeDog(mode: MonsterState['mode']): MonsterState {
  return {
    id: 1,
    kind: 'cave-dog',
    x: 0,
    z: 0,
    yaw: 0,
    action: 'Idle',
    actionCount: 1,
    health: 80,
    mode,
  };
}

describe('EdwinCall', () => {
  it('calls after the breather once the dogs die, then each interval', () => {
    const call = new EdwinCall();
    const breather: number = Math.round(CALL_BREATHER / FRAME);
    const interval: number = Math.round(CALL_INTERVAL / FRAME);
    const frames: number = breather + interval * 2 + 1;
    expect(runFrames(call, frames, CALLING)).toEqual([
      breather,
      breather + interval,
      breather + interval * 2,
    ]);
  });

  it('keeps the interval running while he is off the screen', () => {
    const call = new EdwinCall();
    const breather: number = Math.round(CALL_BREATHER / FRAME);
    const interval: number = Math.round(CALL_INTERVAL / FRAME);
    const away: EdwinSituation = { ...CALLING, isOnScreen: () => false };
    expect(runFrames(call, breather + 1, CALLING)).toEqual([breather]);
    expect(runFrames(call, 10, away)).toEqual([]);
    expect(runFrames(call, interval - 10, CALLING)).toEqual([interval - 11]);
  });

  it('makes a call that fell due off the screen once he is back on it', () => {
    const call = new EdwinCall();
    const breather: number = Math.round(CALL_BREATHER / FRAME);
    const interval: number = Math.round(CALL_INTERVAL / FRAME);
    const away: EdwinSituation = { ...CALLING, isOnScreen: () => false };
    expect(runFrames(call, breather + 1, CALLING)).toEqual([breather]);
    expect(runFrames(call, interval + 5, away)).toEqual([]);
    expect(runFrames(call, interval + 1, CALLING)).toEqual([0, interval]);
  });

  it('waits for the breather again once a dog comes back to life', () => {
    const call = new EdwinCall();
    runFrames(call, 5, CALLING);
    runFrames(call, 1, { ...CALLING, areDogsDead: false });
    const breather: number = Math.round(CALL_BREATHER / FRAME);
    expect(runFrames(call, breather + 1, CALLING)).toEqual([breather]);
  });

  it('does not call once he has told who he is, or in a dialogue', () => {
    const known: EdwinSituation = { ...CALLING, isAcquainted: true };
    expect(runFrames(new EdwinCall(), 50, known)).toEqual([]);
    const talking: EdwinSituation = { ...CALLING, isInDialogue: true };
    expect(runFrames(new EdwinCall(), 50, talking)).toEqual([]);
  });
});

describe('areDogsDead', () => {
  it('tells whether every dog in the snapshot of the cave is dead', () => {
    expect(areDogsDead(null)).toBe(false);
    expect(areDogsDead([makeDog('dead'), makeDog('chase')])).toBe(false);
    expect(areDogsDead([makeDog('dead'), makeDog('dead')])).toBe(true);
    expect(areDogsDead([])).toBe(true);
  });
});
