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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/22
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/chat-box The box the person at the page types a line in
 *   for its player to say to the players nearby.
 */

import { cleanSayText } from '@clovervale/shared';

/** A key pressed in the box. */
export interface ChatKey {
  /** The key, as `key` tells in a keyboard event. */
  readonly key: string;
  /**
   * Whether the key is pressed with Shift, Ctrl, Alt or the meta key held
   * down.
   */
  readonly hasModifier: boolean;
  /**
   * Whether the key belongs to an input method that is composing text, as
   * of Chinese or Japanese.
   */
  readonly isComposing: boolean;
}

/** What the box does with a key pressed in it. */
export interface ChatResponse {
  /**
   * Whether the box took the key, which is then for nothing else, the
   * browser included.
   */
  readonly isHandled: boolean;
  /** The line for the player to say, if the key sends one. */
  readonly line: string | null;
}

/** The response to a key the box leaves alone. */
const PASSED: ChatResponse = { isHandled: false, line: null };

/**
 * The box a line is typed in: whether it is open.
 *
 * While it is open, a plain Enter sends what was typed and closes it, and
 * a plain Esc closes it without sending.  It takes no other key, and no
 * key at all that is pressed with a modifier or that belongs to an input
 * method composing text, so that typing, the input method and the browser
 * work as they do anywhere.
 */
export class ChatBox {
  #isOpen = false;

  /**
   * Whether the box is open.
   *
   * @returns {boolean} Whether it is.
   */
  get isOpen(): boolean {
    return this.#isOpen;
  }

  /** Opens the box, if it is closed. */
  open(): void {
    this.#isOpen = true;
  }

  /** Closes the box without sending anything, if it is open. */
  close(): void {
    this.#isOpen = false;
  }

  /**
   * Sends what was typed in the open box, and closes it.
   *
   * @param {string} text - What was typed.
   * @returns {string | null} The line for the player to say, as
   *   {@link cleanSayText} makes it, or `null` if nothing is left of the
   *   text to say.
   */
  send(text: string): string | null {
    this.#isOpen = false;
    return cleanSayText(text);
  }

  /**
   * Takes a key pressed in the box, if it is one for the box.
   *
   * @param {ChatKey} pressed - The key.
   * @param {string} text - What was typed in the box so far.
   * @returns {ChatResponse} Whether the box took the key, and the line it
   *   sends, if any.
   */
  pressKey(pressed: ChatKey, text: string): ChatResponse {
    if (!this.#isOpen || pressed.hasModifier || pressed.isComposing) {
      return PASSED;
    }
    if (pressed.key === 'Enter') {
      return { isHandled: true, line: this.send(text) };
    }
    if (pressed.key === 'Escape') {
      this.#isOpen = false;
      return { isHandled: true, line: null };
    }
    return PASSED;
  }
}
