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
 * @module scripts/test-browser/gamepad Checks playing with a gamepad.
 */

import { setTimeout as sleep } from 'node:timers/promises';

import type { FigureView } from '../../packages/client/src/player-figures.ts';

import type { BidiSession } from './bidi.ts';
import {
  ACTION_TIMEOUT,
  CREDITS_PAGE,
  ENDING_WORDS,
  EN_NAME,
  HELP_KEYS,
  HELP_PAGE_COUNT,
  HELP_WORDS,
  KEYBOARD_CONTROL_COUNT,
  LANGUAGE_CONTROL,
  POLL_INTERVAL,
  STANDING_DRIFT,
  VIEW_SETTLE_DURATION,
  ZH_TW_HELP_WORDS,
  ZH_TW_LANGUAGE_CONTROL,
  ZH_TW_NAME,
} from './constants.ts';
import { describeHelpLook, readHelpLook } from './help.ts';
import type { HelpLook } from './help.ts';
import { chooseLanguage } from './language.ts';
import { evaluateInPage, saveView, tapKey, waitFor } from './page.ts';

/** How many controls the help sheet lists on the page of the gamepad. */
const HELP_CONTROL_COUNT = 8;
/** The places of the buttons of a gamepad of the standard mapping. */
const PAD_BUTTONS = {
  a: 0,
  b: 1,
  y: 3,
  lb: 4,
  rb: 5,
  start: 9,
} as const;
/** How long a button of the fake gamepad is held down, in milliseconds. */
const PAD_PRESS_DURATION = 200;
/** How far the left stick of the fake gamepad is to walk the player. */
const PAD_WALK_DISTANCE = 0.5;
/**
 * The ways the left stick of the fake gamepad is pushed in turn to walk the
 * player, as the place of an axis and its value: forward, backward, to
 * the left and to the right.
 */
const PAD_WALK_PUSHES: readonly (readonly [number, number])[] = [
  [1, -1],
  [1, 1],
  [0, -1],
  [0, 1],
];
/** How long the left stick is pushed each way at most, in milliseconds. */
const PAD_WALK_TIMEOUT = 3000;
/** How far the right stick of the fake gamepad is to turn the view. */
const PAD_ORBIT = 15;
/**
 * The expression that has a page see a fake gamepad of the standard
 * mapping, held as `window.fakePad` tells, instead of those of the browser,
 * and tells the page it is connected.
 */
const FAKE_PAD_EXPRESSION = `(() => {
  window.fakePad = {
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => false),
  };
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () =>
      window.fakePad.connected
        ? [
            {
              index: 0,
              id: 'Fake pad',
              connected: true,
              mapping: 'standard',
              timestamp: performance.now(),
              axes: [...window.fakePad.axes],
              buttons: window.fakePad.buttons.map((pressed) => ({
                pressed,
                touched: pressed,
                value: pressed ? 1 : 0,
              })),
            },
          ]
        : [],
  });
  window.dispatchEvent(new Event('gamepadconnected'));
  return '';
})()`;

/**
 * Checks the gamepad and the pages of the help sheet, with a fake gamepad
 * of the standard mapping in place of those of the browser: that the H key
 * opens the sheet at the page of the keyboard, which the right and left
 * arrows and the arrows on the sheet turn; that Start opens it at the page
 * of the gamepad, worded in English and in Traditional Chinese, LB and RB
 * turn its pages and B closes it, as A does; that RB turns on to the page
 * of the credits, the ending having been shown; that Y opens and
 * B closes the bag, in
 * which the left stick pushed sideways moves the cursor one slot; that the
 * left stick walks the player and the right stick turns the view; and
 * that the player, walking whichever way is open, stops once the pad is
 * gone.  The sheet and the bag are
 * left closed, and the pad gone.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player of the page.
 * @returns {Promise<void>} A promise settled once the page has passed.
 * @throws {Error} If the page does not do so.
 */
export async function checkGamepad(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  const look = (): Promise<HelpLook> => readHelpLook(session, context);
  const run = async (script: string): Promise<void> => {
    await evaluateInPage(
      session,
      context,
      `(() => { ${script}; return ''; })()`,
    );
  };
  const press = (key: string): Promise<void> =>
    tapKey(session, context, key);
  const pressPad = async (button: number): Promise<void> => {
    await run(`window.fakePad.buttons[${String(button)}] = true`);
    await sleep(PAD_PRESS_DURATION);
    await run(`window.fakePad.buttons[${String(button)}] = false`);
    await sleep(PAD_PRESS_DURATION);
  };
  const expectLook = async (
    isAwaited: (seen: HelpLook) => boolean,
    what: string,
  ): Promise<HelpLook> =>
    waitFor(
      look,
      isAwaited,
      ACTION_TIMEOUT,
      (seen: HelpLook) =>
        `With ${what}, the page tells ${describeHelpLook(seen)}.`,
    );
  const expectPage = (page: number, what: string): Promise<HelpLook> =>
    expectLook(
      (seen: HelpLook) =>
        seen.isOpen &&
        seen.page === page &&
        seen.labels.length ===
          (page === 0 ? KEYBOARD_CONTROL_COUNT : HELP_CONTROL_COUNT),
      what,
    );

  await press(HELP_KEYS.help);
  await expectPage(0, 'H pressed');
  await press(HELP_KEYS.right);
  await expectPage(1, 'the right arrow pressed on the help sheet');
  await press(HELP_KEYS.left);
  await expectPage(0, 'the left arrow pressed on the help sheet');
  await run(`document.querySelector('.help-next')?.click()`);
  await expectPage(1, 'the arrow to the next page clicked');
  await run(`document.querySelector('.help-previous')?.click()`);
  await expectPage(0, 'the arrow to the page before clicked');
  await press(HELP_KEYS.escape);
  await expectLook((seen: HelpLook) => !seen.isOpen, 'Esc pressed');

  await evaluateInPage(session, context, FAKE_PAD_EXPRESSION);
  await pressPad(PAD_BUTTONS.start);
  await expectLook(
    (seen: HelpLook) =>
      seen.isOpen &&
      seen.page === 1 &&
      seen.subtitle === HELP_WORDS.gamepad &&
      seen.labels.length === HELP_CONTROL_COUNT,
    'Start pressed on the gamepad',
  );
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'help-gamepad-en.png');
  await chooseLanguage(session, context, LANGUAGE_CONTROL, ZH_TW_NAME);
  await expectLook(
    (seen: HelpLook) =>
      seen.isOpen &&
      seen.page === 1 &&
      seen.title === ZH_TW_HELP_WORDS.title &&
      seen.subtitle === ZH_TW_HELP_WORDS.gamepad,
    `"${ZH_TW_NAME}" chosen on the page of the gamepad`,
  );
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'help-gamepad-zh-tw.png');
  await chooseLanguage(session, context, ZH_TW_LANGUAGE_CONTROL, EN_NAME);
  await expectLook(
    (seen: HelpLook) => seen.title === HELP_WORDS.title,
    `"${EN_NAME}" chosen again`,
  );
  await pressPad(PAD_BUTTONS.lb);
  await expectPage(0, 'LB pressed on the help sheet');
  await pressPad(PAD_BUTTONS.rb);
  await expectPage(1, 'RB pressed on the help sheet');
  await pressPad(PAD_BUTTONS.b);
  await expectLook((seen: HelpLook) => !seen.isOpen, 'B pressed on the help');
  await pressPad(PAD_BUTTONS.start);
  await expectLook((seen: HelpLook) => seen.isOpen, 'Start pressed again');
  await pressPad(PAD_BUTTONS.a);
  await expectLook((seen: HelpLook) => !seen.isOpen, 'A pressed on the help');
  // The ending has been shown, so RB turns on to the page of the credits.
  await pressPad(PAD_BUTTONS.start);
  await expectPage(1, 'Start pressed after the ending');
  await pressPad(PAD_BUTTONS.rb);
  await pressPad(PAD_BUTTONS.rb);
  await expectLook(
    (seen: HelpLook) =>
      seen.isOpen &&
      seen.page === CREDITS_PAGE &&
      seen.dotCount === HELP_PAGE_COUNT + 1 &&
      JSON.stringify(seen.creditsLines) ===
        JSON.stringify(ENDING_WORDS.lines),
    'RB pressed twice from the page of the gamepad',
  );
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'help-credits-gamepad.png');
  await pressPad(PAD_BUTTONS.b);
  await expectLook(
    (seen: HelpLook) => !seen.isOpen,
    'B pressed on the credits',
  );
  await pressPad(PAD_BUTTONS.y);
  await expectLook(
    (seen: HelpLook) => seen.isBagOpen && !seen.isOpen,
    'Y pressed on the gamepad',
  );
  const readCursor = async (): Promise<number> =>
    Number(
      await evaluateInPage(
        session,
        context,
        `String([...document.querySelectorAll('.bag-slot')].findIndex(
          (slot) => slot.classList.contains('is-cursor'),
        ))`,
      ),
    );
  const columns: number = Math.round(
    Math.sqrt(
      Number(
        await evaluateInPage(
          session,
          context,
          `String(document.querySelectorAll('.bag-slot').length)`,
        ),
      ),
    ),
  );
  const cursor: number = await readCursor();
  // The stick is pushed toward a slot beside the cursor in its row.
  const step: number = cursor % columns === columns - 1 ? -1 : 1;
  await run(`window.fakePad.axes[0] = ${String(step)}`);
  await sleep(PAD_PRESS_DURATION);
  await run('window.fakePad.axes[0] = 0');
  await sleep(PAD_PRESS_DURATION);
  const moved: number = await readCursor();
  if (moved !== cursor + step) {
    throw new Error(
      'With the left stick of the gamepad pushed sideways in the bag, the ' +
        `page moves its cursor from slot ${String(cursor)} to ` +
        `${String(moved)}.`,
    );
  }
  await pressPad(PAD_BUTTONS.b);
  await expectLook((seen: HelpLook) => !seen.isBagOpen, 'B pressed on the bag');

  const findOwn = (seen: HelpLook): FigureView | undefined =>
    seen.figures.find((figure: FigureView) => figure.id === id);
  const before: HelpLook = await look();
  const start: FigureView | undefined = findOwn(before);
  // The heading turned from the start, above -180 and up to 180 degrees.
  const findTurn = (heading: number): number => {
    const turn: number = (((heading - before.heading) % 360) + 360) % 360;
    return turn > 180 ? turn - 360 : turn;
  };
  await run('window.fakePad.axes[2] = -1');
  try {
    await expectLook(
      (seen: HelpLook) => Math.abs(findTurn(seen.heading)) >= PAD_ORBIT,
      'the right stick of the gamepad pushed left',
    );
  } finally {
    await run('window.fakePad.axes[2] = 0');
  }
  // Whatever stands around the player may block a way, so the stick is
  // pushed each way in turn till the player walks.
  const hasWalked = (seen: HelpLook): boolean => {
    const is: FigureView | undefined = findOwn(seen);
    return (
      start !== undefined &&
      is !== undefined &&
      Math.hypot(is.x - start.x, is.z - start.z) >= PAD_WALK_DISTANCE
    );
  };
  let walked: HelpLook = await look();
  try {
    for (const [axis, value] of PAD_WALK_PUSHES) {
      await run(`window.fakePad.axes[${String(axis)}] = ${String(value)}`);
      const deadline: number = Date.now() + PAD_WALK_TIMEOUT;
      walked = await look();
      while (!hasWalked(walked) && Date.now() < deadline) {
        await sleep(POLL_INTERVAL);
        walked = await look();
      }
      if (hasWalked(walked)) {
        break;
      }
      await run(`window.fakePad.axes[${String(axis)}] = 0`);
    }
  } finally {
    await run('window.fakePad.connected = false');
  }
  if (!hasWalked(walked)) {
    throw new Error(
      'With the left stick of the gamepad pushed each way, the page moves ' +
        `its player from ${JSON.stringify(start)} to ` +
        `${JSON.stringify(findOwn(walked))}.`,
    );
  }
  await sleep(VIEW_SETTLE_DURATION);
  const stopped: FigureView | undefined = findOwn(await look());
  await sleep(VIEW_SETTLE_DURATION);
  const after: FigureView | undefined = findOwn(await look());
  if (
    stopped === undefined ||
    after === undefined ||
    Math.hypot(after.x - stopped.x, after.z - stopped.z) > STANDING_DRIFT
  ) {
    throw new Error(
      'With the gamepad gone while its left stick is pushed, the page ' +
        `moves its player from ${JSON.stringify(stopped)} to ` +
        `${JSON.stringify(after)}.`,
    );
  }
}
