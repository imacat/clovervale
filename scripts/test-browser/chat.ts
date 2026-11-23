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
 * @module scripts/test-browser/chat Checks the chat.
 */

import type { PlayerState } from '@clovervale/shared';
import type { SaidView } from '../../packages/client/src/speech-bubble.ts';

import type { BidiSession } from './bidi.ts';
import {
  ACTION_TIMEOUT,
  BAG_KEYS,
  SPEECH_LEAST_HEIGHT,
  SPEECH_TIMEOUT,
  STANDING_DRIFT,
} from './constants.ts';
import { evaluateInPage, tapKey, waitFor } from './page.ts';

/** The chat of a page, its own player, and what the players say there. */
interface ChatLook {
  /** Whether the box of the chat is open. */
  readonly isOpen: boolean;
  /** Whether the keyboard is with the line of the box. */
  readonly isFocused: boolean;
  /** What is typed in the box. */
  readonly typed: string;
  /** The bubbles of the players. */
  readonly said: readonly SaidView[];
  /** The player of the page in the latest snapshot, if it is there. */
  readonly own: PlayerState | null;
}

/** A line to say that is made of keys of the game. */
const CHAT_LINE = 'wasd hi';

/**
 * Checks that a line typed in the box of the chat shows in a bubble above
 * the player of the page: that Enter opens the box and gives it the
 * keyboard, that the keys of the game typed in it are typed and do not
 * walk the player, and that Enter closes the box and has the player say
 * the line, in a bubble above its head, which is over before long.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player of the page.
 * @returns {Promise<void>} A promise settled once the page has passed.
 * @throws {Error} If the page does not do so.
 */
export async function checkChat(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  const look = async (): Promise<ChatLook> =>
    JSON.parse(
      await evaluateInPage(
        session,
        context,
        `(() => {
          const input = document.querySelector('.chat-input');
          return JSON.stringify({
            isOpen: window.clovervale.describeChat().isOpen,
            isFocused: input !== null && document.activeElement === input,
            typed: input?.value ?? '',
            said: window.clovervale.listSaid(),
            own: window.clovervale.listLatestPlayers()
              .find((player) => player.id === ${String(id)}) ?? null,
          });
        })()`,
      ),
    ) as ChatLook;
  const press = (key: string): Promise<void> =>
    tapKey(session, context, key);
  const expectLook = (
    isAwaited: (seen: ChatLook) => boolean,
    what: string,
    timeout: number = ACTION_TIMEOUT,
  ): Promise<ChatLook> =>
    waitFor(
      look,
      isAwaited,
      timeout,
      (seen: ChatLook) =>
        `With ${what}, the first page tells ${JSON.stringify(seen)}.`,
    );
  const hasWalked = (seen: ChatLook, from: ChatLook): boolean =>
    seen.own === null ||
    from.own === null ||
    Math.hypot(seen.own.x - from.own.x, seen.own.z - from.own.z) >
      STANDING_DRIFT;

  const before: ChatLook = await look();
  await press(BAG_KEYS.enter);
  await expectLook(
    (seen: ChatLook) => seen.isOpen && seen.isFocused && seen.typed === '',
    'Enter pressed in play',
  );
  for (const key of CHAT_LINE) {
    await press(key);
  }
  const typed: ChatLook = await expectLook(
    (seen: ChatLook) => seen.isOpen && seen.typed === CHAT_LINE,
    `"${CHAT_LINE}" typed in the box of the chat`,
  );
  await press(BAG_KEYS.enter);
  const said: ChatLook = await expectLook(
    (seen: ChatLook) =>
      !seen.isOpen &&
      seen.said.length === 1 &&
      seen.said.every(
        (bubble) =>
          bubble.player === id &&
          bubble.line === CHAT_LINE &&
          bubble.isShown &&
          bubble.y > SPEECH_LEAST_HEIGHT,
      ),
    `Enter pressed with "${CHAT_LINE}" typed`,
  );
  if (hasWalked(typed, before) || hasWalked(said, before)) {
    throw new Error(
      `With "${CHAT_LINE}" typed in the box of the chat, the player of the ` +
        `first page went from ${JSON.stringify(before.own)} to ` +
        `${JSON.stringify(typed.own)} and ${JSON.stringify(said.own)}.`,
    );
  }
  // The bubble is over before the checks that look at the view go on.
  await expectLook(
    (seen: ChatLook) => seen.said.length === 0,
    'the line said a while ago',
    SPEECH_TIMEOUT,
  );
}
