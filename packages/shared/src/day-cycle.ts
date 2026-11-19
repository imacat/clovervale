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
 * @module shared/day-cycle The cycle of day and night that the server keeps
 *   for the whole world.
 *
 * A time of day is a share of a whole day since midnight, from 0 up to 1,
 * so that 0.5 is noon.
 */

/** The parts of a day, in the order they come, from dawn to night. */
export const DAY_PHASES = ['dawn', 'day', 'dusk', 'night'] as const;

/** A part of a day: dawn, full daylight, dusk or night. */
export type DayPhase = (typeof DAY_PHASES)[number];

/** Where a time of day falls among the parts of the day. */
export interface DayPeriod {
  /** The part of the day it falls in. */
  readonly phase: DayPhase;
  /** How far into that part it falls, from 0 at its start up to 1. */
  readonly progress: number;
}

/**
 * How the time of day goes on the server, which it tells every peer when
 * it welcomes it.
 */
export interface DayCycle {
  /**
   * The time of day at step 0 of the simulation, when the clock of the
   * server reads 0, from 0 up to 1.
   */
  readonly origin: number;
  /**
   * How long a whole day lasts on the clock of the server, in
   * milliseconds, or `null` if the clock of the world is held at its
   * origin.
   */
  readonly length: number | null;
}

/**
 * How much of a whole day each part of it lasts.  The night is split in
 * two by midnight, and since the dawn and the dusk are equally long, the
 * day between them is split in two by noon.  This is the only place the
 * split is set.
 */
const DAY_SPLIT: Readonly<Record<DayPhase, number>> = {
  dawn: 0.1,
  day: 0.4,
  dusk: 0.1,
  night: 0.4,
};

/** The time of day at noon. */
export const NOON = 0.5;

/** How long a whole day lasts unless told otherwise: twenty minutes. */
export const DEFAULT_DAY_LENGTH: number = 20 * 60 * 1000;

/**
 * The time of day a server starts at unless told otherwise: eight in the
 * morning, so that a newly started server opens in full daylight, with
 * most of the day ahead.
 */
export const DEFAULT_DAY_ORIGIN: number = 8 / 24;

/**
 * Wraps a time that may have run past midnight back into a single day.
 *
 * @param {number} time - The time, in days since a midnight.
 * @returns {number} The time of day, from 0 up to 1.
 */
function wrapTimeOfDay(time: number): number {
  const wrapped: number = time - Math.floor(time);
  // A time just short of midnight can round up to the next day.
  return wrapped < 1 ? wrapped : 0;
}

/**
 * Finds the time of day on the clock of the world at a time on the clock
 * of the server.
 *
 * @param {DayCycle} cycle - How the time of day goes on the server.
 * @param {number} serverTime - The time on the clock of the server, in
 *   milliseconds.
 * @returns {number} The time of day, from 0 up to 1, which is the origin
 *   of the cycle at all times if its clock is held.
 */
export function findTimeOfDay(cycle: DayCycle, serverTime: number): number {
  if (cycle.length === null) {
    return cycle.origin;
  }
  return wrapTimeOfDay(cycle.origin + serverTime / cycle.length);
}

/**
 * Finds when a part of the day starts, counted from the start of the
 * night that comes before midnight, so that every part starts less than a
 * day later.
 *
 * @param {DayPhase} phase - The part of the day.
 * @returns {number} When it starts, in days from the start of that night.
 */
function findPhaseOffset(phase: DayPhase): number {
  let offset = 0;
  for (const earlier of ['night', ...DAY_PHASES] as const) {
    if (earlier === phase) {
      return offset;
    }
    offset += DAY_SPLIT[earlier];
  }
  return offset;
}

/**
 * Finds where a time of day falls among the parts of the day.
 *
 * @param {number} time - The time of day, from 0 up to 1.
 * @returns {DayPeriod} The part of the day it falls in, and how far into
 *   that part.
 */
export function findDayPhase(time: number): DayPeriod {
  // Each part starts at the very time findPhaseTime() gives for its start,
  // and the night, split in two by midnight, starts last in the day.
  for (const phase of ['night', 'dusk', 'day', 'dawn'] as const) {
    const start: number = findPhaseTime(phase, 0);
    if (time >= start) {
      return { phase, progress: (time - start) / DAY_SPLIT[phase] };
    }
  }
  // Before the dawn, the night that started the day before goes on.
  return {
    phase: 'night',
    progress: (time + 1 - findPhaseTime('night', 0)) / DAY_SPLIT.night,
  };
}

/**
 * Finds the time of day at a point in a part of the day.
 *
 * @param {DayPhase} phase - The part of the day.
 * @param {number} progress - How far into that part, from 0 at its start
 *   to 1 at its end.
 * @returns {number} The time of day, from 0 up to 1.
 */
export function findPhaseTime(phase: DayPhase, progress: number): number {
  const sinceNight: number =
    findPhaseOffset(phase) + progress * DAY_SPLIT[phase];
  return wrapTimeOfDay(sinceNight - DAY_SPLIT.night / 2);
}
