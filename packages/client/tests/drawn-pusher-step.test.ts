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
 * @module client/tests/drawn-pusher-step Tests for the step of the server
 *   the pushers are drawn at.
 */

import { describe, expect, it } from 'vitest';

import { createMotion } from '@clovervale/shared';
import type { PlayerInput, PlayerMotion } from '@clovervale/shared';

import { DrawnPusherStep } from '../src/drawn-pusher-step.ts';
import { PlayerPrediction } from '../src/prediction.ts';

/** Where the player of the tests starts. */
const START: PlayerMotion = createMotion({ x: 2, z: -3 }, 180);

/** The input that makes the player walk east. */
const EAST: PlayerInput = { type: 'move', direction: { x: 1, z: 0 } };

/** The input that stops the player. */
const STOP: PlayerInput = { type: 'move', direction: { x: 0, z: 0 } };

describe('DrawnPusherStep', () => {
  it('shows the step the pushers are at, as it draws the player', () => {
    const prediction = new PlayerPrediction(START, 100, 0, 'village');
    const pusherStep = new DrawnPusherStep(prediction);
    expect(pusherStep.read(0)).toBe(100);
    expect(pusherStep.read(1000)).toBe(120);
    prediction.issueInput(EAST, 1000);
    expect(pusherStep.read(1000)).toBe(120);
    expect(pusherStep.read(1025)).toBe(120.5);
    prediction.issueInput(STOP, 1030);
    expect(pusherStep.read(1050)).toBe(121);
    expect(pusherStep.read(3050)).toBe(161);
  });
});
