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
 * @module client/dialogue-box The dialogue the player of the page is in, as
 *   the server tells it, and the reply the person at the page chooses.
 */

import type { DialogueView, ReplyInput } from '@clovervale/shared';

/** What the player of the page answers in its dialogue. */
export type DialogueRequest = ReplyInput;

/** What the dialogue box makes of a key pressed. */
export interface DialogueResponse {
  /** Whether the box took the key, so that nothing else is to. */
  readonly isHandled: boolean;
  /** What the player answers, if the key chose that. */
  readonly request: DialogueRequest | null;
}

/** The codes of the keys that choose what the cursor is on. */
const ENTER_KEYS: ReadonlySet<string> = new Set(['Enter', 'NumpadEnter']);

/** A key the box takes but does nothing with. */
const IGNORED: DialogueResponse = { isHandled: true, request: null };

/** A key the box does not take. */
const PASSED: DialogueResponse = { isHandled: false, request: null };

/**
 * The dialogue box of the player of the page: the dialogue it is in, as the
 * server last told, and the reply the cursor is on.
 *
 * The box is open while the server tells of a dialogue, and it takes every
 * key then, so that the player neither moves nor does anything else.  The
 * up and down arrows move the cursor over the replies, stopping at the
 * ends; Enter, or a click on a reply, answers with the reply, or ends a
 * dialogue that offers none.  Once the player
 * has answered, the box waits for the server to tell what comes of it, and
 * answers nothing more till then.  The cursor starts on the first reply of
 * every line.
 */
export class DialogueBox {
  #dialogue: DialogueView | null = null;
  #cursor = 0;
  /** The line the player has answered, while the box waits for the server. */
  #answeredTurn: number | null = null;

  /**
   * Whether the box is open.
   *
   * @returns {boolean} Whether the player is in a dialogue.
   */
  get isOpen(): boolean {
    return this.#dialogue !== null;
  }

  /**
   * The dialogue the player is in, as the server last told.
   *
   * @returns {DialogueView | null} The dialogue, or `null` while it is in
   *   none.
   */
  get dialogue(): DialogueView | null {
    return this.#dialogue;
  }

  /**
   * The reply the cursor is on.
   *
   * @returns {number} The place of the reply among those offered, from 0,
   *   which is 0 while none is offered.
   */
  get cursor(): number {
    return this.#cursor;
  }

  /**
   * Takes in the dialogue the player is in now, as the server tells.
   *
   * @param {DialogueView | null} dialogue - The dialogue, or `null` while
   *   the player is in none.
   */
  noticeDialogue(dialogue: DialogueView | null): void {
    if (dialogue?.turn !== this.#dialogue?.turn) {
      this.#cursor = 0;
      this.#answeredTurn = null;
    }
    this.#dialogue = dialogue;
  }

  /**
   * Takes a key pressed, if the box is open.
   *
   * @param {string} code - The code of the key, as in a keyboard event.
   * @returns {DialogueResponse} Whether the box took the key, and what the
   *   player answers with it, if anything.
   */
  pressKey(code: string): DialogueResponse {
    const dialogue: DialogueView | null = this.#dialogue;
    if (dialogue === null) {
      return PASSED;
    }
    if (ENTER_KEYS.has(code)) {
      return { isHandled: true, request: this.clickReply(this.#cursor) };
    }
    const last: number = Math.max(dialogue.replies.length - 1, 0);
    if (code === 'ArrowUp') {
      this.#cursor = Math.max(this.#cursor - 1, 0);
    } else if (code === 'ArrowDown') {
      this.#cursor = Math.min(this.#cursor + 1, last);
    }
    return IGNORED;
  }

  /**
   * Puts the cursor on a reply, and answers with it, or ends a dialogue
   * that offers no reply.
   *
   * @param {number} index - The place of the reply among those offered,
   *   from 0.
   * @returns {DialogueRequest | null} What the player answers, or `null`
   *   if the box is closed or waits for the server, or there is no such
   *   reply.
   */
  clickReply(index: number): DialogueRequest | null {
    const dialogue: DialogueView | null = this.#dialogue;
    if (dialogue === null || this.#answeredTurn !== null) {
      return null;
    }
    if (dialogue.replies.length === 0) {
      return this.#answer({ type: 'reply', choice: 0 });
    }
    if (!Number.isInteger(index) || dialogue.replies[index] === undefined) {
      return null;
    }
    this.#cursor = index;
    return this.#answer({ type: 'reply', choice: index });
  }

  /**
   * Answers the line said to the player, unless the box waits for the
   * server already.
   *
   * @param {DialogueRequest} request - The answer.
   * @returns {DialogueRequest | null} The answer, or `null` if the box
   *   waits for the server.
   */
  #answer(request: DialogueRequest): DialogueRequest | null {
    if (this.#dialogue === null || this.#answeredTurn !== null) {
      return null;
    }
    this.#answeredTurn = this.#dialogue.turn;
    return request;
  }
}
