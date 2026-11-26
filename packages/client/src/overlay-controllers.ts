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
 * @module client/overlay-controllers The bag, the box of the chat, the help
 *   sheet, the ending sheet and the dialogue box over play, each with what
 *   shows it on the page.
 */

import type {
  DialogueView,
  ItemKindId,
  PlayerInput,
  VillagerId,
} from '@clovervale/shared';

import { createBagView } from './bag-view.ts';
import type { BagView } from './bag-view.ts';
import { ChatBox } from './chat-box.ts';
import { createChatView } from './chat-view.ts';
import type { ChatView } from './chat-view.ts';
import { DialogueBox } from './dialogue-box.ts';
import type { DialogueRequest, DialogueResponse } from './dialogue-box.ts';
import { createDialogueView } from './dialogue-view.ts';
import type { DialogueBoxView, DialogueShown } from './dialogue-view.ts';
import { EndingSheet, EndingWatch, ROLL_DURATION } from './ending-sheet.ts';
import type { EndingResponse } from './ending-sheet.ts';
import { createEndingView, prefersReducedMotion } from './ending-view.ts';
import type { EndingView } from './ending-view.ts';
import {
  GAMEPAD_PAGE,
  HelpSheet,
  KEYBOARD_PAGE,
  TOUCH_PAGE,
  openHelpOnFirstVisit,
} from './help-sheet.ts';
import { createHelpView } from './help-view.ts';
import type { HelpView } from './help-view.ts';
import type { GameCommand, InputSource } from './input-device.ts';
import { InventoryBag } from './inventory-bag.ts';
import type { BagResponse, ItemRequest } from './inventory-bag.ts';
import type { Overlay } from './overlay-stack.ts';
import type { PageStorage } from './page-storage.ts';
import { findKeyCommand } from './player-input.ts';
import type { Translator } from './translator.ts';

/**
 * The page of the help sheet that tells the controls of each kind of
 * device, which the help sheet opens at as the device opens it.
 */
const HELP_PAGES: Readonly<Record<InputSource, number>> = {
  keyboard: KEYBOARD_PAGE,
  gamepad: GAMEPAD_PAGE,
  touch: TOUCH_PAGE,
};

/** What a sheet or a box over play opens among the others by. */
export interface OverlayHost {
  /**
   * Tells whether a sheet or a box can be opened now: while none before it
   * is open.
   *
   * @param {Overlay} overlay - The sheet or the box.
   * @returns {boolean} Whether it can.
   */
  readonly canOpen: (overlay: Overlay) => boolean;
  /**
   * Closes whatever is open after a sheet or a box that has opened, showing
   * it closed, and holds the controls of play.
   *
   * @param {Overlay} opened - The sheet or the box that has opened.
   */
  readonly holdPlayUnder: (opened: Overlay) => void;
}

/** The bag of the player of the page, over play. */
export class BagController implements Overlay {
  /** What the buttons of the gamepads do while the bag is open. */
  readonly padScreen: Overlay['padScreen'] = 'choice';
  /** The bag, which the person at the page opens. */
  readonly #bag = new InventoryBag();
  /** What shows the bag on the page. */
  readonly #view: BagView;
  /** What the bag opens among the others by. */
  readonly #host: OverlayHost;
  /** Carries out an action chosen in the menu of an item. */
  readonly #carryOut: (request: ItemRequest) => void;

  /**
   * Shows the bag on the page, closed.
   *
   * @param {HTMLElement} parent - What it is shown in.
   * @param {Translator} translator - The translator of the page.
   * @param {OverlayHost} host - What it opens among the others by.
   * @param {(request: ItemRequest) => void} carryOut - Carries out an action
   *   chosen in the menu of an item.
   * @param {() => boolean} isTouch - Tells whether the page is shown on a
   *   touch device.
   */
  constructor(
    parent: HTMLElement,
    translator: Translator,
    host: OverlayHost,
    carryOut: (request: ItemRequest) => void,
    isTouch: () => boolean,
  ) {
    this.#host = host;
    this.#carryOut = carryOut;
    this.#view = createBagView(
      parent,
      translator,
      this.#bag,
      carryOut,
      () => {
        this.#clickIcon();
      },
      isTouch,
    );
  }

  /**
   * Tells whether the bag is open.
   *
   * @returns {boolean} Whether it is.
   */
  isOpen(): boolean {
    return this.#bag.isOpen;
  }

  /**
   * Carries out a command for the bag, so that while it is open the arrow
   * keys, Enter and Esc do nothing else, and the keys of play do nothing
   * at all.
   *
   * @param {GameCommand} command - The command.
   * @returns {boolean | null} Whether the game took the command, or `null`
   *   for a command the bag does not take while it is closed.
   */
  pressKey({ code, isRepeat }: GameCommand): boolean | null {
    const wasOpen: boolean = this.#bag.isOpen;
    const response: BagResponse =
      isRepeat && code === 'KeyI'
        ? { isHandled: true, request: null }
        : this.#bag.pressKey(code);
    if (response.isHandled) {
      if (response.request !== null) {
        this.#carryOut(response.request);
      }
      if (this.#bag.isOpen && !wasOpen) {
        this.#host.holdPlayUnder(this);
      }
      this.#view.render();
      return true;
    }
    return this.#bag.isOpen ? findKeyCommand(code) !== null : null;
  }

  /** Closes the bag, if it is open, without showing it closed. */
  close(): void {
    if (this.#bag.isOpen) {
      this.#bag.clickIcon();
    }
  }

  /** Shows the bag as it is now. */
  render(): void {
    this.#view.render();
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
  show(
    inventory: readonly ItemKindId[] | null,
    health: number,
    silver?: number,
  ): void {
    this.#view.show(inventory, health, silver);
  }

  /**
   * Opens the bag if it is closed, and closes it if open, as a click on its
   * icon does, unless a sheet or a box before it is open over the icon.
   */
  #clickIcon(): void {
    if (!this.#host.canOpen(this)) {
      return;
    }
    this.#bag.clickIcon();
    if (this.#bag.isOpen) {
      this.#host.holdPlayUnder(this);
    }
    this.#view.render();
  }
}

/** The box a line is typed in for the player of the page to say. */
export class ChatController implements Overlay {
  /** What the buttons of the gamepads do while the box is open. */
  readonly padScreen: Overlay['padScreen'] = 'choice';
  /** The box. */
  readonly #box = new ChatBox();
  /** What shows the box on the page. */
  readonly #view: ChatView;
  /** What the box opens among the others by. */
  readonly #host: OverlayHost;
  /** Tells whether the page has a player. */
  readonly #hasPlayer: () => boolean;

  /**
   * Shows the box on the page, closed, with its button.
   *
   * @param {HTMLElement} parent - What it is shown in.
   * @param {Translator} translator - The translator of the page.
   * @param {OverlayHost} host - What it opens among the others by.
   * @param {(line: string) => void} sayLine - Has the player of the page
   *   say a line.
   * @param {() => boolean} hasPlayer - Tells whether the page has a player.
   * @param {() => boolean} isOffered - Tells whether the button of the box
   *   is shown.
   */
  constructor(
    parent: HTMLElement,
    translator: Translator,
    host: OverlayHost,
    sayLine: (line: string) => void,
    hasPlayer: () => boolean,
    isOffered: () => boolean,
  ) {
    this.#host = host;
    this.#hasPlayer = hasPlayer;
    this.#view = createChatView(
      parent,
      translator,
      this.#box,
      () => {
        this.#clickButton();
      },
      sayLine,
      isOffered,
    );
  }

  /**
   * Tells whether the box is open.
   *
   * @returns {boolean} Whether it is.
   */
  isOpen(): boolean {
    return this.#box.isOpen;
  }

  /**
   * Carries out a command for the box: while a line is typed, every key is
   * for the box, the browser and the input method alone.
   *
   * @returns {boolean | null} `false` while the box is open, so that the
   *   game takes no key, or `null` while it is closed.
   */
  pressKey(): boolean | null {
    return this.#box.isOpen ? false : null;
  }

  /** Closes the box without sending, without showing it closed. */
  close(): void {
    this.#box.close();
  }

  /** Shows the box and its button as they are now. */
  render(): void {
    this.#view.render();
  }

  /**
   * Tells whether the box can be opened now: while the page has a player,
   * and no sheet or box before it is open.
   *
   * @returns {boolean} Whether it can.
   */
  canOpen(): boolean {
    return this.#hasPlayer() && this.#host.canOpen(this);
  }

  /**
   * Opens the box, if it can be opened, and holds the controls of play, so
   * that the player stands still while a line is typed.
   */
  open(): void {
    if (!this.canOpen()) {
      return;
    }
    this.#host.holdPlayUnder(this);
    this.#box.open();
    this.#view.render();
  }

  /** Closes the box without sending, if it is open, and shows it closed. */
  dismiss(): void {
    this.#box.close();
    this.#view.render();
  }

  /**
   * Opens the box if it is closed, and closes it without sending if open,
   * as a click on its button does.
   */
  #clickButton(): void {
    if (this.#box.isOpen) {
      this.dismiss();
    } else {
      this.open();
    }
  }
}

/** The help sheet that tells the controls of the game, over play. */
export class HelpController implements Overlay {
  /** What the buttons of the gamepads do while the sheet is open. */
  readonly padScreen: Overlay['padScreen'] = 'help';
  /** The sheet. */
  readonly #sheet = new HelpSheet();
  /** What shows the sheet on the page. */
  readonly #view: HelpView;
  /** What the sheet opens among the others by. */
  readonly #host: OverlayHost;
  /** Tells whether the page is shown on a touch device. */
  readonly #isTouch: () => boolean;

  /**
   * Shows the sheet on the page with its button, open on the first visit
   * with the welcome to the game, which moves on to the page of touch on a
   * touch device.
   *
   * @param {HTMLElement} parent - What it is shown in.
   * @param {Translator} translator - The translator of the page.
   * @param {OverlayHost} host - What it opens among the others by.
   * @param {() => boolean} isTouch - Tells whether the page is shown on a
   *   touch device.
   * @param {PageStorage | null} storage - Where the browser lets the page
   *   remember whether the sheet has been opened before.
   */
  constructor(
    parent: HTMLElement,
    translator: Translator,
    host: OverlayHost,
    isTouch: () => boolean,
    storage: PageStorage | null,
  ) {
    this.#host = host;
    this.#isTouch = isTouch;
    this.#view = createHelpView(
      parent,
      translator,
      this.#sheet,
      () => {
        this.#clickButton();
      },
      () => {
        this.#sheet.close();
        this.#view.render();
      },
      () => {
        this.#sheet.moveOn();
        this.#view.render();
      },
      isTouch,
    );
    openHelpOnFirstVisit(
      this.#sheet,
      storage,
      isTouch() ? TOUCH_PAGE : KEYBOARD_PAGE,
    );
    this.#view.render();
  }

  /**
   * Tells whether the sheet is open.
   *
   * @returns {boolean} Whether it is.
   */
  isOpen(): boolean {
    return this.#sheet.isOpen;
  }

  /**
   * Carries out a command for the sheet: the H key opens it over the bag,
   * at the page that tells the controls of the device that gives the
   * command, and while it is open, it takes every key of the game, and
   * leaves every other key to the browser.  While it shows the welcome,
   * any command moves on to its pages.
   *
   * @param {GameCommand} command - The command.
   * @returns {boolean | null} Whether the game took the command, or `null`
   *   for a command other than H while the sheet is closed.
   */
  pressKey({ code, isRepeat, source }: GameCommand): boolean | null {
    if (code !== 'KeyH' && !this.#sheet.isOpen) {
      return null;
    }
    if (isRepeat && code === 'KeyH') {
      return true;
    }
    if (!this.#sheet.isOpen) {
      this.#open(HELP_PAGES[source]);
      return true;
    }
    const wasWelcoming: boolean = this.#sheet.isWelcoming;
    const isTaken: boolean = this.#sheet.pressKey(code, isRepeat);
    if (isTaken || this.#sheet.isWelcoming !== wasWelcoming) {
      this.#view.render();
    }
    return isTaken;
  }

  /** Closes the sheet, if it is open, without showing it closed. */
  close(): void {
    this.#sheet.close();
  }

  /** Shows the sheet as it is now. */
  render(): void {
    this.#view.render();
  }

  /**
   * Has the sheet offer the credits of the game from now on, on a page of
   * their own, and shows it so.
   */
  offerCredits(): void {
    this.#sheet.hasCredits = true;
    this.#view.render();
  }

  /**
   * Opens the sheet, as a click on its button does, unless a sheet or a
   * box before it is open, at the page of touch on a touch device.
   */
  #clickButton(): void {
    if (!this.#host.canOpen(this)) {
      return;
    }
    this.#open(this.#isTouch() ? TOUCH_PAGE : KEYBOARD_PAGE);
  }

  /**
   * Opens the sheet, closing what is open after it, and holds the controls
   * of play.
   *
   * @param {number} page - The page to open it at.
   */
  #open(page: number): void {
    this.#sheet.open(page);
    this.#host.holdPlayUnder(this);
    this.#view.render();
  }
}

/** The sheet of the ending and the credits of the game, over play. */
export class EndingController implements Overlay {
  /** What the buttons of the gamepads do while the sheet is open. */
  readonly padScreen: Overlay['padScreen'] = 'choice';
  /** The sheet. */
  readonly #sheet = new EndingSheet();
  /** What tells when the sheet opens by itself. */
  readonly #watch = new EndingWatch();
  /** What shows the sheet on the page. */
  readonly #view: EndingView;
  /** What the sheet opens among the others by. */
  readonly #host: OverlayHost;

  /**
   * Shows the sheet on the page, closed.
   *
   * @param {HTMLElement} parent - What it is shown in.
   * @param {Translator} translator - The translator of the page.
   * @param {OverlayHost} host - What it opens among the others by.
   */
  constructor(parent: HTMLElement, translator: Translator, host: OverlayHost) {
    this.#host = host;
    this.#view = createEndingView(parent, translator, this.#sheet, () => {
      this.#sheet.advance(performance.now());
      this.#view.render();
    });
  }

  /**
   * Tells whether the sheet is open.
   *
   * @returns {boolean} Whether it is.
   */
  isOpen(): boolean {
    return this.#sheet.isOpen;
  }

  /**
   * Carries out a command for the sheet, which comes over the help sheet
   * and the bag, which are closed while it is open: it takes every key of
   * the game, and leaves every other key to the browser.
   *
   * @param {GameCommand} command - The command.
   * @returns {boolean | null} Whether the game took the command, or `null`
   *   while the sheet is closed.
   */
  pressKey({ code, isRepeat }: GameCommand): boolean | null {
    if (!this.#sheet.isOpen) {
      return null;
    }
    const reply: EndingResponse = this.#sheet.pressKey(
      code,
      performance.now(),
      isRepeat,
    );
    if (reply.scroll !== 0) {
      this.#view.scroll(reply.scroll);
    }
    this.#view.render();
    return reply.isHandled;
  }

  /** Closes the sheet, if it is open, without showing it closed. */
  close(): void {
    this.#sheet.close();
  }

  /** Shows the sheet as it is now. */
  render(): void {
    this.#view.render();
  }

  /**
   * Shows the sheet as it unrolls and rolls up, and opens it with the
   * ending once {@link EndingWatch} tells it is to, closing the help sheet
   * and the bag and holding the controls of play.  It unrolls, unless the
   * person at the page asks for little motion.
   *
   * @param {boolean} isEndingReached - Whether the server has told that the
   *   player of the page has reached the end of the story.
   * @param {boolean} isInDialogue - Whether the player is in a dialogue.
   * @returns {boolean} Whether the sheet has opened now.
   */
  update(isEndingReached: boolean, isInDialogue: boolean): boolean {
    if (this.#sheet.update(performance.now())) {
      this.#view.render();
    }
    if (!this.#watch.notice(isEndingReached, isInDialogue)) {
      return false;
    }
    this.#open();
    return true;
  }

  /**
   * Opens the sheet, closing what is open after it, and holds the controls
   * of play.  It unrolls, unless the person at the page asks for little
   * motion.
   */
  #open(): void {
    this.#sheet.rollDuration = prefersReducedMotion() ? 0 : ROLL_DURATION;
    this.#sheet.open(performance.now());
    this.#host.holdPlayUnder(this);
    this.#view.render();
  }
}

/** The dialogue the player of the page is in, over play. */
export class DialogueController implements Overlay {
  /** What the buttons of the gamepads do while the box is open. */
  readonly padScreen: Overlay['padScreen'] = 'choice';
  /** The dialogue, and the reply chosen. */
  readonly #box = new DialogueBox();
  /** What shows the dialogue box on the page. */
  readonly #view: DialogueBoxView;
  /** What the dialogue box opens among the others by. */
  readonly #host: OverlayHost;
  /** Gives the player of the page an input. */
  readonly #sendInput: (input: PlayerInput) => boolean;

  /**
   * Shows the dialogue box on the page, closed.
   *
   * @param {HTMLElement} parent - What it is shown in.
   * @param {Translator} translator - The translator of the page.
   * @param {OverlayHost} host - What it opens among the others by.
   * @param {(input: PlayerInput) => boolean} sendInput - Gives the player
   *   of the page an input.
   * @param {() => boolean} isTouch - Tells whether the page is shown on a
   *   touch device.
   */
  constructor(
    parent: HTMLElement,
    translator: Translator,
    host: OverlayHost,
    sendInput: (input: PlayerInput) => boolean,
    isTouch: () => boolean,
  ) {
    this.#host = host;
    this.#sendInput = sendInput;
    this.#view = createDialogueView(
      parent,
      translator,
      this.#box,
      (request: DialogueRequest) => {
        sendInput(request);
      },
      isTouch,
    );
  }

  /**
   * Tells whether the player of the page is in a dialogue.
   *
   * @returns {boolean} Whether it is.
   */
  isOpen(): boolean {
    return this.#box.isOpen;
  }

  /**
   * Carries out a command for the dialogue box.  The box takes every key
   * of the game while it is open, so that the player neither moves nor
   * does anything else, and leaves every other key to the browser.
   *
   * @param {GameCommand} command - The command.
   * @returns {boolean | null} Whether the game took the command, or `null`
   *   while the box is closed.
   */
  pressKey({ code }: GameCommand): boolean | null {
    const answer: DialogueResponse = this.#box.pressKey(code);
    if (answer.isHandled) {
      if (answer.request !== null) {
        this.#sendInput(answer.request);
      }
      this.#view.render();
      return true;
    }
    return this.#box.isOpen ? false : null;
  }

  /**
   * Closes the dialogue box without showing it closed.  Only the server
   * ends a dialogue, which nothing over play comes before.
   */
  close(): void {
    this.#box.noticeDialogue(null);
  }

  /** Shows the dialogue box as it is now. */
  render(): void {
    this.#view.render();
  }

  /**
   * Describes the dialogue box as it is shown, for looking at.
   *
   * @returns {DialogueShown | null} What it shows, or `null` while it is
   *   closed.
   */
  describe(): DialogueShown | null {
    return this.#view.describe();
  }

  /**
   * Shows the dialogue the player of the page is in, as the server tells,
   * with the villagers called by the names they go by once they have told
   * the player who they are.  As a dialogue opens, what is open after the
   * box closes, and the controls of play are held.
   *
   * @param {DialogueView | null} dialogue - The dialogue, or `null` while
   *   the player is in none.
   * @param {readonly VillagerId[]} known - The villagers who have told the
   *   player who they are.
   * @returns {boolean} Whether a dialogue has opened now.
   */
  show(dialogue: DialogueView | null, known: readonly VillagerId[]): boolean {
    const wasOpen: boolean = this.#box.isOpen;
    this.#view.show(dialogue, known);
    if (!this.#box.isOpen || wasOpen) {
      return false;
    }
    this.#host.holdPlayUnder(this);
    return true;
  }
}
