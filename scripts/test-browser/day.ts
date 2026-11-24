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
 * @module scripts/test-browser/day Checks the time of day, and the night.
 */

import { setTimeout as sleep } from 'node:timers/promises';

import type { BidiSession } from './bidi.ts';
import {
  ACTION_TIMEOUT,
  HELD_TIME,
  NIGHT_CLOCK,
  POLL_INTERVAL,
  PREVIEW_CONTROL,
  PREVIEW_HOUR_CONTROL,
  RUNNING_DAY_MINUTES,
} from './constants.ts';
import {
  captureGround,
  evaluateInPage,
  loadClient,
  readPageState,
  setControl,
  waitFor,
} from './page.ts';
import type { PageState } from './page.ts';
import { measureBrightness } from './png.ts';

/** The time of day a page tells. */
interface TimeOfDayView {
  /**
   * The time of day of the world, from 0 up to 1, or `null` before the
   * page knows it.
   */
  readonly world: number | null;
  /** The time of day the page shows, from 0 up to 1. */
  readonly shown: number;
  /**
   * The moment the page told the time of day, in milliseconds since the
   * Unix epoch, on the clock of the browser, which all its pages share.
   */
  readonly moment: number;
}

/**
 * What the panel of a page tells of the time of day the game server holds
 * its clock at.
 */
const HELD_TIME_OF_DAY = '12:00, day';
/** That time of day, from 0 up to 1. */
const HELD_DAY_SHARE = 0.5;
/** The hour previewed to see the village at night: midnight. */
const NIGHT_HOUR = 0;
/**
 * The most the foot of the view may be lit at midnight, as a share of how
 * it is lit at noon: clearly darker.
 */
const NIGHT_MOST_SHARE = 0.7;
/**
 * The least the foot of the view may be lit at midnight, as a share of how
 * it is lit at noon: far from black.
 */
const NIGHT_LEAST_SHARE = 0.3;
/**
 * The least brightness the foot of the view may have at midnight, from 0
 * to 255.
 */
const NIGHT_LEAST_BRIGHTNESS = 40;
/**
 * The most the brightness of the foot of the view of a page may change, as
 * a share, while another page previews a different time of day.
 */
const UNCHANGED_SHARE = 0.05;
/** The length of the day of the game server whose clock runs, in ms. */
const RUNNING_DAY_DURATION = RUNNING_DAY_MINUTES * 60_000;
/**
 * How far apart the times of day two pages tell for one and the same moment
 * may be, in days: half a second's worth on that server.
 */
const SAME_TIME_OF_DAY = 500 / RUNNING_DAY_DURATION;
/** The least time the time of day of a page is watched moving on, in ms. */
const DAY_WATCH_DURATION = 3000;
/**
 * The most the time of day of a page may run fast or slow, as a share of
 * the time that passes.
 */
const DAY_PACE_TOLERANCE = 0.25;

/**
 * Reads the time of day a page tells, and the moment it tells it, as JSON.
 */
const TIME_OF_DAY_EXPRESSION = `(() => {
  const time = window.clovervale.describeTimeOfDay();
  return JSON.stringify({
    ...time,
    moment: performance.timeOrigin + performance.now(),
  });
})()`;

/**
 * Reads the time of day a page tells.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<TimeOfDayView>} The time of day.
 */
async function readTimeOfDay(
  session: BidiSession,
  context: string,
): Promise<TimeOfDayView> {
  return JSON.parse(
    await evaluateInPage(session, context, TIME_OF_DAY_EXPRESSION),
  ) as TimeOfDayView;
}

/**
 * Measures how brightly the foot of the view of a page is lit once it shows
 * a time of day.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} shown - The time of day, from 0 up to 1.
 * @param {string} name - The name of the page, for the error messages.
 * @returns {Promise<number>} The mean brightness, from 0 to 255.
 * @throws {Error} If the page does not show the time of day in time.
 */
async function measureShownTime(
  session: BidiSession,
  context: string,
  shown: number,
  name: string,
): Promise<number> {
  await waitFor(
    () => readTimeOfDay(session, context),
    (seen: TimeOfDayView) => seen.shown === shown,
    ACTION_TIMEOUT,
    (seen: TimeOfDayView) =>
      `${name} shows the time of day ${String(seen.shown)} instead of ` +
      `${String(shown)}.`,
  );
  // The time of day is shown from the next frame drawn.
  await sleep(2 * POLL_INTERVAL);
  const state: PageState = await readPageState(session, context);
  return measureBrightness(await captureGround(session, context, state));
}

/**
 * Checks that two pages on a server whose clock is held at noon both tell
 * the time of day the server holds; that when its panel previews
 * midnight, one page shows the village clearly darker, yet far from black,
 * while still telling the time of day the server holds; and that the
 * other page goes on showing noon meanwhile.  The preview is then switched
 * off again.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} viewer - The browsing context of the page that previews.
 * @param {string} other - The browsing context of the other page.
 * @returns {Promise<void>} A promise settled once the pages have passed.
 * @throws {Error} If either page does not show the time of day as it
 *   should.
 */
export async function checkNight(
  session: BidiSession,
  viewer: string,
  other: string,
): Promise<void> {
  const heldPages = [
    [viewer, 'The first page'],
    [other, 'The second page'],
  ] as const;
  await Promise.all(
    heldPages.map(async ([context, name]): Promise<void> => {
      const [state, time]: [PageState, TimeOfDayView] = await Promise.all([
        readPageState(session, context),
        readTimeOfDay(session, context),
      ]);
      const told: string = state.panel['Time of day'] ?? '';
      if (told !== HELD_TIME_OF_DAY || time.world !== HELD_DAY_SHARE) {
        throw new Error(
          `On a server held at ${HELD_TIME}, ${name.toLowerCase()} tells ` +
            `the time of day as "${told}" in its panel, and as ` +
            `${String(time.world)} of a day.`,
        );
      }
    }),
  );
  const noon: number = await measureShownTime(
    session,
    viewer,
    HELD_DAY_SHARE,
    'The first page',
  );
  const otherNoon: number = await measureShownTime(
    session,
    other,
    HELD_DAY_SHARE,
    'The second page',
  );
  await setControl(session, viewer, PREVIEW_HOUR_CONTROL, NIGHT_CLOCK);
  await setControl(session, viewer, PREVIEW_CONTROL, true);
  try {
    const night: number = await measureShownTime(
      session,
      viewer,
      NIGHT_HOUR / 24,
      'Previewing midnight, the first page',
    );
    if (
      night > noon * NIGHT_MOST_SHARE ||
      night < noon * NIGHT_LEAST_SHARE ||
      night < NIGHT_LEAST_BRIGHTNESS
    ) {
      throw new Error(
        'Previewing midnight, the first page lights the foot of its view ' +
          `at a brightness of ${night.toFixed(1)}, against ` +
          `${noon.toFixed(1)} at noon.`,
      );
    }
    const previewTold: string = (await readPageState(session, viewer)).panel[
      'Time of day'
    ] ?? '';
    const previewTime: TimeOfDayView = await readTimeOfDay(session, viewer);
    if (
      previewTold !== HELD_TIME_OF_DAY ||
      previewTime.world !== HELD_DAY_SHARE
    ) {
      throw new Error(
        'Previewing midnight, the first page tells the time of day as ' +
          `"${previewTold}" in its panel, and as ` +
          `${String(previewTime.world)} of a day.`,
      );
    }
    const otherNight: number = await measureShownTime(
      session,
      other,
      HELD_DAY_SHARE,
      'With the first page previewing midnight, the second page',
    );
    const otherTime: TimeOfDayView = await readTimeOfDay(session, other);
    if (
      Math.abs(otherNight - otherNoon) > otherNoon * UNCHANGED_SHARE ||
      otherTime.world !== HELD_DAY_SHARE
    ) {
      throw new Error(
        'With the first page previewing midnight, the second page lights ' +
          `the foot of its view at a brightness of ` +
          `${otherNight.toFixed(1)}, against ${otherNoon.toFixed(1)} ` +
          `before, and tells the time of day as ` +
          `${String(otherTime.world)} of a day.`,
      );
    }
  } finally {
    await setControl(session, viewer, PREVIEW_CONTROL, false);
  }
  await measureShownTime(
    session,
    viewer,
    HELD_DAY_SHARE,
    'With the preview switched off, the first page',
  );
}

/**
 * Checks that two pages on a server whose day goes on, one joining after
 * the other, tell the same time of day for one and the same moment, and
 * that it goes on at the pace of the day of the server in both, against
 * the time that passes on the clock of the browser.  The pages are left on
 * that server.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} first - The browsing context of the page that joins
 *   first.
 * @param {string} second - The browsing context of the page that joins
 *   later.
 * @param {string} url - The address of the client, on that server.
 * @returns {Promise<void>} A promise settled once the pages have passed.
 * @throws {Error} If the pages do not tell the time of day as they should.
 */
export async function checkDayAgreement(
  session: BidiSession,
  first: string,
  second: string,
  url: string,
): Promise<void> {
  await loadClient(session, first, url, 'The first page on a running day');
  await loadClient(session, second, url, 'The second page on a running day');
  // A page knows the time of day of the world only from its first snapshot,
  // which may come some time after it is welcomed.
  const runningPages = [
    [first, 'first'],
    [second, 'second'],
  ] as const;
  await Promise.all(
    runningPages.map(([context, name]) =>
      waitFor(
        () => readTimeOfDay(session, context),
        (seen: TimeOfDayView) => seen.world !== null,
        ACTION_TIMEOUT,
        () =>
          `On a running day, the ${name} page does not tell the time of ` +
          'day of the world.',
      ),
    ),
  );
  const readBoth = async (): Promise<[TimeOfDayView, TimeOfDayView]> => [
    await readTimeOfDay(session, first),
    await readTimeOfDay(session, second),
  ];
  const measureGap = (a: number, b: number): number => {
    const gap: number = Math.abs(a - b) % 1;
    return Math.min(gap, 1 - gap);
  };
  const before: [TimeOfDayView, TimeOfDayView] = await readBoth();
  await sleep(DAY_WATCH_DURATION);
  const after: [TimeOfDayView, TimeOfDayView] = await readBoth();
  for (const [early, late] of [before, after]) {
    // The time of day of the first page, carried forward at the pace of the
    // server to the moment the second page was read.
    const between: number = late.moment - early.moment;
    const carried: number =
      (early.world ?? Number.NaN) + between / RUNNING_DAY_DURATION;
    // False when either time is missing, as a comparison with NaN is.
    const isSameTime: boolean =
      measureGap(carried, late.world ?? Number.NaN) <= SAME_TIME_OF_DAY;
    if (!isSameTime) {
      throw new Error(
        `On a running day, the first page tells the time of day as ` +
          `${String(early.world)} of a day, and the second page, which ` +
          `joined later, as ${String(late.world)}, ` +
          `${between.toFixed(1)} ms after.`,
      );
    }
  }
  for (const index of [0, 1] as const) {
    const change: number =
      (after[index].world ?? Number.NaN) - (before[index].world ?? Number.NaN);
    const passed: number = ((change % 1) + 1) % 1;
    const elapsed: number = after[index].moment - before[index].moment;
    const expected: number = elapsed / RUNNING_DAY_DURATION;
    // False when either time is missing, as a comparison with NaN is.
    const isOnPace: boolean =
      Math.abs(passed - expected) <= expected * DAY_PACE_TOLERANCE;
    if (!isOnPace) {
      throw new Error(
        `On a running day, the time of day of the ` +
          `${index === 0 ? 'first' : 'second'} page goes on by ` +
          `${passed.toExponential(3)} of a day in ` +
          `${elapsed.toFixed(1)} ms, instead of ` +
          `${expected.toExponential(3)}.`,
      );
    }
  }
}
