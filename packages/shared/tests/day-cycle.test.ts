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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/19
// AI assistance: Claude Code (Anthropic)

/**
 * @module shared/tests/day-cycle Tests for the cycle of day and night.
 */

import { describe, expect, it } from 'vitest';

import {
  DAY_PHASES,
  DEFAULT_DAY_LENGTH,
  NOON,
  findDayPhase,
  findPhaseTime,
  findTimeOfDay,
} from '../src/index.ts';
import type { DayPeriod, DayPhase } from '../src/index.ts';

/** The number of moments of the day to sample. */
const SAMPLES = 2400;

/**
 * Lists the parts of a day in the order they come, from midnight on, with
 * how much of the day each lasts; the night comes both first and last,
 * since the day starts and ends in it.
 *
 * @returns {[DayPhase, number][]} The parts, and their shares of the day.
 */
function listPhases(): [DayPhase, number][] {
  const phases: [DayPhase, number][] = [];
  for (let sample = 0; sample < SAMPLES; sample++) {
    const { phase }: DayPeriod = findDayPhase(sample / SAMPLES);
    const last: [DayPhase, number] | undefined = phases.at(-1);
    if (last?.[0] === phase) {
      last[1] += 1 / SAMPLES;
    } else {
      phases.push([phase, 1 / SAMPLES]);
    }
  }
  return phases;
}

describe('findTimeOfDay', () => {
  it('starts at the time of day the cycle starts at', () => {
    expect(findTimeOfDay({ origin: 0.25, length: 60_000 }, 0)).toBe(0.25);
  });

  it('moves on by the share of a day that has passed', () => {
    const cycle = { origin: 0.25, length: 60_000 };
    expect(findTimeOfDay(cycle, 15_000)).toBeCloseTo(0.5, 12);
    expect(findTimeOfDay(cycle, 30_000)).toBeCloseTo(0.75, 12);
  });

  it('comes round past midnight to the next day', () => {
    const cycle = { origin: 0.9, length: 60_000 };
    expect(findTimeOfDay(cycle, 12_000)).toBeCloseTo(0.1, 12);
    expect(findTimeOfDay(cycle, 6_000 + 60_000 * 1000)).toBeCloseTo(0, 9);
    for (let time = 0; time < 300_000; time += 1234) {
      const timeOfDay: number = findTimeOfDay(cycle, time);
      expect(timeOfDay).toBeGreaterThanOrEqual(0);
      expect(timeOfDay).toBeLessThan(1);
    }
  });

  it('stands still on a held clock', () => {
    const cycle = { origin: NOON, length: null };
    expect(findTimeOfDay(cycle, 0)).toBe(NOON);
    expect(findTimeOfDay(cycle, DEFAULT_DAY_LENGTH * 3.7)).toBe(NOON);
  });

  it('lasts twenty minutes on the server by default', () => {
    const cycle = { origin: 0, length: DEFAULT_DAY_LENGTH };
    expect(findTimeOfDay(cycle, 10 * 60_000)).toBeCloseTo(0.5, 12);
  });
});

describe('findDayPhase', () => {
  it('has night at midnight and day at noon', () => {
    expect(findDayPhase(0).phase).toBe('night');
    expect(findDayPhase(NOON).phase).toBe('day');
  });

  it('brings dawn, day, dusk and night in turn, each once a day', () => {
    const phases: DayPhase[] = listPhases().map(([phase]) => phase);
    // Midnight falls in the night, which the day starts and ends in.
    expect(phases).toEqual(['night', ...DAY_PHASES]);
  });

  it('makes the day and the night equally long', () => {
    const shares = new Map<DayPhase, number>();
    for (const [phase, share] of listPhases()) {
      shares.set(phase, (shares.get(phase) ?? 0) + share);
    }
    expect(shares.get('dawn')).toBeCloseTo(0.1, 3);
    expect(shares.get('day')).toBeCloseTo(0.4, 3);
    expect(shares.get('dusk')).toBeCloseTo(0.1, 3);
    expect(shares.get('night')).toBeCloseTo(0.4, 3);
  });

  it('centres the day on noon and the night on midnight', () => {
    for (const offset of [0.05, 0.13, 0.27]) {
      expect(findDayPhase(NOON - offset).progress).toBeCloseTo(
        1 - findDayPhase(NOON + offset).progress,
        9,
      );
    }
    expect(findDayPhase(NOON).progress).toBeCloseTo(0.5, 9);
    expect(findDayPhase(0).progress).toBeCloseTo(0.5, 9);
  });

  it('tells steadily how far into each part the time is', () => {
    let previous: DayPeriod = findDayPhase(0);
    for (let sample = 1; sample <= SAMPLES; sample++) {
      const period: DayPeriod = findDayPhase((sample / SAMPLES) % 1);
      expect(period.progress).toBeGreaterThanOrEqual(0);
      expect(period.progress).toBeLessThan(1);
      if (period.phase === previous.phase) {
        expect(period.progress).toBeGreaterThan(previous.progress);
      } else {
        // A part starts where the one before it ends.
        expect(period.progress).toBeLessThan(0.05);
        expect(previous.progress).toBeGreaterThan(0.95);
      }
      previous = period;
    }
  });
});

describe('findPhaseTime', () => {
  it('finds the time of day of a point in a part of the day', () => {
    for (const phase of DAY_PHASES) {
      for (const progress of [0, 0.3, 0.5, 0.99]) {
        const period: DayPeriod = findDayPhase(findPhaseTime(phase, progress));
        expect(period.phase).toBe(phase);
        expect(period.progress).toBeCloseTo(progress, 9);
      }
    }
  });

  it('gives times of day from midnight up to the next', () => {
    expect(findPhaseTime('night', 0.5)).toBeCloseTo(0, 9);
    expect(findPhaseTime('day', 0.5)).toBeCloseTo(NOON, 9);
    for (const phase of DAY_PHASES) {
      expect(findPhaseTime(phase, 0)).toBeGreaterThanOrEqual(0);
      expect(findPhaseTime(phase, 0.999)).toBeLessThan(1);
    }
  });
});
