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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/18
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/network-delay Holding the messages of the page back, as a
 *   slow connection would.
 */

/** The longest the messages can be held back for, in milliseconds. */
export const MAX_NETWORK_DELAY = 500;

/** A message that is held back. */
interface HeldMessage<T> {
  /** The message. */
  readonly message: T;
  /** When to pass the message on, on the clock of the page. */
  readonly dueTime: number;
}

/** One direction of a connection, which holds its messages back. */
export class DelayLine<T> {
  readonly #deliver: (message: T) => void;
  #held: HeldMessage<T>[] = [];
  #timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Starts with nothing held back.
   *
   * @param {(message: T) => void} deliver - Passes a message on.
   */
  constructor(deliver: (message: T) => void) {
    this.#deliver = deliver;
  }

  /**
   * Passes a message on after a delay, and never before a message that
   * was sent earlier.  A message without a delay, with nothing held back
   * before it, is passed on at once.
   *
   * @param {T} message - The message.
   * @param {number} delay - How long to hold it back for, in milliseconds.
   */
  send(message: T, delay: number): void {
    const now: number = performance.now();
    const last: HeldMessage<T> | undefined = this.#held.at(-1);
    if (last === undefined && delay <= 0) {
      this.#deliver(message);
      return;
    }
    const dueTime: number = Math.max(now + delay, last?.dueTime ?? now);
    this.#held.push({ message, dueTime });
    this.#schedule();
  }

  /** Drops every message that is held back. */
  clear(): void {
    this.#held = [];
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }

  /** Waits for the next message that is held back to be due. */
  #schedule(): void {
    const next: HeldMessage<T> | undefined = this.#held[0];
    if (this.#timer !== null || next === undefined) {
      return;
    }
    const wait: number = Math.max(next.dueTime - performance.now(), 0);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#release();
    }, wait);
  }

  /** Passes the messages that are due on, in the order they were sent. */
  #release(): void {
    const now: number = performance.now();
    while ((this.#held[0]?.dueTime ?? Infinity) <= now) {
      const due: HeldMessage<T> | undefined = this.#held.shift();
      if (due !== undefined) {
        this.#deliver(due.message);
      }
    }
    this.#schedule();
  }
}
