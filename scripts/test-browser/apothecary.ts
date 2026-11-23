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
 * @module scripts/test-browser/apothecary Checks buying healing potions from
 *   Basil.
 */

import { setTimeout as sleep } from 'node:timers/promises';

import {
  HEALING_POTION_PRICE,
  findPlacement,
  placePoint,
} from '@clovervale/shared';
import type { GroundVector } from '@clovervale/shared';
import type { DialogueShown } from '../../packages/client/src/dialogue-view.ts';

import type { BidiSession } from './bidi.ts';
import { tiltCamera, zoomCamera } from './camera.ts';
import {
  ACTION_TIMEOUT,
  BAG_KEYS,
  DIALOGUE_HOLD_DURATION,
  NIGHT_CLOCK,
  POTION_NOTICE,
  PREVIEW_CONTROL,
  PREVIEW_HOUR_CONTROL,
  SCREENSHOT_DIR,
  VIEW_SETTLE_DURATION,
} from './constants.ts';
import { saveView, setControl, tapKey, waitFor } from './page.ts';
import {
  describeQuestLook,
  faceInVillage,
  findHeading,
  readQuestLook,
  turnCameraTo,
  walkInVillage,
} from './village-walk.ts';
import type { QuestLook } from './village-walk.ts';

/** Where the apothecary's stands, and which way it faces. */
const APOTHECARY_PLACE = findPlacement('apothecary');
/** Where Basil the apothecary stands. */
const BASIL_SPOT: GroundVector = findPlacement('basil');
/**
 * Where a player stands in front of the door of the apothecary's to talk to
 * Basil, a step out from its doorstep.
 */
const BEFORE_SHOP_DOOR: GroundVector = placePoint(APOTHECARY_PLACE, {
  x: 0.9,
  z: 4.1,
});
/**
 * Where a player stands on the plaza to look at the apothecary's: out in
 * front of it, off to the side of the gate, so that the great tree is not
 * between the camera and the shop.
 */
const SHOP_VIEWPOINT: GroundVector = placePoint(APOTHECARY_PLACE, {
  x: -3.7,
  z: 5.3,
});
/** Where the herb rack of the apothecary's stands. */
const RACK_SPOT: GroundVector = findPlacement('herb-rack');
/**
 * Where a player stands to look at the herb rack and the props: in front of
 * the end of the rack away from the door.
 */
const RACK_VIEWPOINT: GroundVector = placePoint(APOTHECARY_PLACE, {
  x: -2.8,
  z: 4.4,
});
/** The prompt to talk to Basil. */
const BASIL_TALK_PROMPT = 'Press Space to talk to Basil';
/** The replies Basil offers to his offer of a healing potion. */
const BASIL_REPLIES: readonly string[] = ["I'll take one.", 'No, thanks.'];
/** The dialogue box as Basil offers a healing potion. */
const BASIL_OFFER: DialogueShown = {
  name: 'Basil',
  line: 'Hi, hi! Want a healing potion? Just three silver coins a bottle!',
  replies: BASIL_REPLIES,
  cursor: 0,
};
/** The dialogue box as Basil sells a healing potion. */
const BASIL_SOLD: DialogueShown = {
  name: 'Basil',
  line:
    "Here you go! This one's… a healing potion, I'm pretty sure. Careful " +
    'not to drop it!',
  replies: BASIL_REPLIES,
  cursor: 0,
};
/** The dialogue box as Basil refuses a player with too few coins. */
const BASIL_SHORT: DialogueShown = {
  name: 'Basil',
  line: "Oh, you're a bit short on silver. Sorry, but I've got to eat too…",
  replies: [],
  cursor: 0,
};
/** The dialogue box as Basil bids a player who buys nothing farewell. */
const BASIL_FAREWELL: DialogueShown = {
  name: 'Basil',
  line: 'Okay! Come and find me whenever you need one!',
  replies: [],
  cursor: 0,
};
/** The key value WebDriver gives the down arrow. */
const DOWN_ARROW = '\uE015';
/** How far the wheel is turned to zoom the camera in close, in pixels. */
const SHOP_CLOSE_ZOOM = -900;
/** How much farther the wheel is turned to look at Basil, in pixels. */
const BASIL_CLOSE_ZOOM = -800;
/**
 * How far the view is dragged up to look up at the gable of the shop, as a
 * share of its height.
 */
const GABLE_TILT = -0.12;

/**
 * Saves the views of the apothecary's and of Basil for the owner to look
 * at, if the environment names a directory for the views: the shop seen
 * from the plaza by day and at midnight, its gable sign close up, the herb
 * rack and the props by the door, and Basil from the front, from three
 * quarters and from his left side.  The camera ends as it started, and
 * the player in front of the door, facing Basil.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the views are saved.
 */
async function saveApothecaryViews(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  if (SCREENSHOT_DIR === undefined) {
    return;
  }
  const look = (): Promise<QuestLook> => readQuestLook(session, context, id);
  const { heading } = await look();
  await walkInVillage(session, context, id, SHOP_VIEWPOINT, 'to the plaza');
  await faceInVillage(session, context, id, APOTHECARY_PLACE);
  await turnCameraTo(
    session,
    context,
    id,
    findHeading(SHOP_VIEWPOINT, APOTHECARY_PLACE),
  );
  await saveView(session, context, 'apothecary-day.png');
  await setControl(session, context, PREVIEW_HOUR_CONTROL, NIGHT_CLOCK);
  await setControl(session, context, PREVIEW_CONTROL, true);
  try {
    await saveView(session, context, 'apothecary-night.png');
  } finally {
    await setControl(session, context, PREVIEW_CONTROL, false);
  }

  await walkInVillage(session, context, id, BEFORE_SHOP_DOOR, 'to the door');
  await faceInVillage(session, context, id, APOTHECARY_PLACE);
  await turnCameraTo(
    session,
    context,
    id,
    findHeading(BEFORE_SHOP_DOOR, APOTHECARY_PLACE),
  );
  await zoomCamera(session, context, SHOP_CLOSE_ZOOM);
  await tiltCamera(session, context, GABLE_TILT);
  await saveView(session, context, 'apothecary-gable.png');
  await tiltCamera(session, context, -GABLE_TILT);
  await walkInVillage(session, context, id, RACK_VIEWPOINT, 'before the rack');
  await faceInVillage(session, context, id, RACK_SPOT);
  await turnCameraTo(
    session,
    context,
    id,
    findHeading(RACK_VIEWPOINT, RACK_SPOT),
  );
  await saveView(session, context, 'apothecary-rack.png');

  // Basil from the front and from three quarters, away from the great
  // tree, the player standing off to one side of the way the camera looks
  // at him.
  const basil = findPlacement('basil');
  await zoomCamera(session, context, BASIL_CLOSE_ZOOM);
  for (const [name, turn, aside] of [
    ['basil-front.png', 0, 1],
    ['basil-three-quarter.png', -45, 1],
    ['basil-side.png', 90, -1],
  ] as const) {
    const yaw: number = ((basil.yaw + turn) * Math.PI) / 180;
    const side: number = yaw + (aside * Math.PI) / 2;
    const stand: GroundVector = {
      x: basil.x + Math.sin(yaw) * 1.1 + Math.sin(side) * 1.2,
      z: basil.z + Math.cos(yaw) * 1.1 + Math.cos(side) * 1.2,
    };
    await walkInVillage(session, context, id, stand, `to see ${name}`);
    await faceInVillage(session, context, id, BASIL_SPOT);
    await turnCameraTo(session, context, id, basil.yaw + turn + 180);
    await saveView(session, context, name);
  }
  await zoomCamera(session, context, -BASIL_CLOSE_ZOOM - SHOP_CLOSE_ZOOM);
  await turnCameraTo(session, context, id, heading);
  await walkInVillage(session, context, id, BEFORE_SHOP_DOOR, 'to the door');
  await faceInVillage(session, context, id, BASIL_SPOT);
}

/**
 * Checks that a player buys healing potions from Basil the apothecary, by
 * the door of his shop, until it has too few silver coins.
 *
 * The player walks to the front of the door of the apothecary's, facing
 * Basil, and is prompted to talk to him.  Talked to, he says nothing in
 * passing; the dialogue box shows him offer a healing potion for three
 * silver coins, with the replies to buy one or not.  Each time Enter buys
 * one, the bag shows three coins fewer and one potion more, a notice tells
 * of the potion, and the box shows him hand it over, with the same replies
 * again, while the player has coins enough; once it has too few, Enter has
 * him say so, which changes nothing, and Enter ends the dialogue.  Talked
 * to again, the down arrow and Enter choose to buy nothing, and he bids the
 * player farewell.  The views of the shop, of Basil and of the dialogue are
 * saved if the environment names a directory for them.  The player is left
 * where it started, and the camera as it was.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page of the
 *   player, which is in the village with at least three silver coins and
 *   room in its bag for as many potions as it can pay for.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If the page does not show it so.
 */
export async function checkApothecary(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  const look = (): Promise<QuestLook> => readQuestLook(session, context, id);
  const press = (key: string): Promise<void> =>
    tapKey(session, context, key);
  const countPotions = (seen: QuestLook): number =>
    seen.slots.filter((kind: string) => kind === 'healing-potion').length;
  const isShowing = (seen: QuestLook, shown: DialogueShown): boolean =>
    JSON.stringify(seen.dialogue) === JSON.stringify(shown) &&
    seen.speech === null;
  const start: QuestLook = await look();
  const home: GroundVector | null = start.drawn;

  await saveApothecaryViews(session, context, id);
  await walkInVillage(session, context, id, BEFORE_SHOP_DOOR, 'to the door');
  const before: QuestLook = await faceInVillage(
    session,
    context,
    id,
    BASIL_SPOT,
  );
  await waitFor(
    look,
    (seen: QuestLook) => seen.prompt === BASIL_TALK_PROMPT,
    ACTION_TIMEOUT,
    (seen: QuestLook) =>
      `Before Basil at the door of his shop, the first page tells ` +
      `${describeQuestLook(seen)}.`,
  );
  let silver = Number(before.silver);
  let potions: number = countPotions(before);
  if (!(silver >= HEALING_POTION_PRICE)) {
    throw new Error(
      `Before Basil, the first page tells ${describeQuestLook(before)}, ` +
        `too few silver coins to buy a potion.`,
    );
  }
  await press(' ');
  await waitFor(
    look,
    (seen: QuestLook) => isShowing(seen, BASIL_OFFER) && seen.prompt === null,
    ACTION_TIMEOUT,
    (seen: QuestLook) =>
      `With the space bar pressed before Basil, the first page tells ` +
      `${describeQuestLook(seen)}.`,
  );
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'apothecary-offer.png');
  let bought = 0;
  while (silver >= HEALING_POTION_PRICE) {
    await press(BAG_KEYS.enter);
    const paid: number = silver - HEALING_POTION_PRICE;
    const sold: QuestLook = await waitFor(
      look,
      (seen: QuestLook) =>
        isShowing(seen, BASIL_SOLD) &&
        seen.silver === String(paid) &&
        countPotions(seen) === potions + 1 &&
        seen.notices.includes(POTION_NOTICE),
      ACTION_TIMEOUT,
      (seen: QuestLook) =>
        `With a potion bought from Basil for ${String(silver)} coins, the ` +
        `first page tells ${describeQuestLook(seen)}.`,
    );
    if (bought === 0) {
      await sleep(VIEW_SETTLE_DURATION);
      await saveView(session, context, 'apothecary-sold.png');
    }
    bought++;
    silver = Number(sold.silver);
    potions = countPotions(sold);
  }
  await press(BAG_KEYS.enter);
  await waitFor(
    look,
    (seen: QuestLook) => isShowing(seen, BASIL_SHORT),
    ACTION_TIMEOUT,
    (seen: QuestLook) =>
      `With a potion asked for with ${String(silver)} coins, the first ` +
      `page tells ${describeQuestLook(seen)}.`,
  );
  await sleep(DIALOGUE_HOLD_DURATION);
  const refused: QuestLook = await look();
  if (
    !isShowing(refused, BASIL_SHORT) ||
    refused.silver !== String(silver) ||
    countPotions(refused) !== potions
  ) {
    throw new Error(
      `Refused a potion with ${String(silver)} coins and ` +
        `${String(potions)} potions, the first page tells ` +
        `${describeQuestLook(refused)}.`,
    );
  }
  await saveView(session, context, 'apothecary-short.png');
  await press(BAG_KEYS.enter);
  await waitFor(
    look,
    (seen: QuestLook) =>
      seen.dialogue === null && seen.prompt === BASIL_TALK_PROMPT,
    ACTION_TIMEOUT,
    (seen: QuestLook) =>
      `With Enter pressed as Basil refuses, the first page tells ` +
      `${describeQuestLook(seen)}.`,
  );
  await press(' ');
  await waitFor(
    look,
    (seen: QuestLook) => isShowing(seen, BASIL_OFFER),
    ACTION_TIMEOUT,
    (seen: QuestLook) =>
      `With Basil talked to again, the first page tells ` +
      `${describeQuestLook(seen)}.`,
  );
  await press(DOWN_ARROW);
  await waitFor(
    look,
    (seen: QuestLook) => seen.dialogue?.cursor === 1,
    ACTION_TIMEOUT,
    (seen: QuestLook) =>
      `With the down arrow pressed before Basil, the first page tells ` +
      `${describeQuestLook(seen)}.`,
  );
  await press(BAG_KEYS.enter);
  await waitFor(
    look,
    (seen: QuestLook) =>
      isShowing(seen, BASIL_FAREWELL) &&
      seen.silver === String(silver) &&
      countPotions(seen) === potions,
    ACTION_TIMEOUT,
    (seen: QuestLook) =>
      `With nothing bought from Basil, the first page tells ` +
      `${describeQuestLook(seen)}.`,
  );
  await press(BAG_KEYS.enter);
  await waitFor(
    look,
    (seen: QuestLook) => seen.dialogue === null,
    ACTION_TIMEOUT,
    (seen: QuestLook) =>
      `With Enter pressed as Basil bids farewell, the first page tells ` +
      `${describeQuestLook(seen)}.`,
  );
  if (home !== null) {
    await walkInVillage(session, context, id, home, 'back from the shop');
  }
}
