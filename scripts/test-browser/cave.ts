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
 * @module scripts/test-browser/cave Checks the cave, its wild dogs, its
 *   prisoner and its store rooms.
 */

import { setTimeout as sleep } from 'node:timers/promises';

import {
  CAVE_CONTAINERS,
  CAVE_DOG_HOMES,
  CAVE_LANDING,
  CAVE_ROPE,
  SLASH_REACH,
  VILLAGERS,
  WELL_STAND,
  locateVillager,
} from '@clovervale/shared';
import type {
  CaveContainer,
  GroundVector,
  HealEvent,
  HitEvent,
  MonsterState,
  PlayerState,
  Villager,
} from '@clovervale/shared';
import type { DialogueShown } from '../../packages/client/src/dialogue-view.ts';
import type { SpeechView } from '../../packages/client/src/speech-bubble.ts';

import type { BidiSession } from './bidi.ts';
import { tiltCamera, turnCamera, zoomCamera } from './camera.ts';
import {
  ACTION_TIMEOUT,
  BAG_KEYS,
  CAMERA_SETTLE_DURATION,
  DIALOGUE_HOLD_DURATION,
  EN_NAME,
  FULL_HEALTH,
  LANGUAGE_CONTROL,
  LEG_TIMEOUT,
  MONSTER_TIMEOUT,
  NIGHT_CLOCK,
  POLL_INTERVAL,
  POTION_NOTICE,
  PREVIEW_CONTROL,
  PREVIEW_HOUR_CONTROL,
  ROUTE_LEAST_Z,
  ROUTE_MOST_Z,
  SCREENSHOT_DIR,
  TAP_DURATION,
  TURN_KEYS,
  VIEW_SETTLE_DURATION,
  ZH_TW_LANGUAGE_CONTROL,
  ZH_TW_NAME,
  ZOOM_DELTA,
} from './constants.ts';
import { checkBrowserKeys } from './help.ts';
import { chooseLanguage } from './language.ts';
import { stepWithin, walkUntil } from './monster.ts';
import type { MonsterLook } from './monster.ts';
import {
  SILVER_EXPRESSION,
  captureView,
  evaluateInPage,
  saveView,
  sendKey,
  setControl,
  tapKey,
  waitFor,
} from './page.ts';
import type { MenuActionView, SilverView, SpeechWordsView } from './page.ts';
import { measureBrightness } from './png.ts';
import type { Pixels } from './png.ts';

/** How a page shows the map its player is in, and what it can do there. */
interface CaveLook {
  /** The map the page shows. */
  readonly map: string;
  /** The player of the page in the latest snapshot, if it is there. */
  readonly own: PlayerState | null;
  /** The first monster in the latest snapshot, if there is one. */
  readonly monster: MonsterState | null;
  /** The monsters in the latest snapshot. */
  readonly monsters: readonly MonsterState[];
  /** The latest hits the page has shown, the latest last. */
  readonly hits: readonly HitEvent[];
  /** The identifiers of the players the page shows. */
  readonly figures: readonly number[];
  /** What the space bar does, as the panel tells. */
  readonly spaceKey: string;
  /** The prompt at the foot of the page, if it is shown. */
  readonly prompt: string | null;
  /** What the bubble above a villager shows, if one is shown. */
  readonly speech: SpeechView | null;
  /** What the dialogue box shows, if it is open. */
  readonly dialogue: DialogueShown | null;
  /** Whether each container of the cave is shown open, by its number. */
  readonly containers: readonly boolean[];
  /** Whether the bag is open. */
  readonly isBagOpen: boolean;
  /** How the bag shows the silver coins, or `null` if it shows none. */
  readonly silver: SilverView | null;
  /** The kind of the item in each slot of the bag, or `''` if it is empty. */
  readonly slots: readonly string[];
  /** The name the bag shows of the item under its cursor, or `''`. */
  readonly bagItemName: string;
  /**
   * The actions the open menu of an item lists, each with whether it can
   * be chosen, or `null` if no menu is open.
   */
  readonly menu: readonly MenuActionView[] | null;
  /**
   * The notices of the items received that the page shows, the earliest
   * first.
   */
  readonly notices: readonly string[];
  /** The latest heals the page has shown, the latest last. */
  readonly heals: readonly HealEvent[];
}

/**
 * The farthest east the player walks on its way to the burrow among the
 * spawn stones, in meters, which has it well within reach of the burrow.
 */
const BURROW_X = 10.8;
/** What the panel tells the space bar does in the burrow. */
const ENTER_KEY = 'go down the burrow';
/** The prompt in the burrow. */
const ENTER_PROMPT = 'Press Space to go down the burrow';
/** What the panel tells the space bar does by the rope in the cave. */
const CLIMB_KEY = 'climb up the rope';
/** The prompt by the rope in the cave. */
const CLIMB_PROMPT = 'Press Space to climb up the rope';
/** What the panel tells the space bar does at the bars before the prisoner. */
const EDWIN_TALK_KEY = 'talk to the prisoner';
/** The prompt at the bars before the prisoner. */
const EDWIN_TALK_PROMPT = 'Press Space to talk to the prisoner';
/**
 * What the panel tells the space bar does at the bars before the prisoner,
 * once he has told the player who he is.
 */
const ENVOY_TALK_KEY = 'talk to Envoy Edwin';
/** The prompt at the bars before the prisoner, once he has told who he is. */
const ENVOY_TALK_PROMPT = 'Press Space to talk to Envoy Edwin';
/** The dialogue box as the prisoner first pleads, in English. */
const EDWIN_PLEA: DialogueShown = {
  name: 'Prisoner',
  line: 'Help! Please help me!',
  replies: ['Who are you? What are you doing in there?'],
  cursor: 0,
};
/** The dialogue box as the prisoner first pleads, in Traditional Chinese. */
const ZH_TW_EDWIN_PLEA: DialogueShown = {
  name: '囚犯',
  line: '救命！幫幫我！',
  replies: ['你是誰？怎麼會在這裏？'],
  cursor: 0,
};
/** The dialogue box as the prisoner tells who he is, in English. */
const EDWIN_IDENTITY: DialogueShown = {
  name: 'Envoy Edwin',
  line:
    "I'm Edwin, a royal envoy. I came to spy on the enemy, but I got " +
    "caught, and now I'm locked up in here.",
  replies: ["Hang on, I'll find the key and get you out."],
  cursor: 0,
};
/** The dialogue box as Edwin gives his message, in English. */
const EDWIN_ERRAND: DialogueShown = {
  name: 'Envoy Edwin',
  line:
    "No, there's no time. I've got news the king has to hear right away. " +
    "I've written it on this bit of cloth. Take it to him, quick. It's " +
    'urgent. Go!',
  replies: [],
  cursor: 0,
};
/** What Edwin reminds a player of who carries his message, in English. */
const EDWIN_REMINDER: SpeechWordsView = {
  name: 'Envoy Edwin',
  line: "Haven't you gone to the king yet? Go on, hurry!",
};
/** What Edwin calls out for help once the dogs are dead, in English. */
const EDWIN_CALL: SpeechWordsView = {
  name: 'Prisoner',
  line: 'Help! Is anyone there?',
};
/** The notice of the message from Clovervale received from Edwin. */
const MESSAGE_NOTICE = 'You got the message from Clovervale';
/** What the panel tells the space bar does before a shut chest. */
const OPEN_CHEST_KEY = 'open the chest';
/** The prompt before a shut chest. */
const OPEN_CHEST_PROMPT = 'Press Space to open the chest';
/** What the panel tells the space bar does before a shut barrel. */
const OPEN_BARREL_KEY = 'open the barrel';
/** What the panel tells the space bar does before a barrel looted. */
const EMPTY_BARREL_KEY = 'nothing, as the barrel is empty';
/** How many turns of the mouse wheel bring the camera close to the bones. */
const SKELETON_ZOOM_TURNS = 5;
/** How far the camera turns from looking west to look into the south cell. */
const SKELETON_TURN = -0.25;
/**
 * How far down the view the camera is dragged to look steeply down, as a
 * share of its height.
 */
const STEEP_TILT = 0.15;
/**
 * The farthest from the middle of the passage a player is taken to be on
 * it, across it, in meters.
 */
const ON_PASSAGE = 0.15;
/** How long the view takes to clear after the player changes maps, in ms. */
const FADE_DURATION = 1000;
/** The least brightness of the view of the cave, from 0 to 255. */
const CAVE_LEAST_BRIGHTNESS = 6;
/** How many turns of the mouse wheel bring the camera close to a torch. */
const CLOSE_ZOOM_TURNS = 8;
/** How near a player is shown to where it arrives, in meters. */
const ARRIVAL_NEARNESS = 0.3;
/** The notice of the sword found in a chest. */
const SWORD_NOTICE = 'You got a short sword';
/** The notice of the leather armor received, in Traditional Chinese. */
const ZH_TW_ARMOR_NOTICE = '取得皮甲';
/** The name of the sword in Traditional Chinese. */
const ZH_TW_SWORD = '短劍';
/** The expression that clicks the slot of the sword in the bag of a page. */
const SWORD_SLOT_CLICK_EXPRESSION = `(() => {
  document.querySelector('.bag-slot[data-kind="sword"]')?.click();
  return '';
})()`;
/** The name of the healing potion in Traditional Chinese. */
const ZH_TW_POTION = '治療藥水';
/**
 * Lists the actions the menu of the healing potion in the bag lists in
 * Traditional Chinese.
 *
 * @param {boolean} isHurt - Whether the player lacks health.
 * @returns {MenuActionView[]} The actions: using the potion, which can be
 *   chosen only while the player lacks health, and dropping it.
 */
function listZhTwPotionActions(isHurt: boolean): MenuActionView[] {
  return [
    { label: '使用', isEnabled: isHurt },
    { label: '丟棄', isEnabled: true },
  ];
}

/** The health a healing potion gives back. */
const POTION_HEALING = 50;
/**
 * The expression that clicks the slot of the healing potion in the bag of
 * a page.
 */
const POTION_SLOT_CLICK_EXPRESSION = `(() => {
  document.querySelector('.bag-slot[data-kind="healing-potion"]')?.click();
  return '';
})()`;
/** The silver coins in the barrel of the north store room of the cave. */
const BARREL_SILVER = 5;
/** The notice of those coins received, in English. */
const BARREL_SILVER_NOTICE = `You got ${String(BARREL_SILVER)} silver coins`;
/** The number of the chest at the back of the north store room. */
const NORTH_CHEST = 0;
/** The number of the barrel in the corner of the north store room. */
const CORNER_BARREL = 1;
/** The number of the barrel of silver coins by the passage. */
const SILVER_BARREL = 2;
/** The number of the chest at the back of the south store room. */
const SOUTH_CHEST = 3;
/** The number of the barrel in the corner of the south store room. */
const POTION_BARREL = 4;

/**
 * Makes the expression that tells how a page shows the map its player is
 * in, and what it can do there, as JSON.
 *
 * @param {number} id - The identifier of the player.
 * @returns {string} The expression.
 */
function createCaveExpression(id: number): string {
  return `(() => {
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
      map: window.clovervale.describeMap(),
      own: window.clovervale.listLatestPlayers()
        .find((player) => player.id === ${String(id)}) ?? null,
      monster: window.clovervale.listLatestMonsters()[0] ?? null,
      monsters: window.clovervale.listLatestMonsters(),
      hits: window.clovervale.listShownHits(),
      figures: window.clovervale.describeFigures().map((figure) => figure.id),
      spaceKey: panel['Space key'] ?? '',
      prompt: prompt === null || prompt.hidden ? null : prompt.textContent,
      speech: window.clovervale.describeSpeech(),
      dialogue: window.clovervale.describeDialogue(),
      containers: window.clovervale.describeContainers(),
      isBagOpen: (() => {
        const bag = document.querySelector('.bag-window');
        return bag !== null && !bag.hidden;
      })(),
      silver: ${SILVER_EXPRESSION},
      slots: [...document.querySelectorAll('.bag-slot')]
        .map((slot) => slot.dataset.kind ?? ''),
      bagItemName:
        document.querySelector('.bag-item-name')?.textContent ?? '',
      menu: (() => {
        const menu = document.querySelector('.bag-menu');
        return menu === null || menu.hidden
          ? null
          : [...menu.querySelectorAll('.bag-action')].map((action) => ({
              label: action.textContent,
              isEnabled: action.getAttribute('aria-disabled') !== 'true',
            }));
      })(),
      notices: [...document.querySelectorAll('.item-notice')]
        .map((notice) => notice.textContent),
      heals: window.clovervale.listShownHeals(),
    });
  })()`;
}

/**
 * Reads how a page shows the map its player is in.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player of the first page.
 * @returns {Promise<CaveLook>} How the page shows it.
 */
async function readCaveLook(
  session: BidiSession,
  context: string,
  id: number,
): Promise<CaveLook> {
  return JSON.parse(
    await evaluateInPage(session, context, createCaveExpression(id)),
  ) as CaveLook;
}

/**
 * Describes how a page shows the map its player is in, for the error
 * messages.
 *
 * @param {CaveLook} look - How the page shows it.
 * @returns {string} The description.
 */
function describeCaveLook(look: CaveLook): string {
  const { own } = look;
  const player: string =
    own === null
      ? 'without the player'
      : `with the player at x ${own.x.toFixed(2)}, z ${own.z.toFixed(2)}, ` +
        `facing ${own.yaw.toFixed(0)} degrees, doing "${own.action}", ` +
        `health ${String(own.health)}`;
  const monsters: string = look.monsters
    .map(
      (monster: MonsterState) =>
        `${monster.kind} ${String(monster.id)} ${monster.mode} at x ` +
        `${monster.x.toFixed(2)}, z ${monster.z.toFixed(2)}, health ` +
        String(monster.health),
    )
    .join('; ');
  const prompt: string =
    look.prompt === null ? 'no prompt' : `the prompt "${look.prompt}"`;
  const speech: string =
    look.speech === null
      ? 'no bubble'
      : `a bubble of ${look.speech.name} saying "${look.speech.line}"`;
  const dialogue: string =
    look.dialogue === null
      ? 'no dialogue'
      : `the dialogue ${JSON.stringify(look.dialogue)}`;
  return (
    `the ${look.map} ${player}, the players ${JSON.stringify(look.figures)}, ` +
    `the monsters [${monsters}], ` +
    `the space bar to "${look.spaceKey}", ${prompt}, ${speech}, ${dialogue}, the ` +
    `containers open ${JSON.stringify(look.containers)}, the bag ` +
    `${look.isBagOpen ? 'open' : 'closed'} with ${JSON.stringify(look.slots)} ` +
    `and the silver coins ${JSON.stringify(look.silver)} ` +
    `naming "${look.bagItemName}" and the menu ${JSON.stringify(look.menu)}, ` +
    `the notices ${JSON.stringify(look.notices)}, the heals ` +
    JSON.stringify(look.heals)
  );
}

/**
 * Saves more views of the cave for the owner to look at, if the
 * environment names a directory for the views: close by the torches at the
 * landing, and looking back east up the slope to the mouth of the burrow,
 * at noon and at midnight.  The camera ends as it started.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page, whose player
 *   stands at the landing.
 * @returns {Promise<void>} A promise settled once the views are saved.
 */
async function saveCaveViews(
  session: BidiSession,
  context: string,
): Promise<void> {
  if (SCREENSHOT_DIR === undefined) {
    return;
  }
  for (let turn = 0; turn < CLOSE_ZOOM_TURNS; turn++) {
    await zoomCamera(session, context, -ZOOM_DELTA);
  }
  await saveView(session, context, 'cave-torch.png');
  for (let turn = 0; turn < CLOSE_ZOOM_TURNS; turn++) {
    await zoomCamera(session, context, ZOOM_DELTA);
  }
  await turnCamera(session, context, 0.5);
  await saveView(session, context, 'cave-mouth-day.png');
  await setControl(session, context, PREVIEW_HOUR_CONTROL, NIGHT_CLOCK);
  await setControl(session, context, PREVIEW_CONTROL, true);
  try {
    await sleep(CAMERA_SETTLE_DURATION);
    await saveView(session, context, 'cave-mouth-night.png');
  } finally {
    await setControl(session, context, PREVIEW_CONTROL, false);
  }
  await turnCamera(session, context, -0.5);
}

/**
 * Walks the player of a page in the cave with a key held down, until the
 * page tells it has gotten where it is to be, and waits until it idles
 * there.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @param {string} key - The character of the key that walks it that way.
 * @param {(look: CaveLook) => boolean} isThere - Tells whether it has
 *   gotten there.
 * @param {string} where - Where it is to get, for the error messages.
 * @returns {Promise<CaveLook>} How the page shows it once it idles there.
 * @throws {Error} If it does not get there in time.
 */
async function walkInCave(
  session: BidiSession,
  context: string,
  id: number,
  key: string,
  isThere: (look: CaveLook) => boolean,
  where: string,
): Promise<CaveLook> {
  const look = (): Promise<CaveLook> => readCaveLook(session, context, id);
  const describeProblem = (seen: CaveLook): string =>
    `Walking its player ${where} with the ${key.toUpperCase()} key, the ` +
    `first page tells ${describeCaveLook(seen)}.`;
  if (!isThere(await look())) {
    await sendKey(session, context, 'keyDown', key);
    try {
      await waitFor(look, isThere, LEG_TIMEOUT, describeProblem);
    } finally {
      await sendKey(session, context, 'keyUp', key);
    }
  }
  return waitFor(
    look,
    (seen: CaveLook) => seen.own?.action === 'Idle' && isThere(seen),
    ACTION_TIMEOUT,
    describeProblem,
  );
}

/**
 * Has the player of a page loot the container in front of it with the
 * space bar, and waits until the page shows it open, with what it held in
 * the bag.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @param {number} number - The number of the container.
 * @returns {Promise<CaveLook>} How the page shows it once it is looted.
 * @throws {Error} If the page does not show it so in time.
 */
async function lootContainer(
  session: BidiSession,
  context: string,
  id: number,
  number: number,
): Promise<CaveLook> {
  const container: CaveContainer | undefined = CAVE_CONTAINERS[number];
  const before: CaveLook = await readCaveLook(session, context, id);
  const count = (look: CaveLook): number =>
    look.slots.filter((kind: string) => kind === container?.item).length;
  await tapKey(session, context, ' ');
  return waitFor(
    () => readCaveLook(session, context, id),
    (seen: CaveLook) =>
      seen.containers[number] === true &&
      count(seen) === count(before) + 1 &&
      seen.spaceKey === `nothing, as the ${container?.kind ?? ''} is empty`,
    ACTION_TIMEOUT,
    (seen: CaveLook) =>
      `With the space bar pressed before the ${container?.kind ?? ''} ` +
      `with the ${container?.item ?? 'nothing'}, the first page tells ` +
      `${describeCaveLook(seen)}.`,
  );
}

/**
 * Has the player of a page, by the barrel in the corner of the north store
 * room, walk over to the barrel by the passage, which holds no item but
 * silver coins, and loot it, and waits until the page shows the barrel
 * open, the coins counted in the bag and their notice, with nothing more in
 * the slots.  The view of the bag opened then is saved for the owner to
 * look at, if the environment names a directory for the views, and the bag
 * is closed again.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page, whose camera
 *   looks west down the passage.
 * @param {number} id - The identifier of the player.
 * @param {number} number - The number of the barrel.
 * @returns {Promise<void>} A promise settled once the barrel is looted.
 * @throws {Error} If the page does not show it so in time.
 */
async function lootSilverBarrel(
  session: BidiSession,
  context: string,
  id: number,
  number: number,
): Promise<void> {
  const barrel: CaveContainer | undefined = CAVE_CONTAINERS[number];
  const look = (): Promise<CaveLook> => readCaveLook(session, context, id);
  await walkInCave(
    session,
    context,
    id,
    'a',
    (seen: CaveLook) => (seen.own?.z ?? -Infinity) >= (barrel?.z ?? 0) - 0.05,
    'along the west wall of the north store room',
  );
  await walkInCave(
    session,
    context,
    id,
    's',
    (seen: CaveLook) => seen.spaceKey === OPEN_BARREL_KEY,
    'up to the barrel by the passage in the north store room',
  );
  const before: CaveLook = await look();
  const count = Number(before.silver?.count ?? NaN);
  const filled = (seen: CaveLook): number =>
    seen.slots.filter((kind: string) => kind !== '').length;
  await tapKey(session, context, ' ');
  await waitFor(
    look,
    (seen: CaveLook) =>
      seen.containers[number] === true &&
      seen.silver?.count === String(count + BARREL_SILVER) &&
      seen.silver.label === `${String(count + BARREL_SILVER)} silver coins` &&
      seen.notices.includes(BARREL_SILVER_NOTICE) &&
      filled(seen) === filled(before) &&
      seen.spaceKey === EMPTY_BARREL_KEY,
    ACTION_TIMEOUT,
    (seen: CaveLook) =>
      `With the space bar pressed before the barrel of silver coins, ` +
      `after ${String(count)} coins before, the first page tells ` +
      `${describeCaveLook(seen)}.`,
  );
  await tapKey(session, context, 'i');
  await waitFor(
    look,
    (seen: CaveLook) =>
      seen.isBagOpen &&
      seen.silver?.isCoinDrawn === true &&
      seen.silver.isInWindow,
    ACTION_TIMEOUT,
    (seen: CaveLook) =>
      `With its bag opened after looting the silver coins, the first page ` +
      `tells ${describeCaveLook(seen)}.`,
  );
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'bag-silver.png');
  await tapKey(session, context, 'i');
  await waitFor(
    look,
    (seen: CaveLook) => !seen.isBagOpen,
    ACTION_TIMEOUT,
    (seen: CaveLook) =>
      `With its bag closed again, the first page tells ` +
      `${describeCaveLook(seen)}.`,
  );
}

/**
 * Saves views of the cells for the owner to look at, if the environment
 * names a directory for the views: looking steeply down on both cells from
 * the middle of the passage between them, and close on the bones in the
 * south cell from its bars, the camera turned to look into it.  The camera
 * ends as it started, with the player at the bars of the south cell.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the views are saved.
 */
async function saveCellViews(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  if (SCREENSHOT_DIR === undefined) {
    return;
  }
  await walkInCave(
    session,
    context,
    id,
    'a',
    (seen: CaveLook) => (seen.own?.z ?? -Infinity) >= -ON_PASSAGE,
    'back to the middle of the passage',
  );
  await tiltCamera(session, context, STEEP_TILT);
  await saveView(session, context, 'cave-cells.png');
  await tiltCamera(session, context, -STEEP_TILT);
  await walkInCave(
    session,
    context,
    id,
    'a',
    (seen: CaveLook) => (seen.own?.z ?? -Infinity) >= 1.1,
    'up to the bars of the south cell',
  );
  for (let turn = 0; turn < SKELETON_ZOOM_TURNS; turn++) {
    await zoomCamera(session, context, -ZOOM_DELTA);
  }
  await turnCamera(session, context, SKELETON_TURN);
  await saveView(session, context, 'cave-skeleton.png');
  await turnCamera(session, context, -SKELETON_TURN);
  for (let turn = 0; turn < SKELETON_ZOOM_TURNS; turn++) {
    await zoomCamera(session, context, ZOOM_DELTA);
  }
}

/**
 * Saves a view of the north store room for the owner to look at, if the
 * environment names a directory for the views: the camera turned to look
 * into it, and steeply down.  The camera ends as it started.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page, whose player
 *   stands in the north store room.
 * @returns {Promise<void>} A promise settled once the view is saved.
 */
async function saveStoreView(
  session: BidiSession,
  context: string,
): Promise<void> {
  if (SCREENSHOT_DIR === undefined) {
    return;
  }
  await turnCamera(session, context, -SKELETON_TURN);
  await tiltCamera(session, context, STEEP_TILT);
  await saveView(session, context, 'cave-store.png');
  await tiltCamera(session, context, -STEEP_TILT);
  await turnCamera(session, context, SKELETON_TURN);
}

/**
 * Has the player of a page at the bars before the prisoner, facing him and
 * not told yet who he is, talk to him, as {@link checkCaveChambers} tells.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the talks are over.
 * @throws {Error} If the page does not show them so.
 */
async function talkToEdwin(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  const look = (): Promise<CaveLook> => readCaveLook(session, context, id);
  const press = (key: string): Promise<void> =>
    tapKey(session, context, key);
  const isShowing = (seen: CaveLook, shown: DialogueShown): boolean =>
    JSON.stringify(seen.dialogue) === JSON.stringify(shown) &&
    seen.speech === null &&
    seen.prompt === null;
  const waitForDialogue = async (
    shown: DialogueShown,
    after: string,
  ): Promise<CaveLook> =>
    await waitFor(
      look,
      (seen: CaveLook) => isShowing(seen, shown),
      ACTION_TIMEOUT,
      (seen: CaveLook) =>
        `With ${after}, the first page tells ${describeCaveLook(seen)}.`,
    );
  const waitForEnd = async (after: string): Promise<CaveLook> =>
    await waitFor(
      look,
      (seen: CaveLook) =>
        seen.dialogue === null &&
        seen.own?.action === 'Idle' &&
        seen.spaceKey === ENVOY_TALK_KEY &&
        seen.prompt === ENVOY_TALK_PROMPT,
      ACTION_TIMEOUT,
      (seen: CaveLook) =>
        `With ${after}, the first page tells ${describeCaveLook(seen)}.`,
    );

  await press(' ');
  const pleading: CaveLook = await waitForDialogue(
    EDWIN_PLEA,
    'the space bar pressed at the bars before the prisoner',
  );
  await sendKey(session, context, 'keyDown', 'a');
  await sleep(DIALOGUE_HOLD_DURATION);
  await sendKey(session, context, 'keyUp', 'a');
  const held: CaveLook = await look();
  if (
    held.own?.x !== pleading.own?.x ||
    held.own?.z !== pleading.own?.z ||
    JSON.stringify(held.monsters) !== JSON.stringify(pleading.monsters) ||
    !isShowing(held, EDWIN_PLEA)
  ) {
    throw new Error(
      `With a key held down in the dialogue, the first page tells ` +
        `${describeCaveLook(held)}, from ${describeCaveLook(pleading)}.`,
    );
  }
  await checkBrowserKeys(session, context, 'the dialogue box');
  await chooseLanguage(session, context, LANGUAGE_CONTROL, ZH_TW_NAME);
  await waitForDialogue(
    ZH_TW_EDWIN_PLEA,
    `"${ZH_TW_NAME}" chosen while the prisoner pleads`,
  );
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'cave-edwin-talk.png');
  await chooseLanguage(session, context, ZH_TW_LANGUAGE_CONTROL, EN_NAME);
  await waitForDialogue(
    EDWIN_PLEA,
    `"${EN_NAME}" chosen again while the prisoner pleads`,
  );
  await press(BAG_KEYS.enter);
  await waitForDialogue(EDWIN_IDENTITY, 'the reply to the plea chosen');
  await press(BAG_KEYS.escape);
  await sleep(DIALOGUE_HOLD_DURATION);
  const escaped: CaveLook = await look();
  if (!isShowing(escaped, EDWIN_IDENTITY)) {
    throw new Error(
      `With Esc pressed as Edwin tells who he is, the first page tells ` +
        `${describeCaveLook(escaped)}.`,
    );
  }
  await press(BAG_KEYS.enter);
  await waitFor(
    look,
    (seen: CaveLook) =>
      isShowing(seen, EDWIN_ERRAND) &&
      seen.slots.includes('clovervale-message') &&
      seen.notices.includes(MESSAGE_NOTICE),
    ACTION_TIMEOUT,
    (seen: CaveLook) =>
      `With the key to Edwin's cell offered, the first page tells ` +
      `${describeCaveLook(seen)}.`,
  );
  await press(BAG_KEYS.enter);
  await waitForEnd('Enter pressed as Edwin gives his message');

  await press(' ');
  await waitFor(
    look,
    (seen: CaveLook) =>
      seen.dialogue === null &&
      seen.speech?.name === EDWIN_REMINDER.name &&
      seen.speech.line === EDWIN_REMINDER.line,
    ACTION_TIMEOUT,
    (seen: CaveLook) =>
      `With Edwin talked to by a player carrying his message, the first ` +
      `page tells ${describeCaveLook(seen)}.`,
  );
}

/**
 * Has the player of a page in its cave walk west along the middle of the
 * passage to before the prisoner, and north up to the bars of his cell,
 * as {@link checkCaveChambers} tells.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page of the
 *   player, which stands on the passage east of the prisoner, facing west,
 *   with the camera looking that way.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player is at the bars.
 * @throws {Error} If the page does not show it so.
 */
async function walkToEdwin(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  const edwin: Villager | undefined = VILLAGERS.find(
    (villager: Villager) => villager.map === 'cave',
  );
  const atEdwin: GroundVector =
    edwin === undefined ? { x: NaN, z: NaN } : locateVillager(edwin, 0, []);
  await walkInCave(
    session,
    context,
    id,
    'w',
    (seen: CaveLook) => (seen.own?.x ?? Infinity) <= atEdwin.x + 0.05,
    'along the passage to the cells',
  );
  const atBars: CaveLook = await walkInCave(
    session,
    context,
    id,
    'd',
    (seen: CaveLook) => (seen.own?.z ?? 0) <= -1.1,
    'up to the bars of the cell of the prisoner',
  );
  if (
    atBars.spaceKey !== EDWIN_TALK_KEY ||
    atBars.prompt !== EDWIN_TALK_PROMPT
  ) {
    throw new Error(
      `At the bars before the prisoner, the first page tells ` +
        `${describeCaveLook(atBars)}.`,
    );
  }
}

/**
 * Has the player of a page in its cave, at the bars of a cell, loot the
 * chest and both barrels of the north store room, as
 * {@link checkCaveChambers} tells, and walk back across the room.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page, whose camera
 *   looks west down the passage.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player stands back in
 *   the north store room, in line with its chest.
 * @throws {Error} If the page does not show it so.
 */
async function lootNorthStoreRoom(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  // The chest at the back of the north store room, with the sword.
  const north: CaveContainer | undefined = CAVE_CONTAINERS[NORTH_CHEST];
  await walkInCave(
    session,
    context,
    id,
    'a',
    (seen: CaveLook) => (seen.own?.z ?? -Infinity) >= -ON_PASSAGE,
    'back to the middle of the passage',
  );
  await walkInCave(
    session,
    context,
    id,
    'w',
    (seen: CaveLook) => (seen.own?.x ?? Infinity) <= (north?.x ?? 0) + 0.05,
    'along the passage to the store rooms',
  );
  const byChest: CaveLook = await walkInCave(
    session,
    context,
    id,
    'd',
    (seen: CaveLook) => seen.spaceKey === OPEN_CHEST_KEY,
    'up to the chest of the north store room',
  );
  if (byChest.prompt !== OPEN_CHEST_PROMPT) {
    throw new Error(
      `Before the chest of the north store room, the first page tells ` +
        `${describeCaveLook(byChest)}.`,
    );
  }
  const looted: CaveLook = await lootContainer(
    session,
    context,
    id,
    NORTH_CHEST,
  );
  if (!looted.notices.includes(SWORD_NOTICE)) {
    throw new Error(
      `With the chest of the north store room looted, the first page ` +
        `tells ${describeCaveLook(looted)}.`,
    );
  }

  // The barrel with a clover in the corner beside the chest.
  const corner: CaveContainer | undefined = CAVE_CONTAINERS[CORNER_BARREL];
  await walkInCave(
    session,
    context,
    id,
    'w',
    (seen: CaveLook) => (seen.own?.x ?? Infinity) <= (corner?.x ?? 0) + 0.65,
    'across the north store room',
  );
  await walkInCave(
    session,
    context,
    id,
    'd',
    (seen: CaveLook) => seen.spaceKey === OPEN_BARREL_KEY,
    'up to the barrel in the corner of the north store room',
  );
  await lootContainer(session, context, id, CORNER_BARREL);
  await saveStoreView(session, context);

  // The barrel by the passage, which holds no item but silver coins.
  await lootSilverBarrel(session, context, id, SILVER_BARREL);
  await walkInCave(
    session,
    context,
    id,
    'w',
    (seen: CaveLook) => (seen.own?.x ?? Infinity) <= (north?.x ?? 0) + 0.05,
    'back across the north store room',
  );
}

/**
 * Has the player of a page in its cave, in the north store room, loot the
 * chest and the barrel of the healing potion of the south store room, as
 * {@link checkCaveChambers} tells, the notice of the leather armor checked
 * in Traditional Chinese.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page, whose camera
 *   looks west down the passage.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player stands before
 *   the barrel looted, with English chosen again.
 * @throws {Error} If the page does not show it so.
 */
async function lootSouthStoreRoom(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  const look = (): Promise<CaveLook> => readCaveLook(session, context, id);

  // The chest at the back of the south store room, with the armor.
  const south: CaveContainer | undefined = CAVE_CONTAINERS[SOUTH_CHEST];
  await walkInCave(
    session,
    context,
    id,
    'a',
    (seen: CaveLook) => (seen.own?.z ?? -Infinity) >= -ON_PASSAGE,
    'back to the middle of the passage',
  );
  await walkInCave(
    session,
    context,
    id,
    's',
    (seen: CaveLook) => (seen.own?.x ?? -Infinity) >= (south?.x ?? 0) - 0.05,
    'along the passage before the store rooms',
  );
  await walkInCave(
    session,
    context,
    id,
    'a',
    (seen: CaveLook) => seen.spaceKey === OPEN_CHEST_KEY,
    'up to the chest of the south store room',
  );
  await lootContainer(session, context, id, SOUTH_CHEST);
  await chooseLanguage(session, context, LANGUAGE_CONTROL, ZH_TW_NAME);
  await waitFor(
    look,
    (seen: CaveLook) => seen.notices.includes(ZH_TW_ARMOR_NOTICE),
    ACTION_TIMEOUT,
    (seen: CaveLook) =>
      `With the leather armor looted and "${ZH_TW_NAME}" chosen, the ` +
      `first page tells ${describeCaveLook(seen)}.`,
  );
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'item-notice.png');
  await chooseLanguage(session, context, ZH_TW_LANGUAGE_CONTROL, EN_NAME);

  // The barrel with the healing potion in the corner beside the chest.
  const potion: CaveContainer | undefined = CAVE_CONTAINERS[POTION_BARREL];
  await walkInCave(
    session,
    context,
    id,
    's',
    (seen: CaveLook) =>
      (seen.own?.x ?? -Infinity) >= (potion?.x ?? 0) - 0.65,
    'across the south store room',
  );
  await walkInCave(
    session,
    context,
    id,
    'a',
    (seen: CaveLook) => seen.spaceKey === OPEN_BARREL_KEY,
    'up to the barrel in the corner of the south store room',
  );
  const byPotion: CaveLook = await lootContainer(
    session,
    context,
    id,
    POTION_BARREL,
  );
  if (!byPotion.notices.includes(POTION_NOTICE)) {
    throw new Error(
      `With the barrel of the healing potion looted, the first page ` +
        `tells ${describeCaveLook(byPotion)}.`,
    );
  }
}

/**
 * Has the player of a page in its cave, with the store rooms looted, open
 * its bag and click the slot of the sword, as {@link checkCaveChambers}
 * tells.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the bag shows the name of
 *   the sword, open, with Traditional Chinese chosen.
 * @throws {Error} If the page does not show it so.
 */
async function checkLootInBag(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  const look = (): Promise<CaveLook> => readCaveLook(session, context, id);
  await tapKey(session, context, 'i');
  const isShown = (seen: CaveLook): boolean =>
    seen.isBagOpen &&
    ['sword', 'leather-armor', 'clover'].every((kind: string) =>
      seen.slots.includes(kind),
    );
  await waitFor(look, isShown, ACTION_TIMEOUT, (seen: CaveLook) =>
    `With its bag opened after looting, the first page tells ` +
    `${describeCaveLook(seen)}.`,
  );
  await chooseLanguage(session, context, LANGUAGE_CONTROL, ZH_TW_NAME);
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'cave-bag.png');
  await evaluateInPage(session, context, SWORD_SLOT_CLICK_EXPRESSION);
  await tapKey(session, context, BAG_KEYS.escape);
  await waitFor(
    look,
    (seen: CaveLook) => seen.isBagOpen && seen.bagItemName === ZH_TW_SWORD,
    ACTION_TIMEOUT,
    (seen: CaveLook) =>
      `With the slot of the sword clicked in its open bag, the first page ` +
      `tells ${describeCaveLook(seen)}.`,
  );
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'bag-name.png');
}

/**
 * Has the player of a page in its cave, with its bag open in Traditional
 * Chinese, click the slot of the healing potion and press Enter on its
 * menu, as {@link checkCaveChambers} tells: the potion is used if the
 * fights left the player hurt, and refused otherwise.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the potion is used or
 *   refused, with the bag still open.
 * @throws {Error} If the page does not show it so.
 */
async function checkPotionUse(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  const look = (): Promise<CaveLook> => readCaveLook(session, context, id);
  const hurt: CaveLook = await look();
  const health: number = hurt.own?.health ?? FULL_HEALTH;
  const isHurt: boolean = health < FULL_HEALTH;
  const lastHeal: number = Math.max(
    0,
    ...hurt.heals.map((heal: HealEvent) => heal.id),
  );
  await evaluateInPage(session, context, POTION_SLOT_CLICK_EXPRESSION);
  await waitFor(
    look,
    (seen: CaveLook) =>
      seen.bagItemName === ZH_TW_POTION &&
      JSON.stringify(seen.menu) ===
        JSON.stringify(listZhTwPotionActions(isHurt)),
    ACTION_TIMEOUT,
    (seen: CaveLook) =>
      `With the slot of the healing potion clicked in its open bag, the ` +
      `first page tells ${describeCaveLook(seen)}.`,
  );
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'potion-menu.png');
  await tapKey(session, context, BAG_KEYS.enter);
  if (isHurt) {
    const healed: number = Math.min(health + POTION_HEALING, FULL_HEALTH);
    await waitFor(
      look,
      (seen: CaveLook) =>
        seen.own?.health === healed &&
        !seen.slots.includes('healing-potion') &&
        seen.heals.some(
          (heal: HealEvent) =>
            heal.id > lastHeal &&
            heal.target.kind === 'player' &&
            heal.target.id === id &&
            heal.amount === healed - health,
        ),
      ACTION_TIMEOUT,
      (seen: CaveLook) =>
        `With the healing potion used at health ${String(health)}, the ` +
        `first page tells ${describeCaveLook(seen)}.`,
    );
  } else {
    await sleep(VIEW_SETTLE_DURATION);
    const refused: CaveLook = await look();
    if (
      refused.own?.health !== FULL_HEALTH ||
      !refused.slots.includes('healing-potion') ||
      JSON.stringify(refused.menu) !==
        JSON.stringify(listZhTwPotionActions(false))
    ) {
      throw new Error(
        `With Enter pressed on the disabled use of the healing potion at ` +
          `full health, the first page tells ${describeCaveLook(refused)}.`,
      );
    }
  }
}

/**
 * Checks that a player in its cave talks to the prisoner through the bars
 * of his cell, loots the chests and two barrels of the store rooms, sees
 * what it takes in its bag, and uses the healing potion from it.
 *
 * The player walks west along the middle of the passage to before the
 * prisoner, and north up to the bars of his cell, which stop it, where its
 * page tells the space bar talks to him.  Once the space bar is pressed,
 * the dialogue box shows his plea and the one reply, without a bubble or a
 * prompt, worded again once Traditional Chinese is chosen in the panel,
 * and once English is again.  A key that would walk the player held down
 * then moves it not at all, the dogs stand still meanwhile, and the keys
 * of the browser are left to it.  Enter has
 * him tell who he is, under his name, and Esc changes nothing then.
 * Enter has him give his message, which shows in the bag and in a notice,
 * and Enter again ends the dialogue, after which the page calls him by his
 * name.  Talked to again, he only reminds the player in a bubble to hurry,
 * without a dialogue.  It walks on to the
 * north store room, up to the chest at its back, where its page tells the
 * space bar opens it; once it is pressed, the chest shows open, the sword
 * shows in the bag, and the space bar does nothing more there.  It loots
 * the barrel with a clover in the corner, then the barrel by the passage,
 * whose five silver coins the bag counts beside its coin, told in a notice
 * and filling no slot, and the chest of the south store
 * room and the barrel with the healing potion in its corner, and opens its
 * bag, which shows the sword, the leather armor and a clover, worded in
 * Traditional Chinese for a moment, with the name of the sword under the
 * slots once its slot is clicked.  Once the slot of the potion is clicked,
 * the menu of the potion offers to use it and to drop it.  If the fights
 * have left the player hurt, both can be chosen, and with Enter, the potion
 * is gone from the bag, and the player gets health back, as much as a
 * potion gives or as it lacks, shown as a heal.  If they have not, using
 * it is grayed out, and Enter leaves the potion in the bag, the menu open
 * and the player at full health.  It closes the bag.  Each
 * item looted is told in a notice, in Traditional Chinese too once it is
 * chosen.  It ends on the middle of the passage, before the store rooms.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page of the
 *   player, which stands on the passage east of the prisoner, facing west,
 *   with the camera looking that way.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If the page does not show it so.
 */
async function checkCaveChambers(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  const look = (): Promise<CaveLook> => readCaveLook(session, context, id);
  await walkToEdwin(session, context, id);
  await talkToEdwin(session, context, id);
  await saveCellViews(session, context, id);
  await lootNorthStoreRoom(session, context, id);
  await lootSouthStoreRoom(session, context, id);
  await checkLootInBag(session, context, id);
  await checkPotionUse(session, context, id);
  await chooseLanguage(session, context, ZH_TW_LANGUAGE_CONTROL, EN_NAME);
  await tapKey(session, context, 'i');
  await waitFor(
    look,
    (seen: CaveLook) => !seen.isBagOpen && seen.spaceKey === EMPTY_BARREL_KEY,
    ACTION_TIMEOUT,
    (seen: CaveLook) =>
      `With its bag closed again, the first page tells ` +
      `${describeCaveLook(seen)}.`,
  );
  await walkInCave(
    session,
    context,
    id,
    'd',
    (seen: CaveLook) => (seen.own?.z ?? Infinity) <= ON_PASSAGE,
    'back to the middle of the passage',
  );
}

/**
 * Has the player of a page in its cave fight a wild dog of the cave until
 * the page tells the dog is dead.  The player stands where it is, and
 * presses the space bar for a slash whenever the page tells it is not
 * slashing already and the dog stands alive within the reach of a slash,
 * after a tap of the keys that turn it toward the dog if it does not face
 * it.  A dog that comes to the player is never out of the reach of its
 * slashes for long, as the dog stops in front of it to bite.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page, whose camera
 *   looks west down the passage.
 * @param {number} id - The identifier of the player.
 * @param {number} dogId - The identifier of the dog.
 * @param {string | null} shot - The file name to save the view under once
 *   the page shows the second hit of the player on the dog, or `null` to
 *   save none.
 * @returns {Promise<void>} A promise settled once the dog is dead.
 * @throws {Error} If the dog is not dead in time, or the player dies.
 */
async function fightCaveDog(
  session: BidiSession,
  context: string,
  id: number,
  dogId: number,
  shot: string | null,
): Promise<void> {
  const describeProblem = (seen: CaveLook): string =>
    `Fighting dog ${String(dogId)} of the cave, the first page tells ` +
    `${describeCaveLook(seen)}.`;
  const deadline: number = Date.now() + MONSTER_TIMEOUT * 2;
  let pendingShot: string | null = shot;
  for (;;) {
    const seen: CaveLook = await readCaveLook(session, context, id);
    const dog: MonsterState | undefined = seen.monsters.find(
      (monster: MonsterState) => monster.id === dogId,
    );
    const own: CaveLook['own'] = seen.own;
    if (dog?.mode === 'dead') {
      return;
    }
    if (own === null || own.action === 'Die' || Date.now() > deadline) {
      throw new Error(describeProblem(seen));
    }
    const hits: number = seen.hits.filter(
      (hit: HitEvent) =>
        hit.attacker.kind === 'player' &&
        hit.attacker.id === id &&
        hit.target.kind === 'monster' &&
        hit.target.id === dogId,
    ).length;
    if (pendingShot !== null && hits >= 2) {
      await saveView(session, context, pendingShot);
      pendingShot = null;
    }
    if (
      dog !== undefined &&
      own.action !== 'Slash' &&
      Math.hypot(dog.x - own.x, dog.z - own.z) <= SLASH_REACH - 0.1
    ) {
      const turn: number =
        (Math.round(
          (Math.atan2(dog.x - own.x, dog.z - own.z) * 4) / Math.PI,
        ) +
          8) %
        8;
      const isFacing: boolean =
        Math.abs(((own.yaw - turn * 45 + 540) % 360) - 180) <= 45;
      if (!isFacing) {
        // The camera looks west, which turns the keys by a quarter turn
        // from the first view of the village.
        const keys: readonly string[] = TURN_KEYS[(turn + 6) % 8] ?? [];
        for (const key of keys) {
          await sendKey(session, context, 'keyDown', key);
        }
        await sleep(TAP_DURATION);
        for (const key of keys) {
          await sendKey(session, context, 'keyUp', key);
        }
      }
      await tapKey(session, context, ' ');
    }
    await sleep(POLL_INTERVAL);
  }
}

/**
 * Checks that a player goes down into a cave of its own at the burrow of
 * the wild dog among the spawn stones, and climbs back up out of it by the
 * rope at the bottom of the old well shaft.  In the burrow, its page tells
 * the space bar goes down, and once the space bar is pressed, the page
 * shows the cave, lit by its torches, with the player at the landing at the
 * foot of the slope, alone but for the two wild dogs of the cave, while the
 * other page no longer shows the player.  The dog by the cells notices the
 * player at once, and the player kills it there with its slashes, as
 * {@link fightCaveDog} tells; it then walks west until the other dog
 * notices it, and kills that one too.  The prisoner, on the screen, then
 * calls out for help in a bubble.  The player talks to the prisoner
 * and loots the store rooms, as {@link checkCaveChambers} tells, and walks
 * on west down the passage to the rope, where its
 * page tells the space bar climbs up, and once it is pressed, both pages
 * show the player beside the old well in the yard of the chief's house.
 *
 * The player walks to the spawn stones as in {@link checkMonster}.  The dog
 * is left alive: while it stands where a slash would hit it, the space bar
 * slashes, and the player turns away from it, a tap of a key at a time,
 * until the space bar goes down.  In the cave, the camera looks the way
 * the player faces as it arrives, west down the passage, and the player
 * walks forward until its page tells the space bar climbs up.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If either page does not show the cave so.
 */
export async function checkCave(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
): Promise<void> {
  const look = (): Promise<CaveLook> => readCaveLook(session, actor, id);
  const readBoth = (): Promise<[CaveLook, CaveLook]> =>
    Promise.all([look(), readCaveLook(session, watcher, id)]);
  await walkUntil(
    session,
    actor,
    id,
    'a',
    (seen: MonsterLook) => (seen.own?.x ?? Infinity) <= 1.5,
    'to the path',
  );
  await walkUntil(
    session,
    actor,
    id,
    'd',
    (seen: MonsterLook) => (seen.own?.x ?? -Infinity) >= -0.8,
    'to the path',
  );
  await walkUntil(
    session,
    actor,
    id,
    's',
    (seen: MonsterLook) => (seen.own?.z ?? -Infinity) >= ROUTE_LEAST_Z,
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
    (seen: MonsterLook) => (seen.own?.x ?? -Infinity) >= BURROW_X,
    'into the burrow',
  );
  const deadline: number = Date.now() + LEG_TIMEOUT;
  let seen: CaveLook = await look();
  while (seen.map !== 'cave') {
    if (Date.now() > deadline) {
      throw new Error(
        `In the burrow, the first page tells ${describeCaveLook(seen)}.`,
      );
    }
    if (seen.spaceKey === ENTER_KEY && seen.own?.action === 'Idle') {
      if (seen.prompt !== ENTER_PROMPT) {
        throw new Error(
          `In the burrow, the first page tells ${describeCaveLook(seen)}.`,
        );
      }
      await tapKey(session, actor, ' ');
    } else if (seen.own !== null && seen.monster !== null) {
      // Turn away from the dog, which stands where a slash would hit it.
      const dx: number = seen.own.x - seen.monster.x;
      const dz: number = seen.own.z - seen.monster.z;
      const turn: number =
        (Math.round((Math.atan2(dx, dz) * 4) / Math.PI) + 8) % 8;
      for (const key of TURN_KEYS[turn] ?? []) {
        await sendKey(session, actor, 'keyDown', key);
      }
      await sleep(TAP_DURATION);
      for (const key of TURN_KEYS[turn] ?? []) {
        await sendKey(session, actor, 'keyUp', key);
      }
    }
    await sleep(POLL_INTERVAL * 3);
    seen = await look();
  }

  const isNear = (
    own: CaveLook['own'],
    place: { readonly x: number; readonly z: number },
  ): boolean =>
    own !== null &&
    Math.hypot(own.x - place.x, own.z - place.z) <= ARRIVAL_NEARNESS;
  const [below] = await waitFor(
    readBoth,
    ([own, other]: [CaveLook, CaveLook]) =>
      own.map === 'cave' &&
      isNear(own.own, CAVE_LANDING) &&
      own.figures.length === 1 &&
      own.figures[0] === id &&
      own.monsters.length === CAVE_DOG_HOMES.length &&
      own.monsters.every(
        (monster: MonsterState) =>
          monster.kind === 'cave-dog' && monster.mode !== 'dead',
      ) &&
      !other.figures.includes(id),
    ACTION_TIMEOUT,
    ([own, other]: [CaveLook, CaveLook]) =>
      `With its player gone down the burrow, the first page tells ` +
      `${describeCaveLook(own)}, and the second page ` +
      `${describeCaveLook(other)}.`,
  );
  await sleep(FADE_DURATION);
  const landing: Pixels = await captureView(session, actor);
  const brightness: number = measureBrightness(landing);
  if (brightness < CAVE_LEAST_BRIGHTNESS) {
    throw new Error(
      `With its player in the cave, the first page draws a brightness of ` +
        `${brightness.toFixed(1)}, ${describeCaveLook(below)}.`,
    );
  }
  await saveView(session, actor, 'cave-dogs.png');
  await fightCaveDog(session, actor, id, 1, 'cave-dog-fight.png');
  await saveView(session, actor, 'cave-landing.png');
  await saveCaveViews(session, actor);
  await walkInCave(
    session,
    actor,
    id,
    'w',
    (shown: CaveLook) =>
      shown.monsters.some(
        (monster: MonsterState) =>
          monster.id === 2 && monster.mode === 'chase',
      ),
    'until the other dog notices it',
  );
  await fightCaveDog(session, actor, id, 2, null);
  await waitFor(
    look,
    (shown: CaveLook) =>
      shown.speech?.name === EDWIN_CALL.name &&
      shown.speech.line === EDWIN_CALL.line,
    ACTION_TIMEOUT,
    (shown: CaveLook) =>
      `With both dogs of the cave dead, the first page tells ` +
      `${describeCaveLook(shown)}.`,
  );
  await checkCaveChambers(session, actor, id);

  await sendKey(session, actor, 'keyDown', 'w');
  try {
    await waitFor(
      look,
      (shown: CaveLook) => shown.spaceKey === CLIMB_KEY,
      LEG_TIMEOUT,
      (shown: CaveLook) =>
        `With the W key held down to walk to the rope, the first page ` +
        `tells ${describeCaveLook(shown)}.`,
    );
  } finally {
    await sendKey(session, actor, 'keyUp', 'w');
  }
  await waitFor(
    look,
    (shown: CaveLook) =>
      shown.own?.action === 'Idle' &&
      shown.spaceKey === CLIMB_KEY &&
      shown.prompt === CLIMB_PROMPT &&
      shown.own.x < CAVE_ROPE.x + 1.5,
    ACTION_TIMEOUT,
    (shown: CaveLook) =>
      `By the rope, the first page tells ${describeCaveLook(shown)}.`,
  );
  await saveView(session, actor, 'cave-well.png');
  await tapKey(session, actor, ' ');
  await waitFor(
    readBoth,
    ([own, other]: [CaveLook, CaveLook]) =>
      own.map === 'village' &&
      isNear(own.own, WELL_STAND) &&
      own.figures.includes(id) &&
      other.figures.includes(id) &&
      isNear(other.own, WELL_STAND),
    ACTION_TIMEOUT,
    ([own, other]: [CaveLook, CaveLook]) =>
      `With its player climbed up the rope, the first page tells ` +
      `${describeCaveLook(own)}, and the second page ` +
      `${describeCaveLook(other)}.`,
  );
  await sleep(FADE_DURATION);
  await saveView(session, actor, 'cave-out.png');
}
