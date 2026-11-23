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
 * @module scripts/test-browser/toby Checks how the pages show Toby.
 */

import { setTimeout as sleep } from 'node:timers/promises';

import {
  PLAZA_CENTRE,
  SAY_RANGE,
  STEP_MILLISECONDS,
  TOBY_ACTIVITIES,
  TOBY_GRAB_STEPS,
  TOBY_PATCHES,
  TOBY_STOW_STEPS,
  findTobyGrab,
} from '@clovervale/shared';
import type { GroundVector, TobyActivity, TobyGrab } from '@clovervale/shared';
import type { SpeechView } from '../../packages/client/src/speech-bubble.ts';
import type { TobyView } from '../../packages/client/src/toby-figure.ts';

import type { BidiSession } from './bidi.ts';
import { zoomCamera } from './camera.ts';
import {
  ACTION_TIMEOUT,
  BY_TOBY,
  NETWORK_DELAY,
  POLL_INTERVAL,
  SPEECH_TIMEOUT,
  TOBY_FIND_TIMEOUT,
  TOBY_SQUAT,
  ZOOM_DELTA,
  ZOOM_STEP_FACTOR,
} from './constants.ts';
import { evaluateInPage, setControl, waitFor } from './page.ts';
import {
  findHeading,
  readQuestLook,
  turnCameraTo,
  walkInVillage,
} from './village-walk.ts';

/** How a page shows Toby, and when it tells that. */
interface TobyLook {
  /** How the page shows Toby, or `null` while it does not show him. */
  readonly toby: TobyView | null;
  /**
   * The moment the page told it, in milliseconds since the Unix epoch, on
   * the clock of the browser, which all its pages share.
   */
  readonly moment: number;
}

/** How a page shows Toby as he picks, and what is around him. */
interface TobyFindLook {
  /** How the page shows Toby, or `null` while it does not show him. */
  readonly toby: TobyView | null;
  /** What the bubble shown says, and who says it, or `null` for none. */
  readonly speech: SpeechView | null;
  /** The numbers of the patches shown with their four-leaved clover. */
  readonly clovers: readonly number[];
}

/**
 * How far apart the steps two pages show Toby at for one and the same
 * moment may be, in steps: a quarter of a second's worth, for the time a
 * snapshot takes to reach each page.
 */
const SAME_TOBY_STEPS = 5;
/** What Toby exclaims as he finds a four-leaved clover, in English. */
const TOBY_FOUND_LINE = 'Found one!';
/**
 * How long Toby may take to be seen to move, in milliseconds: more than
 * he ever stays at one end of his run.
 */
const TOBY_MOVE_TIMEOUT = 15_000;
/**
 * The most the steps a page shows Toby at may run fast or slow, as a share
 * of the time that passes.
 */
const TOBY_PACE_TOLERANCE = 0.25;

/**
 * The least time over which the pace of the steps a page shows Toby at is
 * measured, in milliseconds: long enough that the time from the frame
 * that last showed him to each reading makes little odds.
 */
const TOBY_PACE_SPAN = 3000;

/** Reads how a page shows Toby as he picks, and what is around him. */
const TOBY_FIND_EXPRESSION = `(() => JSON.stringify({
  toby: window.clovervale.describeToby(),
  speech: window.clovervale.describeSpeech(),
  clovers: window.clovervale.describeItems().clovers,
}))()`;

/** Reads how a page shows Toby, and the moment it tells that, as JSON. */
const TOBY_EXPRESSION = `(() => JSON.stringify({
  toby: window.clovervale.describeToby(),
  moment: performance.timeOrigin + performance.now(),
}))()`;

/**
 * Reads how a page shows Toby.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<TobyLook>} How the page shows him.
 */
async function readTobyLook(
  session: BidiSession,
  context: string,
): Promise<TobyLook> {
  return JSON.parse(
    await evaluateInPage(session, context, TOBY_EXPRESSION),
  ) as TobyLook;
}

/**
 * Describes how a page shows Toby, for the error messages.
 *
 * @param {TobyLook} look - How the page shows him.
 * @returns {string} The description.
 */
function describeTobyLook(look: TobyLook): string {
  const { toby } = look;
  if (toby === null) {
    return 'does not show Toby';
  }
  return (
    `shows Toby at step ${toby.step.toFixed(2)}, at x ` +
    `${toby.x.toFixed(3)}, z ${toby.z.toFixed(3)}, facing ` +
    `${toby.yaw.toFixed(1)}, doing "${toby.activity}" with the clip ` +
    `"${toby.clip}"`
  );
}

/**
 * Checks that two pages show Toby alike, doing what he does with the clip
 * of that name, at steps that agree for the same moment, and that he moves
 * on at the pace of the server.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} first - The browsing context of one page.
 * @param {string} second - The browsing context of the other page.
 * @returns {Promise<void>} A promise settled once both pages have passed.
 * @throws {Error} If the pages do not show him so.
 */
export async function checkToby(
  session: BidiSession,
  first: string,
  second: string,
): Promise<void> {
  const pages: readonly (readonly [string, string])[] = [
    [first, 'first'],
    [second, 'second'],
  ];
  const isShownRightly = (look: TobyLook): boolean => {
    const { toby } = look;
    if (toby === null) {
      return false;
    }
    return (
      toby.clip === toby.activity ||
      (toby.clip === 'Find' && toby.activity === 'Pick')
    );
  };
  for (const [context, name] of pages) {
    await waitFor(
      () => readTobyLook(session, context),
      isShownRightly,
      ACTION_TIMEOUT,
      (look: TobyLook) => `The ${name} page ${describeTobyLook(look)}.`,
    );
  }
  const readBoth = async (): Promise<[TobyLook, TobyLook]> => [
    await readTobyLook(session, first),
    await readTobyLook(session, second),
  ];
  const [early, late] = await readBoth();
  const carried: number =
    (early.toby?.step ?? NaN) +
    (late.moment - early.moment) / STEP_MILLISECONDS;
  if (!(Math.abs(carried - (late.toby?.step ?? NaN)) <= SAME_TOBY_STEPS)) {
    throw new Error(
      `The first page ${describeTobyLook(early)}, and the second page, ` +
        `${(late.moment - early.moment).toFixed(1)} ms after, ` +
        `${describeTobyLook(late)}.`,
    );
  }
  for (const [context, name] of pages) {
    const before: TobyLook = await readTobyLook(session, context);
    const moved: TobyLook = await waitFor(
      () => readTobyLook(session, context),
      (look: TobyLook) =>
        isShownRightly(look) &&
        (look.toby?.x !== before.toby?.x || look.toby?.z !== before.toby?.z),
      TOBY_MOVE_TIMEOUT,
      (look: TobyLook) =>
        `Toby does not move in the ${name} page, which first ` +
        `${describeTobyLook(before)}, and then ${describeTobyLook(look)}.`,
    );
    const later: TobyLook = await waitFor(
      () => readTobyLook(session, context),
      (look: TobyLook) =>
        isShownRightly(look) && look.moment - before.moment >= TOBY_PACE_SPAN,
      TOBY_PACE_SPAN + TOBY_MOVE_TIMEOUT,
      (look: TobyLook) =>
        `In the ${name} page, Toby is not shown rightly ` +
        `${(look.moment - moved.moment).toFixed(1)} ms after he moves: ` +
        `the page ${describeTobyLook(look)}.`,
    );
    const elapsed: number = later.moment - before.moment;
    const stepped: number =
      (later.toby?.step ?? NaN) - (before.toby?.step ?? NaN);
    const expected: number = elapsed / STEP_MILLISECONDS;
    if (!(Math.abs(stepped - expected) <= expected * TOBY_PACE_TOLERANCE)) {
      throw new Error(
        `In the ${name} page, Toby goes on by ${stepped.toFixed(1)} steps ` +
          `in ${elapsed.toFixed(1)} ms, instead of ${expected.toFixed(1)}.`,
      );
    }
  }
  const seen = new Set<TobyActivity>();
  const deadline: number = Date.now() + TOBY_MOVE_TIMEOUT;
  while (seen.size < TOBY_ACTIVITIES.length && Date.now() < deadline) {
    const { toby } = await readTobyLook(session, first);
    if (toby !== null) {
      seen.add(toby.activity);
    }
    await sleep(POLL_INTERVAL);
  }
  if (seen.size < TOBY_ACTIVITIES.length) {
    throw new Error(
      `Over ${String(TOBY_MOVE_TIMEOUT / 1000)} seconds, the first page ` +
        `shows Toby only ${[...seen].join(', ')}.`,
    );
  }
}

/**
 * Reads how a page shows Toby as he picks, and what is around him.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<TobyFindLook>} How the page shows him.
 */
async function readTobyFindLook(
  session: BidiSession,
  context: string,
): Promise<TobyFindLook> {
  return JSON.parse(
    await evaluateInPage(session, context, TOBY_FIND_EXPRESSION),
  ) as TobyFindLook;
}

/**
 * Describes how a page shows Toby as he picks, for the error messages.
 *
 * @param {TobyFindLook} look - How the page shows him.
 * @returns {string} The description.
 */
function describeTobyFindLook(look: TobyFindLook): string {
  const holding: string =
    look.toby?.isHolding === true ? 'holding a clover' : 'empty-handed';
  const speech: string =
    look.speech === null
      ? 'no bubble'
      : `${look.speech.name} saying "${look.speech.line}"`;
  return (
    `${describeTobyLook({ toby: look.toby, moment: 0 })}, ${holding}, ` +
    `with ${speech}, and the patches ${look.clovers.join()} with their ` +
    'clovers'
  );
}

/**
 * Checks that a page behind a slow connection, and another page, show
 * Toby finding a four-leaved clover alike: holding it in his hand as he
 * picks, from his grab until he puts it away, and never otherwise, while
 * the patch is shown without its clover, wherever their players stand, and
 * that the page goes on showing so as the server tells it of the find,
 * without taking it back.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} first - The browsing context of the page behind the
 *   slow connection.
 * @param {string} second - The browsing context of the other page.
 * @returns {Promise<void>} A promise settled once both pages have passed.
 * @throws {Error} If the pages do not show him so.
 */
export async function checkTobyFind(
  session: BidiSession,
  first: string,
  second: string,
): Promise<void> {
  const hold: number = TOBY_STOW_STEPS - TOBY_GRAB_STEPS;
  const mode =
    `With its messages held back for ${String(NETWORK_DELAY)} ` +
    'milliseconds each way, the first page';
  await setControl(session, first, 'Net delay (ms)', NETWORK_DELAY);
  try {
    const found: TobyFindLook = await waitFor(
      () => readTobyFindLook(session, first),
      (look: TobyFindLook) => {
        return look.toby?.isHolding === true;
      },
      TOBY_FIND_TIMEOUT,
      (look: TobyFindLook) =>
        `${mode} never shows Toby holding a clover: it ` +
        `${describeTobyFindLook(look)}.`,
    );
    const grab: TobyGrab = findTobyGrab(found.toby?.step ?? NaN);
    const isFinding = (look: TobyFindLook): boolean =>
      look.toby !== null &&
      findTobyGrab(look.toby.step).step === grab.step &&
      look.toby.isHolding &&
      look.toby.clip === 'Find' &&
      !look.clovers.includes(grab.patch);
    for (const [context, name] of [
      [first, 'first'],
      [second, 'second'],
    ] as const) {
      await waitFor(
        () => readTobyFindLook(session, context),
        isFinding,
        ACTION_TIMEOUT,
        (look: TobyFindLook) =>
          `Toby grabs at patch ${String(grab.patch)} at step ` +
          `${String(grab.step)}, and the ${name} page ` +
          `${describeTobyFindLook(look)}.`,
      );
    }
    // By the time he puts it away, the first page has heard of the find.
    await waitFor(
      () => readTobyFindLook(session, first),
      (look: TobyFindLook) => {
        const step: number = look.toby?.step ?? NaN;
        if (step < grab.step + hold && !isFinding(look)) {
          throw new Error(
            `${mode} takes back the clover Toby grabs at step ` +
              `${String(grab.step)}: it ${describeTobyFindLook(look)}.`,
          );
        }
        return step >= grab.step + hold;
      },
      ACTION_TIMEOUT,
      (look: TobyFindLook) =>
        `${mode} never shows Toby putting the clover away: it ` +
        `${describeTobyFindLook(look)}.`,
    );
  } finally {
    await setControl(session, first, 'Net delay (ms)', 0);
  }
}

/**
 * Where a player stands to hear Toby from behind its camera: two metres
 * within the range of what is said from where he squats at the patch of
 * clover by the gate, towards the fountain, which is within that range of
 * where he squats at the other patch as well.
 */
const WITHIN_TOBY_HEARING: GroundVector = (() => {
  const apart: number = Math.hypot(
    PLAZA_CENTRE.x - TOBY_SQUAT.x,
    PLAZA_CENTRE.z - TOBY_SQUAT.z,
  );
  const share: number = (SAY_RANGE - 2) / apart;
  return {
    x: TOBY_SQUAT.x + (PLAZA_CENTRE.x - TOBY_SQUAT.x) * share,
    z: TOBY_SQUAT.z + (PLAZA_CENTRE.z - TOBY_SQUAT.z) * share,
  };
})();
/**
 * How far from its player the camera is zoomed in to, in metres, to leave
 * Toby behind it as it looks away from him.
 */
const TOBY_UNSEEN_CAMERA_DISTANCE = 3;

/**
 * Checks that a page shows what Toby exclaims as he finds a four-leaved
 * clover only while he is on its screen: that, with its player within
 * hearing of him and its camera looking away from him, the page shows him
 * holding the clover he finds without any bubble, and that, with its
 * player by the patch of clover by the gate, it shows his bubble saying he
 * found one as he holds the clover of that patch.  The camera ends as it
 * started, and the player by the patch by the gate.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player of the page.
 * @returns {Promise<void>} A promise settled once the page has passed.
 * @throws {Error} If the page does not show him so.
 */
export async function checkTobyExclamation(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  const hold: number = TOBY_STOW_STEPS - TOBY_GRAB_STEPS;
  const look = (): Promise<TobyFindLook> => readTobyFindLook(session, context);
  const readDistance = async (): Promise<number> =>
    Number(
      await evaluateInPage(
        session,
        context,
        'String(window.clovervale.describeCameraDistance())',
      ),
    );
  // Zooms the camera to a distance from what it looks at.
  const zoomTo = async (distance: number): Promise<void> => {
    const turns: number =
      Math.log(distance / (await readDistance())) /
      Math.log(ZOOM_STEP_FACTOR);
    if (Math.abs(turns) >= 0.1) {
      await zoomCamera(session, context, Math.round(-turns * ZOOM_DELTA));
    }
  };
  const isExclaiming = (seen: TobyFindLook): boolean =>
    seen.speech?.line === TOBY_FOUND_LINE;

  // Within hearing of him, the camera looks away from him.
  await walkInVillage(
    session,
    context,
    id,
    WITHIN_TOBY_HEARING,
    'to within hearing of Toby',
  );
  const { heading } = await readQuestLook(session, context, id);
  const distance: number = await readDistance();
  await turnCameraTo(
    session,
    context,
    id,
    findHeading(TOBY_SQUAT, WITHIN_TOBY_HEARING),
  );
  await zoomTo(TOBY_UNSEEN_CAMERA_DISTANCE);
  const away =
    `With its player ${String(SAY_RANGE - 2)} metres from Toby and its ` +
    'camera looking away from him, the first page';
  try {
    await waitFor(
      look,
      (seen: TobyFindLook) =>
        seen.speech === null && seen.toby?.isHolding === false,
      SPEECH_TIMEOUT,
      (seen: TobyFindLook) => `${away} ${describeTobyFindLook(seen)}.`,
    );
    const isHushed = (seen: TobyFindLook): boolean => {
      if (isExclaiming(seen)) {
        throw new Error(
          `${away} shows his bubble: it ${describeTobyFindLook(seen)}.`,
        );
      }
      return true;
    };
    const found: TobyFindLook = await waitFor(
      look,
      (seen: TobyFindLook) => isHushed(seen) && seen.toby?.isHolding === true,
      TOBY_FIND_TIMEOUT,
      (seen: TobyFindLook) =>
        `${away} never shows Toby holding a clover: it ` +
        `${describeTobyFindLook(seen)}.`,
    );
    const grab: TobyGrab = findTobyGrab(found.toby?.step ?? NaN);
    await waitFor(
      look,
      (seen: TobyFindLook) =>
        isHushed(seen) && (seen.toby?.step ?? NaN) >= grab.step + hold,
      ACTION_TIMEOUT,
      (seen: TobyFindLook) =>
        `${away} never shows Toby putting the clover away: it ` +
        `${describeTobyFindLook(seen)}.`,
    );
  } finally {
    await zoomTo(distance);
    await turnCameraTo(session, context, id, heading);
  }

  // By the patch by the gate, he is on the screen as he picks at it.
  await walkInVillage(session, context, id, BY_TOBY, 'to the gate');
  await waitFor(
    look,
    (seen: TobyFindLook) =>
      seen.toby?.isHolding === true &&
      findTobyGrab(seen.toby.step).patch === TOBY_PATCHES[1] &&
      isExclaiming(seen),
    TOBY_FIND_TIMEOUT,
    (seen: TobyFindLook) =>
      'With its player by the patch of clover by the gate, the first page ' +
      `never shows the bubble of Toby as he finds its clover: it ` +
      `${describeTobyFindLook(seen)}.`,
  );
  // The bubble is over before the checks that talk to him go on.
  await waitFor(
    look,
    (seen: TobyFindLook) => seen.speech === null,
    SPEECH_TIMEOUT,
    (seen: TobyFindLook) =>
      `With Toby's find a while ago, the first page ` +
      `${describeTobyFindLook(seen)}.`,
  );
}
