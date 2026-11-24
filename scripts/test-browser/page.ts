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
 * @module scripts/test-browser/page Looks at a page of the client, and acts on
 *   it.
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import type { FigureView } from '../../packages/client/src/player-figures.ts';

import type { BidiSession } from './bidi.ts';
import {
  ACTION_TIMEOUT,
  PAGE_TIMEOUT,
  POLL_INTERVAL,
  SCREENSHOT_DIR,
} from './constants.ts';
import { decodePng, measureGrassFraction } from './png.ts';
import type { Pixels } from './png.ts';

/** What a page tells at one moment. */
export interface PageState {
  /** The width of the view, in CSS pixels. */
  readonly width: number;
  /** The height of the view, in CSS pixels. */
  readonly height: number;
  /** The values the panel of the client displays, by their names. */
  readonly panel: Readonly<Record<string, string>>;
  /** The players the client shows. */
  readonly figures: readonly FigureView[];
}

/** An action the open menu of an item in the bag lists. */
export interface MenuActionView {
  /** The name of the action. */
  readonly label: string;
  /** Whether it can be chosen. */
  readonly isEnabled: boolean;
}

/** A page as it is at one moment: what it tells, and what it draws. */
interface PageLook extends PageState {
  /** The fraction of the foot of the view that is lit grass, from 0 to 1. */
  readonly grassFraction: number;
}

/** The name of a villager and what it says, as a bubble shows them. */
export interface SpeechWordsView {
  /** The name of the villager. */
  readonly name: string;
  /** What it says. */
  readonly line: string;
}

/** How the bag of a page shows the silver coins of its player. */
export interface SilverView {
  /** The number the bag shows beside its coin. */
  readonly count: string;
  /** What the coins are called for the screen readers. */
  readonly label: string;
  /** Whether the coin is drawn. */
  readonly isCoinDrawn: boolean;
  /** Whether the coins are within the bag window and on the screen. */
  readonly isInWindow: boolean;
}

/** The least fraction of the foot of the view that is grass when drawn. */
const DRAWN_FRACTION = 0.1;
/** The model status of a client that has shown the models it could. */
const MODELS_SHOWN_PATTERN = /^\d+ shown/;
/**
 * The expression that tells how the bag of a page shows the silver coins
 * of its player, as a {@link SilverView} or `null`, without making JSON of
 * it, for the expressions that tell more to take it in.
 */
export const SILVER_EXPRESSION = `(() => {
  const silver = document.querySelector('.bag-silver');
  const frame = document.querySelector('.bag-window');
  if (silver === null || frame === null) {
    return null;
  }
  const box = silver.getBoundingClientRect();
  const around = frame.getBoundingClientRect();
  return {
    count: silver.querySelector('.bag-silver-count')?.textContent ?? '',
    label: silver.getAttribute('aria-label') ?? '',
    isCoinDrawn: silver.querySelector('svg .bag-coin-face') !== null,
    isInWindow:
      !frame.hidden &&
      box.width > 0 &&
      box.left >= around.left &&
      box.right <= around.right &&
      box.top >= around.top &&
      box.bottom <= around.bottom &&
      box.left >= 0 &&
      box.top >= 0 &&
      box.right <= globalThis.innerWidth &&
      box.bottom <= globalThis.innerHeight,
  };
})()`;

/** Reads the size of the view and what the client tells of itself. */
const PAGE_EXPRESSION = `(() => {
  const panel = {};
  for (const input of document.querySelectorAll('input[aria-labelledby]')) {
    const labelId = input.getAttribute('aria-labelledby');
    const label = document.getElementById(labelId)?.textContent;
    if (label) {
      panel[label] = input.value;
    }
  }
  return JSON.stringify({
    width: window.innerWidth,
    height: window.innerHeight,
    panel,
    figures: window.clovervale?.describeFigures() ?? [],
  });
})()`;

/** Reads the action the panel of the client displays. */
export const PANEL_ACTION_EXPRESSION = `(() => {
  for (const input of document.querySelectorAll('input[aria-labelledby]')) {
    const labelId = input.getAttribute('aria-labelledby');
    if (document.getElementById(labelId)?.textContent === 'Action') {
      return input.value;
    }
  }
  return '';
})()`;

/**
 * Makes the expression that types a value into a number field of the
 * panel, and gives what the field holds afterward.
 *
 * @param {string} name - The name of the field.
 * @param {number | string} value - The value, as a number, or as the
 *   field shows it.
 * @returns {string} The expression.
 */
function createNumberExpression(
  name: string,
  value: number | string,
): string {
  return `(() => {
    for (const input of document.querySelectorAll('input[aria-labelledby]')) {
      const labelId = input.getAttribute('aria-labelledby');
      if (
        input.type !== 'checkbox' &&
        document.getElementById(labelId)?.textContent === '${name}'
      ) {
        input.focus();
        input.value = '${String(value)}';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.blur();
        return input.value;
      }
    }
    return 'missing';
  })()`;
}

/**
 * Evaluates an expression in a page.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {string} expression - The expression, which gives a string or a
 *   promise of one.
 * @returns {Promise<string>} The string.
 * @throws {Error} If the expression gives anything else.
 */
export async function evaluateInPage(
  session: BidiSession,
  context: string,
  expression: string,
): Promise<string> {
  const evaluated = (await session.send('script.evaluate', {
    expression,
    target: { context },
    awaitPromise: true,
  })) as { result?: { value?: unknown } };
  if (typeof evaluated.result?.value !== 'string') {
    throw new TypeError('The page could not be inspected.');
  }
  return evaluated.result.value;
}

/**
 * Reads what a page tells now.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<PageState>} What the page tells.
 */
export async function readPageState(
  session: BidiSession,
  context: string,
): Promise<PageState> {
  const value: string = await evaluateInPage(session, context, PAGE_EXPRESSION);
  return JSON.parse(value) as PageState;
}

/**
 * Captures what a page draws now.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {object} [clip] - The part of the view to capture, or the whole
 *   view by default.
 * @returns {Promise<Pixels>} The pixels of the view.
 */
export async function captureView(
  session: BidiSession,
  context: string,
  clip?: object,
): Promise<Pixels> {
  const screenshot = (await session.send(
    'browsingContext.captureScreenshot',
    clip === undefined ? { context } : { context, clip },
  )) as { data: string };
  return decodePng(Buffer.from(screenshot.data, 'base64'));
}

/**
 * Captures the foot of the view of a page, which holds the ground, clear of
 * the settings panel.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {PageState} state - What the page tells.
 * @returns {Promise<Pixels>} The pixels of the foot of the view.
 */
export function captureGround(
  session: BidiSession,
  context: string,
  state: PageState,
): Promise<Pixels> {
  return captureView(session, context, {
    type: 'box',
    x: 0,
    y: state.height / 2,
    width: state.width,
    height: state.height / 2,
  });
}

/**
 * Looks at what a page tells and draws now.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<PageLook>} The page as it is.
 */
async function lookAtPage(
  session: BidiSession,
  context: string,
): Promise<PageLook> {
  const state: PageState = await readPageState(session, context);
  const view: Pixels = await captureGround(session, context, state);
  return { ...state, grassFraction: measureGrassFraction(view) };
}

/**
 * Looks at something again and again until it is as awaited.
 *
 * @param {() => Promise<T>} look - Looks at it.
 * @param {(seen: T) => boolean} isAwaited - Tells whether it is as awaited.
 * @param {number} timeout - How long to wait at most, in milliseconds.
 * @param {(seen: T) => string} describeProblem - Tells what is wrong with
 *   what was last seen, for the error message.
 * @returns {Promise<T>} What was seen when it was as awaited.
 * @throws {Error} If it is not as awaited in time.
 */
export async function waitFor<T>(
  look: () => Promise<T>,
  isAwaited: (seen: T) => boolean,
  timeout: number,
  describeProblem: (seen: T) => string,
): Promise<T> {
  const deadline: number = Date.now() + timeout;
  let seen: T = await look();
  while (!isAwaited(seen) && Date.now() < deadline) {
    await sleep(POLL_INTERVAL);
    seen = await look();
  }
  if (!isAwaited(seen)) {
    const seconds = String(timeout / 1000);
    throw new Error(
      `${describeProblem(seen)}\nThat was after ${seconds} seconds.`,
    );
  }
  return seen;
}

/**
 * Loads the client in a page, and waits until it draws its scene, shows the
 * models it has, and connects to the server.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {string} url - The address of the client.
 * @param {string} name - The name of the page, for the error messages.
 * @returns {Promise<void>} A promise settled once the client has done so.
 * @throws {Error} If the client does not do so in time.
 */
export async function loadClient(
  session: BidiSession,
  context: string,
  url: string,
  name: string,
): Promise<void> {
  await session.send('browsingContext.navigate', { context, url });
  const isConnected = (look: PageLook): boolean =>
    (look.panel.Server ?? '').startsWith('connected');
  const isShown = (look: PageLook): boolean =>
    MODELS_SHOWN_PATTERN.test(look.panel.Models ?? '');
  const isDrawn = (look: PageLook): boolean =>
    look.grassFraction >= DRAWN_FRACTION;
  await waitFor(
    () => lookAtPage(session, context),
    (look: PageLook) => isConnected(look) && isShown(look) && isDrawn(look),
    PAGE_TIMEOUT,
    (look: PageLook) => {
      const problems: string[] = [];
      if (!isConnected(look)) {
        problems.push(
          `${name} did not connect to the server: its server status is ` +
            `"${look.panel.Server ?? ''}".`,
        );
      }
      if (!isShown(look)) {
        problems.push(
          `${name} did not finish showing its models: its model status is ` +
            `"${look.panel.Models ?? ''}".`,
        );
      }
      if (!isDrawn(look)) {
        const percentage: string = (look.grassFraction * 100).toFixed(1);
        problems.push(
          `${name} did not draw its scene: only ${percentage}% of the ` +
            'foot of the view is lit grass.',
        );
      }
      return problems.join('\n');
    },
  );
}

/**
 * Finds a player among those a page shows.
 *
 * @param {PageState} state - What the page tells.
 * @param {number} id - The identifier of the player.
 * @returns {FigureView | undefined} The player, if the page shows it.
 */
export function findFigure(
  state: PageState,
  id: number,
): FigureView | undefined {
  return state.figures.find((figure: FigureView) => figure.id === id);
}

/**
 * Describes how a page shows a player, for the error messages.
 *
 * @param {PageState} state - What the page tells.
 * @param {number} id - The identifier of the player.
 * @returns {string} The description.
 */
export function describeFigure(state: PageState, id: number): string {
  const figure: FigureView | undefined = findFigure(state, id);
  if (figure === undefined) {
    return `does not show player ${String(id)}`;
  }
  return (
    `shows player ${String(id)} at x ${figure.x.toFixed(2)}, ` +
    `z ${figure.z.toFixed(2)}, with a yaw of ${figure.yaw.toFixed(1)}, ` +
    `playing ${figure.clip ?? 'nothing'}`
  );
}

/**
 * Waits in a page until an action it tells of becomes `Slash`, or another
 * action if told, and then something else again.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {string} actionExpression - The expression that reads the action
 *   in the page.
 * @param {string} [action] - The action to wait for, `Slash` by default.
 * @returns {Promise<string>} `over` once the action has come and gone,
 *   `never` if it did not come in time, or `stuck` if it did not go.
 */
export function watchAction(
  session: BidiSession,
  context: string,
  actionExpression: string,
  action = 'Slash',
): Promise<string> {
  // The page watches by itself, as an action is too short to be sure to
  // catch by looking in from the outside.
  const expression = `new Promise((resolve) => {
    let outcome = 'never';
    const stop = (result) => {
      clearInterval(interval);
      clearTimeout(timer);
      resolve(result);
    };
    const interval = setInterval(() => {
      const isActing = ${actionExpression} === ${JSON.stringify(action)};
      if (isActing) {
        outcome = 'stuck';
      } else if (outcome === 'stuck') {
        stop('over');
      }
    }, 10);
    const timer = setTimeout(() => stop(outcome), ${String(ACTION_TIMEOUT)});
  })`;
  return evaluateInPage(session, context, expression);
}

/**
 * Presses or releases a key in a page.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {'keyDown' | 'keyUp'} type - Whether to press or to release.
 * @param {string} value - The character of the key.
 * @returns {Promise<void>} A promise settled once the page has the event.
 */
export async function sendKey(
  session: BidiSession,
  context: string,
  type: 'keyDown' | 'keyUp',
  value: string,
): Promise<void> {
  await session.send('input.performActions', {
    context,
    actions: [{ type: 'key', id: 'keyboard', actions: [{ type, value }] }],
  });
}

/**
 * Presses a key once in a page, and releases it straight after.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {string} value - The character of the key.
 * @returns {Promise<void>} A promise settled once the page has both events.
 */
export async function tapKey(
  session: BidiSession,
  context: string,
  value: string,
): Promise<void> {
  await sendKey(session, context, 'keyDown', value);
  await sendKey(session, context, 'keyUp', value);
}

/**
 * Makes the expression that sets a switch of the panel, and gives whether
 * it is set afterward, as `true` or `false`.
 *
 * @param {string} name - The name of the switch.
 * @param {boolean} isEnabled - Whether to switch it on.
 * @returns {string} The expression.
 */
export function createSwitchExpression(
  name: string,
  isEnabled: boolean,
): string {
  return `(() => {
    for (const input of document.querySelectorAll('input[type=checkbox]')) {
      const labelId = input.getAttribute('aria-labelledby');
      if (document.getElementById(labelId)?.textContent === '${name}') {
        if (input.checked !== ${String(isEnabled)}) {
          input.click();
        }
        return String(input.checked);
      }
    }
    return 'missing';
  })()`;
}

/**
 * Sets a control of the panel of a page.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {string} name - The name of the control.
 * @param {boolean | number | string} value - What to set it to, as a
 *   switch, or as typed into a field.
 * @returns {Promise<void>} A promise settled once the control is set.
 * @throws {Error} If the control does not take the value.
 */
export async function setControl(
  session: BidiSession,
  context: string,
  name: string,
  value: boolean | number | string,
): Promise<void> {
  const expression: string =
    typeof value === 'boolean'
      ? createSwitchExpression(name, value)
      : createNumberExpression(name, value);
  const set: string = await evaluateInPage(session, context, expression);
  if (set !== String(value)) {
    throw new Error(
      `Set to ${String(value)}, the "${name}" control of the panel tells ` +
        `"${set}".`,
    );
  }
}

/**
 * Saves the view of a page as a picture, if the environment names a
 * directory for the views.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {string} name - The file name of the picture.
 * @returns {Promise<void>} A promise settled once it is saved, if it is.
 */
export async function saveView(
  session: BidiSession,
  context: string,
  name: string,
): Promise<void> {
  if (SCREENSHOT_DIR === undefined) {
    return;
  }
  const screenshot = (await session.send('browsingContext.captureScreenshot', {
    context,
  })) as { data: string };
  writeFileSync(
    path.join(SCREENSHOT_DIR, name),
    Buffer.from(screenshot.data, 'base64'),
  );
}

/** A box on the page, in CSS pixels. */
export interface BoxView {
  /** The left edge. */
  readonly left: number;
  /** The top edge. */
  readonly top: number;
  /** The right edge. */
  readonly right: number;
  /** The bottom edge. */
  readonly bottom: number;
}
