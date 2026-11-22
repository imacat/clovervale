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
 * @module client/day-clock Reckoning the time of day of the world, as the
 *   server keeps it.
 */

import { SIMULATION_RATE, findTimeOfDay } from '@clovervale/shared';
import type { DayCycle } from '@clovervale/shared';

import { ServerClock } from './interpolation.ts';

/**
 * The time of day the owner previews in the view of the page alone, which
 * is never sent to the server.
 */
export interface TimePreviewSettings {
  /**
   * Whether the page shows the time of day previewed, rather than that of
   * the world.
   */
  isEnabled: boolean;
  /** The time of day previewed, in hours on a 24-hour clock, from 0 to 24. */
  hour: number;
}

/** How long one step of the simulation lasts, in milliseconds. */
const STEP_MILLISECONDS: number = 1000 / SIMULATION_RATE;

/**
 * The time of day of the world, as a page works it out from how the
 * server says the day goes and from the steps of its snapshots.
 *
 * Between snapshots, and when none arrive, it runs on the clock of the
 * page.  Every snapshot keeps it in step with the clock of the server, so
 * that it does not drift however long the page stays open, and it is
 * right again at once when a page that has not been drawn for a while is
 * drawn again.
 */
export class DayClock {
  readonly #clock = new ServerClock();
  #cycle: DayCycle | null = null;

  /**
   * Starts telling the time of day of a server that has welcomed the
   * page, forgetting any other.
   *
   * @param {DayCycle} cycle - How the time of day goes on the server.
   */
  start(cycle: DayCycle): void {
    this.#cycle = cycle;
    this.#clock.reset();
  }

  /**
   * Takes note of the step of a snapshot of the server whose time of day
   * the page is telling, and of when it arrived.
   *
   * @param {number} step - The number of simulation steps the world had
   *   taken when the snapshot was taken.
   * @param {number} localTime - When it arrived, on the clock of the page,
   *   in milliseconds.
   */
  observe(step: number, localTime: number): void {
    this.#clock.observe(step * STEP_MILLISECONDS, localTime);
  }

  /**
   * Tells the time of day of the world.
   *
   * @param {number} localTime - The time on the clock of the page, in
   *   milliseconds, no earlier than that of the last reading.
   * @returns {number | null} The time of day, from 0 up to 1, or `null`
   *   before the server has told how its day goes, and, unless its clock
   *   is held, before its first snapshot.
   */
  read(localTime: number): number | null {
    const cycle: DayCycle | null = this.#cycle;
    if (cycle === null) {
      return null;
    }
    if (cycle.length === null) {
      return cycle.origin;
    }
    const serverTime: number | null = this.#clock.read(localTime);
    return serverTime === null ? null : findTimeOfDay(cycle, serverTime);
  }

  /** Forgets the time of day, as when the page leaves the server. */
  reset(): void {
    this.#cycle = null;
    this.#clock.reset();
  }
}

/**
 * Finds the time of day a page shows.
 *
 * @param {number | null} worldTime - The time of day of the world, from 0
 *   up to 1, or `null` before it is known.
 * @param {Readonly<TimePreviewSettings>} preview - The time of day the
 *   owner previews.
 * @returns {number | null} The time of day previewed, if the owner
 *   previews one, or else that of the world, from 0 up to 1.
 */
export function findShownTime(
  worldTime: number | null,
  preview: Readonly<TimePreviewSettings>,
): number | null {
  return preview.isEnabled ? (preview.hour / 24) % 1 : worldTime;
}

/** A time of day as written on a 24-hour clock, or a whole hour alone. */
const CLOCK_PATTERN = /^(\d{1,2})(?::([0-5]\d))?$/;

/**
 * Tells an hour as hours and minutes on a 24-hour clock, such as `13:55`.
 *
 * @param {number} hour - The hour, from 0 to 24.
 * @returns {string} The hour, to the nearest minute, from `00:00` to
 *   `24:00`.
 */
export function describeHour(hour: number): string {
  const minutes: number = Math.round(hour * 60);
  return [Math.floor(minutes / 60), minutes % 60]
    .map((part: number) => String(part).padStart(2, '0'))
    .join(':');
}

/**
 * Reads an hour written as hours and minutes on a 24-hour clock, such as
 * `13:55`, or as a whole hour alone, such as `13`.
 *
 * @param {string} text - What is written, with any spaces around it.
 * @returns {number | null} The hour, from 0 to 24, or `null` if what is
 *   written is not such a time or is later than `24:00`.
 */
export function parseHour(text: string): number | null {
  const match: RegExpExecArray | null = CLOCK_PATTERN.exec(text.trim());
  if (match === null) {
    return null;
  }
  const hour: number = Number(match[1]) + Number(match[2] ?? 0) / 60;
  return hour > 24 ? null : hour;
}
