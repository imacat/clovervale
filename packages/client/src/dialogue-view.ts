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
 * @module client/dialogue-view The dialogue box of the player of the page,
 *   as the page shows it.
 */

import { DIALOGUE_REPLY_LIMIT, VILLAGERS } from '@clovervale/shared';
import type { DialogueView, Villager, VillagerId } from '@clovervale/shared';

import type { DialogueBox, DialogueRequest } from './dialogue-box.ts';
import { wordDialogueText } from './dialogue-words.ts';
import type { Translator } from './translator.ts';
import { describeVillager } from './villager-words.ts';

/**
 * The name of the property of the root of the page that tells how far up
 * from the foot of the page the dialogue box reaches, for what stands
 * above it there.
 */
const TOP_PROPERTY = '--dialogue-top';

/** The dialogue box, as the page shows it. */
export interface DialogueBoxView {
  /**
   * Takes in the dialogue the player is in now, as the server tells, and
   * the villagers who have told the player who they are, and shows the box
   * so.
   *
   * @param {DialogueView | null} dialogue - The dialogue, or `null` while
   *   the player is in none.
   * @param {readonly VillagerId[]} acquaintances - The villagers.
   */
  readonly show: (
    dialogue: DialogueView | null,
    acquaintances: readonly VillagerId[],
  ) => void;
  /** Shows the box as it is now, after a key has changed it. */
  readonly render: () => void;
  /**
   * Describes what the box shows now.
   *
   * @returns {DialogueShown | null} What it shows, or `null` while it is
   *   closed.
   */
  readonly describe: () => DialogueShown | null;
}

/** What the dialogue box shows. */
export interface DialogueShown {
  /** The name of the villager. */
  readonly name: string;
  /** What the villager has just said. */
  readonly line: string;
  /** The replies offered, in order. */
  readonly replies: readonly string[];
  /** The place of the reply the cursor is on, from 0. */
  readonly cursor: number;
}

/**
 * Creates the dialogue box of the player of the page, at the foot of the
 * page in the middle, which is shown while the player is in a dialogue:
 * the name of the villager on top, by the name it goes by once it has told
 * the player who it is, then what it has just said, then the replies with
 * the cursor on one, and a line that tells the keys, or what to tap on a
 * touch device.  A click on a reply answers with it, as {@link DialogueBox}
 * tells, and on a touch device a tap on the box ends a dialogue that offers
 * no reply; no click on the box reaches the game underneath.  What the box
 * shows is worded again in each language the page comes to speak.
 *
 * @param {HTMLElement} parent - What the box is added to.
 * @param {Translator} translator - The translator of the text of the page.
 * @param {DialogueBox} box - The dialogue box.
 * @param {(request: DialogueRequest) => void} answer - Sends what the
 *   player answers.
 * @param {() => boolean} isTouch - Tells whether the page is used by
 *   touch, so that the line at the foot of the box tells what to tap
 *   rather than the keys, and a tap on the box ends a dialogue that offers
 *   no reply.
 * @returns {DialogueBoxView} The box as shown.
 */
export function createDialogueView(
  parent: HTMLElement,
  translator: Translator,
  box: DialogueBox,
  answer: (request: DialogueRequest) => void,
  isTouch: () => boolean,
): DialogueBoxView {
  let acquaintances: readonly VillagerId[] = [];
  const root: HTMLDivElement = document.createElement('div');
  root.className = 'dialogue';
  root.hidden = true;
  root.addEventListener('pointerdown', (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
  });
  root.addEventListener('click', (event: MouseEvent) => {
    event.stopPropagation();
    // On a touch device, a tap anywhere on the box ends a dialogue that
    // offers no reply to tap.
    if (isTouch() && box.dialogue?.replies.length === 0) {
      const request: DialogueRequest | null = box.clickReply(0);
      if (request !== null) {
        answer(request);
      }
      render();
    }
  });
  root.addEventListener('wheel', (event: WheelEvent) => {
    event.stopPropagation();
  });
  const name: HTMLDivElement = document.createElement('div');
  name.className = 'dialogue-name';
  const line: HTMLDivElement = document.createElement('div');
  line.className = 'dialogue-line';
  const list: HTMLDivElement = document.createElement('div');
  list.className = 'dialogue-replies';
  list.setAttribute('role', 'menu');
  const replies: HTMLDivElement[] = Array.from(
    { length: DIALOGUE_REPLY_LIMIT },
    (_, index: number): HTMLDivElement => {
      const reply: HTMLDivElement = document.createElement('div');
      reply.className = 'dialogue-reply';
      reply.setAttribute('role', 'menuitem');
      reply.addEventListener('click', (event: MouseEvent) => {
        if (event.button !== 0) {
          return;
        }
        const request: DialogueRequest | null = box.clickReply(index);
        if (request !== null) {
          answer(request);
        }
        render();
      });
      return reply;
    },
  );
  const hint: HTMLDivElement = document.createElement('div');
  hint.className = 'dialogue-hint';
  root.append(name, line, list, hint);
  parent.append(root);

  const describe = (): DialogueShown | null => {
    const dialogue: DialogueView | null = box.dialogue;
    if (dialogue === null) {
      return null;
    }
    const villager: Villager | undefined = VILLAGERS.find(
      (candidate: Villager) => candidate.id === dialogue.villager,
    );
    return {
      name:
        villager === undefined
          ? ''
          : describeVillager(translator, villager, acquaintances).name,
      line: wordDialogueText(translator, dialogue.line),
      replies: dialogue.replies.map((reply: string) =>
        wordDialogueText(translator, reply),
      ),
      cursor: box.cursor,
    };
  };

  const render = (): void => {
    const shown: DialogueShown | null = describe();
    root.hidden = shown === null;
    if (shown === null) {
      document.documentElement.style.removeProperty(TOP_PROPERTY);
      return;
    }
    name.textContent = shown.name;
    line.textContent = shown.line;
    list.replaceChildren(...replies.slice(0, shown.replies.length));
    shown.replies.forEach((text: string, index: number) => {
      const reply: HTMLDivElement | undefined = replies[index];
      if (reply === undefined) {
        return;
      }
      reply.textContent = text;
      reply.classList.toggle('is-cursor', index === shown.cursor);
    });
    list.hidden = shown.replies.length === 0;
    const isEnd: boolean = shown.replies.length === 0;
    if (isTouch()) {
      hint.textContent = translator.translate(
        isEnd ? 'dialogue.touchHintEnd' : 'dialogue.touchHint',
      );
    } else {
      hint.textContent = translator.translate(
        isEnd ? 'dialogue.hintEnd' : 'dialogue.hint',
      );
    }
    const top: number = window.innerHeight - root.getBoundingClientRect().top;
    document.documentElement.style.setProperty(
      TOP_PROPERTY,
      `${String(Math.ceil(top))}px`,
    );
  };
  render();
  translator.addListener(render);
  return {
    show: (
      dialogue: DialogueView | null,
      known: readonly VillagerId[],
    ): void => {
      const isSame: boolean =
        JSON.stringify(dialogue) === JSON.stringify(box.dialogue) &&
        JSON.stringify(known) === JSON.stringify(acquaintances);
      if (isSame) {
        return;
      }
      acquaintances = [...known];
      box.noticeDialogue(dialogue);
      render();
    },
    render,
    describe,
  };
}
