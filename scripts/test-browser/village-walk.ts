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
 * @module scripts/test-browser/village-walk Walks a player about the village,
 *   and looks at it there.
 */

import { setTimeout as sleep } from 'node:timers/promises';

import { findMapPath } from '@clovervale/shared';
import type {
  GroundItem,
  GroundVector,
  MonsterState,
  PlayerState,
} from '@clovervale/shared';
import type { DialogueShown } from '../../packages/client/src/dialogue-view.ts';
import type { FigureView } from '../../packages/client/src/player-figures.ts';
import type { TobyView } from '../../packages/client/src/toby-figure.ts';

import type { BidiSession } from './bidi.ts';
import { turnCamera } from './camera.ts';
import {
  ACTION_TIMEOUT,
  STANDING_DRIFT,
  TAP_DURATION,
  TURN_KEYS,
  VIEW_SETTLE_DURATION,
} from './constants.ts';
import { evaluateInPage, sendKey, waitFor } from './page.ts';
import type { MenuActionView, SpeechWordsView } from './page.ts';

/** The longest a player is walked across the village for, in ms. */
const QUEST_WALK_TIMEOUT = 40_000;
/** How often the keys walking a player across the village are set, in ms. */
const QUEST_STEER_INTERVAL = 50;
/**
 * How near a player walked across the village comes to a point on its way
 * before it walks on to the next, in metres.
 */
const QUEST_WAY_NEARNESS = 0.4;
/** How near a player walked across the village stops to its end, in metres. */
const QUEST_STOP_NEARNESS = 0.15;
/**
 * The most degrees a player turned to face a point may face away from the
 * way its keys walk it, which is half the turn from one way the keys walk
 * to the next.
 */
const FACE_TOLERANCE = 22.5;
/** The most times a player taps its keys to turn to face a point. */
const FACE_TRIES = 3;

/** How a page shows its player on the quest of Toby, hurt. */
export interface QuestLook {
  /** The player of the page in the latest snapshot, if it is there. */
  readonly own: PlayerState | null;
  /** The player of the page as the page draws it, if it does. */
  readonly drawn: FigureView | null;
  /** Martha in the latest snapshot, if she is there. */
  readonly martha: MonsterState | null;
  /** How the page shows Toby, or `null` while it does not show him. */
  readonly toby: TobyView | null;
  /** The way the camera looks, in degrees, as the yaw of a player. */
  readonly heading: number;
  /** The prompt shown, or `null` while none is. */
  readonly prompt: string | null;
  /** The dialogue box, or `null` while it is closed. */
  readonly dialogue: DialogueShown | null;
  /** The bubble shown, or `null` while none is. */
  readonly speech: SpeechWordsView | null;
  /** The kinds of the items in the slots of the bag. */
  readonly slots: readonly string[];
  /** The notices of the items got. */
  readonly notices: readonly string[];
  /** Whether the bag is open. */
  readonly isBagOpen: boolean;
  /** The actions the open menu of an item lists, or `null` if none is open. */
  readonly menu: readonly MenuActionView[] | null;
  /** The name of the item chosen in the bag, if it shows one. */
  readonly bagItemName: string;
  /** The kinds of the items drawn on the ground, with where they lie. */
  readonly items: readonly GroundItem[];
  /** The number of silver coins the bag shows. */
  readonly silver: string;
}

/**
 * Makes the expression that tells how a page shows its player on the
 * quest of Toby, hurt, as JSON.
 *
 * @param {number} id - The identifier of the player.
 * @returns {string} The expression.
 */
function createQuestExpression(id: number): string {
  return `(() => {
    const shown = (element) =>
      element === null || element.hidden ? null : element.textContent;
    const speech = window.clovervale.describeSpeech();
    const menu = document.querySelector('.bag-menu');
    const bag = document.querySelector('.bag-window');
    return JSON.stringify({
      own: window.clovervale.listLatestPlayers()
        .find((player) => player.id === ${String(id)}) ?? null,
      drawn: window.clovervale.describeFigures()
        .find((figure) => figure.id === ${String(id)}) ?? null,
      martha: window.clovervale.listLatestMonsters()
        .find((monster) => monster.kind === 'martha') ?? null,
      toby: window.clovervale.describeToby(),
      heading: window.clovervale.describeHeading(),
      prompt: shown(document.querySelector('.interaction-prompt')),
      dialogue: window.clovervale.describeDialogue(),
      speech: speech === null ? null : { name: speech.name, line: speech.line },
      slots: [...document.querySelectorAll('.bag-slot')]
        .map((slot) => slot.dataset.kind ?? ''),
      notices: [...document.querySelectorAll('.item-notice')]
        .map((notice) => notice.textContent),
      isBagOpen: bag !== null && !bag.hidden,
      menu: menu === null || menu.hidden
        ? null
        : [...menu.querySelectorAll('.bag-action')].map((action) => ({
            label: action.textContent,
            isEnabled: action.getAttribute('aria-disabled') !== 'true',
          })),
      bagItemName:
        document.querySelector('.bag-item-name')?.textContent ?? '',
      items: window.clovervale.describeItems().items,
      silver: document.querySelector('.bag-silver-count')?.textContent ?? '',
    });
  })()`;
}

/**
 * Reads how a page shows its player on the quest of Toby, hurt.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<QuestLook>} How the page shows it.
 */
export async function readQuestLook(
  session: BidiSession,
  context: string,
  id: number,
): Promise<QuestLook> {
  return JSON.parse(
    await evaluateInPage(session, context, createQuestExpression(id)),
  ) as QuestLook;
}

/**
 * Describes how a page shows its player on the quest of Toby, hurt, for
 * the error messages.
 *
 * @param {QuestLook} look - How the page shows it.
 * @returns {string} The description.
 */
export function describeQuestLook(look: QuestLook): string {
  return (
    `the player ${JSON.stringify(look.own)} drawn at ` +
    `${JSON.stringify(look.drawn)}, Martha ${JSON.stringify(look.martha)}, ` +
    `Toby ${JSON.stringify(look.toby)}, the prompt ` +
    `${JSON.stringify(look.prompt)}, the dialogue ` +
    `${JSON.stringify(look.dialogue)}, the bubble ` +
    `${JSON.stringify(look.speech)}, the bag ` +
    `${look.isBagOpen ? 'open' : 'closed'} with ` +
    `${JSON.stringify(look.slots)} naming "${look.bagItemName}" and the ` +
    `menu ${JSON.stringify(look.menu)}, the notices ` +
    `${JSON.stringify(look.notices)}, the items on the ground ` +
    `${JSON.stringify(look.items)} and ${look.silver} silver coins`
  );
}

/**
 * Finds the keys that walk the player of a page a way, under the camera as
 * it looks.
 *
 * @param {number} heading - The way the camera looks, in degrees, as the
 *   yaw of a player.
 * @param {GroundVector} way - The way to walk.
 * @returns {readonly string[]} The keys to hold down together.
 */
function findWalkKeys(heading: number, way: GroundVector): readonly string[] {
  const turn: number =
    (Math.round((Math.atan2(way.x, way.z) * 4) / Math.PI) + 8) % 8;
  // The keys walk the way they do as the camera looks, which a key walking
  // down the view from the first view of the village, north.
  const shift: number = Math.round((heading - 180) / 45);
  return TURN_KEYS[(((turn - shift) % 8) + 8) % 8] ?? [];
}

/**
 * Walks the player of a page to a point of the village around the
 * obstacles, holding down the keys that walk it towards the next point on
 * its way as the page draws it, and waits for it to stop there, facing the
 * way it walked last.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @param {GroundVector} to - The point.
 * @param {string} where - Where the player walks, for the error messages.
 * @returns {Promise<void>} A promise settled once it has stopped.
 * @throws {Error} If the player finds no way, or does not get there in time.
 */
export async function walkInVillage(
  session: BidiSession,
  context: string,
  id: number,
  to: GroundVector,
  where: string,
): Promise<void> {
  const look = (): Promise<QuestLook> => readQuestLook(session, context, id);
  const start: QuestLook = await look();
  const path: GroundVector[] | null =
    start.drawn === null ? null : findMapPath('village', start.drawn, to);
  if (path === null) {
    throw new Error(
      `The player finds no way ${where}: the first page tells ` +
        `${describeQuestLook(start)}.`,
    );
  }
  const deadline: number = Date.now() + QUEST_WALK_TIMEOUT;
  let held: readonly string[] = [];
  const hold = async (keys: readonly string[]): Promise<void> => {
    for (const key of held.filter((key: string) => !keys.includes(key))) {
      await sendKey(session, context, 'keyUp', key);
    }
    for (const key of keys.filter((key: string) => !held.includes(key))) {
      await sendKey(session, context, 'keyDown', key);
    }
    held = keys;
  };
  try {
    for (const [index, point] of path.entries()) {
      const nearness: number =
        index === path.length - 1 ? QUEST_STOP_NEARNESS : QUEST_WAY_NEARNESS;
      for (;;) {
        const seen: QuestLook = await look();
        const { drawn } = seen;
        if (drawn === null || Date.now() > deadline) {
          throw new Error(
            `Walking ${where}, the first page tells ` +
              `${describeQuestLook(seen)}.`,
          );
        }
        const way: GroundVector = { x: point.x - drawn.x, z: point.z - drawn.z };
        if (Math.hypot(way.x, way.z) <= nearness) {
          break;
        }
        await hold(findWalkKeys(seen.heading, way));
        await sleep(QUEST_STEER_INTERVAL);
      }
    }
  } finally {
    await hold([]);
  }
  // A snapshot from before a short walk tells that the player idles too,
  // but somewhere other than where the page, which is ahead of the server,
  // draws it.
  await waitFor(
    look,
    (seen: QuestLook) =>
      seen.own?.action === 'Idle' &&
      seen.drawn !== null &&
      Math.hypot(seen.drawn.x - seen.own.x, seen.drawn.z - seen.own.z) <=
        STANDING_DRIFT,
    ACTION_TIMEOUT,
    (seen: QuestLook) =>
      `Stopped ${where}, the first page tells ${describeQuestLook(seen)}.`,
  );
}

/**
 * Turns the player of a page to face a point, with a tap of the keys that
 * walk it that way, and waits for it to stop, tapping again if it did not
 * turn.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @param {GroundVector} point - The point.
 * @returns {Promise<QuestLook>} How the page shows it, once stopped.
 * @throws {Error} If the player never turns that way.
 */
export async function faceInVillage(
  session: BidiSession,
  context: string,
  id: number,
  point: GroundVector,
): Promise<QuestLook> {
  const look = (): Promise<QuestLook> => readQuestLook(session, context, id);
  let seen: QuestLook = await look();
  for (let tries = 1; ; tries++) {
    const keys: readonly string[] = findWalkKeys(seen.heading, {
      x: point.x - (seen.drawn?.x ?? NaN),
      z: point.z - (seen.drawn?.z ?? NaN),
    });
    // The way the keys walk the player, under the camera as it looks.
    const yaw: number = TURN_KEYS.indexOf(keys) * 45 + seen.heading - 180;
    for (const key of keys) {
      await sendKey(session, context, 'keyDown', key);
    }
    await sleep(TAP_DURATION);
    for (const key of keys) {
      await sendKey(session, context, 'keyUp', key);
    }
    await sleep(VIEW_SETTLE_DURATION);
    seen = await waitFor(
      look,
      (shown: QuestLook) => shown.own?.action === 'Idle',
      ACTION_TIMEOUT,
      (shown: QuestLook) =>
        `Turned to ${JSON.stringify(point)}, the first page tells ` +
        `${describeQuestLook(shown)}.`,
    );
    const turn: number = findTurnBetween(yaw, seen.own?.yaw ?? NaN);
    if (Math.abs(turn) <= FACE_TOLERANCE) {
      return seen;
    }
    if (tries >= FACE_TRIES) {
      throw new Error(
        `With ${keys.join(' and ').toUpperCase()} tapped ` +
          `${String(tries)} times to turn to ${JSON.stringify(point)}, a ` +
          `yaw of ${yaw.toFixed(1)} degrees, the first page tells ` +
          `${describeQuestLook(seen)}.`,
      );
    }
  }
}

/**
 * Finds the yaw that faces from one point to another, in degrees.
 *
 * @param {GroundVector} from - The one point.
 * @param {GroundVector} to - The other point.
 * @returns {number} The yaw.
 */
export function findHeading(from: GroundVector, to: GroundVector): number {
  return (Math.atan2(to.x - from.x, to.z - from.z) * 180) / Math.PI;
}

/**
 * Finds the difference between two yaws, from -180 up to 180 degrees.
 *
 * @param {number} to - The yaw to turn to.
 * @param {number} from - The yaw to turn from.
 * @returns {number} How far to turn, in degrees.
 */
function findTurnBetween(to: number, from: number): number {
  return ((((to - from + 180) % 360) + 360) % 360) - 180;
}

/**
 * Turns the camera of a page round its player until it looks a way, as
 * near as its turns go.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @param {number} heading - The way, as the yaw of a player, in degrees.
 * @returns {Promise<void>} A promise settled once it looks that way.
 */
export async function turnCameraTo(
  session: BidiSession,
  context: string,
  id: number,
  heading: number,
): Promise<void> {
  const before: number = (await readQuestLook(session, context, id)).heading;
  const turn: number = findTurnBetween(heading, before);
  if (Math.abs(turn) >= 3) {
    // A drag to the right turns the camera to look further to the left.
    await turnCamera(session, context, -turn / 360);
  }
}
