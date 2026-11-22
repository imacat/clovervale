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
 * @module client/say-queue The lines the player of the page is yet to say,
 *   held back so that the server takes each of them.
 */

import { SAY_INTERVAL } from '@clovervale/shared';

/**
 * How much longer than the server asks the page waits from one line to the
 * next, in milliseconds, so that a line that travels faster than the one
 * before it is not dropped.
 */
export const SAY_MARGIN = 250;

/** The least time from one line the page sends to the next, in ms. */
export const SAY_SPACING: number = SAY_INTERVAL * 1000 + SAY_MARGIN;

/**
 * The lines the player of the page is yet to say, in the order they were
 * sent from the box of the chat.
 *
 * A line is due at once if none was said within {@link SAY_SPACING}
 * milliseconds, and otherwise once that long has passed since the line
 * before it was said, so that no line is lost to the limit of the server.
 */
export class SayQueue {
  readonly #lines: string[] = [];
  /** When the last line was said, or `null` if none has been. */
  #saidTime: number | null = null;

  /**
   * The number of lines yet to be said.
   *
   * @returns {number} The number of lines.
   */
  get length(): number {
    return this.#lines.length;
  }

  /**
   * Adds a line to say, after those added before it.
   *
   * @param {string} line - The line.
   */
  add(line: string): void {
    this.#lines.push(line);
  }

  /**
   * Takes the next line to say, if it is due now, as said now.
   *
   * @param {number} now - The time now, in milliseconds.
   * @returns {string | null} The line, to be said at once, or `null` if
   *   there is none or it is not due yet.
   */
  takeDue(now: number): string | null {
    if (
      this.#lines.length === 0 ||
      (this.#saidTime !== null && now - this.#saidTime < SAY_SPACING)
    ) {
      return null;
    }
    this.#saidTime = now;
    return this.#lines.shift() ?? null;
  }

  /**
   * Drops every line yet to be said, and forgets when the last was said,
   * as the page loses its connection.
   */
  clear(): void {
    this.#lines.length = 0;
    this.#saidTime = null;
  }
}
