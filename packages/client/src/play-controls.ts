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
 * @module client/play-controls The controls of play: the keys, the
 *   gamepads and the fingers on the screen, and the bag, the box of the
 *   chat, the help sheet, the ending sheet and the dialogue box they open
 *   and work over play.
 */

import type {
  DialogueView,
  ItemKindId,
  PlayerInput,
  VillagerId,
} from '@clovervale/shared';

import type { CameraHold } from './camera-keys.ts';
import type { DialogueShown } from './dialogue-view.ts';
import { GamepadDevice } from './gamepad-device.ts';
import { createPrompt } from './interaction-prompt.ts';
import type { Prompt } from './interaction-prompt.ts';
import type { ItemRequest } from './inventory-bag.ts';
import { KeyboardDevice } from './keyboard-device.ts';
import {
  BagController,
  ChatController,
  DialogueController,
  EndingController,
  HelpController,
} from './overlay-controllers.ts';
import type { OverlayHost } from './overlay-controllers.ts';
import { OverlayStack } from './overlay-stack.ts';
import type { Overlay } from './overlay-stack.ts';
import type { PageStorage } from './page-storage.ts';
import { PlayInput } from './play-input.ts';
import { TouchControls } from './touch-controls.ts';
import { createTouchView } from './touch-view.ts';
import type { TouchView } from './touch-view.ts';
import type { Translator } from './translator.ts';

/** What the controls of play act on outside themselves. */
export interface PlayHooks {
  /**
   * Gives the player of the page an input.
   *
   * @param {PlayerInput} input - The input.
   * @returns {boolean} Whether the player was given the input.
   */
  readonly sendInput: (input: PlayerInput) => boolean;
  /**
   * Has the player of the page say a line.
   *
   * @param {string} line - The line.
   */
  readonly sayLine: (line: string) => void;
  /**
   * Tells whether the page has a player, as the server has told.
   *
   * @returns {boolean} Whether it has.
   */
  readonly hasPlayer: () => boolean;
  /**
   * Tells whether the player of the page is dead, as predicted.
   *
   * @returns {boolean} Whether it is, which it is not while there is no
   *   prediction.
   */
  readonly isPlayerDead: () => boolean;
  /**
   * Finds what the space bar has the player of the page do now, as the
   * prompt tells it.
   *
   * @returns {PlayerInput | null} The input, or `null` while there is no
   *   prediction or the player is dead.
   */
  readonly findSpaceInput: () => PlayerInput | null;
  /** Lets the music play, as a press of a gamepad lets the page. */
  readonly allowMusic: () => void;
  /**
   * Tells the way the camera looks.
   *
   * @returns {number} The heading, in degrees.
   */
  readonly readHeading: () => number;
  /**
   * Zooms the camera.
   *
   * @param {number} factor - How much farther the camera is to be.
   */
  readonly zoom: (factor: number) => void;
}

/**
 * The controls of play, and the sheets and the boxes over play: the bag,
 * the box of the chat, the help sheet, the ending sheet, the dialogue box,
 * and the prompt of what the space bar does.
 */
export class PlayControls {
  /** The prompt that tells what the space bar does. */
  readonly prompt: Prompt;
  /** What the person at the page holds to turn the camera. */
  readonly cameraHolds: readonly CameraHold[];
  /** What the controls act on outside themselves. */
  readonly #hooks: PlayHooks;
  /** The fingers on the screen of a touch device. */
  readonly #touchControls = new TouchControls();
  /** What shows the controls of a touch device on the page. */
  readonly #touchView: TouchView;
  /** The bag of the player of the page, over play. */
  readonly #bag: BagController;
  /** The box of the chat, over play. */
  readonly #chat: ChatController;
  /** The help sheet, over play. */
  readonly #help: HelpController;
  /** The ending sheet, over play. */
  readonly #ending: EndingController;
  /** The dialogue box, over play. */
  readonly #dialogue: DialogueController;
  /** The sheets and the boxes over play. */
  readonly #overlays: OverlayStack;
  /** What the devices give, taken to the sheets and the boxes, and play. */
  readonly #input: PlayInput;

  /**
   * Shows the controls, the sheets and the boxes on the page, with the help
   * sheet open on the first visit with the welcome to the game, which moves
   * on to the page of touch on a touch device.
   *
   * @param {HTMLElement} parent - What they are shown in.
   * @param {Translator} translator - The translator of the page.
   * @param {PageStorage | null} storage - Where the browser lets the page
   *   remember whether the help sheet has been opened before.
   * @param {PlayHooks} hooks - What the controls act on outside themselves.
   */
  constructor(
    parent: HTMLElement,
    translator: Translator,
    storage: PageStorage | null,
    hooks: PlayHooks,
  ) {
    this.#hooks = hooks;
    const host: OverlayHost = {
      canOpen: (overlay: Overlay) => this.#overlays.canOpen(overlay),
      holdPlayUnder: (opened: Overlay) => {
        this.#overlays.holdPlayUnder(opened);
      },
    };
    this.#touchView = createTouchView(
      parent,
      translator,
      this.#touchControls,
      () => {
        this.#touchControls.pressAction(this.#input);
      },
      () => {
        this.#bag.render();
        this.#dialogue.render();
      },
    );
    const { isTouch } = this.#touchView;
    this.prompt = createPrompt(parent);
    this.#bag = new BagController(
      parent,
      translator,
      host,
      (request: ItemRequest) => {
        this.#carryOutItemAction(request);
      },
      isTouch,
    );
    // The button of the chat goes under the open bag on a touch device, so
    // it is shown only while the bag is closed.
    this.#chat = new ChatController(
      parent,
      translator,
      host,
      hooks.sayLine,
      hooks.hasPlayer,
      () => !this.#bag.isOpen(),
    );
    this.#help = new HelpController(parent, translator, host, isTouch, storage);
    this.#ending = new EndingController(parent, translator, host);
    this.#dialogue = new DialogueController(
      parent,
      translator,
      host,
      hooks.sendInput,
      isTouch,
    );
    this.#overlays = new OverlayStack(
      [this.#dialogue, this.#ending, this.#help, this.#bag, this.#chat],
      () => {
        this.#holdPlay();
      },
    );
    this.#input = new PlayInput(
      [
        new KeyboardDevice(),
        new GamepadDevice(hooks.allowMusic),
        this.#touchControls,
      ],
      this.#overlays,
      {
        sendInput: hooks.sendInput,
        findSpaceInput: hooks.findSpaceInput,
        readHeading: hooks.readHeading,
        zoom: hooks.zoom,
        isTyping: () => this.#chat.isOpen(),
        canChat: () => this.#chat.canOpen(),
        openChat: () => {
          this.#chat.open();
        },
      },
    );
    this.cameraHolds = this.#input.devices;
  }

  /**
   * Whether the player of the page is in a dialogue.
   *
   * @returns {boolean} Whether it is.
   */
  get isInDialogue(): boolean {
    return this.#dialogue.isOpen();
  }

  /**
   * Whether the box of the chat is open.
   *
   * @returns {boolean} Whether it is.
   */
  get isChatOpen(): boolean {
    return this.#chat.isOpen();
  }

  /**
   * Tells whether the page is shown on a touch device.
   *
   * @returns {boolean} Whether it is.
   */
  isTouch(): boolean {
    return this.#touchView.isTouch();
  }

  /**
   * Describes the dialogue box as it is shown, for looking at.
   *
   * @returns {DialogueShown | null} What it shows, or `null` while it is
   *   closed.
   */
  describeDialogue(): DialogueShown | null {
    return this.#dialogue.describe();
  }

  /**
   * Starts listening to the devices, and lets go of everything held on them
   * as the window loses the focus, as {@link PlayInput.listen} tells.
   *
   * @param {Window} target - The window of the page.
   */
  listen(target: Window): void {
    this.#input.listen(target);
  }

  /**
   * Shows what the player of the page carries in the bag, with its health
   * and its silver coins.
   *
   * @param {(readonly ItemKindId[]) | null} inventory - What it carries, or
   *   `null` while the server has not told it.
   * @param {number} health - Its health.
   * @param {number} [silver] - Its silver coins, none if left out.
   */
  showBag(
    inventory: readonly ItemKindId[] | null,
    health: number,
    silver?: number,
  ): void {
    this.#bag.show(inventory, health, silver);
  }

  /**
   * Shows the dialogue the player of the page is in, as the server tells,
   * with the villagers called by the names they go by once they have told the
   * player who they are.  As a dialogue opens, the bag, the help sheet and
   * the ending sheet close, and the keys held down walk the player and turn
   * the camera no more.
   *
   * @param {DialogueView | null} dialogue - The dialogue, or `null` while
   *   the player is in none.
   * @param {readonly VillagerId[]} known - The villagers who have told the
   *   player who they are.
   * @returns {boolean} Whether a dialogue has opened now.
   */
  showDialogue(
    dialogue: DialogueView | null,
    known: readonly VillagerId[],
  ): boolean {
    return this.#dialogue.show(dialogue, known);
  }

  /** Closes the box of the chat without sending, if it is open. */
  closeChat(): void {
    this.#chat.dismiss();
  }

  /**
   * Reads the devices at a frame, as {@link PlayInput.update} tells, shows
   * the touch controls and the button of the chat as they are now, and
   * tells the server which way the devices walk the player, if that has
   * changed.
   *
   * @param {number} seconds - The time since the last frame, in seconds.
   */
  update(seconds: number): void {
    this.#input.update(seconds);
    this.#touchView.render();
    this.#chat.render();
    this.#input.sendMove();
  }

  /**
   * Shows the ending sheet as it unrolls and rolls up, and opens it with the
   * ending, as {@link EndingController.update} tells, as the page knows
   * whether its player has reached the end of the story.  From then on,
   * the help sheet offers the credits on a page of their own.
   *
   * @param {boolean} isEndingReached - Whether the server has told that the
   *   player of the page has reached the end of the story.
   */
  showEnding(isEndingReached: boolean): void {
    if (this.#ending.update(isEndingReached, this.#dialogue.isOpen())) {
      this.#help.offerCredits();
    }
  }

  /**
   * Carries out an action chosen in the menu of an item in the bag: a use
   * has the player of the page use the item of the slot, and a drop has it
   * drop the item at its feet, unless it is dead.  Whether anything comes
   * of it is for the server to decide, and shows once the server tells it.
   *
   * @param {ItemRequest} request - The action, and the slot of the item.
   */
  #carryOutItemAction(request: ItemRequest): void {
    // The request of each action is its input.
    if (!this.#hooks.isPlayerDead()) {
      this.#hooks.sendInput({ type: request.action, slot: request.slot });
    }
  }

  /**
   * Holds the controls of play while the bag, the help sheet, the ending
   * sheet, a dialogue or the box of the chat opens, as
   * {@link PlayInput.holdPlay} tells.  The box of the chat closes without
   * sending, if it was open.
   */
  #holdPlay(): void {
    this.closeChat();
    this.#input.holdPlay();
  }
}
