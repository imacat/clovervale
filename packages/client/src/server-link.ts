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
 * @module client/server-link The connection of the page to the game
 *   server, which holds the messages each way back as the panel is set.
 */

import { createSayMessage, encodeClientMessage } from '@clovervale/shared';
import type { ClientMessage } from '@clovervale/shared';

import { DelayLine } from './network-delay.ts';
import { SayQueue } from './say-queue.ts';

/** The connection the owner has the page pretend to have. */
export interface NetworkSettings {
  /**
   * How long every message of the page is held back for, each way, in
   * milliseconds.
   */
  delay: number;
}

/**
 * The connection to the game server, once the page has opened it, with the
 * messages each way held back as the panel is set, and the lines the
 * player of the page is yet to say, each in its turn.
 */
export class ServerLink {
  /** How long the panel has the messages held back. */
  readonly #network: Readonly<NetworkSettings>;
  /** The connection, once the page has opened it. */
  #socket: WebSocket | null = null;
  /** What the page sends the server, held back. */
  readonly #outgoing: DelayLine<string>;
  /** What the server sends the page, held back. */
  readonly #incoming: DelayLine<string>;
  /** The lines the player of the page is yet to say, each in its turn. */
  readonly #sayQueue = new SayQueue();

  /**
   * Starts without a connection.
   *
   * @param {Readonly<NetworkSettings>} network - How long the panel has the
   *   messages held back, as set whenever one is sent or received.
   * @param {(data: string) => void} receive - Handles a message from the
   *   server, once it has been held back.
   */
  constructor(
    network: Readonly<NetworkSettings>,
    receive: (data: string) => void,
  ) {
    this.#network = network;
    this.#outgoing = new DelayLine<string>((data: string) => {
      if (this.isOpen) {
        this.#socket?.send(data);
      }
    });
    this.#incoming = new DelayLine<string>(receive);
  }

  /**
   * Whether the connection is open.
   *
   * @returns {boolean} Whether it is.
   */
  get isOpen(): boolean {
    return this.#socket?.readyState === WebSocket.OPEN;
  }

  /**
   * Opens the connection to a game server.
   *
   * @param {string} url - The address of the server.
   * @param {() => void} close - Called once the connection closes.
   * @throws {SyntaxError} If the address names no server a page can
   *   connect to.
   */
  connect(url: string, close: () => void): void {
    const socket = new WebSocket(url);
    this.#socket = socket;
    socket.addEventListener('message', (event: MessageEvent<unknown>) => {
      this.#incoming.send(String(event.data), this.#network.delay);
    });
    socket.addEventListener('close', close);
  }

  /**
   * Sends the server a message, held back as the panel is set, if the
   * connection is open once it is due.
   *
   * @param {ClientMessage} message - The message.
   */
  send(message: ClientMessage): void {
    this.#outgoing.send(encodeClientMessage(message), this.#network.delay);
  }

  /**
   * Has the player of the page say a line: at once, or, sent too soon
   * after the line before it for the server to take it, as soon as it can
   * be, after any lines still waiting, as {@link SayQueue} tells.
   *
   * @param {string} line - The line.
   */
  say(line: string): void {
    this.#sayQueue.add(line);
    this.sendDueSay();
  }

  /**
   * Sends the server the next line the player of the page is yet to say,
   * if its turn has come.
   */
  sendDueSay(): void {
    const line: string | null = this.#sayQueue.takeDue(performance.now());
    if (line !== null) {
      this.send(createSayMessage(line));
    }
  }

  /**
   * Drops every message held back either way, and every line the player of
   * the page is yet to say, as the page disconnects.
   */
  forget(): void {
    this.#incoming.clear();
    this.#outgoing.clear();
    this.#sayQueue.clear();
  }
}
