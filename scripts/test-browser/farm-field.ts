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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/25
// AI assistance: Claude Code (Anthropic)

/**
 * @module scripts/test-browser/farm-field Checks that a player walks into
 *   the farm fields behind the houses through their gates, and is stopped
 *   by their fences.
 */

import { setTimeout as sleep } from 'node:timers/promises';

import {
  FARM_FIELDS,
  FIELD_FENCE_THICKNESS,
  VILLAGE_TERRAIN,
  WALK_SPEED,
  findPlacement,
  measureDistance,
  placePoint,
} from '@clovervale/shared';
import type {
  FarmFieldId,
  GroundVector,
  Placement,
} from '@clovervale/shared';

import type { BidiSession } from './bidi.ts';
import { ACTION_TIMEOUT, VIEW_SETTLE_DURATION } from './constants.ts';
import { saveView, sendKey, waitFor } from './page.ts';
import {
  describeQuestLook,
  faceInVillage,
  findHeading,
  findWalkKeys,
  readQuestLook,
  turnCameraTo,
  walkInVillage,
} from './village-walk.ts';
import type { QuestLook } from './village-walk.ts';

/** The farm fields, the houses they lie behind, and the names of views. */
const FIELDS: readonly (readonly [FarmFieldId, string, string])[] = [
  ['chief-field', "Martha's house", 'farm-field-chief.png'],
  ['cottage-field', "Toby's cottage", 'farm-field-cottage.png'],
  ['apothecary-field', "Basil's shop", 'farm-field-apothecary.png'],
];

/**
 * How far inside the back of the fence of a field a player stands at the
 * end of the lane from the gate, in meters.
 */
const INSIDE_BACK = 0.5;

/**
 * How much longer the keys that walk a player into the fence are held
 * down than it takes to walk up to the fence, in milliseconds.
 */
const PUSH_DURATION = 1000;

/**
 * How far, at most, a player stopped by the fence stands from where the
 * fence blocks it, in meters.
 */
const EDGE_NEARNESS = 0.1;

/**
 * Walks the player of a page straight toward a point from where it
 * stands, for as long as it takes to cover a distance and a little longer,
 * and tells where it stops.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @param {GroundVector} toward - The point.
 * @param {number} distance - The distance, in meters.
 * @returns {Promise<QuestLook>} How the page shows the player, stopped.
 * @throws {Error} If the page does not draw its player, or the player does
 *   not stop.
 */
async function walkToward(
  session: BidiSession,
  context: string,
  id: number,
  toward: GroundVector,
  distance: number,
): Promise<QuestLook> {
  const look = (): Promise<QuestLook> => readQuestLook(session, context, id);
  const before: QuestLook = await look();
  const from: GroundVector | null = before.drawn;
  if (from === null) {
    throw new Error(
      `Before walking toward ${JSON.stringify(toward)}, the first page ` +
        `tells ${describeQuestLook(before)}, not drawing its player.`,
    );
  }
  const keys: readonly string[] = findWalkKeys(before.heading, {
    x: toward.x - from.x,
    z: toward.z - from.z,
  });
  try {
    for (const key of keys) {
      await sendKey(session, context, 'keyDown', key);
    }
    await sleep((distance / WALK_SPEED) * 1000 + PUSH_DURATION);
  } finally {
    for (const key of keys) {
      await sendKey(session, context, 'keyUp', key);
    }
  }
  return waitFor(
    look,
    (seen: QuestLook) => seen.own?.action === 'Idle',
    ACTION_TIMEOUT,
    (seen: QuestLook) =>
      `Walked toward ${JSON.stringify(toward)}, the first page tells ` +
      `${describeQuestLook(seen)}.`,
  );
}

/**
 * Tells whether a player stands right up against something in its way
 * toward a point.
 *
 * @param {GroundVector | null} at - Where the player stands, if anywhere.
 * @param {GroundVector} toward - The point.
 * @returns {boolean} Whether it may stand there but not
 *   {@link EDGE_NEARNESS} farther on.
 */
function isStoppedBefore(
  at: GroundVector | null,
  toward: GroundVector,
): boolean {
  if (at === null) {
    return false;
  }
  const distance: number = measureDistance(at, toward);
  const beyond: GroundVector = {
    x: at.x + ((toward.x - at.x) / distance) * EDGE_NEARNESS,
    z: at.z + ((toward.z - at.z) / distance) * EDGE_NEARNESS,
  };
  return VILLAGE_TERRAIN.isClear(at) && !VILLAGE_TERRAIN.isClear(beyond);
}

/**
 * Checks that a player walks into the farm field behind each of the houses
 * of Martha, Toby and Basil through its gate, and is stopped by its fence.
 *
 * For each field, the player walks in through the gate and up the lane
 * from it to the back of the field, and looks back across the field at
 * the house.  It then walks on into the back of the fence, and is stopped
 * there, standing where it may, with the fence in its way.  The views
 * across the fields are saved if the environment names a directory for
 * them.  The player is left where it started, and the camera as it was.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page of the
 *   player, which is in the village.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If the page does not draw its player, or does not show
 *   it so.
 */
export async function checkFarmFields(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  const start: QuestLook = await readQuestLook(session, context, id);
  const home: GroundVector | null = start.drawn;
  if (home === null) {
    throw new Error(
      `Before the farm fields, the first page tells ` +
        `${describeQuestLook(start)}, not drawing its player.`,
    );
  }
  for (const [field, what, view] of FIELDS) {
    const place: Placement = findPlacement(field);
    const half: number = FARM_FIELDS[field].width / 2;
    const inside: GroundVector = placePoint(place, {
      x: 0,
      z: -(half - FIELD_FENCE_THICKNESS - INSIDE_BACK),
    });
    const gate: GroundVector = placePoint(place, { x: 0, z: half });
    const fence: GroundVector = placePoint(place, { x: 0, z: -half });
    await walkInVillage(
      session,
      context,
      id,
      inside,
      `into the field behind ${what}`,
    );
    await faceInVillage(session, context, id, gate);
    await turnCameraTo(session, context, id, findHeading(inside, gate));
    await sleep(VIEW_SETTLE_DURATION);
    await saveView(session, context, view);
    const stopped: QuestLook = await walkToward(
      session,
      context,
      id,
      fence,
      INSIDE_BACK,
    );
    if (!isStoppedBefore(stopped.own, fence)) {
      throw new Error(
        `Walked into the back of the fence of the field behind ${what}, ` +
          `the first page tells ${describeQuestLook(stopped)}, not ` +
          'stopped by it.',
      );
    }
  }
  await turnCameraTo(session, context, id, start.heading);
  await walkInVillage(session, context, id, home, 'back home');
}
