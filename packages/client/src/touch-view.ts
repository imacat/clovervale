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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/21
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/touch-view The touch controls as the page shows them on a
 *   touch device: the stick at the bottom left, the action button at the
 *   bottom right, and the fingers on the scene.
 */

import { CHAT_INPUT_CLASS } from './chat-view.ts';
import { noticePointerType } from './touch-controls.ts';
import type { StickPlace, StickPush, TouchControls } from './touch-controls.ts';
import type { Translator } from './translator.ts';
import { createSvgElement, drawPicture } from './view-elements.ts';

/** The class of the root of the page while it is used by touch. */
const TOUCH_CLASS = 'is-touch';

/** The touch controls as the page shows them. */
export interface TouchView {
  /**
   * Tells whether the page is used by touch now.
   *
   * @returns {boolean} Whether it is.
   */
  readonly isTouch: () => boolean;
  /**
   * Shows the controls as they are now: hidden while they are held, and
   * the knob of the stick where it is pushed.
   */
  readonly render: () => void;
}

/**
 * Draws an open hand, its fingers up, 64 units square, as on the action
 * button.
 *
 * @returns {SVGElement} The hand.
 */
export function drawHand(): SVGElement {
  const fingers: readonly (readonly [number, number, number, number])[] = [
    [21, 10, 8, 30],
    [30, 6, 8, 34],
    [39, 9, 8, 31],
    [48, 16, 7, 26],
  ];
  return drawPicture([
    ...fingers.map(([x, y, width, height]) =>
      createSvgElement('rect', {
        x: String(x),
        y: String(y),
        width: String(width),
        height: String(height),
        rx: String(width / 2),
        class: 'touch-hand',
      }),
    ),
    createSvgElement('rect', {
      x: '8',
      y: '30',
      width: '8',
      height: '22',
      rx: '4',
      transform: 'rotate(-38 12 41)',
      class: 'touch-hand',
    }),
    createSvgElement('path', {
      d: 'M21 32 L55 32 L55 44 C55 54 48 60 38 60 C28 60 21 54 21 46Z',
      class: 'touch-hand',
    }),
  ]);
}

/**
 * Tells whether the browser reports its main pointer as coarse, as a
 * finger on the screen of a phone or a tablet is.
 *
 * @returns {boolean} Whether it does.
 */
function isCoarsePointer(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Creates the touch controls of the page: a stick at the bottom left, its
 * knob following the finger within its base, and a large round action
 * button at the bottom right with an open hand on it, shown only while the
 * page is used by touch, and hidden while they are held.  The page counts
 * as used by touch from the start if the main pointer of the browser is
 * coarse, from any touch on it, and no longer from a press of a mouse.  A
 * finger on the stick walks the player, one on the scene turns the view
 * and two there zoom, as {@link TouchControls} tells; a finger on the scene
 * is kept from the mouse controls of the camera.  The action button is
 * carried out as it is pressed.  Turning the device around lets go of every
 * finger.  No long press opens a menu while the page is used by touch, but
 * on the line of the box of the chat, where the menu of the browser
 * selects, copies, cuts and pastes as in any line of text.
 *
 * @param {HTMLElement} parent - What the controls are added to.
 * @param {Translator} translator - The translator of the text of the page.
 * @param {TouchControls} controls - The fingers.
 * @param {() => void} pressAction - Called when the action button is
 *   pressed.
 * @param {() => void} noticeMode - Called once the page comes to be used
 *   by touch, or by a mouse again.
 * @returns {TouchView} The controls as shown.
 */
export function createTouchView(
  parent: HTMLElement,
  translator: Translator,
  controls: TouchControls,
  pressAction: () => void,
  noticeMode: () => void,
): TouchView {
  let isTouch: boolean = isCoarsePointer();
  document.documentElement.classList.toggle(TOUCH_CLASS, isTouch);

  const root: HTMLDivElement = document.createElement('div');
  root.className = 'touch-controls';
  const stick: HTMLDivElement = document.createElement('div');
  stick.className = 'touch-stick';
  stick.setAttribute('role', 'img');
  const knob: HTMLDivElement = document.createElement('div');
  knob.className = 'touch-knob';
  stick.append(knob);
  const action: HTMLDivElement = document.createElement('div');
  action.className = 'touch-action';
  action.setAttribute('role', 'button');
  action.append(drawHand());
  root.append(stick, action);
  parent.append(root);
  // A long press opens no menu anywhere on the page used by touch, nor on
  // the controls ever, but on the line of the box of the chat, which is
  // left its menu to select, copy, cut and paste with.
  window.addEventListener(
    'contextmenu',
    (event: Event) => {
      const { target } = event;
      if (
        target instanceof Element &&
        target.classList.contains(CHAT_INPUT_CLASS)
      ) {
        return;
      }
      if (isTouch || (target instanceof Node && root.contains(target))) {
        event.preventDefault();
      }
    },
    { capture: true },
  );

  stick.addEventListener('pointerdown', (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const box: DOMRect = stick.getBoundingClientRect();
    const place: StickPlace = {
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
      radius: box.width / 2,
    };
    if (
      controls.pressStick(event.pointerId, event.clientX, event.clientY, place)
    ) {
      render();
    }
  });
  action.addEventListener('pointerdown', (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (controls.isPaused) {
      return;
    }
    action.classList.add('is-pressed');
    pressAction();
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    action.addEventListener(type, () => {
      action.classList.remove('is-pressed');
    });
  }

  // The window hears every press first, which tells how the page is used,
  // and keeps a finger on the scene from the mouse controls of the camera.
  window.addEventListener(
    'pointerdown',
    (event: PointerEvent) => {
      const next: boolean = noticePointerType(isTouch, event.pointerType);
      if (next !== isTouch) {
        isTouch = next;
        document.documentElement.classList.toggle(TOUCH_CLASS, isTouch);
        noticeMode();
      }
      if (
        event.pointerType !== 'touch' ||
        !(event.target instanceof HTMLCanvasElement)
      ) {
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      controls.pressView(event.pointerId, event.clientX, event.clientY);
    },
    { capture: true },
  );
  window.addEventListener('pointermove', (event: PointerEvent) => {
    controls.movePointer(event.pointerId, event.clientX, event.clientY);
  });
  for (const type of ['pointerup', 'pointercancel']) {
    window.addEventListener(type, (event: Event) => {
      if (event instanceof PointerEvent) {
        controls.releasePointer(event.pointerId);
      }
    });
  }
  window
    .matchMedia('(orientation: portrait)')
    .addEventListener('change', () => {
      controls.releaseAll();
      action.classList.remove('is-pressed');
    });

  let shownPush = '';
  let shownHeld: boolean | null = null;
  const render = (): void => {
    const isHeld: boolean = controls.isPaused;
    if (isHeld !== shownHeld) {
      shownHeld = isHeld;
      root.classList.toggle('is-held', isHeld);
    }
    const push: StickPush = controls.stickPush;
    const transform = `translate(${String(push.x * 100)}%, ${String(
      push.y * 100,
    )}%)`;
    if (transform !== shownPush) {
      shownPush = transform;
      // The knob is as wide as the radius of the base, so that a full push
      // moves it by its own width.
      knob.style.transform = transform;
      stick.classList.toggle('is-pushed', push.x !== 0 || push.y !== 0);
    }
  };
  const relabel = (): void => {
    const actionLabel: string = translator.translate('touch.action');
    action.title = actionLabel;
    action.setAttribute('aria-label', actionLabel);
    stick.setAttribute('aria-label', translator.translate('touch.stick'));
  };
  relabel();
  translator.addListener(relabel);
  render();
  return { isTouch: () => isTouch, render };
}
