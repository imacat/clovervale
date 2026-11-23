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
 * @module scripts/test-browser/camera Checks the camera, and turns, tilts and
 *   zooms it.
 */

import { setTimeout as sleep } from 'node:timers/promises';

import type { GroundVector } from '@clovervale/shared';
import type { FigureView } from '../../packages/client/src/player-figures.ts';

import type { BidiSession } from './bidi.ts';
import {
  ACTION_TIMEOUT,
  CAMERA_SETTLE_DURATION,
  LEFT_ARROW,
  SAME_POSITION,
  STANDING_DRIFT,
  WALK_DISTANCE,
} from './constants.ts';
import { evaluateInPage, readPageState, sendKey, waitFor } from './page.ts';
import type { PageState } from './page.ts';

/** Where a page has its camera. */
interface CameraView {
  /** The player the camera control of the panel has chosen. */
  readonly chosen: string;
  /** The players the camera control of the panel offers. */
  readonly offered: readonly string[];
  /** Where what the camera looks at stands. */
  readonly focus: GroundVector;
  /** The players the page shows. */
  readonly figures: readonly FigureView[];
}

/**
 * How far the camera is to go round its player while the left arrow is
 * held down in the check, in degrees.
 */
const KEY_ORBIT = 30;

/**
 * Makes the expression that chooses a player in the camera control of the
 * panel, if told to, and gives where the page has its camera, as JSON.
 *
 * @param {string | null} choice - The name of the player to choose, or
 *   `null` to choose nothing.
 * @returns {string} The expression.
 */
function createCameraExpression(choice: string | null): string {
  return `(() => {
    let select = null;
    for (const element of document.querySelectorAll('select')) {
      const labelId = element.getAttribute('aria-labelledby');
      if (document.getElementById(labelId)?.textContent === 'Camera on') {
        select = element;
      }
    }
    const offered = [...(select?.options ?? [])].map((option) => option.text);
    const choice = ${JSON.stringify(choice)};
    if (select !== null && choice !== null && offered.includes(choice)) {
      select.selectedIndex = offered.indexOf(choice);
      select.dispatchEvent(new Event('change'));
    }
    return JSON.stringify({
      chosen: select?.selectedOptions[0]?.text ?? 'missing',
      offered,
      focus: window.clovervale.describeCamera(),
      figures: window.clovervale.describeFigures(),
    });
  })()`;
}

/**
 * Reads where a page has its camera, after choosing a player in the camera
 * control of its panel, if told to.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {string | null} [choice] - The name of the player to choose, or
 *   `null` to choose nothing, by default.
 * @returns {Promise<CameraView>} Where the page has its camera.
 */
async function readCameraView(
  session: BidiSession,
  context: string,
  choice: string | null = null,
): Promise<CameraView> {
  return JSON.parse(
    await evaluateInPage(session, context, createCameraExpression(choice)),
  ) as CameraView;
}

/**
 * Tells whether a page has its camera on a player as it shows it.
 *
 * @param {CameraView} view - Where the page has its camera.
 * @param {number} id - The identifier of the player.
 * @returns {boolean} Whether the camera looks at where the player stands.
 */
function isCameraOn(view: CameraView, id: number): boolean {
  const figure: FigureView | undefined = view.figures.find(
    (shown: FigureView) => shown.id === id,
  );
  return (
    figure !== undefined &&
    Math.abs(figure.x - view.focus.x) < SAME_POSITION &&
    Math.abs(figure.z - view.focus.z) < SAME_POSITION
  );
}

/**
 * Describes where a page has its camera, for the error messages.
 *
 * @param {CameraView} view - Where the page has its camera.
 * @returns {string} The description.
 */
function describeCameraView(view: CameraView): string {
  const figures: string = view.figures
    .map(
      (figure: FigureView) =>
        `player ${String(figure.id)} at x ${figure.x.toFixed(2)}, ` +
        `z ${figure.z.toFixed(2)}`,
    )
    .join(', ');
  return (
    `has "${view.chosen}" chosen out of "${view.offered.join('", "')}", ` +
    `looks at x ${view.focus.x.toFixed(2)}, z ${view.focus.z.toFixed(2)}, ` +
    `and shows ${figures === '' ? 'nobody' : figures}`
  );
}

/**
 * Checks that a page has its camera follow the player of another page once
 * the player is chosen in its panel, while the player walks, and that it
 * has the camera on its own player again once the other page has left.
 * The other page is closed.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} watcher - The browsing context of the page whose camera
 *   is checked.
 * @param {number} ownId - The identifier of the player of that page.
 * @param {string} actor - The browsing context of the other page.
 * @param {number} id - The identifier of the player of the other page.
 * @returns {Promise<void>} A promise settled once the camera has passed.
 * @throws {Error} If the camera of the page does not do so.
 */
export async function checkCamera(
  session: BidiSession,
  watcher: string,
  ownId: number,
  actor: string,
  id: number,
): Promise<void> {
  const name = `#${String(id)}`;
  const chosen: CameraView = await readCameraView(session, watcher, name);
  if (chosen.chosen !== name) {
    throw new Error(
      `With player ${String(id)} chosen for its camera, the first page ` +
        `${describeCameraView(chosen)}.`,
    );
  }
  const findX = (view: CameraView): number =>
    view.figures.find((figure: FigureView) => figure.id === id)?.x ?? NaN;
  const startX: number = findX(chosen);
  await sendKey(session, actor, 'keyDown', 'a');
  try {
    await waitFor(
      () => readCameraView(session, watcher),
      (view: CameraView) =>
        isCameraOn(view, id) && findX(view) <= startX - WALK_DISTANCE,
      ACTION_TIMEOUT,
      (view: CameraView) =>
        `With player ${String(id)} chosen for its camera, and walking from ` +
        `x ${startX.toFixed(2)} in the second page, the first page ` +
        `${describeCameraView(view)}.`,
    );
  } finally {
    await sendKey(session, actor, 'keyUp', 'a');
  }

  await session.send('browsingContext.close', { context: actor });
  await waitFor(
    () => readCameraView(session, watcher),
    (view: CameraView) =>
      view.chosen.startsWith('Own player') &&
      !view.offered.includes(name) &&
      isCameraOn(view, ownId),
    ACTION_TIMEOUT,
    (view: CameraView) =>
      `With player ${String(id)} chosen for its camera, and the second page ` +
      `closed, the first page ${describeCameraView(view)}.`,
  );
}

/**
 * Checks that the left arrow held down in a page orbits its camera to the
 * right round its own player, which turns the way the camera looks to the
 * left, without walking the player.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player of the page.
 * @returns {Promise<void>} A promise settled once the camera has passed.
 * @throws {Error} If the page does not turn its camera so, or walks the
 *   player.
 */
export async function checkCameraKeys(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  const readHeading = async (): Promise<number> =>
    Number(
      await evaluateInPage(
        session,
        context,
        'String(window.clovervale.describeHeading())',
      ),
    );
  const findOwn = (view: CameraView): FigureView | undefined =>
    view.figures.find((figure: FigureView) => figure.id === id);
  const before: CameraView = await readCameraView(session, context);
  const start: number = await readHeading();
  // The heading turned from the start, above -180 and up to 180 degrees.
  const findTurn = (heading: number): number => {
    const turn: number = (((heading - start) % 360) + 360) % 360;
    return turn > 180 ? turn - 360 : turn;
  };
  await sendKey(session, context, 'keyDown', LEFT_ARROW);
  try {
    await waitFor(
      readHeading,
      (heading: number) => findTurn(heading) >= KEY_ORBIT,
      ACTION_TIMEOUT,
      (heading: number) =>
        `With the left arrow held down, the first page has its camera ` +
        `look at ${heading.toFixed(1)} degrees, from ${start.toFixed(1)}.`,
    );
  } finally {
    await sendKey(session, context, 'keyUp', LEFT_ARROW);
  }
  const after: CameraView = await readCameraView(session, context);
  const was: FigureView | undefined = findOwn(before);
  const is: FigureView | undefined = findOwn(after);
  if (
    was === undefined ||
    is === undefined ||
    Math.hypot(is.x - was.x, is.z - was.z) > STANDING_DRIFT
  ) {
    throw new Error(
      'With the left arrow held down, the first page ' +
        `${describeCameraView(after)}, after it ` +
        `${describeCameraView(before)}.`,
    );
  }
}

/**
 * Turns the camera of a page around what it looks at, by dragging across
 * the view with the left mouse button, and waits for it to settle.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} share - How far to turn it, as a share of a whole turn,
 *   one way or the other.
 * @returns {Promise<void>} A promise settled once it has settled.
 */
export async function turnCamera(
  session: BidiSession,
  context: string,
  share: number,
): Promise<void> {
  const state: PageState = await readPageState(session, context);
  // A drag across the height of the view turns the camera a whole turn.
  const across: number = Math.round(state.height * share);
  // The drag runs across the middle of the left part of the view, clear of
  // the panel on the right, whichever way it goes.
  const x: number = Math.round(state.width / 3 - across / 2);
  const y: number = Math.round(state.height / 2);
  await session.send('input.performActions', {
    context,
    actions: [
      {
        type: 'pointer',
        id: 'mouse',
        parameters: { pointerType: 'mouse' },
        actions: [
          { type: 'pointerMove', x, y },
          { type: 'pointerDown', button: 0 },
          { type: 'pointerMove', x: x + across, y, duration: 300 },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ],
  });
  await sleep(CAMERA_SETTLE_DURATION);
}

/**
 * Tilts the camera of a page around what it looks at, by dragging down or
 * up the view with the left mouse button, and waits for it to settle.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} share - How far to drag, as a share of the height of the
 *   view: down, to look down more steeply, above zero, and up below it.
 * @returns {Promise<void>} A promise settled once it has settled.
 */
export async function tiltCamera(
  session: BidiSession,
  context: string,
  share: number,
): Promise<void> {
  const state: PageState = await readPageState(session, context);
  const down: number = Math.round(state.height * share);
  const x: number = Math.round(state.width / 3);
  const y: number = Math.round(state.height / 2 - down / 2);
  await session.send('input.performActions', {
    context,
    actions: [
      {
        type: 'pointer',
        id: 'mouse',
        parameters: { pointerType: 'mouse' },
        actions: [
          { type: 'pointerMove', x, y },
          { type: 'pointerDown', button: 0 },
          { type: 'pointerMove', x, y: y + down, duration: 300 },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ],
  });
  await sleep(CAMERA_SETTLE_DURATION);
}

/**
 * Zooms the camera of a page in or out with the mouse wheel over the view,
 * and waits for it to settle.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} delta - How far to turn the wheel, in pixels: up to zoom
 *   in, below zero, and down to zoom out.
 * @returns {Promise<void>} A promise settled once it has settled.
 */
export async function zoomCamera(
  session: BidiSession,
  context: string,
  delta: number,
): Promise<void> {
  const state: PageState = await readPageState(session, context);
  const x: number = Math.round(state.width / 4);
  const y: number = Math.round(state.height / 2);
  await session.send('input.performActions', {
    context,
    actions: [
      {
        type: 'wheel',
        id: 'wheel',
        actions: [{ type: 'scroll', x, y, deltaX: 0, deltaY: delta }],
      },
    ],
  });
  await sleep(CAMERA_SETTLE_DURATION);
}
