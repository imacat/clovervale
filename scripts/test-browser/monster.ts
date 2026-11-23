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
 * @module scripts/test-browser/monster Checks the fight with the monster.
 */

import { setTimeout as sleep } from 'node:timers/promises';

import type { HitEvent, MonsterState, PlayerState } from '@clovervale/shared';

import type { BidiSession } from './bidi.ts';
import {
  ACTION_TIMEOUT,
  FULL_HEALTH,
  LEG_TIMEOUT,
  MONSTER_TIMEOUT,
  ROUTE_LEAST_Z,
  ROUTE_MOST_Z,
  TAP_DURATION,
  TURN_KEYS,
  YAW_TOLERANCE,
} from './constants.ts';
import { evaluateInPage, sendKey, waitFor } from './page.ts';

/** How a page shows the monster and its own player, and the hits. */
export interface MonsterLook {
  /** The player of the page in the latest snapshot, if it is there. */
  readonly own: PlayerState | null;
  /** The monster in the latest snapshot, if it is there. */
  readonly monster: MonsterState | null;
  /** How much of the health bar of the monster the page fills, if shown. */
  readonly bar: number | null;
  /** The latest hits the page has shown, the latest last. */
  readonly hits: readonly HitEvent[];
}

/**
 * How far along the X axis the player walks towards the spawn stones, in
 * metres.  Anywhere along the stretch from there to the far side of the
 * stones, the player is less than 1.8 metres from the home of the monster,
 * which never wanders more than 3 metres from its home, so the player is
 * within the 5 metres the monster notices a player from, wherever the
 * monster is.
 */
const APPROACH_X = 9.7;
/**
 * How near the monster must come before the player slashes it, from
 * centre to centre, in metres, which is within the reach of a slash.
 */
const MONSTER_NEARNESS = 1.3;
/** How long a slash may take to show as a hit, in milliseconds. */
const HIT_TIMEOUT = 2000;

/**
 * Makes the expression that tells how a page shows the monster and a
 * player, and the hits it has shown, as JSON.
 *
 * @param {number} id - The identifier of the player.
 * @returns {string} The expression.
 */
function createMonsterExpression(id: number): string {
  return `(() => {
    const own = window.clovervale.listLatestPlayers()
      .find((player) => player.id === ${String(id)}) ?? null;
    return JSON.stringify({
      own,
      monster: window.clovervale.listLatestMonsters()[0] ?? null,
      bar: window.clovervale.describeMonsters()[0]?.health ?? null,
      hits: window.clovervale.listShownHits(),
    });
  })()`;
}

/**
 * Reads how a page shows the monster and a player, and the hits.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<MonsterLook>} How the page shows them.
 */
async function readMonsterLook(
  session: BidiSession,
  context: string,
  id: number,
): Promise<MonsterLook> {
  return JSON.parse(
    await evaluateInPage(session, context, createMonsterExpression(id)),
  ) as MonsterLook;
}

/**
 * Describes how a page shows the monster and a player, for the error
 * messages.
 *
 * @param {MonsterLook} look - How the page shows them.
 * @returns {string} The description.
 */
function describeMonsterLook(look: MonsterLook): string {
  const { own, monster } = look;
  const player: string =
    own === null
      ? 'without the player'
      : `with the player at x ${own.x.toFixed(2)}, z ${own.z.toFixed(2)}, ` +
        `health ${String(own.health)}`;
  const shown: string =
    monster === null
      ? 'without the monster'
      : `with the monster ${monster.mode} at x ${monster.x.toFixed(2)}, z ` +
        `${monster.z.toFixed(2)}, health ${String(monster.health)}`;
  return `${player}, ${shown}, and ${String(look.hits.length)} hits shown`;
}

/**
 * Walks the player of a page one way, with keys held down, until it gets
 * where a test tells.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @param {string} key - The character of the key that walks it that way.
 * @param {(look: MonsterLook) => boolean} isThere - Tells whether it has
 *   got there.
 * @param {string} where - Where it is to get, for the error messages.
 * @returns {Promise<void>} A promise settled once it has got there.
 * @throws {Error} If it does not get there in time.
 */
export async function walkUntil(
  session: BidiSession,
  context: string,
  id: number,
  key: string,
  isThere: (look: MonsterLook) => boolean,
  where: string,
): Promise<void> {
  const look = (): Promise<MonsterLook> =>
    readMonsterLook(session, context, id);
  if (isThere(await look())) {
    return;
  }
  await sendKey(session, context, 'keyDown', key);
  try {
    await waitFor(look, isThere, LEG_TIMEOUT, (seen: MonsterLook) =>
      `With the ${key.toUpperCase()} key held down to walk ${where}, the ` +
      `first page tells ${describeMonsterLook(seen)}.`,
    );
  } finally {
    await sendKey(session, context, 'keyUp', key);
  }
}

/**
 * Steps the player of a page along the Z axis, a tap of a key at a time,
 * until it stands within a stretch.  It waits until the page tells that
 * the player idles before the first tap, and that it has moved and idles
 * again after every tap.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @param {number} least - The least position along the Z axis of the
 *   stretch, in metres.
 * @param {number} most - The greatest position along the Z axis of the
 *   stretch, in metres.
 * @param {string} where - Where the player is stepped, for the error
 *   messages.
 * @returns {Promise<void>} A promise settled once it stands there.
 * @throws {Error} If it does not get there in time.
 */
export async function stepWithin(
  session: BidiSession,
  context: string,
  id: number,
  least: number,
  most: number,
  where: string,
): Promise<void> {
  const look = (): Promise<MonsterLook> =>
    readMonsterLook(session, context, id);
  const describeProblem = (seen: MonsterLook): string =>
    `Stepping its player ${where} to z ${String(least)} to ` +
    `${String(most)}, the first page tells ${describeMonsterLook(seen)}.`;
  const deadline: number = Date.now() + LEG_TIMEOUT;
  let seen: MonsterLook = await waitFor(
    look,
    (shown: MonsterLook) => shown.own?.action === 'Idle',
    ACTION_TIMEOUT,
    describeProblem,
  );
  for (;;) {
    const z: number = seen.own?.z ?? NaN;
    if (z >= least && z <= most) {
      return;
    }
    if (Number.isNaN(z) || Date.now() > deadline) {
      throw new Error(describeProblem(seen));
    }
    const key: string = z < least ? 's' : 'w';
    await sendKey(session, context, 'keyDown', key);
    try {
      await sleep(TAP_DURATION);
    } finally {
      await sendKey(session, context, 'keyUp', key);
    }
    seen = await waitFor(
      look,
      (shown: MonsterLook) =>
        shown.own?.action === 'Idle' && shown.own.z !== z,
      ACTION_TIMEOUT,
      describeProblem,
    );
  }
}

/**
 * Sums up the damage of the hits a page has shown on the monster.
 *
 * @param {MonsterLook} look - How the page shows the hits.
 * @returns {number} The damage.
 */
function sumMonsterDamage(look: MonsterLook): number {
  return look.hits
    .filter((hit: HitEvent) => hit.target.kind === 'monster')
    .reduce((total: number, hit: HitEvent) => total + hit.damage, 0);
}

/**
 * Checks that a page has shown no hit twice.
 *
 * @param {MonsterLook} look - How the page shows the hits.
 * @param {string} name - The name of the page, for the error messages.
 * @throws {Error} If it has.
 */
function checkHitsOnce(look: MonsterLook, name: string): void {
  const ids: number[] = look.hits.map((hit: HitEvent) => hit.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(
      `${name} has shown hits more than once: ${JSON.stringify(ids)}.`,
    );
  }
}

/**
 * Checks that a player that walks to the monster and slashes it once it
 * has come to the player lowers its health in its own page and in the
 * page of another player, and that each page shows the hit once, for as
 * much as the health went down.  The player walks away from the monster
 * as soon as both pages tell that its health went down and the monster
 * has hurt the player, before the hits are checked, so that the monster
 * has little time to hurt it more.
 *
 * The player walks right in the first view to the path, back along the
 * path to a stretch where its way is clear to the spawn stones of the
 * monster, and right again between the stones until the monster notices
 * it, which it does by then wherever it has wandered.  It slashes as it
 * walks towards the monster, which leaves it facing that way, as a
 * slashing player does not turn.  It walks away along the same stretch.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If either page does not show the hit so.
 */
export async function checkMonster(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
): Promise<void> {
  await walkUntil(
    session,
    actor,
    id,
    'd',
    (look: MonsterLook) => (look.own?.x ?? -Infinity) >= -0.8,
    'to the path',
  );
  await walkUntil(
    session,
    actor,
    id,
    's',
    (look: MonsterLook) => (look.own?.z ?? -Infinity) >= ROUTE_LEAST_Z,
    'along the path',
  );
  await stepWithin(
    session,
    actor,
    id,
    ROUTE_LEAST_Z,
    ROUTE_MOST_Z,
    'along the path',
  );
  await walkUntil(
    session,
    actor,
    id,
    'd',
    (look: MonsterLook) =>
      look.monster?.mode === 'chase' ||
      (look.own?.x ?? -Infinity) >= APPROACH_X,
    'towards the spawn stones',
  );
  const measure = (look: MonsterLook): number =>
    look.own === null || look.monster === null
      ? Infinity
      : Math.hypot(look.monster.x - look.own.x, look.monster.z - look.own.z);
  // The monster that chases a player stops walking once it is near it.
  await waitFor(
    () => readMonsterLook(session, actor, id),
    (look: MonsterLook) =>
      look.monster?.mode === 'chase' &&
      look.monster.action !== 'Walk' &&
      measure(look) <= MONSTER_NEARNESS,
    MONSTER_TIMEOUT,
    (look: MonsterLook) =>
      `With its player by the spawn stones, the first page tells ` +
      `${describeMonsterLook(look)}, the monster never coming to it.`,
  );

  const readBoth = (): Promise<[MonsterLook, MonsterLook]> =>
    Promise.all([
      readMonsterLook(session, actor, id),
      readMonsterLook(session, watcher, id),
    ]);
  const [ownBefore, otherBefore] = await readBoth();
  const healthBefore: number = ownBefore.monster?.health ?? NaN;
  const isLowered = (look: MonsterLook): boolean =>
    (look.monster?.health ?? Infinity) < healthBefore;
  const dx: number = (ownBefore.monster?.x ?? NaN) - (ownBefore.own?.x ?? NaN);
  const dz: number = (ownBefore.monster?.z ?? NaN) - (ownBefore.own?.z ?? NaN);
  const turn: number = (Math.round((Math.atan2(dx, dz) * 4) / Math.PI) + 8) % 8;
  const keys: readonly string[] = TURN_KEYS[turn] ?? [];
  const isFacing = (look: MonsterLook): boolean =>
    look.own?.action === 'Walk' &&
    Math.abs(((look.own.yaw - turn * 45 + 540) % 360) - 180) <=
      YAW_TOLERANCE;
  // Two keys let go of one after the other would leave the player facing
  // the way of the later one, and a slash that comes into effect with the
  // walk would leave it facing the way it faced before.  A slash started
  // once the server tells the player walks the way of the keys keeps it
  // facing that way, as a slashing player does not turn.
  try {
    for (const key of keys) {
      await sendKey(session, actor, 'keyDown', key);
    }
    await waitFor(
      () => readMonsterLook(session, actor, id),
      isFacing,
      ACTION_TIMEOUT,
      (look: MonsterLook) =>
        `With ${keys.join(' and ').toUpperCase()} held down to walk ` +
        `towards the monster, the first page tells ` +
        `${describeMonsterLook(look)}, facing ${String(look.own?.yaw)} ` +
        'degrees.',
    );
    await sendKey(session, actor, 'keyDown', ' ');
  } finally {
    await sendKey(session, actor, 'keyUp', ' ');
    for (const key of keys) {
      await sendKey(session, actor, 'keyUp', key);
    }
  }
  await waitFor(
    readBoth,
    ([own, other]: [MonsterLook, MonsterLook]) =>
      isLowered(own) && isLowered(other),
    HIT_TIMEOUT,
    ([own, other]: [MonsterLook, MonsterLook]) =>
      `With its player slashing at the monster, the first page tells ` +
      `${describeMonsterLook(own)}, and the second page ` +
      `${describeMonsterLook(other)}, after a monster health of ` +
      `${String(healthBefore)} before.`,
  );
  // The monster strikes back before long, which leaves the player hurt.
  await waitFor(
    () => readMonsterLook(session, actor, id),
    (look: MonsterLook) => (look.own?.health ?? FULL_HEALTH) < FULL_HEALTH,
    MONSTER_TIMEOUT,
    (look: MonsterLook) =>
      `With its player by the monster it hit, the first page tells ` +
      `${describeMonsterLook(look)}, the monster never hurting it.`,
  );
  await stepWithin(
    session,
    actor,
    id,
    ROUTE_LEAST_Z,
    ROUTE_MOST_Z,
    'away from the monster',
  );
  await walkUntil(
    session,
    actor,
    id,
    'a',
    (look: MonsterLook) => (look.own?.x ?? Infinity) <= 2,
    'away from the monster',
  );

  // The hits are shown as the monster is, a while after the snapshots.
  const isShown = (look: MonsterLook, before: MonsterLook): boolean =>
    (look.bar ?? 1) < 1 &&
    sumMonsterDamage(look) - sumMonsterDamage(before) ===
      (before.monster?.health ?? NaN) - (look.monster?.health ?? NaN);
  const isAllShown = ([own, other]: [MonsterLook, MonsterLook]): boolean =>
    isShown(own, ownBefore) && isShown(other, otherBefore);
  const describeBoth = ([own, other]: [MonsterLook, MonsterLook]): string =>
    `the first page tells ${describeMonsterLook(own)}, and the second ` +
    `page ${describeMonsterLook(other)}`;
  await waitFor(
    readBoth,
    isAllShown,
    HIT_TIMEOUT,
    (looks: [MonsterLook, MonsterLook]) =>
      `After its player hit the monster, ${describeBoth(looks)}, the hits ` +
      'shown not adding up to the health the monster lost.',
  );
  await sleep(HIT_TIMEOUT);
  const after: [MonsterLook, MonsterLook] = await readBoth();
  checkHitsOnce(after[0], 'The first page');
  checkHitsOnce(after[1], 'The second page');
  if (!isAllShown(after)) {
    throw new Error(
      `A while after its player hit the monster, ${describeBoth(after)}, ` +
        'the hits shown no longer adding up to the health the monster lost.',
    );
  }
}
