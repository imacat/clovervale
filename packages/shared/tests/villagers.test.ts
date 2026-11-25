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
 * @module shared/tests/villagers Tests for the villagers a player can talk
 *   to.
 */

import { describe, expect, it } from 'vitest';

import type { Pusher } from '../src/pusher.ts';
import { TobyQuest } from '../src/quests.ts';
import type { Quest } from '../src/quests.ts';
import { findTobyPose } from '../src/toby.ts';
import { findPusher, getVillager, hasServerWords } from '../src/villagers.ts';
import type { VillagerId } from '../src/villagers.ts';

/**
 * Tells whether the server chooses what a villager says to a player.
 *
 * @param {VillagerId} id - The villager.
 * @param {readonly Quest[]} quests - The quests the player has opened.
 * @returns {boolean} Whether it does.
 */
function isChosenByServer(id: VillagerId, quests: readonly Quest[]): boolean {
  return hasServerWords(getVillager(id), quests);
}

describe('hasServerWords', () => {
  it('has the server choose the words of Toby, Basil and Edwin', () => {
    for (const id of ['toby', 'basil', 'edwin'] as const) {
      expect(isChosenByServer(id, [])).toBe(true);
      expect(isChosenByServer(id, [new TobyQuest('done')])).toBe(true);
    }
  });

  it('has the server choose the words of Martha on the quest', () => {
    expect(isChosenByServer('martha', [new TobyQuest('started')])).toBe(true);
    expect(isChosenByServer('martha', [new TobyQuest('supplied')])).toBe(true);
  });

  it('leaves the words of Martha to the peer off the quest', () => {
    expect(isChosenByServer('martha', [])).toBe(false);
    expect(isChosenByServer('martha', [new TobyQuest('done')])).toBe(false);
  });

  it('leaves the words of Nancy, Emma and the gate guard to the peer', () => {
    for (const id of ['nancy', 'emma', 'guard'] as const) {
      expect(isChosenByServer(id, [])).toBe(false);
      expect(isChosenByServer(id, [new TobyQuest()])).toBe(false);
    }
  });
});

describe('findPusher', () => {
  it('has Toby push the players aside in the village', () => {
    const pusher: Pusher | null = findPusher('village');
    for (const step of [0, 60, 157.5]) {
      const { x, z } = findTobyPose(step);
      expect(pusher?.locate(step)).toMatchObject({ x, z });
    }
  });

  it('has nobody push the players aside in the cave', () => {
    expect(findPusher('cave')).toBeNull();
  });
});
