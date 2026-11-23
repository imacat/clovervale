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
 * @module scripts/test-browser/movement Checks how the players walk, slash and
 *   are stopped.
 */

import { setTimeout as sleep } from 'node:timers/promises';

import type { PlayerState } from '@clovervale/shared';
import type { FigureView } from '../../packages/client/src/player-figures.ts';

import type { BidiSession } from './bidi.ts';
import {
  ACTION_TIMEOUT,
  NETWORK_DELAY,
  POLL_INTERVAL,
  SAME_POSITION,
  WALK_DISTANCE,
} from './constants.ts';
import {
  PANEL_ACTION_EXPRESSION,
  captureView,
  createSwitchExpression,
  describeFigure,
  evaluateInPage,
  findFigure,
  readPageState,
  sendKey,
  setControl,
  tapKey,
  waitFor,
  watchAction,
} from './page.ts';
import type { PageState } from './page.ts';
import { countChangedPixels } from './png.ts';
import type { Pixels } from './png.ts';

/** How a page shows a walking player, frame after frame. */
interface WalkSample {
  /** The position along the X axis the page shows the player at. */
  readonly drawn: number;
  /** The position along the X axis the latest snapshot tells. */
  readonly told: number;
}

/** How a page shows its own player, against what the server tells. */
interface OwnView {
  /** Where the page draws the player, or `null` if it does not. */
  readonly drawn: FigureView | null;
  /** The player in the latest snapshot, or `null` if it is not there. */
  readonly told: PlayerState | null;
  /** The number of corrections the panel of the page counts. */
  readonly corrections: string;
}

/** The yaw of a player that walks to the left of the first view. */
const LEFTWARD_YAW = -90;
/** The least number of pixels a player changes by walking across a view. */
const MOVED_PIXELS = 3000;

/** How long a walking player is watched frame by frame, in milliseconds. */
const WATCH_DURATION = 1000;
/** The fewest frames a page draws while a walking player is watched. */
const WATCHED_FRAMES = 20;
/** The least fraction of the frames a smooth player is between snapshots. */
const SMOOTH_FRACTION = 0.8;
/** How long a player is walked for behind the delay, in milliseconds. */
const DELAYED_WALK_DURATION = 700;
/** The furthest back the server judges a slash, in milliseconds. */
const COMPENSATION_LIMIT = 1000;

/**
 * How long a player may take to walk from the plaza to the cottage on its
 * left, in milliseconds.
 */
const BLOCKED_TIMEOUT = 20_000;
/**
 * The number of looks in a row that must find a walking player where it
 * was, for it to count as stopped.
 */
const BLOCKED_LOOKS = 6;
/** How long a player is walked along an obstacle, in milliseconds. */
const SLIDE_DURATION = 700;

/**
 * Makes the expression that tells how a page shows a player, against what
 * the latest snapshot tells of it, as JSON.
 *
 * @param {number} id - The identifier of the player.
 * @returns {string} The expression.
 */
function createOwnExpression(id: number): string {
  return `(() => {
    const find = (players) =>
      players.find((player) => player.id === ${String(id)}) ?? null;
    let corrections = '';
    for (const input of document.querySelectorAll('input[aria-labelledby]')) {
      const labelId = input.getAttribute('aria-labelledby');
      if (document.getElementById(labelId)?.textContent === 'Corrections') {
        corrections = input.value;
      }
    }
    return JSON.stringify({
      drawn: find(window.clovervale.describeFigures()),
      told: find(window.clovervale.listLatestPlayers()),
      corrections,
    });
  })()`;
}

/**
 * Makes the expression that waits in a page for the next key to go down,
 * and then for the first frame the page draws with a player moved, and
 * gives how long that took, in milliseconds, or `never`.
 *
 * @param {number} id - The identifier of the player.
 * @returns {string} The expression.
 */
function createResponseExpression(id: number): string {
  return `new Promise((resolve) => {
    const find = () =>
      window.clovervale.describeFigures()
        .find((figure) => figure.id === ${String(id)});
    const start = find();
    const end = performance.now() + ${String(ACTION_TIMEOUT)};
    let pressTime = null;
    window.addEventListener(
      'keydown',
      () => {
        pressTime = performance.now();
      },
      { once: true, capture: true },
    );
    const look = () => {
      const now = performance.now();
      const figure = find();
      if (
        pressTime !== null &&
        (figure?.x !== start?.x || figure?.z !== start?.z)
      ) {
        resolve(String(now - pressTime));
      } else if (now > end) {
        resolve('never');
      } else {
        requestAnimationFrame(look);
      }
    };
    requestAnimationFrame(look);
  })`;
}

/**
 * Makes the expression that watches how a page shows a player, at every
 * frame the page draws for a while, and gives the samples as JSON.
 *
 * @param {number} id - The identifier of the player.
 * @returns {string} The expression.
 */
function createWatchExpression(id: number): string {
  return `new Promise((resolve) => {
    const samples = [];
    const end = performance.now() + ${String(WATCH_DURATION)};
    const findX = (players) =>
      players.find((player) => player.id === ${String(id)})?.x;
    const sample = () => {
      const drawn = findX(window.clovervale.describeFigures());
      const told = findX(window.clovervale.listLatestPlayers());
      if (drawn !== undefined && told !== undefined) {
        samples.push({ drawn, told });
      }
      if (performance.now() < end) {
        requestAnimationFrame(sample);
      } else {
        resolve(JSON.stringify(samples));
      }
    };
    requestAnimationFrame(sample);
  })`;
}

/**
 * Checks that a player walks, in the page of another player, while a key is
 * held down in its own page, and stops when the key is released.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If the other page does not show the player doing so.
 */
export async function checkWalk(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
): Promise<void> {
  const viewBefore: Pixels = await captureView(session, watcher);
  const before: PageState = await readPageState(session, watcher);
  const startX: number = findFigure(before, id)?.x ?? NaN;

  // Both views look the same way, so left is the same for both.
  await sendKey(session, actor, 'keyDown', 'a');
  const isFarLeft = (state: PageState): boolean => {
    const figure: FigureView | undefined = findFigure(state, id);
    return (
      figure !== undefined &&
      figure.x <= startX - WALK_DISTANCE &&
      Math.abs(figure.yaw - LEFTWARD_YAW) < 1 &&
      figure.clip === 'Walk'
    );
  };
  await waitFor(
    () => readPageState(session, watcher),
    isFarLeft,
    ACTION_TIMEOUT,
    (state: PageState) =>
      `With the A key held down in the first page for player ${String(id)}` +
      `, which started at x ${startX.toFixed(2)}, the second page ` +
      `${describeFigure(state, id)}.`,
  );
  const own: PageState = await readPageState(session, actor);
  if (own.panel.Action !== 'Walk') {
    throw new Error(
      'With the A key held down, the panel of the first page tells its ' +
        `player does "${own.panel.Action ?? ''}".`,
    );
  }

  await sendKey(session, actor, 'keyUp', 'a');
  const stopped: PageState = await waitFor(
    () => readPageState(session, watcher),
    (state: PageState) => findFigure(state, id)?.clip === 'Idle',
    ACTION_TIMEOUT,
    (state: PageState) =>
      'With the A key released in the first page, the second page ' +
      `${describeFigure(state, id)}.`,
  );
  await sleep(POLL_INTERVAL * 5);
  const later: PageState = await readPageState(session, watcher);
  if (findFigure(later, id)?.x !== findFigure(stopped, id)?.x) {
    throw new Error(
      'With the A key released in the first page, the second page ' +
        `${describeFigure(later, id)}, still moving.`,
    );
  }

  const viewAfter: Pixels = await captureView(session, watcher);
  const changed: number = countChangedPixels(viewBefore, viewAfter);
  if (changed < MOVED_PIXELS) {
    throw new Error(
      `The second page ${describeFigure(later, id)}, but only ` +
        `${String(changed)} pixels of its view have changed.`,
    );
  }
}

/**
 * Checks how the page of another player shows a player that walks, with the
 * interpolation switched on or off: between the snapshots, moving at about
 * every frame, or exactly as the latest snapshot tells, and in the end
 * where the latest snapshot tells either way.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player.
 * @param {boolean} isSmooth - Whether the interpolation is switched on.
 * @param {string} key - The character of the key that walks the player
 *   along the X axis.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If the other page does not show the player so.
 */
export async function checkMotion(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
  isSmooth: boolean,
  key: string,
): Promise<void> {
  const mode = `With the interpolation switched ${isSmooth ? 'on' : 'off'}`;
  const switched: string = await evaluateInPage(
    session,
    watcher,
    createSwitchExpression('Interpolate', isSmooth),
  );
  if (switched !== String(isSmooth)) {
    throw new Error(
      `${mode} in the second page, its switch tells "${switched}".`,
    );
  }

  await sendKey(session, actor, 'keyDown', key);
  let samples: WalkSample[];
  try {
    await waitFor(
      () => readPageState(session, watcher),
      (state: PageState) => findFigure(state, id)?.clip === 'Walk',
      ACTION_TIMEOUT,
      (state: PageState) =>
        `${mode}, and the ${key.toUpperCase()} key held down in the first ` +
        `page, the second page ${describeFigure(state, id)}.`,
    );
    samples = JSON.parse(
      await evaluateInPage(session, watcher, createWatchExpression(id)),
    ) as WalkSample[];
  } finally {
    await sendKey(session, actor, 'keyUp', key);
  }

  // The first frame may show a snapshot from before the watch began.
  const frames: WalkSample[] = samples.slice(1);
  const told: number[] = samples.map((sample: WalkSample) => sample.told);
  const between: number = frames.filter((sample: WalkSample) =>
    told.every((x: number) => Math.abs(x - sample.drawn) > SAME_POSITION),
  ).length;
  const snapshots: number = new Set<number>(told).size;
  const seen =
    `the second page drew ${String(frames.length)} frames from ` +
    `${String(snapshots)} snapshots, with the player between two ` +
    `snapshots in ${String(between)} of them`;
  if (frames.length < WATCHED_FRAMES || snapshots < 2) {
    throw new Error(`${mode}, ${seen}, which is too few to tell.`);
  }
  if (isSmooth && between < frames.length * SMOOTH_FRACTION) {
    throw new Error(`${mode}, ${seen}, which is not smooth.`);
  }
  if (!isSmooth && between > 0) {
    throw new Error(`${mode}, ${seen}, not as the latest snapshot tells.`);
  }
  const start: number = frames[0]?.drawn ?? NaN;
  const end: number = frames.at(-1)?.drawn ?? NaN;
  const isBackward: boolean = frames.some(
    (sample: WalkSample, index: number) =>
      (sample.drawn - (frames[index - 1]?.drawn ?? start)) * (end - start) <
      0,
  );
  if (isBackward) {
    throw new Error(`${mode}, the second page drew the player going back.`);
  }

  await waitFor(
    () => readPageState(session, watcher),
    (state: PageState) => findFigure(state, id)?.clip === 'Idle',
    ACTION_TIMEOUT,
    (state: PageState) =>
      `${mode}, and the key released in the first page, the second page ` +
      `${describeFigure(state, id)}.`,
  );
  const rest: WalkSample | undefined = (
    JSON.parse(
      await evaluateInPage(session, watcher, createWatchExpression(id)),
    ) as WalkSample[]
  ).at(-1);
  if (rest === undefined || rest.drawn !== rest.told) {
    throw new Error(
      `${mode}, the second page shows the player at x ` +
        `${String(rest?.drawn)} in the end, and the latest snapshot tells ` +
        `x ${String(rest?.told)}.`,
    );
  }
}

/**
 * Checks that a player slashes once, in its own page and in the page of
 * another player, when the space bar is pressed in its own page.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If either page does not show the player doing so.
 */
export async function checkSlash(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
): Promise<void> {
  const figureAction =
    '(window.clovervale.describeFigures()' +
    `.find((figure) => figure.id === ${String(id)}) ?? {}).clip`;
  const outcomes: Promise<string[]> = Promise.all([
    watchAction(session, watcher, figureAction),
    watchAction(session, actor, PANEL_ACTION_EXPRESSION),
  ]);
  // A watch that fails must not go unhandled while the keys are sent.
  outcomes.catch(() => undefined);
  await tapKey(session, actor, ' ');
  const [seen = '', told = ''] = await outcomes;
  const problems: Readonly<Record<string, string>> = {
    never: 'never slashing',
    stuck: 'slashing without end',
  };
  if (seen !== 'over') {
    throw new Error(
      'With the space bar pressed in the first page, the second page ' +
        `shows player ${String(id)} ${problems[seen] ?? seen}.`,
    );
  }
  if (told !== 'over') {
    throw new Error(
      'With the space bar pressed in the first page, its panel tells of ' +
        `its player ${problems[told] ?? told}.`,
    );
  }
  const after: PageState = await readPageState(session, watcher);
  if (findFigure(after, id)?.clip !== 'Idle') {
    throw new Error(
      `After the slash, the second page ${describeFigure(after, id)}.`,
    );
  }
}

/**
 * Checks how the server judges a slash of a player behind a slow
 * connection, with the lag compensation switched off and on, as the panel
 * of its page tells: on the world as it is, and on the world as the page
 * showed it, which is at least as far back as the messages to the server
 * are held back, and no further back than the server judges any slash.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player.
 * @returns {Promise<void>} A promise settled once the slashes have passed.
 * @throws {Error} If the panel does not tell so.
 */
export async function checkCompensation(
  session: BidiSession,
  actor: string,
): Promise<void> {
  await setControl(session, actor, 'Net delay (ms)', NETWORK_DELAY);
  for (const isCompensating of [false, true]) {
    const mode =
      `With the lag compensation switched ${isCompensating ? 'on' : 'off'} ` +
      `and its messages held back for ${String(NETWORK_DELAY)} ` +
      'milliseconds each way, the first page';
    await setControl(session, actor, 'Compensate lag', isCompensating);
    await waitFor(
      () => evaluateInPage(session, actor, PANEL_ACTION_EXPRESSION),
      (action: string) => action === 'Idle',
      ACTION_TIMEOUT,
      (action: string) => `${mode} tells its player is "${action}".`,
    );
    const before: PageState = await readPageState(session, actor);
    await tapKey(session, actor, ' ');
    // The page may show the latest snapshot for a while after the delay
    // goes up, until its clock of the server has caught up.
    const least: number = isCompensating ? NETWORK_DELAY : 0;
    const most: number = isCompensating ? COMPENSATION_LIMIT : 0;
    const readBack = (state: PageState): number =>
      Number(/^(\d+) ms$/.exec(state.panel['Judged back'] ?? '')?.[1]);
    await waitFor(
      () => readPageState(session, actor),
      (state: PageState) =>
        state.panel['Judged back'] !== before.panel['Judged back'] &&
        readBack(state) >= least &&
        readBack(state) <= most &&
        state.panel.Result === 'missed',
      ACTION_TIMEOUT,
      (state: PageState) =>
        `${mode} tells its slash was judged ` +
        `"${state.panel['Judged back'] ?? ''}" back, with the result ` +
        `"${state.panel.Result ?? ''}", after "` +
        `${before.panel['Judged back'] ?? ''}" before.`,
    );
  }
  await setControl(session, actor, 'Net delay (ms)', 0);
}

/**
 * Reads how a page shows a player, against what the server tells of it.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<OwnView>} How the page shows the player.
 */
async function readOwnView(
  session: BidiSession,
  context: string,
  id: number,
): Promise<OwnView> {
  return JSON.parse(
    await evaluateInPage(session, context, createOwnExpression(id)),
  ) as OwnView;
}

/**
 * Checks how a page shows its own player behind a slow connection, with the
 * prediction switched on or off: moving at once when a key goes down, or
 * only once the server has answered, and in the end where the server tells,
 * without a correction, in its own page and in the page of another player.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player.
 * @param {boolean} isPredicting - Whether the prediction is switched on.
 * @param {string} key - The character of the key that walks the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If either page does not show the player so.
 */
export async function checkPrediction(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
  isPredicting: boolean,
  key: string,
): Promise<void> {
  const delay = String(NETWORK_DELAY);
  const mode =
    `With the prediction switched ${isPredicting ? 'on' : 'off'} and its ` +
    `messages held back for ${delay} milliseconds each way, the first page`;
  await setControl(session, actor, 'Predict', isPredicting);
  await setControl(session, actor, 'Net delay (ms)', NETWORK_DELAY);
  const before: OwnView = await readOwnView(session, actor, id);
  let response: string;
  try {
    // The page times itself, from the key going down to the frame it draws.
    const watch: Promise<string> = evaluateInPage(
      session,
      actor,
      createResponseExpression(id),
    );
    // A watch that fails must not go unhandled while the key is sent.
    watch.catch(() => undefined);
    await sendKey(session, actor, 'keyDown', key);
    response = await watch;
    await sleep(DELAYED_WALK_DURATION);
  } finally {
    await sendKey(session, actor, 'keyUp', key);
  }
  const elapsed = Number(response);
  const took =
    response === 'never'
      ? 'never drew its player moving'
      : `drew its player moving after ${elapsed.toFixed(0)} milliseconds`;
  if (isPredicting && !(elapsed < NETWORK_DELAY)) {
    throw new Error(`${mode} ${took}, which is not at once.`);
  }
  if (!isPredicting && !(elapsed >= NETWORK_DELAY * 2)) {
    throw new Error(
      `${mode} ${took}, which is not after the server has answered.`,
    );
  }

  const isAt = (view: OwnView, x: number, z: number): boolean =>
    view.drawn?.x === x && view.drawn.z === z;
  const describeView = (view: OwnView): string =>
    `draws its player at x ${String(view.drawn?.x)}, z ` +
    `${String(view.drawn?.z)}, and the server tells x ` +
    `${String(view.told?.x)}, z ${String(view.told?.z)}, doing ` +
    `"${view.told?.action ?? ''}"`;
  const own: OwnView = await waitFor(
    () => readOwnView(session, actor, id),
    (view: OwnView) =>
      view.told?.action === 'Idle' &&
      view.told.x !== before.told?.x &&
      isAt(view, view.told.x, view.told.z),
    ACTION_TIMEOUT,
    (view: OwnView) => `${mode} ${describeView(view)}, with the key released.`,
  );
  await sleep(POLL_INTERVAL * 5 + NETWORK_DELAY * 2);
  const later: OwnView = await readOwnView(session, actor, id);
  if (!isAt(later, own.told?.x ?? NaN, own.told?.z ?? NaN)) {
    throw new Error(`${mode} ${describeView(later)}, still moving.`);
  }
  if (later.corrections !== before.corrections) {
    throw new Error(
      `${mode} counts "${later.corrections}" corrections, after ` +
        `"${before.corrections}" before its player walked.`,
    );
  }
  await waitFor(
    () => readOwnView(session, watcher, id),
    (view: OwnView) => isAt(view, own.told?.x ?? NaN, own.told?.z ?? NaN),
    ACTION_TIMEOUT,
    (view: OwnView) =>
      `${mode} ${describeView(later)}, and the second page ` +
      `${describeView(view)}.`,
  );
  await setControl(session, actor, 'Net delay (ms)', 0);
  await setControl(session, actor, 'Predict', true);
}

/**
 * Checks that a player that walks into an obstacle behind a slow
 * connection, with the outlines of the obstacles drawn, is stopped by it,
 * and slides along it when it walks into it at an angle, and that its own
 * page shows it in the end where the server tells, without a correction,
 * as does the page of another player.
 *
 * The player walks left, which in the first view is toward the cottage
 * on the left of the plaza, whose front faces the plaza.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If either page does not show the player so.
 */
export async function checkObstacle(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
): Promise<void> {
  const mode =
    `With its messages held back for ${String(NETWORK_DELAY)} ` +
    'milliseconds each way, the first page';
  await setControl(session, actor, 'Show obstacles', true);
  await setControl(session, actor, 'Net delay (ms)', NETWORK_DELAY);
  const describeView = (view: OwnView): string =>
    `draws its player at x ${String(view.drawn?.x)}, z ` +
    `${String(view.drawn?.z)}, and the server tells x ` +
    `${String(view.told?.x)}, z ${String(view.told?.z)}, doing ` +
    `"${view.told?.action ?? ''}"`;
  const before: OwnView = await readOwnView(session, actor, id);
  let blocked: OwnView;
  let slid: OwnView;
  try {
    await sendKey(session, actor, 'keyDown', 'a');
    let lastX = NaN;
    let stillLooks = 0;
    blocked = await waitFor(
      () => readOwnView(session, actor, id),
      (view: OwnView) => {
        const isStill =
          view.told?.action === 'Walk' && view.told.x === lastX;
        stillLooks = isStill ? stillLooks + 1 : 0;
        lastX = view.told?.x ?? NaN;
        return stillLooks >= BLOCKED_LOOKS;
      },
      BLOCKED_TIMEOUT,
      (view: OwnView) =>
        `${mode}, with the A key held down, ${describeView(view)}, never ` +
        'stopped by the cottage.',
    );
    if (!((blocked.told?.x ?? NaN) < (before.told?.x ?? NaN))) {
      throw new Error(
        `${mode}, with the A key held down, ${describeView(blocked)}, ` +
          `after x ${String(before.told?.x)} before.`,
      );
    }
    await sendKey(session, actor, 'keyDown', 'w');
    await sleep(SLIDE_DURATION + NETWORK_DELAY * 2);
    slid = await readOwnView(session, actor, id);
  } finally {
    await sendKey(session, actor, 'keyUp', 'w');
    await sendKey(session, actor, 'keyUp', 'a');
  }
  const blockedX: number = blocked.told?.x ?? NaN;
  const blockedZ: number = blocked.told?.z ?? NaN;
  const isAlong: boolean =
    Math.abs((slid.told?.x ?? NaN) - blockedX) < SAME_POSITION &&
    (slid.told?.z ?? NaN) < blockedZ - 0.1;
  if (!isAlong) {
    throw new Error(
      `${mode}, with the W key held down as well against the cottage at ` +
        `x ${String(blockedX)}, z ${String(blockedZ)}, ` +
        `${describeView(slid)}, not sliding along it.`,
    );
  }

  const isAt = (view: OwnView, x: number, z: number): boolean =>
    view.drawn?.x === x && view.drawn.z === z;
  const own: OwnView = await waitFor(
    () => readOwnView(session, actor, id),
    (view: OwnView) =>
      view.told?.action === 'Idle' && isAt(view, view.told.x, view.told.z),
    ACTION_TIMEOUT,
    (view: OwnView) => `${mode} ${describeView(view)}, with the keys released.`,
  );
  await sleep(POLL_INTERVAL * 5 + NETWORK_DELAY * 2);
  const later: OwnView = await readOwnView(session, actor, id);
  if (!isAt(later, own.told?.x ?? NaN, own.told?.z ?? NaN)) {
    throw new Error(`${mode} ${describeView(later)}, still moving.`);
  }
  if (later.corrections !== before.corrections) {
    throw new Error(
      `${mode} counts "${later.corrections}" corrections, after ` +
        `"${before.corrections}" before its player walked into the cottage.`,
    );
  }
  await waitFor(
    () => readOwnView(session, watcher, id),
    (view: OwnView) => isAt(view, own.told?.x ?? NaN, own.told?.z ?? NaN),
    ACTION_TIMEOUT,
    (view: OwnView) =>
      `${mode} ${describeView(later)}, and the second page ` +
      `${describeView(view)}.`,
  );
  await setControl(session, actor, 'Net delay (ms)', 0);
  await setControl(session, actor, 'Show obstacles', false);
}
