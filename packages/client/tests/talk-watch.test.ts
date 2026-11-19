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
  SIMULATION_RATE,
  TALK_REACH,
  TALK_STEPS,
  TOBY_LOOP_STEPS,
  applyInput,
  createMotion,
  findPlacement,
  findTobyPose,
  stepMotion,
} from '@clovervale/shared';
import type { PlayerMotion, TobyPose } from '@clovervale/shared';

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
  return stepMotion(applyInput(motion, { type: 'interact' }), 0);
}

/**
 * Moves a player several steps forward.
 *
 * @param {PlayerMotion} motion - The motion of the player.
 * @param {number} count - The number of steps.
 * @param {number} [from] - The number of the first step, 0 by default.
 * @returns {PlayerMotion} The motion after the steps.
 */
function stepTimes(
  motion: PlayerMotion,
  count: number,
  from = 0,
): PlayerMotion {
  let stepped: PlayerMotion = motion;
  for (let step = from; step < from + count; step++) {
    stepped = stepMotion(stepped, step);
  }
  return stepped;
}

describe('TalkWatch', () => {
  it('notices a talk once, as it starts, with whom it is', () => {
    const watch = new TalkWatch();
    expect(watch.noticeTalk(BY_NANCY, 0)).toBeNull();
    const talking: PlayerMotion = interact(BY_NANCY);
    expect(watch.noticeTalk(talking, 0)?.id).toBe('nancy');
    expect(watch.noticeTalk(talking, 0)).toBeNull();
    expect(watch.noticeTalk(stepMotion(talking, 0), 0)).toBeNull();
  });

  it('notices the next talk as well', () => {
    const watch = new TalkWatch();
    const first: PlayerMotion = interact(BY_NANCY);
    watch.noticeTalk(first, 0);
    const over: PlayerMotion = stepTimes(first, TALK_STEPS);
    expect(over.action).toBe('Idle');
    expect(watch.noticeTalk(over, 0)).toBeNull();
    const second: PlayerMotion = interact(over);
    expect(second.action).toBe('Talk');
    expect(watch.noticeTalk(second, 0)?.id).toBe('nancy');
  });

  it('notices no slash, and nothing without a player', () => {
    const watch = new TalkWatch();
    expect(watch.noticeTalk(interact({ ...BY_NANCY, yaw: 0 }), 0)).toBeNull();
    expect(watch.noticeTalk(null, 0)).toBeNull();
  });

  it('notices a talk to Toby where he was as it started', () => {
    let step = 0;
    while (findTobyPose(step).activity !== 'Run') {
      step = (step + 1) % TOBY_LOOP_STEPS;
    }
    step += SIMULATION_RATE / 2;
    const toby: TobyPose = findTobyPose(step);
    const facing: PlayerMotion = createMotion(
      { x: toby.x, z: toby.z - TALK_REACH + 0.2 },
      0,
    );
    const talking: PlayerMotion = stepMotion(
      applyInput(facing, { type: 'interact' }),
      step,
    );
    expect(talking.action).toBe('Talk');
    // Noticed only some steps later, when he has run on out of reach.
    const later: PlayerMotion = stepTimes(talking, TALK_STEPS - 1, step + 1);
    const watch = new TalkWatch();
    expect(watch.noticeTalk(later, step + TALK_STEPS - 1)?.id).toBe('toby');
  });
});
