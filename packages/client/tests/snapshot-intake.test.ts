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
 * @module client/tests/snapshot-intake Tests for finding what the player of
 *   the page gains from one snapshot to the next.
 */

import { describe, expect, it } from 'vitest';

import { findGainedItems, findGainedSilver } from '../src/snapshot-intake.ts';

describe('findGainedItems', () => {
  it('finds a clover picked and an item looted', () => {
    expect(findGainedItems(['clover'], ['clover', 'clover'])).toEqual([
      'clover',
    ]);
    expect(findGainedItems(['clover'], ['clover', 'sword'])).toEqual([
      'sword',
    ]);
  });

  it('finds nothing as the inventory is first told on joining', () => {
    expect(findGainedItems(null, ['clover', 'sword'])).toEqual([]);
  });

  it('finds nothing as the same inventory comes back on another map', () => {
    expect(findGainedItems(['sword', 'clover'], ['sword', 'clover'])).toEqual(
      [],
    );
  });

  it('finds nothing as an item is dropped and the rest close up', () => {
    expect(
      findGainedItems(['clover', 'sword', 'clover'], ['sword', 'clover']),
    ).toEqual([]);
  });

  it('finds the item gained in the same snapshot as another is dropped', () => {
    expect(
      findGainedItems(['clover', 'sword'], ['sword', 'leather-armor']),
    ).toEqual(['leather-armor']);
  });

  it('finds nothing once there is no player', () => {
    expect(findGainedItems(['clover'], null)).toEqual([]);
  });
});

describe('findGainedSilver', () => {
  it('finds the silver coins gained', () => {
    expect(findGainedSilver(0, 2)).toBe(2);
    expect(findGainedSilver(3, 8)).toBe(5);
  });

  it('finds none as the count is first told on joining', () => {
    expect(findGainedSilver(null, 12)).toBe(0);
  });

  it('finds none as the count stays or goes down', () => {
    expect(findGainedSilver(4, 4)).toBe(0);
    expect(findGainedSilver(4, 1)).toBe(0);
  });

  it('finds none once there is no player', () => {
    expect(findGainedSilver(4, null)).toBe(0);
  });
});
