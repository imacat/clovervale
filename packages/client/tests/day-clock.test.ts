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
 * @module client/tests/day-clock Tests for reckoning the time of day of the
 *   world.
 */

import { describe, expect, it } from 'vitest';

import { SIMULATION_RATE, SNAPSHOT_RATE } from '@clovervale/shared';
import type { DayCycle } from '@clovervale/shared';

import {
  DayClock,
  describeHour,
  findShownTime,
  parseHour,
} from '../src/day-clock.ts';

/** How long one step of the simulation lasts, in milliseconds. */
const STEP: number = 1000 / SIMULATION_RATE;

/** The number of simulation steps from one snapshot to the next. */
const SNAPSHOT_STEPS: number = SIMULATION_RATE / SNAPSHOT_RATE;

/** A day lasting a minute, starting at six in the morning. */
const SHORT_DAY: DayCycle = { origin: 0.25, length: 60_000 };

/**
 * Tells when the snapshot of a time on the clock of the server reaches the
 * page, on the clock of the page, in milliseconds.
 */
type Arrive = (serverTime: number, index: number) => number;

/**
 * Feeds a clock the snapshots a server sends over a stretch of its time,
 * reading the clock after each.
 *
 * @param {DayClock} clock - The clock.
 * @param {Arrive} arrive - When each snapshot reaches the page.
 * @param {number} from - The time on the clock of the server to start
 *   sending from, in milliseconds.
 * @param {number} to - The time on the clock of the server to stop sending
 *   before, in milliseconds.
 * @param {boolean} [isRead] - Whether the clock is read after each
 *   snapshot, which it is by default.
 * @returns {number[]} The readings, in order.
 */
function feedSnapshots(
  clock: DayClock,
  arrive: Arrive,
  from: number,
  to: number,
  isRead = true,
): number[] {
  const readings: number[] = [];
  const first: number = Math.ceil(from / (SNAPSHOT_STEPS * STEP));
  for (let index = first; index * SNAPSHOT_STEPS * STEP < to; index++) {
    const step: number = index * SNAPSHOT_STEPS;
    const arrival: number = arrive(step * STEP, index);
    clock.observe(step, arrival);
    if (isRead) {
      readings.push(clock.read(arrival) ?? NaN);
    }
  }
  return readings;
}

/**
 * Measures how far apart two times of day are, the shorter way around.
 *
 * @param {number} a - One time of day.
 * @param {number} b - The other time of day.
 * @returns {number} How far apart they are, in days.
 */
function measureGap(a: number, b: number): number {
  const gap: number = Math.abs(a - b) % 1;
  return Math.min(gap, 1 - gap);
}

/**
 * Finds a delay that looks random but is always the same for a snapshot.
 *
 * @param {number} index - The number of the snapshot.
 * @returns {number} The delay, from 0 up to 30 milliseconds.
 */
function findDelay(index: number): number {
  return ((index * 7919) % 31) * 0.97;
}

describe('DayClock', () => {
  it('tells nothing before the server has told how the day goes', () => {
    const clock = new DayClock();
    expect(clock.read(1000)).toBeNull();
  });

  it('tells nothing of a running day before the first snapshot', () => {
    const clock = new DayClock();
    clock.start(SHORT_DAY);
    expect(clock.read(1000)).toBeNull();
  });

  it('tells a held time of day at once and forever', () => {
    const clock = new DayClock();
    clock.start({ origin: 0.5, length: null });
    expect(clock.read(1000)).toBe(0.5);
    clock.observe(900, 50_000);
    expect(clock.read(9_000_000)).toBe(0.5);
  });

  it('reckons the time of day onward from the latest snapshot', () => {
    const clock = new DayClock();
    clock.start(SHORT_DAY);
    clock.observe(6000 / STEP, 20_000);
    expect(clock.read(20_000)).toBeCloseTo(0.25 + 6000 / 60_000, 9);
    // With no snapshot since, the page goes on by its own clock.
    expect(clock.read(29_000)).toBeCloseTo(0.25 + 15_000 / 60_000, 9);
  });

  it('comes around past midnight', () => {
    const clock = new DayClock();
    clock.start({ origin: 0.95, length: 60_000 });
    clock.observe(0, 0);
    expect(clock.read(6000)).toBeCloseTo(0.05, 9);
    expect(clock.read(65_000)).toBeCloseTo(0.0333, 3);
  });

  it('shows a page that joins later the time of day of the others', () => {
    const day: DayCycle = { origin: 0.4, length: 1_200_000 };
    const early = new DayClock();
    const late = new DayClock();
    // The clock of the late page started 95 seconds after the other.
    const earlyLink: Arrive = (time, i) => time + 25 + findDelay(i);
    const lateLink: Arrive = (time, i) => time + 40 + findDelay(i + 3) - 95_000;
    early.start(day);
    late.start(day);
    feedSnapshots(early, earlyLink, 0, 100_000);
    feedSnapshots(late, lateLink, 97_000, 100_000);
    const earlyTime: number | null = early.read(100_050);
    const lateTime: number | null = late.read(100_050 - 95_000);
    expect(earlyTime).toBeCloseTo(0.4 + 100_000 / 1_200_000, 4);
    // They differ by no more than their snapshots take to arrive, here
    // under a twentieth of a second.
    const gap: number = measureGap(earlyTime ?? NaN, lateTime ?? NaN);
    expect(gap * 1_200_000).toBeLessThan(50);
  });

  it('stays with the server over a long session on a fast clock', () => {
    const day: DayCycle = { origin: 0.1, length: 1_200_000 };
    const clock = new DayClock();
    clock.start(day);
    // The clock of the page runs half a percent fast.
    const link: Arrive = (time, i) => (time + 20 + findDelay(i)) * 1.005;
    const hours = 2;
    const readings: number[] = feedSnapshots(clock, link, 0, hours * 3.6e6);
    const last: number = readings.at(-1) ?? NaN;
    const truth: number = (0.1 + (hours * 3.6e6) / 1_200_000) % 1;
    expect(measureGap(last, truth)).toBeLessThan(1e-4);
    // It never turns back either, which would move the sun backward.
    readings.slice(1).forEach((reading: number, index: number) => {
      const step: number = reading - (readings[index] ?? 0);
      expect(step < 0 ? step + 1 : step).toBeLessThan(0.01);
    });
  });

  it('is right again at once when a hidden page is shown', () => {
    const clock = new DayClock();
    clock.start(SHORT_DAY);
    // The clock of the page runs a fifth of a percent fast.
    const link: Arrive = (time, i) => time * 1.002 + findDelay(i);
    feedSnapshots(clock, link, 0, 10_000);
    // While hidden, the page draws nothing and so does not read its clock.
    feedSnapshots(clock, link, 10_000, 610_000, false);
    const shown: number = link(610_000, 0);
    expect(
      measureGap(clock.read(shown) ?? NaN, (0.25 + 610_000 / 60_000) % 1),
    ).toBeLessThan(1e-3);
  });

  it('forgets the day of a server it has left for another', () => {
    const clock = new DayClock();
    clock.start(SHORT_DAY);
    clock.observe(90_000 / STEP, 100_000);
    clock.reset();
    expect(clock.read(100_000)).toBeNull();
    // A server that has started again counts its steps from 0.
    clock.start({ origin: 0.5, length: 60_000 });
    clock.observe(600 / STEP, 101_000);
    expect(clock.read(101_000)).toBeCloseTo(0.51, 9);
  });
});

describe('findShownTime', () => {
  it('shows the time of day of the world unless previewing', () => {
    expect(findShownTime(0.3, { isEnabled: false, hour: 18 })).toBe(0.3);
    expect(findShownTime(null, { isEnabled: false, hour: 18 })).toBeNull();
  });

  it('shows the hour previewed instead, however the world goes', () => {
    expect(findShownTime(0.3, { isEnabled: true, hour: 18 })).toBe(0.75);
    expect(findShownTime(null, { isEnabled: true, hour: 6 })).toBe(0.25);
    expect(findShownTime(0.3, { isEnabled: true, hour: 24 })).toBe(0);
  });
});

describe('describeHour', () => {
  it('tells an hour as hours and minutes on a 24-hour clock', () => {
    expect(describeHour(0)).toBe('00:00');
    expect(describeHour(6.5)).toBe('06:30');
    expect(describeHour(13 + 55 / 60)).toBe('13:55');
    expect(describeHour(24)).toBe('24:00');
  });

  it('tells an hour a slider steps to on its minute', () => {
    // Steps of three minutes do not add up to exact hours.
    expect(describeHour(0.05 * 279)).toBe('13:57');
    expect(describeHour(0.05 * 1)).toBe('00:03');
  });
});

describe('parseHour', () => {
  it('reads hours and minutes on a 24-hour clock', () => {
    expect(parseHour('13:55')).toBeCloseTo(13 + 55 / 60, 9);
    expect(parseHour('00:00')).toBe(0);
    expect(parseHour('6:05')).toBeCloseTo(6 + 5 / 60, 9);
    expect(parseHour(' 24:00 ')).toBe(24);
  });

  it('reads a whole hour alone', () => {
    expect(parseHour('7')).toBe(7);
    expect(parseHour('18')).toBe(18);
    expect(parseHour('24')).toBe(24);
  });

  it('reads back the hour it tells', () => {
    for (let step = 0; step <= 480; step += 1) {
      const hour: number = step * 0.05;
      expect(parseHour(describeHour(hour))).toBeCloseTo(hour, 9);
    }
  });

  it('reads nothing of what is not such a time', () => {
    for (const text of ['', '13:', ':30', '13:5', '13:60', '1:2:3', 'noon']) {
      expect(parseHour(text)).toBeNull();
    }
    expect(parseHour('13.5')).toBeNull();
  });

  it('reads nothing beyond the clock', () => {
    for (const text of ['24:01', '24:59', '25', '25:30', '99']) {
      expect(parseHour(text)).toBeNull();
    }
  });
});
