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
 * @module scripts/test-browser/toby-quest Checks the quest of the hurt Toby.
 */

import { setTimeout as sleep } from 'node:timers/promises';

import { STEP_MILLISECONDS, findPlacement } from '@clovervale/shared';
import type { GroundVector } from '@clovervale/shared';
import type { DialogueShown } from '../../packages/client/src/dialogue-view.ts';

import type { BidiSession } from './bidi.ts';
import { zoomCamera } from './camera.ts';
import {
  ACTION_TIMEOUT,
  BAG_KEYS,
  BY_TOBY,
  DIALOGUE_HOLD_DURATION,
  ITEM_NEARNESS,
  MONSTER_TIMEOUT,
  NETWORK_DELAY,
  SCREENSHOT_DIR,
  TOBY_FIND_TIMEOUT,
  TOBY_SQUAT,
  VIEW_SETTLE_DURATION,
} from './constants.ts';
import {
  evaluateInPage,
  saveView,
  setControl,
  tapKey,
  waitFor,
} from './page.ts';
import type { MenuActionView, SpeechWordsView } from './page.ts';
import {
  describeQuestLook,
  faceInVillage,
  readQuestLook,
  walkInVillage,
} from './village-walk.ts';
import type { QuestLook } from './village-walk.ts';

/** Where Martha stands on her porch. */
const MARTHA_HOME_SPOT: GroundVector = findPlacement('martha');
/** Where a player stands before Martha on her porch. */
const BY_MARTHA: GroundVector = (() => {
  const { x, z, yaw } = findPlacement('martha');
  const turn: number = (yaw * Math.PI) / 180;
  return { x: x + Math.sin(turn) * 1.2, z: z + Math.cos(turn) * 1.2 };
})();
/** Where a player stands off Martha's porch, out of her reach. */
const AWAY_FROM_MARTHA: GroundVector = (() => {
  const { x, z, yaw } = findPlacement('martha');
  const turn: number = (yaw * Math.PI) / 180;
  return { x: x + Math.sin(turn) * 3.6, z: z + Math.cos(turn) * 3.6 };
})();
/** The dialogue box as Martha asks after Toby, her jar lost. */
const MARTHA_WONDER: DialogueShown = {
  name: 'Chief Martha',
  line: "How's Toby doing? Did you put the ointment on him?",
  replies: ["Sorry, I've lost the ointment."],
  cursor: 0,
};
/** The dialogue box as Martha gives another jar. */
const MARTHA_REPLACE: DialogueShown = {
  name: 'Chief Martha',
  line: "Never mind, I'll fetch you another jar. Here, take it to Toby, quick!",
  replies: [],
  cursor: 0,
};
/** How many times a player tries to talk to Toby as he picks. */
const QUEST_TALK_TRIES = 3;
/** The prompt to talk to Toby. */
const TOBY_TALK_PROMPT = 'Press Space to talk to Toby';
/** The prompt to talk to Martha. */
const MARTHA_TALK_PROMPT = 'Press Space to talk to Chief Martha';
/** The dialogue box as Toby tells of his fall, in English. */
const TOBY_HURT: DialogueShown = {
  name: 'Toby',
  line:
    'Waaah… I fell down just now and it really hurts. Mommy and Daddy have ' +
    "both gone to the fields. Mommy said if anything's wrong, I can go to " +
    'the village chief…',
  replies: [
    "I'll go ask the village chief. You wait here, and don't wander off.",
  ],
  cursor: 0,
};
/** What Toby moans to a player on the quest without the ointment. */
const TOBY_MOAN: SpeechWordsView = { name: 'Toby', line: 'Owww, it hurts…' };
/** The dialogue box as Martha welcomes a player on the quest. */
const MARTHA_WELCOME: DialogueShown = {
  name: 'Chief Martha',
  line: 'Hello, stranger! What can I do for you?',
  replies: [
    'Toby was playing outside and fell down and hurt himself. Do you have ' +
      'any medicine?',
  ],
  cursor: 0,
};
/** The dialogue box as Martha gives her ointment. */
const MARTHA_OINTMENT: DialogueShown = {
  name: 'Chief Martha',
  line:
    'Oh my goodness! Children, always running around. Is it bad? Here, ' +
    'take this ointment to Toby, quick!',
  replies: [],
  cursor: 0,
};
/** What Martha tells a player who carries her ointment. */
const MARTHA_HURRY: SpeechWordsView = {
  name: 'Chief Martha',
  line: 'Go on, take it to Toby, quick!',
};
/** The dialogue box as Toby moans to a player who brings the ointment. */
const TOBY_ACHE: DialogueShown = {
  name: 'Toby',
  line: 'Owww, it hurts…',
  replies: [
    "Hold still, I'll put some ointment on it. There, all done. Be careful " +
      "when you're playing from now on, OK?",
  ],
  cursor: 0,
};
/** The dialogue box as Toby thanks the player and gives it a clover. */
const TOBY_THANKS: DialogueShown = {
  name: 'Toby',
  line: "Okay. Thank you! This one's for you!",
  replies: [],
  cursor: 0,
};
/** What Toby says in passing to a player who has done the quest. */
const TOBY_ORDINARY_LINES: ReadonlySet<string> = new Set([
  "Mommy says I can't go outside. There are wild dogs out there.",
  'If you want something, go see the village chief. She lives in the ' +
    'biggest house!',
  "I'm looking for a four-leaf one! If you find one, you'll have good luck.",
  "Here, this one's for you! It brings good luck.",
]);
/** The name of the ointment. */
const OINTMENT_NAME = "jar of Martha's ointment";
/** The notice of the ointment received from Martha. */
const OINTMENT_NOTICE = `You got a ${OINTMENT_NAME}`;
/** The prompt by the ointment on the ground. */
const OINTMENT_PROMPT = `Press Space to pick up the ${OINTMENT_NAME}`;
/** The actions the menu of the ointment in the bag lists. */
const OINTMENT_ACTIONS: readonly MenuActionView[] = [
  { label: 'Drop', isEnabled: true },
];
/** The notice of the four-leaf clover Toby gives. */
const QUEST_CLOVER_NOTICE = 'You got a four-leaf clover';
/**
 * How far the wheel is turned to zoom the camera in on the ointment on the
 * ground, in pixels, below zero.
 */
const OINTMENT_CAMERA_ZOOM = -1500;
/**
 * The expression that clicks the slot of the ointment in the bag of a
 * page, and gives the number of the slot, or -1.
 */
const OINTMENT_SLOT_CLICK_EXPRESSION = `(() => {
  const slots = [...document.querySelectorAll('.bag-slot')];
  const index = slots.findIndex(
    (slot) => slot.dataset.kind === 'martha-ointment',
  );
  slots[index]?.click();
  return String(index);
})()`;

/**
 * Has the player of a page, standing by the patch of clover by the gate
 * and facing it, talk to Toby as he picks there: it waits for the page to
 * prompt it to talk to him as he picks, presses the space bar, and waits
 * for what he says, trying again on a later round of his if it talked to
 * nobody.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @param {(look: QuestLook) => boolean} isAnswered - Tells whether the page
 *   shows what he is to say.
 * @param {string} what - What he is to say, for the error messages.
 * @returns {Promise<QuestLook>} How the page shows it once he says it.
 * @throws {Error} If he never says it.
 */
async function talkToToby(
  session: BidiSession,
  context: string,
  id: number,
  isAnswered: (look: QuestLook) => boolean,
  what: string,
): Promise<QuestLook> {
  const look = (): Promise<QuestLook> => readQuestLook(session, context, id);
  for (let tries = 1; ; tries++) {
    await waitFor(
      look,
      (seen: QuestLook) =>
        seen.prompt === TOBY_TALK_PROMPT &&
        seen.toby?.activity === 'Pick' &&
        seen.dialogue === null,
      TOBY_FIND_TIMEOUT,
      (seen: QuestLook) =>
        `Waiting by the patch by the gate to talk to Toby, the first page ` +
        `tells ${describeQuestLook(seen)}.`,
    );
    await tapKey(session, context, ' ');
    try {
      return await waitFor(look, isAnswered, ACTION_TIMEOUT, () => '');
    } catch (error: unknown) {
      if (tries >= QUEST_TALK_TRIES) {
        throw new Error(
          `With the space bar pressed by Toby, the first page never shows ` +
            `${what}: it tells ${describeQuestLook(await look())}.`,
          { cause: error },
        );
      }
    }
  }
}

/**
 * Checks that a player plays the quest of Toby, hurt, through, as a player
 * who has beaten Martha.
 *
 * The player walks to the patch of clover by the gate, facing it, and
 * talks to Toby as he picks there.  The dialogue box shows him telling of
 * his fall, with the reply that promises to ask the village chief, while
 * he goes on running his course and the player stands still; Enter ends
 * it.  Talked to again, he only moans in a bubble that it hurts.  The
 * player walks up to Martha, idling on her porch, and talks to her behind
 * a slow connection: the dialogue box shows her welcome, with the reply
 * that asks her for medicine for Toby, and Enter has her give her ointment,
 * which shows in the bag and in a notice; Enter ends the dialogue, and
 * talked to again, she only tells the player in a bubble to hurry.  She
 * never chatters meanwhile.  Off her porch, in the bag, the menu of the
 * ointment offers only to drop it; dropped, it lies on the ground at the
 * feet of the player, which picks it up again with the space bar, and
 * drops it again.  Talked to without it, Martha asks after Toby, and told
 * the ointment is lost, gives another jar.  Back by Toby, talked to, the
 * dialogue box shows him moaning that it hurts, with the reply that puts
 * the ointment on and tells him to take care, and Enter has him thank the
 * player, which takes the ointment out of the bag and gives the player a
 * four-leaf clover, told in a notice; Enter ends the dialogue, and
 * talked to again, he says one of his ordinary lines in a bubble.  The
 * views of each dialogue, of the bag with the ointment, and of the
 * ointment on the ground are saved if the environment names a directory
 * for them.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page of the
 *   player, which is in the village, not hunted by Martha.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If the page does not show it so.
 */
export async function checkTobyQuest(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  const look = (): Promise<QuestLook> => readQuestLook(session, context, id);
  const press = (key: string): Promise<void> =>
    tapKey(session, context, key);
  const isShowing = (seen: QuestLook, shown: DialogueShown): boolean =>
    JSON.stringify(seen.dialogue) === JSON.stringify(shown) &&
    seen.speech === null &&
    seen.prompt === null;
  const waitForDialogue = (
    shown: DialogueShown,
    after: string,
    isAlso: (seen: QuestLook) => boolean = () => true,
  ): Promise<QuestLook> =>
    waitFor(
      look,
      (seen: QuestLook) => isShowing(seen, shown) && isAlso(seen),
      ACTION_TIMEOUT,
      (seen: QuestLook) =>
        `With ${after}, the first page tells ${describeQuestLook(seen)}.`,
    );
  const waitForEnd = (after: string): Promise<QuestLook> =>
    waitFor(
      look,
      (seen: QuestLook) => seen.dialogue === null,
      ACTION_TIMEOUT,
      (seen: QuestLook) =>
        `With ${after}, the first page tells ${describeQuestLook(seen)}.`,
    );
  const countClovers = (seen: QuestLook): number =>
    seen.slots.filter((kind: string) => kind === 'clover').length;
  const listCarried = (seen: QuestLook): string[] =>
    seen.slots.filter((kind: string) => kind !== '');

  // Toby tells of his fall.
  await walkInVillage(session, context, id, BY_TOBY, 'to the gate');
  await faceInVillage(session, context, id, TOBY_SQUAT);
  const hurt: QuestLook = await talkToToby(
    session,
    context,
    id,
    (seen: QuestLook) => isShowing(seen, TOBY_HURT),
    'Toby telling of his fall',
  );
  await sleep(DIALOGUE_HOLD_DURATION);
  const held: QuestLook = await look();
  if (
    !isShowing(held, TOBY_HURT) ||
    held.own?.x !== hurt.own?.x ||
    held.own?.z !== hurt.own?.z ||
    held.toby === null ||
    hurt.toby === null ||
    held.toby.step - hurt.toby.step <
      (DIALOGUE_HOLD_DURATION / STEP_MILLISECONDS) * 0.5
  ) {
    throw new Error(
      `In the dialogue with Toby, the first page tells ` +
        `${describeQuestLook(held)}, after ${describeQuestLook(hurt)}.`,
    );
  }
  await saveView(session, context, 'quest-toby-hurt.png');
  await press(BAG_KEYS.enter);
  await waitForEnd('the promise to ask the village chief chosen');
  await talkToToby(
    session,
    context,
    id,
    (seen: QuestLook) =>
      seen.dialogue === null &&
      seen.speech?.name === TOBY_MOAN.name &&
      seen.speech.line === TOBY_MOAN.line,
    'Toby moaning that it hurts',
  );

  // Martha gives her ointment.
  const ointmentBefore: number = listCarried(await look()).length;
  await walkInVillage(session, context, id, BY_MARTHA, 'to Martha');
  await faceInVillage(session, context, id, MARTHA_HOME_SPOT);
  await waitFor(
    look,
    (seen: QuestLook) =>
      seen.martha?.mode === 'idle' && seen.prompt === MARTHA_TALK_PROMPT,
    MONSTER_TIMEOUT * 2,
    (seen: QuestLook) =>
      `Before Martha on her porch, the first page tells ` +
      `${describeQuestLook(seen)}.`,
  );
  await setControl(session, context, 'Net delay (ms)', NETWORK_DELAY);
  try {
    // She never chatters to a player on the quest, though the page shows
    // what it is told late; Toby may still exclaim at a find.
    const isQuiet = (seen: QuestLook): boolean => {
      if (
        seen.speech?.name === MARTHA_HURRY.name &&
        seen.speech.line !== MARTHA_HURRY.line
      ) {
        throw new Error(
          `Talking to Martha on the quest, the first page tells ` +
            `${describeQuestLook(seen)}.`,
        );
      }
      return true;
    };
    await press(' ');
    await waitFor(
      look,
      (seen: QuestLook) => isQuiet(seen) && isShowing(seen, MARTHA_WELCOME),
      ACTION_TIMEOUT,
      (seen: QuestLook) =>
        `With the space bar pressed before Martha on the quest, the first ` +
        `page tells ${describeQuestLook(seen)}.`,
    );
    await sleep(VIEW_SETTLE_DURATION);
    await saveView(session, context, 'quest-martha-welcome.png');
    await press(BAG_KEYS.enter);
    await waitForDialogue(
      MARTHA_OINTMENT,
      'the medicine for Toby asked for',
      (seen: QuestLook) =>
        listCarried(seen).length === ointmentBefore + 1 &&
        listCarried(seen).at(-1) === 'martha-ointment' &&
        seen.notices.includes(OINTMENT_NOTICE),
    );
    await sleep(VIEW_SETTLE_DURATION);
    await saveView(session, context, 'quest-martha-ointment.png');
    await press(BAG_KEYS.enter);
    await waitForEnd('Enter pressed as Martha gives her ointment');
    await press(' ');
    await waitFor(
      look,
      (seen: QuestLook) =>
        isQuiet(seen) &&
        seen.dialogue === null &&
        JSON.stringify(seen.speech) === JSON.stringify(MARTHA_HURRY),
      ACTION_TIMEOUT,
      (seen: QuestLook) =>
        `With Martha talked to by a player carrying her ointment, the ` +
        `first page tells ${describeQuestLook(seen)}.`,
    );
  } finally {
    await setControl(session, context, 'Net delay (ms)', 0);
  }

  // The ointment cannot be used, but is put down and picked up again, away
  // from Martha, who would be talked to rather.
  const dropOintment = async (): Promise<void> => {
    await press('i');
    const slot = Number(
      await evaluateInPage(session, context, OINTMENT_SLOT_CLICK_EXPRESSION),
    );
    const menu: QuestLook = await waitFor(
      look,
      (seen: QuestLook) =>
        seen.isBagOpen &&
        slot >= 0 &&
        seen.bagItemName === OINTMENT_NAME &&
        JSON.stringify(seen.menu) === JSON.stringify(OINTMENT_ACTIONS),
      ACTION_TIMEOUT,
      (seen: QuestLook) =>
        `With the slot of the ointment clicked in the open bag, the first ` +
        `page tells ${describeQuestLook(seen)}.`,
    );
    await sleep(VIEW_SETTLE_DURATION);
    await saveView(session, context, 'quest-ointment-bag.png');
    await press(BAG_KEYS.enter);
    await waitFor(
      look,
      (seen: QuestLook) =>
        !seen.slots.includes('martha-ointment') &&
        seen.items.some(
          (item) =>
            item.kind === 'martha-ointment' &&
            Math.abs(item.x - (menu.own?.x ?? Number.NaN)) <= ITEM_NEARNESS &&
            Math.abs(item.z - (menu.own?.z ?? Number.NaN)) <= ITEM_NEARNESS,
        ),
      ACTION_TIMEOUT,
      (seen: QuestLook) =>
        `With the ointment dropped, the first page tells ` +
        `${describeQuestLook(seen)}.`,
    );
    await press(BAG_KEYS.escape);
    await waitFor(
      look,
      (seen: QuestLook) => !seen.isBagOpen && seen.prompt === OINTMENT_PROMPT,
      ACTION_TIMEOUT,
      (seen: QuestLook) =>
        `With the bag closed over the ointment dropped, the first page ` +
        `tells ${describeQuestLook(seen)}.`,
    );
  };
  await walkInVillage(session, context, id, AWAY_FROM_MARTHA, 'off the porch');
  await dropOintment();
  if (SCREENSHOT_DIR !== undefined) {
    // The player steps on, away from the camera, so as not to hide the
    // jar, and back.
    const { heading } = await look();
    const beyond: GroundVector = {
      x: AWAY_FROM_MARTHA.x + Math.sin((heading * Math.PI) / 180) * 0.9,
      z: AWAY_FROM_MARTHA.z + Math.cos((heading * Math.PI) / 180) * 0.9,
    };
    await walkInVillage(session, context, id, beyond, 'beyond the jar');
    await zoomCamera(session, context, OINTMENT_CAMERA_ZOOM);
    await sleep(VIEW_SETTLE_DURATION);
    await saveView(session, context, 'quest-ointment-ground.png');
    await zoomCamera(session, context, -OINTMENT_CAMERA_ZOOM);
    await walkInVillage(session, context, id, AWAY_FROM_MARTHA, 'back');
  }
  await waitFor(
    look,
    (seen: QuestLook) => seen.prompt === OINTMENT_PROMPT,
    ACTION_TIMEOUT,
    (seen: QuestLook) =>
      `By the ointment dropped, the first page tells ` +
      `${describeQuestLook(seen)}.`,
  );
  await press(' ');
  await waitFor(
    look,
    (seen: QuestLook) =>
      listCarried(seen).at(-1) === 'martha-ointment' &&
      !seen.items.some((item) => item.kind === 'martha-ointment'),
    ACTION_TIMEOUT,
    (seen: QuestLook) =>
      `With the ointment picked up again, the first page tells ` +
      `${describeQuestLook(seen)}.`,
  );

  // Martha gives another jar to a player who has lost hers.
  await dropOintment();
  await walkInVillage(session, context, id, BY_MARTHA, 'back to Martha');
  await faceInVillage(session, context, id, MARTHA_HOME_SPOT);
  await waitFor(
    look,
    (seen: QuestLook) =>
      seen.martha?.mode === 'idle' && seen.prompt === MARTHA_TALK_PROMPT,
    ACTION_TIMEOUT,
    (seen: QuestLook) =>
      `Back before Martha, the first page tells ${describeQuestLook(seen)}.`,
  );
  await press(' ');
  await waitForDialogue(MARTHA_WONDER, 'Martha talked to without her jar');
  await saveView(session, context, 'quest-martha-wonder.png');
  await press(BAG_KEYS.enter);
  await waitForDialogue(
    MARTHA_REPLACE,
    'the jar told lost',
    (seen: QuestLook) => listCarried(seen).at(-1) === 'martha-ointment',
  );
  await press(BAG_KEYS.enter);
  await waitForEnd('Enter pressed as Martha gives another jar');

  // Toby takes the ointment and gives a clover.
  await walkInVillage(session, context, id, BY_TOBY, 'back to the gate');
  await faceInVillage(session, context, id, TOBY_SQUAT);
  const aching: QuestLook = await talkToToby(
    session,
    context,
    id,
    (seen: QuestLook) => isShowing(seen, TOBY_ACHE),
    'Toby moaning to the player who brings the ointment',
  );
  await saveView(session, context, 'quest-toby-ache.png');
  await press(BAG_KEYS.enter);
  await waitForDialogue(
    TOBY_THANKS,
    'the ointment put on Toby',
    (seen: QuestLook) =>
      !seen.slots.includes('martha-ointment') &&
      listCarried(seen).length === listCarried(aching).length &&
      countClovers(seen) === countClovers(aching) + 1 &&
      seen.notices.includes(QUEST_CLOVER_NOTICE),
  );
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'quest-toby-thanks.png');
  await press(BAG_KEYS.enter);
  await waitForEnd('Enter pressed as Toby thanks the player');
  await talkToToby(
    session,
    context,
    id,
    (seen: QuestLook) =>
      seen.dialogue === null &&
      seen.speech?.name === 'Toby' &&
      TOBY_ORDINARY_LINES.has(seen.speech.line),
    'one of the ordinary lines of Toby',
  );
}
