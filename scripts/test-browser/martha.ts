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
 * @module scripts/test-browser/martha Checks the fight and the talk with
 *   Martha.
 */

import { setTimeout as sleep } from 'node:timers/promises';

import { SLASH_REACH, VILLAGERS, locateVillager } from '@clovervale/shared';
import type {
  GroundVector,
  MonsterState,
  PlayerState,
  Villager,
} from '@clovervale/shared';
import type { DialogueShown } from '../../packages/client/src/dialogue-view.ts';
import type { MonsterView } from '../../packages/client/src/monster-figures.ts';
import type { PitchforkView } from '../../packages/client/src/martha-figure.ts';

import type { BidiSession } from './bidi.ts';
import { turnCamera, zoomCamera } from './camera.ts';
import {
  ACTION_TIMEOUT,
  BAG_KEYS,
  DIALOGUE_HOLD_DURATION,
  HELP_KEYS,
  LEG_TIMEOUT,
  MONSTER_TIMEOUT,
  POLL_INTERVAL,
  SCREENSHOT_DIR,
  TAP_DURATION,
  TURN_KEYS,
  VIEW_SETTLE_DURATION,
} from './constants.ts';
import { checkEnding } from './ending.ts';
import { readHelpLook } from './help.ts';
import {
  evaluateInPage,
  saveView,
  sendKey,
  tapKey,
  waitFor,
} from './page.ts';

/** Martha as a page shows her, and its own player. */
interface MarthaLook {
  /** The map the page shows. */
  readonly map: string;
  /** The player of the page in the latest snapshot, if it is there. */
  readonly own: PlayerState | null;
  /** Martha in the latest snapshot, if she is there. */
  readonly martha: MonsterState | null;
  /** Martha as the page draws her, if it does. */
  readonly shown: MonsterView | null;
  /**
   * Whether Martha's pitchfork is drawn against the wall, and on the
   * ground, each `null` until its model is loaded.
   */
  readonly pitchfork: PitchforkView;
  /** The way the camera looks, in degrees, as the yaw of a player. */
  readonly heading: number;
  /** The dialogue box, or `null` while it is closed. */
  readonly dialogue: DialogueShown | null;
  /** The kinds of the items in the slots of the bag. */
  readonly slots: readonly string[];
  /** The notices of the items got. */
  readonly notices: readonly string[];
}

/** The notice of the token Martha gives up once beaten. */
const TOKEN_NOTICE = 'You got the token of the Clovervale spy';
/**
 * The dialogue box as Martha first asks a player Edwin has told who he is,
 * as it climbs out of her well.
 */
const MARTHA_ASK: DialogueShown = {
  name: 'Chief Martha',
  line: 'Who are you? What were you doing down the well?',
  replies: [
    "Chief! There's a royal envoy locked up down the well. Quick, go and " +
      'save him!',
  ],
  cursor: 0,
};
/** The dialogue box as Martha owns up to being the spy. */
const MARTHA_CONFESSION: DialogueShown = {
  name: 'Chief Martha',
  line:
    "Hmph, so you found out! I'm an enemy spy. That royal envoy tried to " +
    "sneak off with what he'd learnt, so I caught him and locked him up. " +
    'Now that you know too, you can stay and keep him company!',
  replies: [],
  cursor: 0,
};
/** How far Martha stands from her porch at the least to have come over. */
const MARTHA_LEAST_WALK = 1.5;
/** How many views of a thrust of Martha's pitchfork are saved. */
const THRUST_VIEW_COUNT = 10;
/** How long after each other the views of a thrust are saved, in ms. */
const THRUST_VIEW_INTERVAL = 60;
/**
 * How far the camera is turned round the player to look at Martha from
 * the side, the side of the well, away from the great tree, as a share of
 * the height of the view to drag across.
 */
const MARTHA_CAMERA_TURN = -0.25;
/**
 * How far the wheel is turned to zoom the camera in on Martha, in pixels,
 * below zero.
 */
const MARTHA_CAMERA_ZOOM = -1000;
/** How long Martha is left sitting before her view is saved, in ms. */
const SIT_SETTLE_DURATION = 1500;

/**
 * Makes the expression that tells how a page shows Martha and its own
 * player, as JSON.
 *
 * @param {number} id - The identifier of the player.
 * @returns {string} The expression.
 */
function createMarthaExpression(id: number): string {
  return `(() => {
    const martha = window.clovervale.listLatestMonsters()
      .find((monster) => monster.kind === 'martha') ?? null;
    const shown = martha === null
      ? undefined
      : window.clovervale.describeMonsters()
          .find((monster) => monster.id === martha.id);
    return JSON.stringify({
      map: window.clovervale.describeMap(),
      own: window.clovervale.listLatestPlayers()
        .find((player) => player.id === ${String(id)}) ?? null,
      martha,
      shown: shown ?? null,
      pitchfork: window.clovervale.describePitchfork(),
      heading: window.clovervale.describeHeading(),
      dialogue: window.clovervale.describeDialogue(),
      slots: [...document.querySelectorAll('.bag-slot')]
        .map((slot) => slot.dataset.kind ?? ''),
      notices: [...document.querySelectorAll('.item-notice')]
        .map((notice) => notice.textContent),
    });
  })()`;
}

/**
 * Reads how a page shows Martha and its own player.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<MarthaLook>} How the page shows them.
 */
async function readMarthaLook(
  session: BidiSession,
  context: string,
  id: number,
): Promise<MarthaLook> {
  return JSON.parse(
    await evaluateInPage(session, context, createMarthaExpression(id)),
  ) as MarthaLook;
}

/**
 * Describes how a page shows Martha and its own player, for the error
 * messages.
 *
 * @param {MarthaLook} look - How the page shows them.
 * @returns {string} The description.
 */
function describeMarthaLook(look: MarthaLook): string {
  return (
    `the ${look.map} with the player ${JSON.stringify(look.own)}, Martha ` +
    `${JSON.stringify(look.martha)} drawn as ${JSON.stringify(look.shown)}, ` +
    `the pitchfork ${JSON.stringify(look.pitchfork)}, the dialogue ` +
    `${JSON.stringify(look.dialogue)}, the bag ${JSON.stringify(look.slots)} ` +
    `and the notices ${JSON.stringify(look.notices)}`
  );
}

/**
 * Checks that Martha comes over to a player that has climbed out of her
 * well, talks with it, fights it with her pitchfork, and sits down beaten.
 *
 * Both pages see her come away from her porch with her pitchfork, which
 * is no longer drawn against the wall of her house, and stand by the
 * player on her guard; the page of the player shows her asking who it is,
 * with the reply that tells of the envoy, as Edwin has told it who he is,
 * and Esc changes nothing.  Enter has her own up to being the spy, and
 * Enter again ends the dialogue, after which she fights the player, her
 * health shown.  The player slashes at her, stepping up to her and
 * turning to face her, until she sits beaten on the ground, her pitchfork
 * dropped beside her, which both pages show, and it gets her token, which
 * shows in the bag and in a notice, and with it, as it carries Edwin's
 * message, the ending, as {@link checkEnding} tells.  The camera of the
 * page of the player is turned to look at the two of them from the side,
 * and zoomed in, while she talks and fights, and turned and zoomed back
 * after; the keys that turn the player turn it the way the camera then
 * has them.
 * The views of her on her guard, of a thrust of her pitchfork, frame by
 * frame, of the fight and of her sitting are saved if the environment
 * names a directory for them.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player,
 *   which stands beside the well, the camera behind it.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If either page does not show it so.
 */
export async function checkMartha(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
): Promise<void> {
  const look = (): Promise<MarthaLook> => readMarthaLook(session, actor, id);
  const readBoth = (): Promise<[MarthaLook, MarthaLook]> =>
    Promise.all([look(), readMarthaLook(session, watcher, id)]);
  const press = (key: string): Promise<void> => tapKey(session, actor, key);
  const porch = VILLAGERS.find(
    (villager: Villager) => villager.id === 'martha',
  );
  if (porch === undefined) {
    throw new Error('There is no Martha among the villagers.');
  }
  const home: GroundVector = locateVillager(porch, 0, []);
  const isArmedFor = (seen: MarthaLook): boolean =>
    seen.martha?.isArmed === true &&
    seen.shown?.isWeaponShown === true &&
    seen.pitchfork.isOnWall === false &&
    seen.pitchfork.isOnGround === false &&
    Math.hypot(seen.martha.x - home.x, seen.martha.z - home.z) >=
      MARTHA_LEAST_WALK;
  const isAsking = (seen: MarthaLook): boolean =>
    JSON.stringify(seen.dialogue) === JSON.stringify(MARTHA_ASK);
  const isHelpOpen = async (): Promise<boolean> =>
    (await readHelpLook(session, actor)).isOpen;
  // The help sheet, opened as Martha comes over, closes as she starts to
  // talk, if she has not started already.
  await press(HELP_KEYS.help);
  await waitFor(
    readBoth,
    ([own, other]: [MarthaLook, MarthaLook]) =>
      isAsking(own) &&
      own.martha?.mode === 'talk' &&
      own.shown?.isBarShown === false &&
      isArmedFor(own) &&
      other.martha?.mode === 'talk' &&
      isArmedFor(other),
    LEG_TIMEOUT,
    ([own, other]: [MarthaLook, MarthaLook]) =>
      `With its player climbed out of the well, the first page tells ` +
      `${describeMarthaLook(own)}, and the second page ` +
      `${describeMarthaLook(other)}.`,
  );
  await waitFor(
    isHelpOpen,
    (isOpen: boolean) => !isOpen,
    ACTION_TIMEOUT,
    () => 'As Martha asks, the first page shows its help sheet.',
  );
  await press(HELP_KEYS.help);
  await sleep(VIEW_SETTLE_DURATION);
  if ((await isHelpOpen()) || !isAsking(await look())) {
    throw new Error(
      'With H pressed as Martha asks, the first page shows its help ' +
        `sheet, and tells ${describeMarthaLook(await look())}.`,
    );
  }
  await turnCamera(session, actor, MARTHA_CAMERA_TURN);
  await zoomCamera(session, actor, MARTHA_CAMERA_ZOOM);
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, actor, 'martha-guard.png');
  await press(BAG_KEYS.escape);
  await sleep(DIALOGUE_HOLD_DURATION);
  const escaped: MarthaLook = await look();
  if (!isAsking(escaped)) {
    throw new Error(
      `With Esc pressed as Martha asks, the first page tells ` +
        `${describeMarthaLook(escaped)}.`,
    );
  }
  await press(BAG_KEYS.enter);
  await waitFor(
    look,
    (seen: MarthaLook) =>
      JSON.stringify(seen.dialogue) === JSON.stringify(MARTHA_CONFESSION),
    ACTION_TIMEOUT,
    (seen: MarthaLook) =>
      `With the reply to Martha chosen, the first page tells ` +
      `${describeMarthaLook(seen)}.`,
  );
  await press(BAG_KEYS.enter);
  await waitFor(
    look,
    (seen: MarthaLook) =>
      seen.dialogue === null &&
      seen.martha?.mode === 'chase' &&
      seen.shown?.isBarShown === true,
    ACTION_TIMEOUT,
    (seen: MarthaLook) =>
      `With Martha's confession ended, the first page tells ` +
      `${describeMarthaLook(seen)}.`,
  );

  const deadline: number = Date.now() + MONSTER_TIMEOUT * 2;
  let isThrustSaved = SCREENSHOT_DIR === undefined;
  let isFightSaved = SCREENSHOT_DIR === undefined;
  for (;;) {
    const seen: MarthaLook = await look();
    const { own, martha } = seen;
    if (martha?.mode === 'sit') {
      break;
    }
    if (own === null || own.action === 'Die' || Date.now() > deadline) {
      throw new Error(
        `Fighting Martha, the first page tells ${describeMarthaLook(seen)}.`,
      );
    }
    if (!isThrustSaved && seen.shown?.clip === 'Attack') {
      const start: number = Date.now();
      for (let frame = 1; frame <= THRUST_VIEW_COUNT; frame++) {
        const at = String(Date.now() - start).padStart(3, '0');
        await saveView(
          session,
          actor,
          `martha-thrust-${String(frame).padStart(2, '0')}-${at}ms.png`,
        );
        await sleep(THRUST_VIEW_INTERVAL);
      }
      isThrustSaved = true;
      continue;
    }
    if (!isFightSaved && (martha?.health ?? Infinity) < 100) {
      await saveView(session, actor, 'martha-fight.png');
      isFightSaved = true;
    }
    if (martha !== null && own.action !== 'Slash') {
      const apart: number = Math.hypot(martha.x - own.x, martha.z - own.z);
      const turn: number =
        (Math.round(
          (Math.atan2(martha.x - own.x, martha.z - own.z) * 4) / Math.PI,
        ) +
          8) %
        8;
      const isFacing: boolean =
        Math.abs(((own.yaw - turn * 45 + 540) % 360) - 180) <= 45;
      const isNear: boolean = apart <= SLASH_REACH - 0.1;
      // The player steps towards her while she is out of its reach, and
      // turns to face her where it is not facing her.
      if (!isNear || !isFacing) {
        // The keys walk the way they do as the camera looks, which a key
        // walking down the view from the first view of the village, north,
        // as the player faced as it climbed out.
        const shift: number = Math.round((seen.heading - 180) / 45);
        const keys: readonly string[] =
          TURN_KEYS[(((turn - shift) % 8) + 8) % 8] ?? [];
        for (const key of keys) {
          await sendKey(session, actor, 'keyDown', key);
        }
        await sleep(TAP_DURATION);
        for (const key of keys) {
          await sendKey(session, actor, 'keyUp', key);
        }
      }
      if (isNear) {
        await press(' ');
      }
    }
    await sleep(POLL_INTERVAL);
  }
  await waitFor(
    readBoth,
    ([own, other]: [MarthaLook, MarthaLook]) =>
      own.shown?.clip === 'Sit' &&
      !own.shown.isBarShown &&
      !own.shown.isWeaponShown &&
      own.pitchfork.isOnGround === true &&
      own.pitchfork.isOnWall === false &&
      other.pitchfork.isOnGround === true &&
      own.slots.includes('spy-token') &&
      own.notices.includes(TOKEN_NOTICE) &&
      other.martha?.mode === 'sit' &&
      other.shown?.clip === 'Sit',
    ACTION_TIMEOUT,
    ([own, other]: [MarthaLook, MarthaLook]) =>
      `With Martha beaten, the first page tells ${describeMarthaLook(own)}, ` +
      `and the second page ${describeMarthaLook(other)}.`,
  );
  // The player now holds Edwin's message and her token in the village.
  await checkEnding(session, actor, id);
  await sleep(SIT_SETTLE_DURATION);
  await saveView(session, actor, 'martha-sitting.png');
  await zoomCamera(session, actor, -MARTHA_CAMERA_ZOOM);
  await turnCamera(session, actor, -MARTHA_CAMERA_TURN);
}
