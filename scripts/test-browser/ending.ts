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
 * @module scripts/test-browser/ending Checks the ending sheet and the credits.
 */

import { setTimeout as sleep } from 'node:timers/promises';

import {
  ROLL_DURATION,
  ROLL_PAUSE,
  ROLL_SPEED,
} from '../../packages/client/src/ending-sheet.ts';
import type { FigureView } from '../../packages/client/src/player-figures.ts';

import type { BidiSession } from './bidi.ts';
import {
  ACTION_TIMEOUT,
  CREDITS_PAGE,
  DIALOGUE_HOLD_DURATION,
  ENDING_WORDS,
  EN_NAME,
  GAME_VERSION,
  HELP_KEYS,
  HELP_PAGE_COUNT,
  LANDSCAPE_VIEWPORT,
  LANGUAGE_CONTROL,
  LEFT_ARROW,
  PHONE_PIXEL_RATIO,
  POLL_INTERVAL,
  PORTRAIT_VIEWPORT,
  STANDING_DRIFT,
  TOUCH_TAP_DURATION,
  VIEW_SETTLE_DURATION,
  YAW_TOLERANCE,
  ZH_TW_LANGUAGE_CONTROL,
  ZH_TW_NAME,
  ZOOM_DELTA,
} from './constants.ts';
import { checkBrowserKeys, describeHelpLook, readHelpLook } from './help.ts';
import type { HelpLook } from './help.ts';
import { chooseLanguage } from './language.ts';
import {
  evaluateInPage,
  saveView,
  sendKey,
  tapKey,
  waitFor,
} from './page.ts';

/** How a page shows its ending sheet. */
interface EndingLook {
  /** Whether the sheet is open. */
  readonly isOpen: boolean;
  /** What it shows: `ending`, `credits`, or nothing while it is closed. */
  readonly content: string;
  /**
   * How it moves: `unrolling`, `shown`, `rolling`, or nothing while it is
   * closed.
   */
  readonly motion: string;
  /**
   * The tops and the bottoms of its top roller, of its parchment and of its
   * bottom roller, in pixels, or `null` while it is closed.
   */
  readonly edges: {
    readonly top: readonly [number, number];
    readonly paper: readonly [number, number];
    readonly bottom: readonly [number, number];
  } | null;
  /** The end of the story. */
  readonly text: string;
  /** The words under the end of the story. */
  readonly end: string;
  /** The title of the credits. */
  readonly title: string;
  /** The lines of the credits, headings included, in order. */
  readonly lines: readonly string[];
  /** All the words of the sheet. */
  readonly words: string;
  /** How far the credits are scrolled, in pixels. */
  readonly scrollTop: number;
  /** How much taller the credits are than the sheet shows, in pixels. */
  readonly overflow: number;
  /** Whether the help sheet is open. */
  readonly isHelpOpen: boolean;
  /** Whether the bag is open. */
  readonly isBagOpen: boolean;
  /** The way the camera looks, in degrees, as the yaw of a player. */
  readonly heading: number;
  /** The players the page shows. */
  readonly figures: readonly FigureView[];
}

/** The page of touch of the help sheet, from 0. */
const TOUCH_PAGE = 2;
/** The expression that tells how a page shows its ending sheet, as JSON. */
const ENDING_EXPRESSION = `(() => {
  const sheet = document.querySelector('.ending-scroll');
  const roll = document.querySelector('.ending-roll');
  const help = document.querySelector('.help-sheet');
  const bag = document.querySelector('.bag-window');
  const read = (selector) =>
    document.querySelector(selector)?.textContent ?? '';
  return JSON.stringify({
    isOpen: sheet !== null && !sheet.hidden,
    content: sheet?.dataset.content ?? '',
    motion: sheet?.dataset.motion ?? '',
    edges: sheet === null || sheet.hidden
      ? null
      : Object.fromEntries(
          [
            ['top', '.ending-roller.is-top'],
            ['paper', '.ending-paper'],
            ['bottom', '.ending-roller.is-bottom'],
          ].map(([name, selector]) => {
            const box = document.querySelector(selector)
              .getBoundingClientRect();
            return [name, [box.top, box.bottom]];
          }),
        ),
    text: read('.ending-text'),
    end: read('.ending-end'),
    title: read('.ending-scroll .credits-title'),
    lines: [
      ...document.querySelectorAll(
        '.ending-scroll :is(.credits-name, .credits-version, ' +
          '.credits-heading, .credits-line)',
      ),
    ].map((line) => line.textContent),
    words: sheet?.textContent ?? '',
    scrollTop: roll?.scrollTop ?? 0,
    overflow: roll === null ? 0 : roll.scrollHeight - roll.clientHeight,
    isHelpOpen: help !== null && !help.hidden,
    isBagOpen: bag !== null && !bag.hidden,
    heading: window.clovervale.describeHeading(),
    figures: window.clovervale.describeFigures(),
  });
})()`;
/** The words of the ending sheet in Traditional Chinese. */
const ZH_TW_ENDING_WORDS = {
  text: '你帶著證物和情報，前往王國首都。',
  end: '（完）',
  title: '製作名單',
  lines: [
    '四葉谷',
    `版本 ${GAME_VERSION}`,
    '作者',
    '依瑪貓',
    'AI 輔助',
    'Claude Code (Anthropic)',
    'Gemini (Google)',
    '音樂',
    '〈Embers on the Flagstone〉',
    'Kaazoom 作品，取自 Pixabay',
    'Pixabay Content License',
    '函式庫',
    'three.js — MIT License',
    'lil-gui — MIT License',
    '授權',
    '本遊戲專案以 Apache License 2.0 授權；音樂和函式庫依各自的授權。',
  ],
} as const;
/** The size of the view of a desktop the ending sheet is checked at. */
const DESKTOP_VIEWPORT = { width: 1280, height: 800 } as const;
/**
 * How long the credits that do not fit are watched to roll, after they
 * have stood still for a moment, in milliseconds.
 */
const ROLL_WATCH_DURATION = 3000;
/**
 * The least the credits roll up while they are watched, in pixels, at a
 * comfortable pace for reading.
 */
const LEAST_ROLL = 30;

/**
 * Reads how a page shows its ending sheet.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<EndingLook>} How the page shows it.
 */
async function readEndingLook(
  session: BidiSession,
  context: string,
): Promise<EndingLook> {
  return JSON.parse(
    await evaluateInPage(session, context, ENDING_EXPRESSION),
  ) as EndingLook;
}

/**
 * Describes how a page shows its ending sheet, for an error message.
 *
 * @param {EndingLook} look - How the page shows it.
 * @returns {string} The description.
 */
function describeEndingLook(look: EndingLook): string {
  const { figures, heading, ...rest } = look;
  return (
    `the ending sheet ${JSON.stringify({ ...rest, words: undefined })}, ` +
    'the camera at ' +
    `${heading.toFixed(1)} degrees and the players ${JSON.stringify(figures)}`
  );
}

/**
 * Tells whether a page shows its ending sheet unrolled, at the end of the
 * story or at the credits, with the words of a language.
 *
 * @param {EndingLook} look - How the page shows it.
 * @param {typeof ENDING_WORDS | typeof ZH_TW_ENDING_WORDS} words - The
 *   words of the language.
 * @param {string} content - What it is to show: `ending` or `credits`.
 * @returns {boolean} Whether it does.
 */
function isEndingWorded(
  look: EndingLook,
  words: typeof ENDING_WORDS | typeof ZH_TW_ENDING_WORDS,
  content: 'ending' | 'credits',
): boolean {
  const isWorded: boolean =
    content === 'ending'
      ? look.text === words.text && look.end === words.end
      : look.title === words.title &&
        JSON.stringify(look.lines) === JSON.stringify(words.lines);
  return (
    look.isOpen &&
    look.content === content &&
    look.motion === 'shown' &&
    isWorded &&
    !look.isHelpOpen &&
    !look.isBagOpen
  );
}

/**
 * Sets the size of the view of a page, and waits for it to settle.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {Readonly<{ width: number; height: number }> | null} viewport - The
 *   size, or `null` for that of its window.
 * @param {number | null} pixelRatio - The pixels to a CSS pixel, or `null`
 *   for those of the screen.
 * @returns {Promise<void>} A promise settled once the view has settled.
 */
async function setViewSize(
  session: BidiSession,
  context: string,
  viewport: Readonly<{ width: number; height: number }> | null,
  pixelRatio: number | null,
): Promise<void> {
  await session.send('browsingContext.setViewport', {
    context,
    viewport,
    devicePixelRatio: pixelRatio,
  });
  await sleep(VIEW_SETTLE_DURATION);
}

/**
 * Drags the mouse up across the middle of the view of a page, as far as a
 * share of its height.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {Readonly<{ width: number; height: number }>} viewport - The size
 *   of the view.
 * @returns {Promise<void>} A promise settled once the mouse is let go of.
 */
async function dragUp(
  session: BidiSession,
  context: string,
  viewport: Readonly<{ width: number; height: number }>,
): Promise<void> {
  const x: number = Math.round(viewport.width / 2);
  const y: number = Math.round(viewport.height / 2);
  await session.send('input.performActions', {
    context,
    actions: [
      {
        type: 'pointer',
        id: 'mouse',
        parameters: { pointerType: 'mouse' },
        actions: [
          { type: 'pointerMove', x, y: y + 40 },
          { type: 'pointerDown', button: 0 },
          { type: 'pointerMove', x, y: y - 40, duration: 300 },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ],
  });
  await session.send('input.releaseActions', { context });
}

/**
 * Watches the scroll of the ending sheet of a page as it moves, until it
 * stands unrolled or closes, and checks at every look that the parchment
 * moves as one with the rollers: its top under the top roller and its
 * bottom under the bottom roller, without a gap or parchment beyond them.
 * A few of the views are saved if the environment names a directory for
 * them, each named after the motion and the look.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {string} prefix - What the names of the views saved start with.
 * @returns {Promise<readonly string[]>} The motions seen, one for each
 *   look.
 * @throws {Error} If the parchment and the rollers part.
 */
async function watchScroll(
  session: BidiSession,
  context: string,
  prefix: string,
): Promise<readonly string[]> {
  const seen: string[] = [];
  const deadline: number = Date.now() + ROLL_DURATION * 3 + ACTION_TIMEOUT;
  for (;;) {
    const look: EndingLook = await readEndingLook(session, context);
    if (!look.isOpen || look.motion === 'shown' || Date.now() > deadline) {
      return seen;
    }
    const { edges } = look;
    const isUnder = (
      edge: number,
      roller: readonly [number, number],
    ): boolean => edge >= roller[0] - 1 && edge <= roller[1] + 1;
    if (
      edges === null ||
      !isUnder(edges.paper[0], edges.top) ||
      !isUnder(edges.paper[1], edges.bottom)
    ) {
      throw new Error(
        `As its scroll moves, the first page draws the rollers and the ` +
          `parchment at ${JSON.stringify(edges)}: ` +
          `${describeEndingLook(look)}.`,
      );
    }
    seen.push(look.motion);
    if (seen.length % 3 === 1) {
      await saveView(
        session,
        context,
        `${prefix}-${look.content}-${look.motion}-` +
          `${String(seen.length).padStart(2, '0')}.png`,
      );
    }
    await sleep(POLL_INTERVAL / 2);
  }
}

/**
 * Waits until a page shows its ending sheet as awaited.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {(seen: EndingLook) => boolean} isAwaited - Tells whether the page
 *   shows it as awaited.
 * @param {string} what - What is done to the page, for the error message.
 * @returns {Promise<EndingLook>} How the page shows it then.
 * @throws {Error} If the page does not show it so in time.
 */
function expectEndingLook(
  session: BidiSession,
  context: string,
  isAwaited: (seen: EndingLook) => boolean,
  what: string,
): Promise<EndingLook> {
  return waitFor(
    () => readEndingLook(session, context),
    isAwaited,
    ACTION_TIMEOUT,
    (seen: EndingLook) =>
      `With ${what}, the first page tells ${describeEndingLook(seen)}.`,
  );
}

/**
 * Saves the view of the scroll of the ending sheet of a page half unrolled,
 * if it is caught so, and if the environment names a directory for the
 * views.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {string} name - The file name to save the view under.
 * @returns {Promise<void>} A promise settled once the scroll unrolls or
 *   stands unrolled, and the view is saved if it is to be.
 * @throws {Error} If the scroll does not unroll in time.
 */
async function saveUnrolling(
  session: BidiSession,
  context: string,
  name: string,
): Promise<void> {
  const unrolling: EndingLook = await waitFor(
    () => readEndingLook(session, context),
    (seen: EndingLook) =>
      seen.motion === 'unrolling' || seen.motion === 'shown',
    ACTION_TIMEOUT,
    (seen: EndingLook) =>
      `Before ${name}, the first page tells ${describeEndingLook(seen)}.`,
  );
  if (unrolling.motion === 'unrolling') {
    await sleep(ROLL_DURATION / 3);
    await saveView(session, context, name);
  }
}

/**
 * Checks the end of the story on the ending sheet of a page, as
 * {@link checkEnding} tells, from the sheet opening by itself to its views
 * on a phone.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page, whose player
 *   has just come to hold both items in the village.
 * @param {number} id - The identifier of the player of the page.
 * @returns {Promise<void>} A promise settled once the page has passed,
 *   showing the end of the story in Traditional Chinese on a desktop.
 * @throws {Error} If the page does not show its ending sheet so.
 */
async function checkEndingStory(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  const look = (): Promise<EndingLook> => readEndingLook(session, context);
  // The view is a desktop's before the scroll unrolls, a second after the
  // token is received.
  await session.send('browsingContext.setViewport', {
    context,
    viewport: DESKTOP_VIEWPORT,
    devicePixelRatio: null,
  });
  await saveUnrolling(session, context, 'ending-unrolling.png');
  await watchScroll(session, context, 'scroll-open');
  const opened: EndingLook = await expectEndingLook(
    session,
    context,
    (seen: EndingLook) => isEndingWorded(seen, ENDING_WORDS, 'ending'),
    'its player holding both the message and the token in the village',
  );
  if (opened.words.includes('@')) {
    throw new Error(
      `The ending sheet of the first page tells an address: "${opened.words}".`,
    );
  }
  const was: FigureView | undefined = opened.figures.find(
    (figure: FigureView) => figure.id === id,
  );
  for (const key of ['d', LEFT_ARROW]) {
    await sendKey(session, context, 'keyDown', key);
  }
  await sleep(DIALOGUE_HOLD_DURATION);
  for (const key of ['d', LEFT_ARROW]) {
    await sendKey(session, context, 'keyUp', key);
  }
  await tapKey(session, context, HELP_KEYS.help);
  await tapKey(session, context, 'i');
  await sleep(VIEW_SETTLE_DURATION);
  const held: EndingLook = await look();
  const is: FigureView | undefined = held.figures.find(
    (figure: FigureView) => figure.id === id,
  );
  if (
    was === undefined ||
    is === undefined ||
    Math.hypot(is.x - was.x, is.z - was.z) > STANDING_DRIFT ||
    Math.abs(held.heading - opened.heading) > YAW_TOLERANCE ||
    !isEndingWorded(held, ENDING_WORDS, 'ending')
  ) {
    throw new Error(
      'With D and the left arrow held down, and H and I pressed, on the ' +
        `ending sheet, the first page moves its player from ` +
        `${JSON.stringify(was)} to ${JSON.stringify(is)}, and tells ` +
        `${describeEndingLook(held)}.`,
    );
  }
  await checkBrowserKeys(session, context, 'the ending sheet');
  await saveView(session, context, 'ending-desktop-en.png');
  await chooseLanguage(session, context, LANGUAGE_CONTROL, ZH_TW_NAME);
  await expectEndingLook(
    session,
    context,
    (seen: EndingLook) => isEndingWorded(seen, ZH_TW_ENDING_WORDS, 'ending'),
    `"${ZH_TW_NAME}" chosen on the ending sheet`,
  );
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'ending-desktop-zh-tw.png');
  await setViewSize(session, context, LANDSCAPE_VIEWPORT, PHONE_PIXEL_RATIO);
  await saveView(session, context, 'ending-landscape.png');
  await setViewSize(session, context, PORTRAIT_VIEWPORT, PHONE_PIXEL_RATIO);
  await saveView(session, context, 'ending-portrait.png');
  await setViewSize(session, context, DESKTOP_VIEWPORT, null);
}

/**
 * Checks that Space rolls up the end of the story on the ending sheet of a
 * page and that it unrolls again with the credits, which fit on a desktop,
 * as {@link checkEnding} tells.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page, which shows
 *   the end of the story in Traditional Chinese on a desktop.
 * @returns {Promise<void>} A promise settled once the page has passed,
 *   showing the credits in English on a desktop.
 * @throws {Error} If the page does not show its ending sheet so.
 */
async function checkEndingCredits(
  session: BidiSession,
  context: string,
): Promise<void> {
  // Space rolls the scroll up, and Esc, pressed as it does, skips nothing.
  await tapKey(session, context, ' ');
  await expectEndingLook(
    session,
    context,
    (seen: EndingLook) =>
      seen.content === 'ending' && seen.motion === 'rolling',
    'Space pressed on the end of the story',
  );
  await tapKey(session, context, HELP_KEYS.escape);
  const turned: readonly string[] = await watchScroll(
    session,
    context,
    'scroll-turn',
  );
  if (!turned.includes('rolling') || !turned.includes('unrolling')) {
    throw new Error(
      'Going on from the end of the story to the credits, the scroll of ' +
        `the first page moves through ${JSON.stringify(turned)}.`,
    );
  }
  await expectEndingLook(
    session,
    context,
    (seen: EndingLook) => isEndingWorded(seen, ZH_TW_ENDING_WORDS, 'credits'),
    'the scroll unrolled again after the end of the story',
  );
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'credits-desktop-zh-tw.png');
  await chooseLanguage(session, context, ZH_TW_LANGUAGE_CONTROL, EN_NAME);
  await expectEndingLook(
    session,
    context,
    (seen: EndingLook) => isEndingWorded(seen, ENDING_WORDS, 'credits'),
    `"${EN_NAME}" chosen again on the credits`,
  );
  await sleep(ROLL_PAUSE + VIEW_SETTLE_DURATION);
  const desktop: EndingLook = await readEndingLook(session, context);
  if (desktop.overflow > 0) {
    throw new Error(
      'On a desktop, the credits of the first page do not stand still: ' +
        `it tells ${describeEndingLook(desktop)}.`,
    );
  }
  await saveView(session, context, 'credits-desktop-en.png');
}

/**
 * Checks that the credits on the ending sheet of a page do not fit on a
 * phone held on its side, and roll up by themselves, until the wheel
 * scrolls them, and that a drag of the mouse scrolls them too, as
 * {@link checkEnding} tells.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page, which shows
 *   the credits in English on a desktop.
 * @returns {Promise<void>} A promise settled once the page has passed, at
 *   the size of its window.
 * @throws {Error} If the page does not show the credits so.
 */
async function checkCreditsRoll(
  session: BidiSession,
  context: string,
): Promise<void> {
  const look = (): Promise<EndingLook> => readEndingLook(session, context);
  await setViewSize(session, context, LANDSCAPE_VIEWPORT, PHONE_PIXEL_RATIO);
  const unrolled: EndingLook = await look();
  if (unrolled.overflow <= 0 || unrolled.scrollTop !== 0) {
    throw new Error(
      'On a phone held on its side, the credits of the first page tell ' +
        `${describeEndingLook(unrolled)}.`,
    );
  }
  await saveView(session, context, 'credits-landscape.png');
  await sleep(ROLL_PAUSE + ROLL_WATCH_DURATION);
  const rolled: EndingLook = await look();
  if (
    rolled.scrollTop < LEAST_ROLL ||
    rolled.scrollTop > (ROLL_SPEED * (ROLL_WATCH_DURATION + 1000)) / 1000
  ) {
    throw new Error(
      'On a phone held on its side, the credits of the first page roll ' +
        `from ${describeEndingLook(unrolled)} to ` +
        `${describeEndingLook(rolled)}.`,
    );
  }
  await saveView(session, context, 'credits-landscape-rolled.png');
  await session.send('input.performActions', {
    context,
    actions: [
      {
        type: 'wheel',
        id: 'wheel',
        actions: [
          {
            type: 'scroll',
            x: Math.round(LANDSCAPE_VIEWPORT.width / 2),
            y: Math.round(LANDSCAPE_VIEWPORT.height / 2),
            deltaX: 0,
            deltaY: -ZOOM_DELTA * 10,
          },
        ],
      },
    ],
  });
  await sleep(VIEW_SETTLE_DURATION);
  const scrolled: EndingLook = await look();
  await sleep(ROLL_PAUSE);
  const stopped: EndingLook = await look();
  if (
    scrolled.scrollTop >= rolled.scrollTop ||
    stopped.scrollTop !== scrolled.scrollTop ||
    !isEndingWorded(stopped, ENDING_WORDS, 'credits')
  ) {
    throw new Error(
      'With the wheel turned on the rolling credits, the first page tells ' +
        `${describeEndingLook(scrolled)}, and then ` +
        `${describeEndingLook(stopped)}.`,
    );
  }
  await dragUp(session, context, LANDSCAPE_VIEWPORT);
  await sleep(VIEW_SETTLE_DURATION);
  const dragged: EndingLook = await look();
  if (
    dragged.scrollTop <= stopped.scrollTop ||
    !isEndingWorded(dragged, ENDING_WORDS, 'credits')
  ) {
    throw new Error(
      'With the mouse dragged up the credits, the first page tells ' +
        `${describeEndingLook(stopped)}, and then ` +
        `${describeEndingLook(dragged)}.`,
    );
  }
  await setViewSize(session, context, PORTRAIT_VIEWPORT, PHONE_PIXEL_RATIO);
  await saveView(session, context, 'credits-portrait.png');
  await setViewSize(session, context, null, null);
}

/**
 * Checks that a click around the ending sheet of a page rolls it up and
 * closes it.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page, which shows
 *   the credits.
 * @returns {Promise<void>} A promise settled once the sheet is closed.
 * @throws {Error} If the page does not show the sheet so.
 */
async function checkEndingClosed(
  session: BidiSession,
  context: string,
): Promise<void> {
  await evaluateInPage(
    session,
    context,
    `(() => {
      document.querySelector('.ending')?.click();
      return '';
    })()`,
  );
  const closing: readonly string[] = await watchScroll(
    session,
    context,
    'scroll-close',
  );
  if (!closing.includes('rolling')) {
    throw new Error(
      'With the page around the credits clicked, the scroll of the first ' +
        `page moves through ${JSON.stringify(closing)}.`,
    );
  }
  await expectEndingLook(
    session,
    context,
    (seen: EndingLook) => !seen.isOpen,
    'the credits rolled up',
  );
}

/**
 * Checks that once the ending sheet of a page has been shown, the help
 * sheet, opening at its first page as ever, has a last page of the
 * credits, which the right arrow turns to.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page, whose ending
 *   sheet has been shown and closed.
 * @returns {Promise<void>} A promise settled once the help sheet is closed.
 * @throws {Error} If the page does not show the help sheet so.
 */
async function checkHelpCredits(
  session: BidiSession,
  context: string,
): Promise<void> {
  const readHelp = (): Promise<HelpLook> => readHelpLook(session, context);
  await tapKey(session, context, HELP_KEYS.help);
  await waitFor(
    readHelp,
    (seen: HelpLook) =>
      seen.isOpen && seen.page === 0 && seen.dotCount === HELP_PAGE_COUNT + 1,
    ACTION_TIMEOUT,
    (seen: HelpLook) =>
      `With H pressed after the ending, the first page tells ` +
      `${describeHelpLook(seen)}.`,
  );
  for (let turn = 0; turn <= HELP_PAGE_COUNT; turn++) {
    await tapKey(session, context, HELP_KEYS.right);
  }
  await waitFor(
    readHelp,
    (seen: HelpLook) =>
      seen.page === CREDITS_PAGE &&
      seen.subtitle === ENDING_WORDS.title &&
      JSON.stringify(seen.creditsLines) ===
        JSON.stringify(ENDING_WORDS.lines),
    ACTION_TIMEOUT,
    (seen: HelpLook) =>
      `With the right arrow pressed to the last page after the ending, the ` +
      `first page tells ${describeHelpLook(seen)}.`,
  );
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'help-credits.png');
  await tapKey(session, context, HELP_KEYS.escape);
  await tapKey(session, context, HELP_KEYS.help);
  await waitFor(
    readHelp,
    (seen: HelpLook) => seen.isOpen && seen.page === 0,
    ACTION_TIMEOUT,
    (seen: HelpLook) =>
      `With H pressed again after the credits, the first page tells ` +
      `${describeHelpLook(seen)}.`,
  );
  await tapKey(session, context, HELP_KEYS.escape);
  await waitFor(
    readHelp,
    (seen: HelpLook) => !seen.isOpen,
    ACTION_TIMEOUT,
    (seen: HelpLook) =>
      `With Esc pressed on the help sheet, the first page tells ` +
      `${describeHelpLook(seen)}.`,
  );
}

/**
 * Checks the ending sheet, which a page opens by itself once its player
 * holds both the message from Clovervale and the token of the spy in the
 * village: a scroll whose rollers part from the middle as it unrolls, the
 * parchment between them at every look as {@link watchScroll} tells, which
 * tells the end of the story and "The End" alone, in English and in
 * Traditional Chinese; that while it is open a walking key and an arrow
 * held down neither walk the player nor turn the camera, H and I open
 * neither the help sheet nor the bag, and the keys of the browser are left
 * to it; that Space rolls it up, a press of Esc meanwhile doing nothing,
 * and it unrolls again with the credits, with the version of the game from
 * its package, its author without an address, the AI that assisted, the
 * music, the libraries and the licenses; that on a desktop the credits fit
 * and stand still, while on a phone held on its side they do not, and
 * roll up by themselves after a moment, until the wheel scrolls them,
 * which stops them, and a drag of the mouse scrolls them too, neither
 * leaving the sheet; that a click around it rolls it up and closes it; and
 * that once
 * it has been shown, the help sheet, opening at its first page as ever,
 * has a last page of the credits, which the right arrow turns to.
 * The views of the sheet as it unrolls, of the end of the story and of the
 * credits on a desktop, in both languages, and on a phone held on its side
 * and upright, and of the page of the credits of the help sheet are
 * saved if the environment names a directory for them.  The sheets are
 * left closed, the page in English at the size of its window.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page, whose player
 *   has just come to hold both items in the village.
 * @param {number} id - The identifier of the player of the page.
 * @returns {Promise<void>} A promise settled once the page has passed.
 * @throws {Error} If the page does not show its ending sheet so.
 */
export async function checkEnding(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  await checkEndingStory(session, context, id);
  await checkEndingCredits(session, context);
  await checkCreditsRoll(session, context);
  await checkEndingClosed(session, context);
  await checkHelpCredits(session, context);
}

/**
 * Checks the page of the credits of the help sheet by touch on a phone:
 * that once the page is used by touch, the help sheet its button opens, at
 * the page of touch, turns on to the credits with its arrow tapped, which
 * do not fit the sheet on the phone held on its side and scroll inside it;
 * and that the button at its foot closes it.  The views of the page of the
 * credits on the phone held on its side and upright are saved if the
 * environment names a directory for them.  The page is left used by touch,
 * at the size of its window, the sheet closed.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page, whose ending
 *   has been shown.
 * @returns {Promise<void>} A promise settled once the page has passed.
 * @throws {Error} If the page does not show the credits so.
 */
export async function checkCreditsByTouch(
  session: BidiSession,
  context: string,
): Promise<void> {
  const look = (): Promise<HelpLook> => readHelpLook(session, context);
  const tap = async (x: number, y: number): Promise<void> => {
    await session.send('input.performActions', {
      context,
      actions: [
        {
          type: 'pointer',
          id: 'finger',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', x, y },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: TOUCH_TAP_DURATION },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    });
  };
  const tapElement = async (selector: string): Promise<void> => {
    const [x, y] = JSON.parse(
      await evaluateInPage(
        session,
        context,
        `(() => {
          const box = document.querySelector(${JSON.stringify(selector)})
            .getBoundingClientRect();
          return JSON.stringify([
            Math.round(box.left + box.width / 2),
            Math.round(box.top + box.height / 2),
          ]);
        })()`,
      ),
    ) as [number, number];
    await tap(x, y);
  };
  const expectLook = (
    isAwaited: (seen: HelpLook) => boolean,
    what: string,
  ): Promise<HelpLook> =>
    waitFor(
      look,
      isAwaited,
      ACTION_TIMEOUT,
      (seen: HelpLook) =>
        `With ${what}, the page used by touch tells ` +
        `${describeHelpLook(seen)}.`,
    );

  await setViewSize(session, context, LANDSCAPE_VIEWPORT, PHONE_PIXEL_RATIO);
  // A first tap on the scene has the page lay itself out for touch, which
  // moves the button of the help sheet.
  await tap(
    Math.round(LANDSCAPE_VIEWPORT.width / 3),
    Math.round(LANDSCAPE_VIEWPORT.height / 3),
  );
  await sleep(VIEW_SETTLE_DURATION);
  await tapElement('.help-button');
  await expectLook(
    (seen: HelpLook) => seen.isOpen && seen.page === TOUCH_PAGE,
    'its button tapped after the ending',
  );
  await tapElement('.help-next');
  await expectLook(
    (seen: HelpLook) =>
      seen.page === CREDITS_PAGE &&
      JSON.stringify(seen.creditsLines) ===
        JSON.stringify(ENDING_WORDS.lines),
    'the arrow to the next page tapped on the page of touch',
  );
  const overflow = Number(
    await evaluateInPage(
      session,
      context,
      `(() => {
        const sheet = document.querySelector('.help-sheet');
        return String(sheet.scrollHeight - sheet.clientHeight);
      })()`,
    ),
  );
  if (overflow <= 0) {
    throw new Error(
      'Used by touch on a phone held on its side, the page of the credits ' +
        `of the help sheet is ${String(overflow)} pixels taller than it.`,
    );
  }
  await saveView(session, context, 'help-credits-touch-landscape.png');
  await setViewSize(session, context, PORTRAIT_VIEWPORT, PHONE_PIXEL_RATIO);
  await saveView(session, context, 'help-credits-touch-portrait.png');
  await tapElement('.help-ok');
  await expectLook(
    (seen: HelpLook) => !seen.isOpen,
    'the button at the foot of the credits tapped',
  );
  await setViewSize(session, context, null, null);
}
