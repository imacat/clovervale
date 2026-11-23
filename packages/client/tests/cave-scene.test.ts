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
 * @module client/tests/cave-scene Tests for the light of the cave.
 */

import { describe, expect, it } from 'vitest';

import { NOON, findPhaseTime } from '@clovervale/shared';

import { findMouthLight } from '../src/cave-scene.ts';
import type { MouthLight } from '../src/cave-scene.ts';

/** Midnight, as a time of day. */
const MIDNIGHT = 0;

/**
 * Finds the brightest channel of the color of the mouth of the burrow.
 *
 * @param {MouthLight} light - The light at the mouth.
 * @returns {number} The brightest channel, from 0.
 */
function findBrightest(light: MouthLight): number {
  const { r, g, b } = light.color;
  return Math.max(r, g, b);
}

describe('findMouthLight', () => {
  it('shows white daylight at noon, at full strength', () => {
    const light: MouthLight = findMouthLight(NOON);
    const { r, g, b } = light.color;
    expect(Math.min(r, g, b)).toBeGreaterThan(0.8 * findBrightest(light));
    expect(light.strength).toBe(1);
  });

  it('shows warmer, dimmer light at dusk and at dawn', () => {
    const noon: MouthLight = findMouthLight(NOON);
    for (const phase of ['dusk', 'dawn'] as const) {
      const light: MouthLight = findMouthLight(findPhaseTime(phase, 0.5));
      expect(light.color.r).toBeGreaterThan(light.color.b * 1.2);
      expect(findBrightest(light)).toBeLessThan(findBrightest(noon));
      expect(light.strength).toBeLessThan(noon.strength);
    }
  });

  it('shows dim blue moonlight at night, dimmer than at dusk', () => {
    const night: MouthLight = findMouthLight(MIDNIGHT);
    const dusk: MouthLight = findMouthLight(findPhaseTime('dusk', 0.5));
    expect(night.color.b).toBeGreaterThan(night.color.r);
    expect(findBrightest(night)).toBeGreaterThan(0);
    expect(findBrightest(night)).toBeLessThan(findBrightest(dusk));
    expect(night.strength).toBeLessThan(dusk.strength);
  });
});
