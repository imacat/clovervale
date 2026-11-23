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
 * @module scripts/test-browser/fountain Checks the healing at the fountain.
 */

import { setTimeout as sleep } from 'node:timers/promises';

import type { HealEvent, PlayerState } from '@clovervale/shared';

import type { BidiSession } from './bidi.ts';
import {
  ACTION_TIMEOUT,
  FULL_HEALTH,
  LEG_TIMEOUT,
  NETWORK_DELAY,
  POLL_INTERVAL,
  TAP_DURATION,
} from './constants.ts';
import { walkUntil } from './monster.ts';
import type { MonsterLook } from './monster.ts';
import {
  evaluateInPage,
  sendKey,
  setControl,
  tapKey,
  waitFor,
  watchAction,
} from './page.ts';

/** How a page shows a player by the fountain, and the heals. */
interface FountainLook {
  /** The player in the latest snapshot, if it is there. */
  readonly own: PlayerState | null;
  /** How much of the health bar of the player the page fills, if shown. */
  readonly bar: number | null;
  /** The latest heals the page has shown, the latest last. */
  readonly heals: readonly HealEvent[];
  /** The prompt the page shows, or `null` if it shows none. */
  readonly prompt: string | null;
  /** What the panel of the page tells the space bar does. */
  readonly spaceKey: string;
  /** The number of corrections the panel of the page counts. */
  readonly corrections: string;
}

/**
 * The farthest along the X axis from the center of the fountain a player
 * is walked to before it walks forward to the fountain, in meters.  From
 * there, it walks within reach of the fountain, facing it, for over two
 * seconds before it slides past the rim.
 */
const FOUNTAIN_X = 0.3;
/** What the panel tells the space bar does by the fountain, facing it. */
const DRINK_KEY = 'drink from the fountain';
/** What the panel tells the space bar does by the fountain, facing away. */
const SLASH_KEY = 'slash';
/** The prompt a page shows by the fountain, facing it. */
const DRINK_PROMPT = 'Press Space to drink from the fountain';

/**
 * Makes the expression that tells how a page shows a player and the heals
 * it has shown, and what it tells the space bar does, as JSON.
 *
 * @param {number} id - The identifier of the player.
 * @returns {string} The expression.
 */
function createFountainExpression(id: number): string {
  return `(() => {
    const find = (players) =>
      players.find((player) => player.id === ${String(id)}) ?? null;
    const panel = {};
    for (const input of document.querySelectorAll('input[aria-labelledby]')) {
      const labelId = input.getAttribute('aria-labelledby');
      const label = document.getElementById(labelId)?.textContent;
      if (label) {
        panel[label] = input.value;
      }
    }
    const prompt = document.querySelector('.interaction-prompt');
    return JSON.stringify({
      own: find(window.clovervale.listLatestPlayers()),
      bar: find(window.clovervale.describeFigures())?.health ?? null,
      heals: window.clovervale.listShownHeals(),
      prompt: prompt === null || prompt.hidden ? null : prompt.textContent,
      spaceKey: panel['Space key'] ?? '',
      corrections: panel.Corrections ?? '',
    });
  })()`;
}

/**
 * Reads how a page shows a player and the heals, and what it tells the
 * space bar does.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<FountainLook>} How the page shows them.
 */
async function readFountainLook(
  session: BidiSession,
  context: string,
  id: number,
): Promise<FountainLook> {
  return JSON.parse(
    await evaluateInPage(session, context, createFountainExpression(id)),
  ) as FountainLook;
}

/**
 * Describes how a page shows a player and the heals, and what it tells
 * the space bar does, for the error messages.
 *
 * @param {FountainLook} look - How the page shows them.
 * @returns {string} The description.
 */
function describeFountainLook(look: FountainLook): string {
  const { own } = look;
  const player: string =
    own === null
      ? 'without the player'
      : `with the player at x ${own.x.toFixed(2)}, z ${own.z.toFixed(2)}, ` +
        `doing "${own.action}", health ${String(own.health)}, its bar ` +
        `${String(look.bar)} full`;
  const prompt: string =
    look.prompt === null ? 'no prompt' : `the prompt "${look.prompt}"`;
  return (
    `${player}, the space bar to "${look.spaceKey}", ${prompt}, ` +
    `${String(look.heals.length)} heals shown, and "${look.corrections}" ` +
    'corrections'
  );
}

/**
 * Sums up the health a page has shown a player get back.
 *
 * @param {FountainLook} look - How the page shows the heals.
 * @param {number} id - The identifier of the player.
 * @returns {number} The health.
 */
function sumHealing(look: FountainLook, id: number): number {
  return look.heals
    .filter(
      (heal: HealEvent) =>
        heal.target.kind === 'player' && heal.target.id === id,
    )
    .reduce((total: number, heal: HealEvent) => total + heal.amount, 0);
}

/**
 * Checks that a hurt player that drinks from the fountain behind a slow
 * connection gets health back in its own page and in the page of another
 * player, which shows it drinking, and that each page shows the heal once,
 * for as much as the health went up.  Its own page prompts it to drink by
 * the fountain, and slashes instead once it faces away, without a
 * correction for either.
 *
 * The player walks left in the first view to the middle of the plaza, and
 * forward to the fountain until its page tells the space bar has it drink.
 * It turns away from the fountain with a tap of a key.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If either page does not show the player so.
 */
export async function checkFountain(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
): Promise<void> {
  const look = (context: string) => (): Promise<FountainLook> =>
    readFountainLook(session, context, id);
  await walkUntil(
    session,
    actor,
    id,
    'a',
    (seen: MonsterLook) => (seen.own?.x ?? Infinity) <= FOUNTAIN_X,
    'to the middle of the plaza',
  );
  await sendKey(session, actor, 'keyDown', 'w');
  try {
    await waitFor(
      look(actor),
      (seen: FountainLook) => seen.spaceKey === DRINK_KEY,
      LEG_TIMEOUT,
      (seen: FountainLook) =>
        'With the W key held down to walk to the fountain, the first page ' +
        `tells ${describeFountainLook(seen)}.`,
    );
  } finally {
    await sendKey(session, actor, 'keyUp', 'w');
  }

  const mode =
    `With its messages held back for ${String(NETWORK_DELAY)} ` +
    'milliseconds each way, the first page';
  await setControl(session, actor, 'Net delay (ms)', NETWORK_DELAY);
  const readBoth = (): Promise<[FountainLook, FountainLook]> =>
    Promise.all([look(actor)(), look(watcher)()]);
  const describeBoth = ([own, other]: [FountainLook, FountainLook]): string =>
    `${mode} tells ${describeFountainLook(own)}, and the second page ` +
    describeFountainLook(other);
  const isResting = ([own, other]: [FountainLook, FountainLook]): boolean =>
    own.own?.action === 'Idle' &&
    other.own?.action === 'Idle' &&
    own.own.x === other.own.x &&
    own.own.z === other.own.z;
  const before: [FountainLook, FountainLook] = await waitFor(
    readBoth,
    isResting,
    ACTION_TIMEOUT,
    (looks: [FountainLook, FountainLook]) =>
      `By the fountain, ${describeBoth(looks)}.`,
  );
  const [ownBefore] = before;
  if (ownBefore.prompt !== DRINK_PROMPT) {
    throw new Error(`By the fountain, ${describeBoth(before)}.`);
  }
  if (!((ownBefore.own?.health ?? FULL_HEALTH) < FULL_HEALTH)) {
    throw new Error(
      `By the fountain, ${describeBoth(before)}, the player not hurt.`,
    );
  }

  const toldAction =
    '(window.clovervale.listLatestPlayers()' +
    `.find((player) => player.id === ${String(id)}) ?? {}).action`;
  const drinking: Promise<string> = watchAction(
    session,
    watcher,
    toldAction,
    'Drink',
  );
  // A watch that fails must not go unhandled while the keys are sent.
  drinking.catch(() => undefined);
  await tapKey(session, actor, ' ');
  const seen: string = await drinking;
  if (seen !== 'over') {
    const problem: string =
      seen === 'never' ? 'never drinking' : 'drinking without end';
    throw new Error(
      'With the space bar pressed by the fountain in the first page, the ' +
        `second page shows player ${String(id)} ${problem}.`,
    );
  }
  const isHealed = (after: FountainLook, earlier: FountainLook): boolean => {
    const gained: number =
      (after.own?.health ?? NaN) - (earlier.own?.health ?? NaN);
    return (
      gained > 0 &&
      (after.bar ?? 0) > (earlier.bar ?? 1) &&
      sumHealing(after, id) - sumHealing(earlier, id) === gained
    );
  };
  const isAllHealed = ([own, other]: [FountainLook, FountainLook]): boolean =>
    isHealed(own, before[0]) && isHealed(other, before[1]);
  await waitFor(
    readBoth,
    isAllHealed,
    ACTION_TIMEOUT,
    (looks: [FountainLook, FountainLook]) =>
      `With its player drinking from the fountain, ${describeBoth(looks)}, ` +
      `after a health of ${String(ownBefore.own?.health)} before.`,
  );

  await sendKey(session, actor, 'keyDown', 's');
  try {
    await sleep(TAP_DURATION);
  } finally {
    await sendKey(session, actor, 'keyUp', 's');
  }
  const turned: [FountainLook, FountainLook] = await waitFor(
    readBoth,
    (looks: [FountainLook, FountainLook]) =>
      isResting(looks) && looks[0].own?.z !== ownBefore.own?.z,
    ACTION_TIMEOUT,
    (looks: [FountainLook, FountainLook]) =>
      `With its player turned away from the fountain, ${describeBoth(looks)}.`,
  );
  if (turned[0].spaceKey !== SLASH_KEY || turned[0].prompt !== null) {
    throw new Error(
      `With its player turned away from the fountain, ` +
        `${describeBoth(turned)}.`,
    );
  }
  const figureAction =
    '(window.clovervale.describeFigures()' +
    `.find((figure) => figure.id === ${String(id)}) ?? {}).clip`;
  const slashing: Promise<string> = watchAction(session, watcher, figureAction);
  slashing.catch(() => undefined);
  await tapKey(session, actor, ' ');
  const slashed: string = await slashing;
  if (slashed !== 'over') {
    throw new Error(
      'With the space bar pressed by the fountain, facing away from it, in ' +
        `the first page, the second page shows player ${String(id)} ` +
        `slashing "${slashed}".`,
    );
  }

  await sleep(POLL_INTERVAL * 5 + NETWORK_DELAY * 2);
  const after: [FountainLook, FountainLook] = await readBoth();
  if (after[0].corrections !== ownBefore.corrections) {
    throw new Error(
      `After its player drank and slashed by the fountain, ` +
        `${describeBoth(after)}, after "${ownBefore.corrections}" ` +
        'corrections before.',
    );
  }
  for (const [index, name] of ['The first page', 'The second page'].entries()) {
    const ids: number[] = (after[index]?.heals ?? []).map(
      (heal: HealEvent) => heal.id,
    );
    if (new Set(ids).size !== ids.length) {
      throw new Error(
        `${name} has shown heals more than once: ${JSON.stringify(ids)}.`,
      );
    }
  }
  await setControl(session, actor, 'Net delay (ms)', 0);
}
