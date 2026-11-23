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
 * @module scripts/test-browser/help Checks the help sheet and the keys of the
 *   browser.
 */

import { setTimeout as sleep } from 'node:timers/promises';

import type { FigureView } from '../../packages/client/src/player-figures.ts';

import type { BidiSession } from './bidi.ts';
import {
  ACTION_TIMEOUT,
  DIALOGUE_HOLD_DURATION,
  EN_NAME,
  HELP_KEYS,
  HELP_PAGE_COUNT,
  HELP_WORDS,
  KEYBOARD_CONTROL_COUNT,
  LANGUAGE_CONTROL,
  LEFT_ARROW,
  STANDING_DRIFT,
  VIEW_SETTLE_DURATION,
  YAW_TOLERANCE,
  ZH_TW_HELP_WORDS,
  ZH_TW_LANGUAGE_CONTROL,
  ZH_TW_NAME,
} from './constants.ts';
import { chooseLanguage } from './language.ts';
import {
  evaluateInPage,
  saveView,
  sendKey,
  tapKey,
  waitFor,
} from './page.ts';

/** How a page shows its help sheet. */
export interface HelpLook {
  /** Whether the sheet is open. */
  readonly isOpen: boolean;
  /** The title of the sheet. */
  readonly title: string;
  /** The words on the button at the foot of the sheet. */
  readonly ok: string;
  /** What each control the page of the sheet shown lists does. */
  readonly labels: readonly string[];
  /** The page of the sheet shown, from 0, or -1 if no page is marked. */
  readonly page: number;
  /** The name of the page shown. */
  readonly subtitle: string;
  /** The key shown on the button of the sheet, or `null` if none is. */
  readonly buttonKey: string | null;
  /** Whether the bag is open. */
  readonly isBagOpen: boolean;
  /** The number of pages the sheet shows a dot for. */
  readonly dotCount: number;
  /** The lines of the credits on the page shown, if they are shown. */
  readonly creditsLines: readonly string[];
  /** The way the camera looks, in degrees, as the yaw of a player. */
  readonly heading: number;
  /** The players the page shows. */
  readonly figures: readonly FigureView[];
}

/** The codes of keys of the browser the game does not use. */
const BROWSER_KEYS: readonly string[] = ['F5', 'F11', 'F12', 'Tab'];
/** The expression that tells how a page shows its help sheet, as JSON. */
export const HELP_EXPRESSION = `(() => {
  const sheet = document.querySelector('.help-sheet');
  const button = document.querySelector('.help-button');
  const bag = document.querySelector('.bag-window');
  return JSON.stringify({
    isOpen: sheet !== null && !sheet.hidden,
    title: document.querySelector('.help-title')?.textContent ?? '',
    ok: document.querySelector('.help-ok')?.textContent ?? '',
    labels: [
      ...document.querySelectorAll('.help-controls:not([hidden]) .help-label'),
    ].map((label) => label.textContent),
    page: [...document.querySelectorAll('.help-dot')].findIndex((dot) =>
      dot.classList.contains('is-current'),
    ),
    subtitle: document.querySelector('.help-subtitle')?.textContent ?? '',
    buttonKey: button?.querySelector('.help-key')?.textContent ?? null,
    isBagOpen: bag !== null && !bag.hidden,
    dotCount: [...document.querySelectorAll('.help-dot')]
      .filter((dot) => !dot.hidden).length,
    creditsLines: [
      ...document.querySelectorAll(
        '.help-credits-page:not([hidden]) :is(.credits-name, ' +
          '.credits-version, .credits-heading, .credits-line)',
      ),
    ].map((line) => line.textContent),
    heading: window.clovervale.describeHeading(),
    figures: window.clovervale.describeFigures(),
  });
})()`;

/**
 * Reads how a page shows its help sheet.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<HelpLook>} How the page shows it.
 */
export async function readHelpLook(
  session: BidiSession,
  context: string,
): Promise<HelpLook> {
  return JSON.parse(
    await evaluateInPage(session, context, HELP_EXPRESSION),
  ) as HelpLook;
}

/**
 * Describes how a page shows its help sheet, for an error message.
 *
 * @param {HelpLook} look - How the page shows it.
 * @returns {string} The description.
 */
export function describeHelpLook(look: HelpLook): string {
  return (
    `the help sheet ${look.isOpen ? 'open' : 'closed'}, titled ` +
    `"${look.title}" at page ${String(look.page)} "${look.subtitle}" ` +
    `with "${look.ok}" at its foot and ` +
    `${String(look.labels.length)} controls, its button keyed ` +
    `"${String(look.buttonKey)}", ${String(look.dotCount)} pages, the ` +
    `credits ${JSON.stringify(look.creditsLines)}, and the bag ` +
    (look.isBagOpen ? 'open' : 'closed')
  );
}

/**
 * Checks that a page leaves the keys of the browser the game does not use
 * to the browser, so that they do what the browser does with them.  The
 * keys are only told to the page, and never reach the browser itself.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {string} what - What is open on the page, for an error message.
 * @returns {Promise<void>} A promise settled once the page has passed.
 * @throws {Error} If the page keeps a key of the browser from it.
 */
export async function checkBrowserKeys(
  session: BidiSession,
  context: string,
  what: string,
): Promise<void> {
  const kept: string[] = JSON.parse(
    await evaluateInPage(
      session,
      context,
      `JSON.stringify(${JSON.stringify(BROWSER_KEYS)}.filter((code) => {
        const event = new KeyboardEvent('keydown', {
          code,
          key: code,
          bubbles: true,
          cancelable: true,
        });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }))`,
    ),
  ) as string[];
  if (kept.length > 0) {
    throw new Error(
      `While ${what} is open, the page keeps ${kept.join(', ')} from the ` +
        'browser.',
    );
  }
}

/**
 * Checks the help sheet: that the first page opens it by itself on the
 * first visit of the browser, in English, and the second page, on a later
 * visit, does not; that while it is open, a walking key held down does not
 * walk the player, an arrow key does not turn the camera, I does not open
 * the bag, and the keys of the browser are left to it; that it follows the
 * language chosen in the panel; that Esc, Enter, the H key, its cross and
 * the button at its foot close it, and the H key and its button open it;
 * that before the ending it has no page of the credits to turn to; and
 * that the H key opens it over the open bag, which closes, while the bag,
 * open, holds the player too, and leaves the keys of the browser to it as
 * well.  The sheet is left closed.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the first page.
 * @param {string} other - The browsing context of the second page.
 * @param {number} id - The identifier of the player of the first page.
 * @returns {Promise<void>} A promise settled once the pages have passed.
 * @throws {Error} If a page does not show its help sheet so.
 */
export async function checkHelp(
  session: BidiSession,
  context: string,
  other: string,
  id: number,
): Promise<void> {
  const look = (): Promise<HelpLook> => readHelpLook(session, context);
  const press = (key: string): Promise<void> =>
    tapKey(session, context, key);
  const click = async (selector: string): Promise<void> => {
    await evaluateInPage(
      session,
      context,
      `(() => {
        document.querySelector(${JSON.stringify(selector)})?.click();
        return '';
      })()`,
    );
  };
  const expectOpen = async (
    isOpen: boolean,
    what: string,
  ): Promise<HelpLook> =>
    waitFor(
      look,
      (seen: HelpLook) => seen.isOpen === isOpen,
      ACTION_TIMEOUT,
      (seen: HelpLook) =>
        `With ${what}, the first page tells ${describeHelpLook(seen)}.`,
    );

  const first: HelpLook = await look();
  if (
    !first.isOpen ||
    first.title !== HELP_WORDS.title ||
    first.ok !== HELP_WORDS.ok ||
    first.labels.length !== KEYBOARD_CONTROL_COUNT ||
    first.page !== 0 ||
    first.subtitle !== HELP_WORDS.keyboard ||
    first.buttonKey !== 'H' ||
    first.dotCount !== HELP_PAGE_COUNT
  ) {
    throw new Error(
      `On the first visit, the first page tells ${describeHelpLook(first)}.`,
    );
  }
  const later: HelpLook = await readHelpLook(session, other);
  if (later.isOpen || later.buttonKey !== 'H') {
    throw new Error(
      `On a later visit, the second page tells ${describeHelpLook(later)}.`,
    );
  }

  // Held while the sheet or the bag is open.
  const checkHeld = async (what: string): Promise<void> => {
    const before: HelpLook = await look();
    for (const key of ['d', LEFT_ARROW]) {
      await sendKey(session, context, 'keyDown', key);
    }
    await sleep(DIALOGUE_HOLD_DURATION);
    for (const key of ['d', LEFT_ARROW]) {
      await sendKey(session, context, 'keyUp', key);
    }
    const after: HelpLook = await look();
    const was: FigureView | undefined = before.figures.find(
      (figure: FigureView) => figure.id === id,
    );
    const is: FigureView | undefined = after.figures.find(
      (figure: FigureView) => figure.id === id,
    );
    if (
      was === undefined ||
      is === undefined ||
      Math.hypot(is.x - was.x, is.z - was.z) > STANDING_DRIFT ||
      Math.abs(after.heading - before.heading) > YAW_TOLERANCE
    ) {
      throw new Error(
        `With D and the left arrow held down while ${what} is open, the ` +
          `first page moves its player from ${JSON.stringify(was)} to ` +
          `${JSON.stringify(is)} and turns its camera from ` +
          `${before.heading.toFixed(1)} to ${after.heading.toFixed(1)} ` +
          'degrees.',
      );
    }
  };
  await checkHeld('the help sheet');
  await checkBrowserKeys(session, context, 'the help sheet');
  await press('i');
  await sleep(VIEW_SETTLE_DURATION);
  const unbagged: HelpLook = await look();
  if (!unbagged.isOpen || unbagged.isBagOpen) {
    throw new Error(
      `With I pressed while the help sheet is open, the first page tells ` +
        `${describeHelpLook(unbagged)}.`,
    );
  }
  await saveView(session, context, 'help-en.png');
  // Before the ending, there is no page of the credits to turn to.
  for (let turn = 0; turn < HELP_PAGE_COUNT; turn++) {
    await press(HELP_KEYS.right);
  }
  await sleep(VIEW_SETTLE_DURATION);
  const lastPage: HelpLook = await look();
  if (
    lastPage.page !== HELP_PAGE_COUNT - 1 ||
    lastPage.dotCount !== HELP_PAGE_COUNT ||
    lastPage.creditsLines.length > 0
  ) {
    throw new Error(
      'With the right arrow pressed past the last page before the ending, ' +
        `the first page tells ${describeHelpLook(lastPage)}.`,
    );
  }
  for (let turn = 1; turn < HELP_PAGE_COUNT; turn++) {
    await press(HELP_KEYS.left);
  }
  await waitFor(
    look,
    (seen: HelpLook) => seen.page === 0,
    ACTION_TIMEOUT,
    (seen: HelpLook) =>
      `With the left arrow pressed back to the first page, the first page ` +
      `tells ${describeHelpLook(seen)}.`,
  );

  await chooseLanguage(session, context, LANGUAGE_CONTROL, ZH_TW_NAME);
  await waitFor(
    look,
    (seen: HelpLook) =>
      seen.isOpen &&
      seen.title === ZH_TW_HELP_WORDS.title &&
      seen.ok === ZH_TW_HELP_WORDS.ok,
    ACTION_TIMEOUT,
    (seen: HelpLook) =>
      `With "${ZH_TW_NAME}" chosen while the help sheet is open, the ` +
        `first page tells ${describeHelpLook(seen)}.`,
  );
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'help-zh-tw.png');
  await chooseLanguage(session, context, ZH_TW_LANGUAGE_CONTROL, EN_NAME);
  await waitFor(
    look,
    (seen: HelpLook) => seen.title === HELP_WORDS.title,
    ACTION_TIMEOUT,
    (seen: HelpLook) =>
      `With "${EN_NAME}" chosen again, the first page tells ` +
      `${describeHelpLook(seen)}.`,
  );

  await press(HELP_KEYS.escape);
  await expectOpen(false, 'Esc pressed on the help sheet');
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'help-button.png');
  await press(HELP_KEYS.help);
  await expectOpen(true, 'H pressed');
  await press(HELP_KEYS.enter);
  await expectOpen(false, 'Enter pressed on the help sheet');
  await click('.help-button');
  await expectOpen(true, 'its button clicked');
  await click('.help-close');
  await expectOpen(false, 'the cross of the help sheet clicked');
  await press(HELP_KEYS.help);
  await expectOpen(true, 'H pressed again');
  await press(HELP_KEYS.help);
  await expectOpen(false, 'H pressed on the help sheet');
  await click('.help-button');
  await expectOpen(true, 'its button clicked again');
  await click('.help-ok');
  await expectOpen(false, 'the button at the foot of the help sheet clicked');

  await press('i');
  await waitFor(
    look,
    (seen: HelpLook) => seen.isBagOpen && !seen.isOpen,
    ACTION_TIMEOUT,
    (seen: HelpLook) =>
      `With I pressed, the first page tells ${describeHelpLook(seen)}.`,
  );
  await checkHeld('the bag');
  await checkBrowserKeys(session, context, 'the bag');
  await press(HELP_KEYS.help);
  await waitFor(
    look,
    (seen: HelpLook) => seen.isOpen && !seen.isBagOpen,
    ACTION_TIMEOUT,
    (seen: HelpLook) =>
      `With H pressed while the bag is open, the first page tells ` +
      `${describeHelpLook(seen)}.`,
  );
  await press(HELP_KEYS.escape);
  await expectOpen(false, 'Esc pressed on the help sheet over the bag');
}
