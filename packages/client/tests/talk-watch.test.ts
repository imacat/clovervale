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
 * @module client/tests/talk-watch Tests for noticing the talks of the
 *   player of the page.
 */

import { describe, expect, it } from 'vitest';

import {
  TALK_REACH,
  TALK_STEPS,
  applyInput,
  createMotion,
  findPlacement,
  stepMotion,
} from '@clovervale/shared';
import type { PlayerMotion } from '@clovervale/shared';

import { TalkWatch } from '../src/talk-watch.ts';

/** A player south of Nancy the villager, facing her. */
const BY_NANCY: PlayerMotion = createMotion(
  {
    x: findPlacement('npc-nancy.glb').x,
    z: findPlacement('npc-nancy.glb').z + TALK_REACH - 0.1,
  },
  180,
);

/**
 * Makes a player interact, and moves it one step forward.
 *
 * @param {PlayerMotion} motion - The motion of the player.
 * @returns {PlayerMotion} The motion after the step.
 */
function interact(motion: PlayerMotion): PlayerMotion {
  return stepMotion(applyInput(motion, { type: 'interact' }));
}

/**
 * Moves a player several steps forward.
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

describe('TalkWatch', () => {
  it('notices a talk once, as it starts, with whom it is', () => {
    const watch = new TalkWatch();
    expect(watch.noticeTalk(BY_NANCY)).toBeNull();
    const talking: PlayerMotion = interact(BY_NANCY);
    expect(watch.noticeTalk(talking)?.name).toBe('Nancy');
    expect(watch.noticeTalk(talking)).toBeNull();
    expect(watch.noticeTalk(stepMotion(talking))).toBeNull();
  });

  it('notices the next talk as well', () => {
    const watch = new TalkWatch();
    const first: PlayerMotion = interact(BY_NANCY);
    watch.noticeTalk(first);
    const over: PlayerMotion = stepTimes(first, TALK_STEPS);
    expect(over.action).toBe('Idle');
    expect(watch.noticeTalk(over)).toBeNull();
    const second: PlayerMotion = interact(over);
    expect(second.action).toBe('Talk');
    expect(watch.noticeTalk(second)?.name).toBe('Nancy');
  });

  it('notices no slash, and nothing without a player', () => {
    const watch = new TalkWatch();
    expect(watch.noticeTalk(interact({ ...BY_NANCY, yaw: 0 }))).toBeNull();
    expect(watch.noticeTalk(null)).toBeNull();
  });
});
