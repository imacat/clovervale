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
 * @module scripts/test-browser/touch Checks playing by touch on a phone.
 */

import { setTimeout as sleep } from 'node:timers/promises';

import type { FigureView } from '../../packages/client/src/player-figures.ts';

import type { BidiSession } from './bidi.ts';
import {
  ACTION_TIMEOUT,
  LANDSCAPE_VIEWPORT,
  NO_SILVER_LABEL,
  PHONE_PIXEL_RATIO,
  PORTRAIT_VIEWPORT,
  STANDING_DRIFT,
  TOUCH_TAP_DURATION,
  VIEW_SETTLE_DURATION,
} from './constants.ts';
import { HELP_EXPRESSION, describeHelpLook } from './help.ts';
import type { HelpLook } from './help.ts';
import {
  PANEL_ACTION_EXPRESSION,
  SILVER_EXPRESSION,
  evaluateInPage,
  loadClient,
  readPageState,
  saveView,
  setControl,
  waitFor,
  watchAction,
} from './page.ts';
import type { BoxView, PageState, SilverView } from './page.ts';

/** The least size of a target to tap, in CSS pixels. */
const LEAST_TAP_TARGET = 44;
/** How far a finger pushes the stick or drags on the scene, in pixels. */
const TOUCH_PUSH = 60;
/** How long a finger is held on the stick to walk, in milliseconds. */
const TOUCH_HOLD_DURATION = 1500;
/** How far the player is to walk with the stick held, in meters. */
const TOUCH_WALK_DISTANCE = 0.5;
/** How far the view is to turn with a finger held on the scene, degrees. */
const TOUCH_ORBIT = 15;
/** How much nearer a pinch is to bring the camera, as a share. */
const TOUCH_ZOOM_SHARE = 0.9;
/** The number of the touch controls the page of touch lists. */
const TOUCH_CONTROL_COUNT = 6;
/** The ways the stick is pushed in turn till the player walks. */
const TOUCH_WALK_PUSHES: readonly (readonly [number, number])[] = [
  [0, -1],
  [0, 1],
  [1, 0],
  [-1, 0],
];
/** The pairs of what is shown that are not to overlap while playing. */
const PLAY_APART: readonly (readonly [string, string])[] = [
  ['stick', 'action'],
  ['stick', 'prompt'],
  ['action', 'prompt'],
  ['stick', 'panel'],
  ['action', 'panel'],
  ['bagIcon', 'helpButton'],
  ['chatButton', 'bagIcon'],
  ['chatButton', 'helpButton'],
  ['chatButton', 'stick'],
  ['chatButton', 'panel'],
  ['bagIcon', 'panel'],
  ['helpButton', 'panel'],
  ['prompt', 'panel'],
];
/** The pairs of what is shown that are not to overlap with the bag open. */
const OPEN_APART: readonly (readonly [string, string])[] = [
  ['bag', 'bagIcon'],
  ['bag', 'helpButton'],
  ['bag', 'panel'],
  ['silver', 'panel'],
];

/** How a page used by touch shows itself. */
interface TouchLook {
  /** Whether the page counts as used by touch. */
  readonly isTouch: boolean;
  /** The width of the view, in CSS pixels. */
  readonly width: number;
  /** The height of the view, in CSS pixels. */
  readonly height: number;
  /** Whether the touch controls are held, hidden. */
  readonly isHeld: boolean;
  /** Whether the panel is folded up. */
  readonly isPanelClosed: boolean;
  /** Whether a key cap is shown on the bag, the help or the chat button. */
  readonly isKeyShown: boolean;
  /** Whether the keyboard is with the line of the box of the chat. */
  readonly isChatFocused: boolean;
  /** The boxes of what is shown, by their names; the hidden are left out. */
  readonly boxes: Readonly<Record<string, BoxView>>;
  /** The least width and height of the targets to tap shown. */
  readonly leastTarget: number;
  /** The name of the target to tap that is least, if any is shown. */
  readonly leastTargetName: string;
  /** The help sheet, as the page shows it. */
  readonly help: HelpLook;
  /** How the bag shows the silver coins, or `null` if it shows none. */
  readonly silver: SilverView | null;
  /** How far the camera is from what it looks at, in meters. */
  readonly distance: number;
}

/** A page of its own used by touch, and its player. */
interface TouchPage {
  /** The session with the browser. */
  readonly session: BidiSession;
  /** The browsing context of the page. */
  readonly context: string;
  /** The identifier of the player of the page. */
  readonly id: number;
}

/** Reads how a page used by touch shows itself, as JSON. */
const TOUCH_EXPRESSION = `(() => {
  const isShown = (element) => {
    if (element === null) {
      return false;
    }
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' &&
      box.width > 0 && box.height > 0 && element.closest('[hidden]') === null;
  };
  const named = {
    stick: '.touch-stick',
    action: '.touch-action',
    bagIcon: '.bag-icon',
    helpButton: '.help-button',
    chatButton: '.chat-button',
    chatBox: '.chat-box',
    panel: '.panel',
    prompt: '.interaction-prompt',
    bag: '.bag-window',
    silver: '.bag-silver',
    sheet: '.help-sheet',
    dialogue: '.dialogue',
  };
  const boxes = {};
  for (const [name, selector] of Object.entries(named)) {
    const element = document.querySelector(selector);
    if (isShown(element)) {
      const { left, top, right, bottom } = element.getBoundingClientRect();
      boxes[name] = { left, top, right, bottom };
    }
  }
  let leastTarget = Infinity;
  let leastTargetName = '';
  const targets = '.touch-action, .bag-icon, .help-button, .bag-slot, ' +
    '.chat-button, .chat-send, .chat-cancel, ' +
    '.bag-action, .dialogue-reply, .help-previous, .help-next, ' +
    '.help-close, .help-ok';
  for (const element of document.querySelectorAll(targets)) {
    if (isShown(element)) {
      const box = element.getBoundingClientRect();
      const least = Math.min(box.width, box.height);
      if (least < leastTarget) {
        leastTarget = least;
        leastTargetName = element.className;
      }
    }
  }
  const { x, z } = window.clovervale.describeCamera();
  return JSON.stringify({
    isTouch: document.documentElement.classList.contains('is-touch'),
    width: window.innerWidth,
    height: window.innerHeight,
    isHeld: document.querySelector('.touch-controls')
      ?.classList.contains('is-held') ?? false,
    isPanelClosed: document.querySelector('.panel') !== null &&
      !isShown(document.querySelector('.panel-contents')),
    isKeyShown: [
      ...document.querySelectorAll('.bag-key, .help-key, .chat-key'),
    ].some(isShown),
    isChatFocused: document.activeElement !== null &&
      document.activeElement === document.querySelector('.chat-input'),
    boxes,
    leastTarget: Number.isFinite(leastTarget) ? leastTarget : 0,
    leastTargetName,
    help: ${HELP_EXPRESSION.replace('JSON.stringify', '')},
    silver: ${SILVER_EXPRESSION},
    distance: window.clovervale.describeCameraDistance(),
  });
})()`;

/**
 * Reads how a page used by touch shows itself.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<TouchLook>} How the page shows itself.
 */
async function readTouchLook(
  session: BidiSession,
  context: string,
): Promise<TouchLook> {
  return JSON.parse(
    await evaluateInPage(session, context, TOUCH_EXPRESSION),
  ) as TouchLook;
}

/**
 * Finds the middle of something a page used by touch shows.
 *
 * @param {TouchLook} look - How the page shows itself.
 * @param {string} name - The name of what is shown.
 * @returns {[number, number]} Its middle, rounded to whole CSS pixels.
 * @throws {Error} If the page does not show it.
 */
function findMiddle(look: TouchLook, name: string): [number, number] {
  const box: BoxView | undefined = look.boxes[name];
  if (box === undefined) {
    throw new Error(
      `The page used by touch does not show its ${name}: it shows ` +
        `${Object.keys(look.boxes).join(', ')}.`,
    );
  }
  return [
    Math.round((box.left + box.right) / 2),
    Math.round((box.top + box.bottom) / 2),
  ];
}

/**
 * Finds what a page used by touch lays out badly: what reaches beyond the
 * view, what overlaps what, and a target to tap that is too small.
 *
 * @param {TouchLook} look - How the page shows itself.
 * @param {readonly (readonly [string, string])[]} apart - The pairs of
 *   what is shown that are not to overlap.
 * @returns {string[]} What is laid out badly, in words.
 */
function findLayoutProblems(
  look: TouchLook,
  apart: readonly (readonly [string, string])[],
): string[] {
  const problems: string[] = [];
  for (const [name, box] of Object.entries(look.boxes)) {
    if (
      box.left < 0 ||
      box.top < 0 ||
      box.right > look.width + 0.5 ||
      box.bottom > look.height + 0.5
    ) {
      problems.push(`its ${name} reaches beyond the view`);
    }
  }
  for (const [one, other] of apart) {
    const a: BoxView | undefined = look.boxes[one];
    const b: BoxView | undefined = look.boxes[other];
    if (
      a !== undefined &&
      b !== undefined &&
      a.left < b.right &&
      b.left < a.right &&
      a.top < b.bottom &&
      b.top < a.bottom
    ) {
      problems.push(`its ${one} overlaps its ${other}`);
    }
  }
  if (look.leastTarget > 0 && look.leastTarget < LEAST_TAP_TARGET) {
    problems.push(
      `its "${look.leastTargetName}" is only ` +
        `${look.leastTarget.toFixed(0)} pixels across to tap`,
    );
  }
  return problems;
}

/**
 * Checks that a page used by touch lays itself out well.
 *
 * @param {TouchLook} seen - How the page shows itself.
 * @param {string} what - What is done to the page, for the error message.
 * @param {readonly (readonly [string, string])[]} apart - The pairs of
 *   what is shown that are not to overlap.
 * @throws {Error} If the page lays itself out badly.
 */
function expectLaidOut(
  seen: TouchLook,
  what: string,
  apart: readonly (readonly [string, string])[],
): void {
  const problems: string[] = findLayoutProblems(seen, apart);
  if (problems.length > 0) {
    throw new Error(
      `With ${what}, the page used by touch lays itself out badly: ` +
        `${problems.join('; ')}.`,
    );
  }
}

/**
 * Finds the figure of the player of a page used by touch.
 *
 * @param {TouchPage} page - The page.
 * @param {TouchLook} seen - How the page shows itself.
 * @returns {FigureView | undefined} The figure, or `undefined` if the page
 *   shows none of the player.
 */
function findOwn(page: TouchPage, seen: TouchLook): FigureView | undefined {
  return seen.help.figures.find((figure: FigureView) => figure.id === page.id);
}

/**
 * Turns the phone a page is on, and waits for the view to settle.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {Readonly<{ width: number; height: number }>} viewport - The size
 *   of the view of the phone turned.
 * @returns {Promise<void>} A promise settled once the view has settled.
 */
async function turnPhone(
  session: BidiSession,
  context: string,
  viewport: Readonly<{ width: number; height: number }>,
): Promise<void> {
  await session.send('browsingContext.setViewport', {
    context,
    viewport,
    devicePixelRatio: PHONE_PIXEL_RATIO,
  });
  await sleep(VIEW_SETTLE_DURATION);
}

/**
 * Touches a page with fingers at once.
 *
 * @param {TouchPage} page - The page.
 * @param {readonly (readonly Readonly<Record<string, unknown>>[])[]} fingers
 *   - What each finger does, in turn.
 * @returns {Promise<void>} A promise settled once the fingers are done.
 */
async function touch(
  page: TouchPage,
  fingers: readonly (readonly Readonly<Record<string, unknown>>[])[],
): Promise<void> {
  await page.session.send('input.performActions', {
    context: page.context,
    actions: fingers.map((actions, index: number) => ({
      type: 'pointer',
      id: `finger${String(index)}`,
      parameters: { pointerType: 'touch' },
      actions,
    })),
  });
}

/**
 * Taps a page with a finger.
 *
 * @param {TouchPage} page - The page.
 * @param {number} x - Where to tap across the view, in CSS pixels.
 * @param {number} y - Where to tap down the view, in CSS pixels.
 * @returns {Promise<void>} A promise settled once the finger is lifted.
 */
async function tap(page: TouchPage, x: number, y: number): Promise<void> {
  await touch(page, [
    [
      { type: 'pointerMove', x, y },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: TOUCH_TAP_DURATION },
      { type: 'pointerUp', button: 0 },
    ],
  ]);
}

/**
 * Taps the middle of something a page used by touch shows.
 *
 * @param {TouchPage} page - The page.
 * @param {string} name - The name of what is shown.
 * @returns {Promise<void>} A promise settled once the finger is lifted.
 * @throws {Error} If the page does not show it.
 */
async function tapOn(page: TouchPage, name: string): Promise<void> {
  const [x, y] = findMiddle(
    await readTouchLook(page.session, page.context),
    name,
  );
  await tap(page, x, y);
}

/**
 * Taps the middle of an element of a page.
 *
 * @param {TouchPage} page - The page.
 * @param {string} selector - The selector of the element.
 * @returns {Promise<void>} A promise settled once the finger is lifted.
 */
async function tapElement(page: TouchPage, selector: string): Promise<void> {
  const [x, y] = JSON.parse(
    await evaluateInPage(
      page.session,
      page.context,
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
  await tap(page, x, y);
}

/**
 * Waits until a page used by touch shows itself as awaited.
 *
 * @param {TouchPage} page - The page.
 * @param {(seen: TouchLook) => boolean} isAwaited - Tells whether the page
 *   shows itself as awaited.
 * @param {string} what - What is done to the page, for the error message.
 * @returns {Promise<TouchLook>} How the page shows itself then.
 * @throws {Error} If the page does not show itself so in time.
 */
function expectLook(
  page: TouchPage,
  isAwaited: (seen: TouchLook) => boolean,
  what: string,
): Promise<TouchLook> {
  return waitFor(
    () => readTouchLook(page.session, page.context),
    isAwaited,
    ACTION_TIMEOUT,
    (seen: TouchLook) => {
      const { help, ...rest } = seen;
      return (
        `With ${what}, the page used by touch tells ` +
        `${JSON.stringify(rest)} and ${describeHelpLook(help)}.`
      );
    },
  );
}

/**
 * Checks that the button of the help sheet of a page used by touch opens it
 * at the page of touch, whose arrows and cross work by tapping, laid out
 * well and holding the controls while open.
 *
 * @param {TouchPage} page - The page.
 * @param {string} name - How the phone is held.
 * @returns {Promise<void>} A promise settled once the sheet is closed again.
 * @throws {Error} If the page does not do so.
 */
async function checkTouchHelp(page: TouchPage, name: string): Promise<void> {
  await tapOn(page, 'helpButton');
  const help: TouchLook = await expectLook(
    page,
    (seen: TouchLook) =>
      seen.help.isOpen &&
      seen.help.page === 2 &&
      seen.help.subtitle === 'Touch' &&
      seen.help.labels.length === TOUCH_CONTROL_COUNT &&
      seen.isHeld,
    `its help button tapped, held ${name}`,
  );
  await saveView(page.session, page.context, `touch-help-${name}.png`);
  expectLaidOut(help, `the help sheet open, held ${name}`, []);
  await tapElement(page, '.help-previous');
  await expectLook(
    page,
    (seen: TouchLook) => seen.help.isOpen && seen.help.page === 1,
    `the arrow to the page before tapped, held ${name}`,
  );
  expectLaidOut(
    await readTouchLook(page.session, page.context),
    `the page of the gamepad, held ${name}`,
    [],
  );
  await tapElement(page, '.help-previous');
  await expectLook(
    page,
    (seen: TouchLook) => seen.help.isOpen && seen.help.page === 0,
    `the arrow to the page before tapped again, held ${name}`,
  );
  expectLaidOut(
    await readTouchLook(page.session, page.context),
    `the page of the keyboard, held ${name}`,
    [],
  );
  await tapElement(page, '.help-next');
  await expectLook(
    page,
    (seen: TouchLook) => seen.help.isOpen && seen.help.page === 1,
    `the arrow to the next page tapped, held ${name}`,
  );
  await tapElement(page, name === 'portrait' ? '.help-close' : '.help-ok');
  await expectLook(
    page,
    (seen: TouchLook) => !seen.help.isOpen && !seen.isHeld,
    `the help sheet closed by tapping, held ${name}`,
  );
}

/**
 * Checks that the bag of a page used by touch opens and closes by tapping,
 * showing no silver coins, laid out well and holding the controls while
 * open.
 *
 * @param {TouchPage} page - The page.
 * @param {string} name - How the phone is held.
 * @returns {Promise<void>} A promise settled once the bag is closed again.
 * @throws {Error} If the page does not do so.
 */
async function checkTouchBag(page: TouchPage, name: string): Promise<void> {
  await tapOn(page, 'bagIcon');
  const bag: TouchLook = await expectLook(
    page,
    (seen: TouchLook) =>
      seen.help.isBagOpen &&
      seen.isHeld &&
      seen.silver?.count === '0' &&
      seen.silver.label === NO_SILVER_LABEL &&
      seen.silver.isCoinDrawn &&
      seen.silver.isInWindow,
    `its bag icon tapped, held ${name}, showing no silver coins`,
  );
  await saveView(page.session, page.context, `touch-bag-${name}.png`);
  expectLaidOut(bag, `the bag open, held ${name}`, OPEN_APART);
  await tapOn(page, 'bagIcon');
  await expectLook(
    page,
    (seen: TouchLook) => !seen.help.isBagOpen && !seen.isHeld,
    `its bag icon tapped again, held ${name}`,
  );
}

/**
 * Checks that the box of the chat of a page used by touch opens with the
 * keyboard on its line, which alone is left the menu of a long press, and
 * closes by tapping, laid out well and holding the controls while open.
 *
 * @param {TouchPage} page - The page.
 * @param {string} name - How the phone is held.
 * @returns {Promise<void>} A promise settled once the box is closed again.
 * @throws {Error} If the page does not do so.
 */
async function checkTouchChat(page: TouchPage, name: string): Promise<void> {
  await tapOn(page, 'chatButton');
  const chat: TouchLook = await expectLook(
    page,
    (seen: TouchLook) =>
      seen.boxes.chatBox !== undefined && seen.isChatFocused && seen.isHeld,
    `its chat button tapped, held ${name}`,
  );
  await saveView(page.session, page.context, `touch-chat-${name}.png`);
  expectLaidOut(chat, `the box of the chat open, held ${name}`, []);
  // A long press opens the menu of the browser on the line of the box,
  // to select, copy, cut and paste with, and nowhere else.
  const kept: string[] = JSON.parse(
    await evaluateInPage(
      page.session,
      page.context,
      `JSON.stringify(['.chat-input', 'canvas'].filter((selector) => {
        const event = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
        });
        document.querySelector(selector).dispatchEvent(event);
        return event.defaultPrevented;
      }))`,
    ),
  ) as string[];
  if (kept.join() !== 'canvas') {
    throw new Error(
      `Held ${name}, the page used by touch keeps the menu of a long ` +
        `press from "${kept.join(', ')}", rather than from the scene alone.`,
    );
  }
  await tapElement(page, '.chat-cancel');
  await expectLook(
    page,
    (seen: TouchLook) => seen.boxes.chatBox === undefined && !seen.isHeld,
    `the cross of the box of the chat tapped, held ${name}`,
  );
}

/**
 * Checks a page used by touch on a phone held one way: that it shows the
 * stick and the action button with its panel folded up, laid out well,
 * without the keys on its buttons, and that its help sheet, its bag and
 * the box of its chat work by tapping.
 *
 * @param {TouchPage} page - The page, touched already.
 * @param {string} name - How the phone is held.
 * @param {Readonly<{ width: number; height: number }>} viewport - The size
 *   of the view of the phone held so.
 * @returns {Promise<void>} A promise settled once the page has passed.
 * @throws {Error} If the page does not do so.
 */
async function checkTouchHeld(
  page: TouchPage,
  name: string,
  viewport: Readonly<{ width: number; height: number }>,
): Promise<void> {
  await turnPhone(page.session, page.context, viewport);
  const playing: TouchLook = await expectLook(
    page,
    (seen: TouchLook) =>
      seen.isTouch &&
      !seen.isHeld &&
      seen.isPanelClosed &&
      seen.boxes.stick !== undefined &&
      seen.boxes.action !== undefined,
    `the screen touched, held ${name}`,
  );
  if (playing.isKeyShown) {
    throw new Error(
      `Held ${name}, the page used by touch shows the keys of its buttons.`,
    );
  }
  await saveView(page.session, page.context, `touch-${name}.png`);
  expectLaidOut(playing, `the screen held ${name}`, PLAY_APART);
  await checkTouchHelp(page, name);
  await checkTouchBag(page, name);
  await checkTouchChat(page, name);
}

/**
 * Checks that the stick of a page used by touch walks the player, whichever
 * way is open, while a finger on the scene turns the view at once, and that
 * the player stops once the stick is let go.
 *
 * @param {TouchPage} page - The page.
 * @param {TouchLook} before - How the page shows itself beforehand.
 * @param {readonly [number, number]} stick - The middle of the stick.
 * @param {readonly [number, number]} scene - Where on the scene to drag.
 * @returns {Promise<void>} A promise settled once the player has stopped.
 * @throws {Error} If the page does not do so.
 */
async function checkTouchWalk(
  page: TouchPage,
  before: TouchLook,
  stick: readonly [number, number],
  scene: readonly [number, number],
): Promise<void> {
  const look = (): Promise<TouchLook> =>
    readTouchLook(page.session, page.context);
  const [stickX, stickY] = stick;
  const [sceneX, sceneY] = scene;
  const start: FigureView | undefined = findOwn(page, before);
  const findTurn = (heading: number): number => {
    const turn: number = (((heading - before.help.heading) % 360) + 360) % 360;
    return turn > 180 ? turn - 360 : turn;
  };
  let walked: TouchLook = before;
  const hasWalked = (seen: TouchLook): boolean => {
    const is: FigureView | undefined = findOwn(page, seen);
    return (
      start !== undefined &&
      is !== undefined &&
      Math.hypot(is.x - start.x, is.z - start.z) >= TOUCH_WALK_DISTANCE
    );
  };
  for (const [x, y] of TOUCH_WALK_PUSHES) {
    await touch(page, [
      [
        { type: 'pointerMove', x: stickX, y: stickY },
        { type: 'pointerDown', button: 0 },
        {
          type: 'pointerMove',
          x: stickX + x * TOUCH_PUSH,
          y: stickY + y * TOUCH_PUSH,
          duration: 100,
        },
        { type: 'pause', duration: TOUCH_HOLD_DURATION },
        { type: 'pointerUp', button: 0 },
      ],
      [
        { type: 'pointerMove', x: sceneX, y: sceneY },
        { type: 'pointerDown', button: 0 },
        {
          type: 'pointerMove',
          x: sceneX - TOUCH_PUSH,
          y: sceneY,
          duration: 100,
        },
        { type: 'pause', duration: TOUCH_HOLD_DURATION },
        { type: 'pointerUp', button: 0 },
      ],
    ]);
    walked = await look();
    if (hasWalked(walked)) {
      break;
    }
  }
  if (!hasWalked(walked)) {
    throw new Error(
      'With the stick pushed each way, the page used by touch moves its ' +
        `player from ${JSON.stringify(start)} to ` +
        `${JSON.stringify(findOwn(page, walked))}.`,
    );
  }
  if (Math.abs(findTurn(walked.help.heading)) < TOUCH_ORBIT) {
    throw new Error(
      'With a finger dragged on the scene while the stick walks, the page ' +
        `used by touch turns its camera from ` +
        `${before.help.heading.toFixed(1)} to ` +
        `${walked.help.heading.toFixed(1)} degrees.`,
    );
  }
  await sleep(VIEW_SETTLE_DURATION);
  const stopped: FigureView | undefined = findOwn(page, await look());
  await sleep(VIEW_SETTLE_DURATION);
  const still: FigureView | undefined = findOwn(page, await look());
  if (
    stopped === undefined ||
    still === undefined ||
    Math.hypot(still.x - stopped.x, still.z - stopped.z) > STANDING_DRIFT
  ) {
    throw new Error(
      'With the finger lifted from the stick, the page used by touch moves ' +
        `its player from ${JSON.stringify(stopped)} to ` +
        `${JSON.stringify(still)}.`,
    );
  }
}

/**
 * Checks that two fingers spreading on the scene of a page used by touch
 * zoom in.
 *
 * @param {TouchPage} page - The page.
 * @param {readonly [number, number]} scene - Where on the scene to spread.
 * @returns {Promise<void>} A promise settled once the page has passed.
 * @throws {Error} If the page does not do so.
 */
async function checkTouchZoom(
  page: TouchPage,
  scene: readonly [number, number],
): Promise<void> {
  const [sceneX, sceneY] = scene;
  const far: TouchLook = await readTouchLook(page.session, page.context);
  await touch(
    page,
    [-1, 1].map((side: number) => [
      { type: 'pointerMove', x: sceneX + side * 20, y: sceneY },
      { type: 'pointerDown', button: 0 },
      {
        type: 'pointerMove',
        x: sceneX + side * 20 * 4,
        y: sceneY,
        duration: 300,
      },
      { type: 'pointerUp', button: 0 },
    ]),
  );
  const near: TouchLook = await readTouchLook(page.session, page.context);
  if (near.distance > far.distance * TOUCH_ZOOM_SHARE) {
    throw new Error(
      'With two fingers spread on the scene, the page used by touch moves ' +
        `its camera from ${far.distance.toFixed(2)} to ` +
        `${near.distance.toFixed(2)} meters away.`,
    );
  }
}

/**
 * Checks that the action button of a page used by touch slashes, as the
 * space bar does.
 *
 * @param {TouchPage} page - The page.
 * @returns {Promise<void>} A promise settled once the slash is over.
 * @throws {Error} If the page does not do so.
 */
async function checkTouchAction(page: TouchPage): Promise<void> {
  const slash: Promise<string> = watchAction(
    page.session,
    page.context,
    PANEL_ACTION_EXPRESSION,
  );
  slash.catch(() => undefined);
  await tapOn(page, 'action');
  const outcome: string = await slash;
  if (outcome !== 'over') {
    throw new Error(
      'With the action button tapped, the panel of the page used by touch ' +
        `tells its player ${outcome === 'never' ? 'never slashing' : outcome}.`,
    );
  }
}

/**
 * Checks that turning the phone of a page used by touch upright, with a
 * finger held on the stick, lays the page out again at once and lets go of
 * the finger.
 *
 * @param {TouchPage} page - The page, on a phone held on its side.
 * @param {readonly [number, number]} stick - The middle of the stick.
 * @returns {Promise<void>} A promise settled once all fingers are let go.
 * @throws {Error} If the page does not do so.
 */
async function checkTouchTurn(
  page: TouchPage,
  stick: readonly [number, number],
): Promise<void> {
  const look = (): Promise<TouchLook> =>
    readTouchLook(page.session, page.context);
  const [stickX, stickY] = stick;
  await touch(page, [
    [
      { type: 'pointerMove', x: stickX, y: stickY },
      { type: 'pointerDown', button: 0 },
      {
        type: 'pointerMove',
        x: stickX,
        y: stickY - TOUCH_PUSH,
        duration: 100,
      },
    ],
  ]);
  try {
    await sleep(VIEW_SETTLE_DURATION);
    await turnPhone(page.session, page.context, PORTRAIT_VIEWPORT);
    const turned: TouchLook = await expectLook(
      page,
      (seen: TouchLook) => seen.width === PORTRAIT_VIEWPORT.width,
      'the phone turned upright with a finger on the stick',
    );
    expectLaidOut(turned, 'the phone turned upright', PLAY_APART);
    await sleep(VIEW_SETTLE_DURATION);
    const was: FigureView | undefined = findOwn(page, await look());
    await sleep(VIEW_SETTLE_DURATION);
    const is: FigureView | undefined = findOwn(page, await look());
    if (
      was === undefined ||
      is === undefined ||
      Math.hypot(is.x - was.x, is.z - was.z) > STANDING_DRIFT
    ) {
      throw new Error(
        'With the phone turned upright while a finger walks with the ' +
          'stick, the page used by touch goes on moving its player from ' +
          `${JSON.stringify(was)} to ${JSON.stringify(is)}.`,
      );
    }
  } finally {
    await page.session.send('input.releaseActions', {
      context: page.context,
    });
  }
}

/**
 * Checks the touch controls in a page of its own on a phone-sized screen,
 * held upright and on its side, with synthetic touches: that the first
 * touch has the page count as used by touch, show the stick and the
 * action button with its panel folded up, all laid out within the view
 * without overlapping and large enough to tap, without the keys on the
 * buttons of the bag and the help sheet; that the stick walks the player
 * and stops once lifted; that a finger on the scene turns the view while
 * another walks; that two fingers spreading zoom in; that the action
 * button slashes; that the button of the help sheet opens it at the page
 * of touch, whose arrows and cross work by tapping, the bag opens and
 * closes by tapping, and the box of the chat opens with the keyboard on
 * its line, which alone is left the menu of a long press, and closes by
 * tapping, each laid out well, holding the controls while open;
 * and that turning the phone around lays the page out again at once and
 * lets go of a finger held on the stick.  Each layout is saved, if the
 * environment names a directory to.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} url - The address of the client.
 * @returns {Promise<void>} A promise settled once the page has passed.
 * @throws {Error} If the page does not do so.
 */
export async function checkTouch(
  session: BidiSession,
  url: string,
): Promise<void> {
  const created = (await session.send('browsingContext.create', {
    type: 'window',
  })) as { context: string };
  const context: string = created.context;
  // The page is loaded at the size of the other pages, whose foot shows
  // the grass it is checked by, before the phone is held upright.
  await loadClient(session, context, url, 'The page used by touch');
  await setControl(session, context, 'Trailing camera', false);
  await turnPhone(session, context, PORTRAIT_VIEWPORT);
  const state: PageState = await readPageState(session, context);
  const id = Number(/^#(\d+)/.exec(state.panel.Player ?? '')?.[1]);
  const page: TouchPage = { session, context, id };

  await tap(
    page,
    Math.round(PORTRAIT_VIEWPORT.width / 2),
    Math.round(PORTRAIT_VIEWPORT.height / 3),
  );
  for (const [name, viewport] of [
    ['portrait', PORTRAIT_VIEWPORT],
    ['landscape', LANDSCAPE_VIEWPORT],
  ] as const) {
    await checkTouchHeld(page, name, viewport);
  }

  const before: TouchLook = await readTouchLook(session, context);
  const stick: [number, number] = findMiddle(before, 'stick');
  const scene: [number, number] = [
    Math.round(before.width / 2),
    Math.round(before.height / 3),
  ];
  await checkTouchWalk(page, before, stick, scene);
  await checkTouchZoom(page, scene);
  await checkTouchAction(page);
  await checkTouchTurn(page, stick);
  await session.send('browsingContext.close', { context });
}
