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
 * @module client/ending-view The ending sheet as the page shows it: a scroll
 *   of parchment between two wooden rollers in the middle of the page, which
 *   unrolls to tell the end of the story or the credits of the game, and
 *   rolls up again, rolling the credits slowly inside when they do not fit.
 */

import { createElement, drawCredits } from './credits-view.ts';
import type { CreditsView } from './credits-view.ts';
import { findRollOffset } from './ending-sheet.ts';
import type { EndingContent, EndingSheet } from './ending-sheet.ts';
import type { Translator } from './translator.ts';

/** How far an arrow key scrolls the credits, in pixels. */
const SCROLL_STEP = 48;

/**
 * How far the pointer may move between pressing and letting go for a
 * click that advances the sheet, in pixels; farther, it is a drag.
 */
const CLICK_SLOP = 8;

/** The ending sheet as the page shows it. */
export interface EndingView {
  /** Shows the sheet as it is now, after it has changed. */
  readonly render: () => void;
  /**
   * Scrolls the open credits a step, as the player does, which stops them
   * rolling by themselves.
   *
   * @param {number} way - Which way: -1 up, and 1 down.
   */
  readonly scroll: (way: number) => void;
}

/**
 * Tells whether the person at the page asks for as little motion as can
 * be.
 *
 * @returns {boolean} Whether they do.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Creates the ending sheet of the page: while it is open, a clear veil over
 * the page, and in the middle a scroll of parchment between two wooden
 * rollers, which tells either the end of the story with "The End" under
 * it, or the credits: the name and the version of the game, its author,
 * the AI that assisted, the music, the libraries the client comes with,
 * each under its licence, and the licence of the game.  The names of
 * people, of works, of libraries and of licences are the same in every
 * language, and the rest is worded again in each language the page comes
 * to speak.
 *
 * As the sheet unrolls, the rollers part from the middle and the parchment
 * shows more and more of what it tells, from the middle out; as it rolls
 * up, they come together again over it, and when it closes, the rolled
 * scroll fades away.  The parchment and the rollers move as one, both
 * drawn at every frame from how far the sheet tells it has unrolled, so
 * that nothing moves while the sheet takes no time.
 *
 * Credits that fit the scroll stand still.  Those that do not, as on a
 * phone, stand still for a moment once the scroll has unrolled, or once
 * they come not to fit, and then roll up slowly inside it until their end
 * shows, unless the person at the page asks for little motion; the wheel,
 * a drag of the mouse or of a finger, the scroll bar and the arrow keys
 * scroll them too, which stops them rolling by themselves.
 *
 * A click or a tap anywhere on the page while the sheet is open, on the
 * scroll or around it, advances the sheet, but for one that ends a drag
 * or scrolls the credits; a press stops the credits rolling by themselves,
 * and no click reaches the game underneath.
 *
 * @param {HTMLElement} parent - What the sheet is added to.
 * @param {Translator} translator - The translator of the text of the page.
 * @param {EndingSheet} sheet - The ending sheet.
 * @param {() => void} advance - Called when a click advances the sheet.
 * @returns {EndingView} The sheet as shown.
 */
export function createEndingView(
  parent: HTMLElement,
  translator: Translator,
  sheet: EndingSheet,
  advance: () => void,
): EndingView {
  const veil: HTMLDivElement = createElement('div', 'ending');
  const frame: HTMLDivElement = createElement('div', 'ending-scroll');
  frame.setAttribute('role', 'dialog');
  frame.setAttribute('aria-modal', 'true');
  const topRoller: HTMLDivElement = createElement(
    'div',
    'ending-roller is-top',
  );
  const bottomRoller: HTMLDivElement = createElement(
    'div',
    'ending-roller is-bottom',
  );
  const reel: HTMLDivElement = createElement('div', 'ending-reel');
  const paper: HTMLDivElement = createElement('div', 'ending-paper');
  const credits: HTMLDivElement = createElement(
    'div',
    'ending-page ending-credits',
  );
  const roll: HTMLDivElement = createElement('div', 'ending-roll');
  const story: HTMLDivElement = createElement(
    'div',
    'ending-page ending-story',
  );
  const text: HTMLParagraphElement = createElement('p', 'ending-text');
  text.id = 'ending-text';
  const end: HTMLParagraphElement = createElement('p', 'ending-end');
  story.append(text, end);
  const shownCredits: CreditsView = drawCredits(translator);
  shownCredits.title.id = 'ending-title';
  // The words of the end of the story, told afresh in every language.
  const worded: [HTMLElement, () => string][] = [
    [text, () => translator.translate('ending.text')],
    [end, () => translator.translate('ending.end')],
  ];
  roll.append(shownCredits.element);
  credits.append(roll);
  paper.append(story, credits);
  reel.append(paper);
  frame.append(topRoller, reel, bottomRoller);
  parent.append(veil, frame);


  /**
   * How long the credits have not fitted the scroll unrolled since they
   * were last shown, in milliseconds.
   */
  let unfitFor = 0;
  /** When the credits were last rolled, on the clock of the page. */
  let rolledAt: number | null = null;
  /** Whether the credits roll by themselves. */
  let isRolling = false;
  /** What the scroll last showed. */
  let shown: EndingContent | null = null;
  /** The next frame the scroll is drawn at, if one is asked for. */
  let drawFrame: number | null = null;
  /** Where a drag of the mouse on the credits last was, if it is on. */
  let dragY: number | null = null;
  /**
   * Where the pointer was pressed, and how far the credits were scrolled
   * then, if it is pressed.
   */
  let press: { x: number; y: number; scrollTop: number } | null = null;

  /** Stops the credits rolling by themselves, for the player to scroll. */
  const stopRolling = (): void => {
    isRolling = false;
  };
  /**
   * Draws the scroll as far as it has unrolled, the parchment as tall as
   * that share of what it tells, between the rollers, which therefore
   * always hold its edges, fading away as it rolls up for good; rolls the
   * credits as far as they have come while it stands unrolled; and goes on
   * at the next frame while the sheet is open.
   *
   * @param {number} now - The time of the frame, on the clock of the page.
   */
  const draw = (now: number): void => {
    drawFrame = null;
    const { content, motion } = sheet;
    if (content === null) {
      return;
    }
    const share: number = sheet.findUnrolledShare(now);
    const page: HTMLDivElement = content === 'ending' ? story : credits;
    reel.style.height = `${String(share * page.offsetHeight)}px`;
    frame.style.opacity =
      content === 'credits' && motion === 'rolling'
        ? String(Math.min(share * 3, 1))
        : '';
    if (content === 'credits' && isRolling) {
      const overflow: number = roll.scrollHeight - roll.clientHeight;
      if (rolledAt !== null && overflow > 0 && motion === 'shown') {
        unfitFor += now - rolledAt;
      }
      rolledAt = now;
      roll.scrollTop = findRollOffset(unfitFor, overflow);
    }
    drawFrame = requestAnimationFrame(draw);
  };

  for (const element of [veil, frame]) {
    for (const type of ['pointerdown', 'wheel', 'contextmenu']) {
      element.addEventListener(type, (event: Event) => {
        if (type === 'pointerdown' || type === 'contextmenu') {
          event.preventDefault();
        }
        event.stopPropagation();
      });
    }
    element.addEventListener('pointerdown', (event: PointerEvent) => {
      // Only the player scrolls the credits from a press on.
      isRolling = false;
      press = {
        x: event.clientX,
        y: event.clientY,
        scrollTop: roll.scrollTop,
      };
    });
    element.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation();
      const pressed = press;
      press = null;
      if (
        event.button !== 0 ||
        (pressed !== null &&
          (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) >
            CLICK_SLOP ||
            roll.scrollTop !== pressed.scrollTop))
      ) {
        return;
      }
      advance();
    });
  }
  roll.addEventListener('wheel', stopRolling, { passive: true });
  roll.addEventListener('touchstart', stopRolling, { passive: true });
  roll.addEventListener('pointerdown', (event: PointerEvent) => {
    stopRolling();
    if (event.pointerType !== 'touch' && event.button === 0) {
      dragY = event.clientY;
      roll.setPointerCapture(event.pointerId);
    }
  });
  roll.addEventListener('pointermove', (event: PointerEvent) => {
    if (dragY !== null) {
      roll.scrollTop -= event.clientY - dragY;
      dragY = event.clientY;
    }
  });
  for (const type of ['pointerup', 'pointercancel']) {
    roll.addEventListener(type, () => {
      dragY = null;
    });
  }

  const render = (): void => {
    const { content, motion } = sheet;
    const isOpen: boolean = content !== null;
    veil.hidden = !isOpen;
    frame.hidden = !isOpen;
    frame.dataset.content = content ?? '';
    frame.dataset.motion = motion ?? '';
    for (const [element, words] of worded) {
      element.textContent = words();
    }
    shownCredits.relabel();
    if (content === null) {
      if (drawFrame !== null) {
        cancelAnimationFrame(drawFrame);
        drawFrame = null;
      }
      shown = null;
      isRolling = false;
      dragY = null;
      press = null;
      return;
    }
    frame.setAttribute(
      'aria-labelledby',
      content === 'ending' ? 'ending-text' : 'ending-title',
    );
    if (content !== shown) {
      shown = content;
      story.hidden = content !== 'ending';
      credits.hidden = content !== 'credits';
      roll.scrollTop = 0;
      unfitFor = 0;
      rolledAt = null;
      isRolling = content === 'credits' && !prefersReducedMotion();
    }
    if (drawFrame !== null) {
      cancelAnimationFrame(drawFrame);
    }
    draw(performance.now());
  };
  const scroll = (way: number): void => {
    stopRolling();
    roll.scrollTop += way * SCROLL_STEP;
  };
  render();
  translator.addListener(render);
  return { render, scroll };
}
