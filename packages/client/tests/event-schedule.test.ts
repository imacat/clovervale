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
 * @module client/tests/event-schedule Tests for holding the events back
 *   until their moment is shown.
 */

import { describe, expect, it } from 'vitest';

import { SIMULATION_RATE } from '@clovervale/shared';
import type { GameEvent } from '@clovervale/shared';

import { EventSchedule } from '../src/event-schedule.ts';

/** How long one step of the simulation lasts, in milliseconds. */
const STEP: number = 1000 / SIMULATION_RATE;

/**
 * Makes a hit of a player on the monster.
 *
 * @param {number} id - The number of the event.
 * @param {number} step - The step at which it happened.
 * @returns {GameEvent} The hit.
 */
function makeHit(id: number, step: number): GameEvent {
  return {
    type: 'hit',
    id,
    step,
    attacker: { kind: 'player', id: 3 },
    target: { kind: 'monster', id: 1 },
    damage: 20,
  };
}

describe('EventSchedule', () => {
  it('holds an event back until its moment is shown', () => {
    const schedule = new EventSchedule();
    const hit: GameEvent = makeHit(1, 10);
    schedule.receive([hit]);
    expect(schedule.takeDue(null)).toEqual([]);
    expect(schedule.takeDue(10 * STEP - 1)).toEqual([]);
    expect(schedule.takeDue(10 * STEP)).toEqual([hit]);
  });

  it('hands out each event once', () => {
    const schedule = new EventSchedule();
    const hit: GameEvent = makeHit(1, 10);
    schedule.receive([hit]);
    expect(schedule.takeDue(20 * STEP)).toEqual([hit]);
    expect(schedule.takeDue(30 * STEP)).toEqual([]);
    expect(schedule.size).toBe(0);
  });

  it('ignores an event it has taken in before', () => {
    const schedule = new EventSchedule();
    const first: GameEvent = makeHit(1, 10);
    const second: GameEvent = makeHit(2, 11);
    schedule.receive([first]);
    schedule.receive([first, second]);
    expect(schedule.takeDue(20 * STEP)).toEqual([first, second]);
    schedule.receive([first, second]);
    expect(schedule.takeDue(30 * STEP)).toEqual([]);
  });

  it(
    'hands out the events in the order they happened, as they come due',
    () => {
      const schedule = new EventSchedule();
      const events: GameEvent[] = [
        makeHit(4, 10),
        makeHit(5, 10),
        makeHit(6, 14),
      ];
      schedule.receive(events);
      expect(schedule.takeDue(12 * STEP)).toEqual(events.slice(0, 2));
      expect(schedule.takeDue(14 * STEP)).toEqual(events.slice(2));
    },
  );

  it('forgets everything once cleared, and starts counting over', () => {
    const schedule = new EventSchedule();
    schedule.receive([makeHit(7, 10)]);
    schedule.clear();
    expect(schedule.takeDue(20 * STEP)).toEqual([]);
    const restarted: GameEvent = makeHit(1, 2);
    schedule.receive([restarted]);
    expect(schedule.takeDue(20 * STEP)).toEqual([restarted]);
  });
});
