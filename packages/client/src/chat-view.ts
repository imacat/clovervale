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
 * @module client/chat-view The chat as the page shows it: its button
 *   beside those of the bag and the help sheet, and, while it is open, the
 *   box a line is typed in.
 */

import { SAY_LENGTH_LIMIT } from '@clovervale/shared';

import type { ChatBox, ChatResponse } from './chat-box.ts';
import type { Translator } from './translator.ts';
import {
  createClickable,
  createSvgElement,
  drawPicture,
} from './view-elements.ts';

/** The chat as the page shows it. */
export interface ChatView {
  /**
   * Shows the chat as it is now: the box while it is open, ready to be
   * typed in, and its button while the chat is offered.
   */
  readonly render: () => void;
}

/** The class of the line of the box, which is typed in. */
export const CHAT_INPUT_CLASS = 'chat-input';

/**
 * How long after an input method has composed a text a key still belongs
 * to it, in milliseconds: some browsers tell of the Enter that ends the
 * composing only afterwards, as a key of its own.
 */
const COMPOSING_ECHO = 50;

/**
 * Draws a speech bubble with three dots in it, 64 units square, as on the
 * button of the chat.
 *
 * @returns {SVGElement} The speech bubble.
 */
export function drawChatIcon(): SVGElement {
  return drawPicture([
    createSvgElement('path', {
      d:
        'M14 10 L50 10 C55 10 58 13 58 18 L58 36 C58 41 55 44 50 44 ' +
        'L30 44 L18 56 L20 44 L14 44 C9 44 6 41 6 36 L6 18 C6 13 9 10 14 10Z',
      class: 'chat-icon-bubble',
    }),
    ...[20, 32, 44].map((x: number) =>
      createSvgElement('circle', {
        cx: String(x),
        cy: '27',
        r: '3.5',
        class: 'chat-icon-dot',
      }),
    ),
  ]);
}

/**
 * Creates the chat of the page: its button right of that of the help
 * sheet, a speech bubble, with the key that opens it, Enter, on it, and,
 * while the chat is open, a box of one line to type in, with a button that
 * sends the line and a cross that closes the box beside it, above the
 * buttons, or along the top of the page on a touch device, clear of its
 * keyboard.  The button is shown only while the chat is offered.
 *
 * As the box opens, it is empty and takes the keyboard, so that a touch
 * device shows its own.  In the box, a plain Enter sends what was typed
 * and a plain Esc closes the box, as {@link ChatBox} tells; every other
 * key, and every key pressed with a modifier or while an input method
 * composes text, is left to the browser and the input method untouched,
 * and what is typed is never changed while the box is open, though the
 * browser lets no more be typed or pasted than a line may hold; it is
 * selected, copied, cut and pasted as in any line of text, by the menu of
 * the browser too.  The box
 * closes without sending once the keyboard is taken to something else on
 * the page.  No click on the box or the button reaches the game underneath.
 * What the chat shows is worded again in each language the page comes to
 * speak.
 *
 * @param {HTMLElement} parent - What the chat is added to.
 * @param {Translator} translator - The translator of the text of the page.
 * @param {ChatBox} box - The box.
 * @param {() => void} clickButton - Called when the button is clicked.
 * @param {(line: string) => void} say - Called with a line that is sent.
 * @param {() => boolean} isOffered - Tells whether the button is to be
 *   shown now.
 * @returns {ChatView} The chat as shown.
 */
export function createChatView(
  parent: HTMLElement,
  translator: Translator,
  box: ChatBox,
  clickButton: () => void,
  say: (line: string) => void,
  isOffered: () => boolean,
): ChatView {
  const button: HTMLDivElement = createClickable('chat-button', clickButton);
  const key: HTMLSpanElement = document.createElement('span');
  key.className = 'chat-key';
  key.textContent = 'Enter';
  button.append(drawChatIcon(), key);

  const frame: HTMLDivElement = document.createElement('div');
  frame.className = 'chat-box';
  frame.hidden = true;
  const input: HTMLInputElement = document.createElement('input');
  input.className = CHAT_INPUT_CLASS;
  input.type = 'text';
  input.autocomplete = 'off';
  input.enterKeyHint = 'send';
  // The browser itself keeps the line from growing longer than it may.
  input.maxLength = SAY_LENGTH_LIMIT;
  let isShownOpen = false;
  let isShownOffered: boolean | null = null;
  const render = (): void => {
    const isOfferedNow: boolean = isOffered();
    if (isOfferedNow !== isShownOffered) {
      isShownOffered = isOfferedNow;
      button.hidden = !isOfferedNow;
    }
    if (box.isOpen === isShownOpen) {
      return;
    }
    isShownOpen = box.isOpen;
    button.setAttribute('aria-expanded', String(box.isOpen));
    frame.hidden = !box.isOpen;
    if (box.isOpen) {
      input.focus();
    } else {
      input.value = '';
      input.blur();
    }
  };
  const finish = (line: string | null): void => {
    render();
    if (line !== null) {
      say(line);
    }
  };
  const send: HTMLDivElement = createClickable('chat-send', () => {
    finish(box.send(input.value));
  });
  const cross: HTMLDivElement = createClickable('chat-cancel', () => {
    box.close();
    finish(null);
  });
  frame.append(input, send, cross);
  for (const type of ['pointerdown', 'click', 'wheel']) {
    frame.addEventListener(type, (event: Event) => {
      event.stopPropagation();
    });
  }

  // The input method is only listened to, never interfered with.
  let isComposing = false;
  let composedTime = -Infinity;
  input.addEventListener('compositionstart', () => {
    isComposing = true;
  });
  input.addEventListener('compositionend', (event: CompositionEvent) => {
    isComposing = false;
    composedTime = event.timeStamp;
  });
  input.addEventListener('keydown', (event: KeyboardEvent) => {
    // A key held down sends and closes nothing again and again.
    if (event.repeat) {
      return;
    }
    const response: ChatResponse = box.pressKey(
      {
        key: event.key,
        hasModifier:
          event.shiftKey || event.ctrlKey || event.altKey || event.metaKey,
        isComposing:
          event.isComposing ||
          isComposing ||
          event.timeStamp - composedTime < COMPOSING_ECHO,
      },
      input.value,
    );
    // Every key the box does not take is left exactly as it is.
    if (!response.isHandled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    finish(response.line);
  });
  input.addEventListener('blur', () => {
    // A window that loses the keyboard leaves it with the box.
    if (box.isOpen && document.activeElement !== input) {
      box.close();
      render();
    }
  });
  parent.append(button, frame);

  const relabel = (): void => {
    const label: string = translator.translate('chat.icon');
    button.title = label;
    button.setAttribute('aria-label', label);
    const hint: string = translator.translate('chat.input');
    input.placeholder = hint;
    input.setAttribute('aria-label', hint);
    for (const [element, id] of [
      [send, 'chat.send'],
      [cross, 'chat.cancel'],
    ] as const) {
      const text: string = translator.translate(id);
      element.title = text;
      element.setAttribute('aria-label', text);
    }
  };
  relabel();
  translator.addListener(relabel);
  render();
  return { render };
}
