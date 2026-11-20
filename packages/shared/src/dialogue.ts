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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/20
// AI assistance: Claude Code (Anthropic)

/**
 * @module shared/dialogue A dialogue between a player and a villager, as
 *   the server tells the peer of the player to show it.
 */

import type { VillagerId } from './villagers.ts';

/** The most replies a player is offered at once in a dialogue. */
export const DIALOGUE_REPLY_LIMIT = 3;

/** The longest name of a message of a dialogue, in characters. */
const TEXT_NAME_LIMIT = 100;

/**
 * A dialogue a player is in, as it stands now: what the villager has just
 * said, and the replies the player is offered.  The words are named by
 * their messages, for the peer to word them in the language it speaks.
 */
export interface DialogueView {
  /** The villager the player talks to. */
  readonly villager: VillagerId;
  /** The message of what the villager has just said. */
  readonly line: string;
  /**
   * The messages of the replies the player is offered, in order, no more
   * than {@link DIALOGUE_REPLY_LIMIT}.  With none, the player can only end
   * the dialogue.
   */
  readonly replies: readonly string[];
  /**
   * The number of the line among every line said to the player in its
   * dialogues so far, from 1, which tells one line from the next even if
   * they are worded alike.
   */
  readonly turn: number;
}

/**
 * Tells whether a decoded value names a message of a dialogue: a short
 * name of letters, digits, dots and hyphens.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether it does.
 */
export function isDialogueText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= TEXT_NAME_LIMIT &&
    /^[A-Za-z0-9.-]+$/u.test(value)
  );
}
