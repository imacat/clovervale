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
 * @module client/overlay-stack The sheets and the boxes that open over
 *   play, in the order they come before one another.
 */

import type { PadScreen } from './gamepad.ts';
import type { GameCommand } from './input-device.ts';

/**
 * A sheet or a box that opens over play.  While one is open, the controls
 * of play are held.
 */
export interface Overlay {
  /** What the buttons of the gamepads do while it is open. */
  readonly padScreen: Exclude<PadScreen, 'play'>;
  /**
   * Tells whether it is open.
   *
   * @returns {boolean} Whether it is.
   */
  readonly isOpen: () => boolean;
  /**
   * Carries out a command, if it is for it.
   *
   * @param {GameCommand} command - The command.
   * @returns {boolean | null} Whether the game took the command, which is
   *   then for nothing else, the browser included, or `null` if the command
   *   is not for it.
   */
  readonly pressKey: (command: GameCommand) => boolean | null;
  /** Closes it, if it is open, without showing it closed. */
  readonly close: () => void;
  /** Shows it as it is now. */
  readonly render: () => void;
}

/**
 * The sheets and the boxes over play, the first first: each takes the
 * commands of the game before those after it and before play, opens only
 * while none before it is open, and closes those after it as it opens.
 */
export class OverlayStack {
  /** The sheets and the boxes, the first first. */
  readonly #overlays: readonly Overlay[];
  /** Holds the controls of play, as a sheet or a box opens. */
  readonly #holdPlay: () => void;

  /**
   * Stacks the sheets and the boxes over play.
   *
   * @param {readonly Overlay[]} overlays - The sheets and the boxes, the
   *   first first.
   * @param {() => void} holdPlay - Holds the controls of play, as a sheet
   *   or a box opens.
   */
  constructor(overlays: readonly Overlay[], holdPlay: () => void) {
    this.#overlays = overlays;
    this.#holdPlay = holdPlay;
  }

  /**
   * Tells whether a sheet or a box can be opened now: while none before it
   * is open.
   *
   * @param {Overlay} overlay - The sheet or the box.
   * @returns {boolean} Whether it can.
   */
  canOpen(overlay: Overlay): boolean {
    const before: readonly Overlay[] = this.#overlays.slice(
      0,
      this.#overlays.indexOf(overlay),
    );
    return !before.some((other: Overlay) => other.isOpen());
  }

  /**
   * Closes whatever is open after a sheet or a box that has opened, showing
   * it closed, and holds the controls of play.
   *
   * @param {Overlay} opened - The sheet or the box that has opened.
   */
  holdPlayUnder(opened: Overlay): void {
    const after: readonly Overlay[] = this.#overlays.slice(
      this.#overlays.indexOf(opened) + 1,
    );
    for (const overlay of after) {
      if (overlay.isOpen()) {
        overlay.close();
        overlay.render();
      }
    }
    this.#holdPlay();
  }

  /**
   * Tells what is open on the page, as it tells what the buttons of the
   * gamepads do.
   *
   * @returns {PadScreen} What the first sheet or box open has them do, or
   *   `play` while none is open.
   */
  findScreen(): PadScreen {
    return (
      this.#overlays.find((overlay: Overlay) => overlay.isOpen())
        ?.padScreen ?? 'play'
    );
  }

  /**
   * Tells whether any sheet or box is open.
   *
   * @returns {boolean} Whether one is.
   */
  isAnyOpen(): boolean {
    return this.#overlays.some((overlay: Overlay) => overlay.isOpen());
  }

  /**
   * Carries out a command, as the first sheet or box it is for takes it, as
   * {@link Overlay.pressKey} tells.
   *
   * @param {GameCommand} command - The command.
   * @returns {boolean | null} Whether the game took the command, or `null`
   *   if it is for none of them.
   */
  pressKey(command: GameCommand): boolean | null {
    for (const overlay of this.#overlays) {
      const isTaken: boolean | null = overlay.pressKey(command);
      if (isTaken !== null) {
        return isTaken;
      }
    }
    return null;
  }
}
