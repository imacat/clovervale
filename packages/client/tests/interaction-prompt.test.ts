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
 * @module client/tests/interaction-prompt Tests for telling what the space
 *   bar does.
 */

import { describe, expect, it } from 'vitest';

import {
  FOUNTAIN_RIM_RADIUS,
  PLAYER_RADIUS,
  PLAZA_CENTRE,
  applyInput,
  createMotion,
  killMotion,
  stepMotion,
} from '@clovervale/shared';
import type { PlayerMotion } from '@clovervale/shared';

import {
  describePrompt,
  describeSpaceKey,
} from '../src/interaction-prompt.ts';

/** A player against the rim of the fountain, facing it. */
const BY_FOUNTAIN: PlayerMotion = createMotion(
  {
    x: PLAZA_CENTRE.x,
    z: PLAZA_CENTRE.z + FOUNTAIN_RIM_RADIUS + PLAYER_RADIUS,
  },
  180,
);

/** A player by the fountain, facing away from it. */
const FACING_AWAY: PlayerMotion = { ...BY_FOUNTAIN, yaw: 0 };

describe('describePrompt', () => {
  it('tells a player by the fountain, facing it, that it can drink', () => {
    expect(describePrompt(BY_FOUNTAIN)).toBe(
      'Press Space to drink from the fountain',
    );
  });

  it('tells nothing while the space bar makes the player slash', () => {
    expect(describePrompt(FACING_AWAY)).toBeNull();
  });

  it('tells nothing while the player drinks already', () => {
    const drinking: PlayerMotion = stepMotion(
      applyInput(BY_FOUNTAIN, { type: 'interact' }),
    );
    expect(drinking.action).toBe('Drink');
    expect(describePrompt(drinking)).toBeNull();
  });

  it('tells nothing to a dead player, or without a player', () => {
    expect(describePrompt(killMotion(BY_FOUNTAIN))).toBeNull();
    expect(describePrompt(null)).toBeNull();
  });
});

describe('describeSpaceKey', () => {
  it('tells what the space bar makes the player do', () => {
    expect(describeSpaceKey(BY_FOUNTAIN)).toBe('drink from the fountain');
    expect(describeSpaceKey(FACING_AWAY)).toBe('slash');
  });

  it('tells that it does nothing while the player cannot interact', () => {
    expect(describeSpaceKey(killMotion(BY_FOUNTAIN))).toBe('nothing');
  });

  it('tells nothing is known without a player', () => {
    expect(describeSpaceKey(null)).toBe('–');
  });
});
