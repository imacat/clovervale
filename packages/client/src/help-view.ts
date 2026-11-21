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
 * @module client/help-view The help sheet as the page shows it: its button
 *   beside the bag, and, while it is open, a sheet of parchment in the
 *   middle of the page that lists the controls of the game.
 */

import type { HelpSheet } from './help-sheet.ts';
import type { PlainMessageId } from './messages/en.ts';
import type { Translator } from './translator.ts';

/** The help sheet as the page shows it. */
export interface HelpView {
  /** Shows the sheet as it is now, after it has opened or closed. */
  readonly render: () => void;
}

/** A control of the game, as the sheet lists it. */
interface ControlRow {
  /**
   * The key caps of the control, in clusters side by side, each cluster in
   * lines, centred one above another as on a keyboard, and each line a list
   * of the labels of its caps; or `mouse` for the mouse.
   */
  readonly caps: readonly (readonly (readonly string[])[])[] | 'mouse';
  /** The message that tells what the control does. */
  readonly labelKey: PlainMessageId;
}

/**
 * The controls the sheet lists, in the order it lists them: first those of
 * play, and then those of the bag, the dialogues and the sheet itself.
 */
const CONTROL_ROWS: readonly ControlRow[] = [
  { caps: [[['W'], ['A', 'S', 'D']]], labelKey: 'help.walk' },
  { caps: [[['↑'], ['←', '↓', '→']]], labelKey: 'help.turn' },
  { caps: 'mouse', labelKey: 'help.mouse' },
  { caps: [[['Space']]], labelKey: 'help.interact' },
  { caps: [[['I']]], labelKey: 'help.bag' },
  {
    caps: [[['↑'], ['←', '↓', '→']], [['Enter']]],
    labelKey: 'help.choose',
  },
  { caps: [[['Esc']]], labelKey: 'help.escape' },
  { caps: [[['H']]], labelKey: 'help.help' },
];

/** The labels of the key caps drawn wide. */
const WIDE_CAPS: ReadonlySet<string> = new Set(['Space', 'Enter', 'Esc']);

/** The namespace of the elements of SVG. */
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Makes an element of SVG.
 *
 * @param {string} name - The name of the element.
 * @param {Readonly<Record<string, string>>} attributes - Its attributes.
 * @returns {SVGElement} The element.
 */
function createSvgElement(
  name: string,
  attributes: Readonly<Record<string, string>>,
): SVGElement {
  const element: SVGElement = document.createElementNS(SVG_NAMESPACE, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }
  return element;
}

/**
 * Draws a small picture, 64 units square.
 *
 * @param {readonly SVGElement[]} parts - What the picture is made of.
 * @returns {SVGElement} The picture.
 */
function drawPicture(parts: readonly SVGElement[]): SVGElement {
  const svg: SVGElement = createSvgElement('svg', {
    viewBox: '0 0 64 64',
    'aria-hidden': 'true',
  });
  svg.append(...parts);
  return svg;
}

/**
 * Draws a small piece of parchment, its corners curled, with a question
 * mark in the middle.
 *
 * @returns {SVGElement} The parchment.
 */
function drawParchment(): SVGElement {
  return drawPicture([
    createSvgElement('path', {
      d:
        'M14 8 L46 6 C50 6 52 9 51 13 L50 30 L53 48 C54 54 50 57 46 57 ' +
        'L18 58 C13 58 11 55 12 51 L14 34 L11 15 C10 10 11 8 14 8Z',
      class: 'help-icon-sheet',
    }),
    createSvgElement('path', {
      d: 'M46 6 C50 6 52 9 51 13 C48 12 46 10 46 6Z',
      class: 'help-icon-curl',
    }),
    createSvgElement('path', {
      d: 'M18 58 C13 58 11 55 12 51 C15 52 17 54 18 58Z',
      class: 'help-icon-curl',
    }),
    createSvgElement('path', {
      d: 'M24 25 C24 17 40 16 40 25 C40 31 32 31 32 38',
      class: 'help-icon-mark',
    }),
    createSvgElement('circle', {
      cx: '32',
      cy: '46',
      r: '3',
      class: 'help-icon-dot',
    }),
  ]);
}

/**
 * Draws a mouse, its left button pressed, with arrows of a drag beside it.
 *
 * @returns {SVGElement} The mouse.
 */
function drawMouse(): SVGElement {
  return drawPicture([
    createSvgElement('rect', {
      x: '20',
      y: '8',
      width: '24',
      height: '40',
      rx: '12',
      class: 'help-mouse-body',
    }),
    createSvgElement('path', {
      d: 'M32 8 L32 24 L20 24 L20 20 C20 13 25 8 32 8Z',
      class: 'help-mouse-button',
    }),
    createSvgElement('path', {
      d: 'M20 24 L44 24 M32 8 L32 24',
      class: 'help-mouse-line',
    }),
    createSvgElement('path', {
      d: 'M6 56 L58 56 M12 51 L6 56 L12 61 M52 51 L58 56 L52 61',
      class: 'help-mouse-drag',
    }),
  ]);
}

/**
 * Makes an element that does something when it is clicked, and keeps the
 * pointer from the game underneath it and itself from taking the focus.
 *
 * @param {string} className - The class of the element.
 * @param {() => void} onClick - What it does when clicked.
 * @returns {HTMLDivElement} The element.
 */
function createClickable(
  className: string,
  onClick: () => void,
): HTMLDivElement {
  const element: HTMLDivElement = document.createElement('div');
  element.className = className;
  element.setAttribute('role', 'button');
  element.addEventListener('pointerdown', (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
  });
  element.addEventListener('click', (event: MouseEvent) => {
    event.stopPropagation();
    if (event.button === 0) {
      onClick();
    }
  });
  return element;
}

/**
 * Draws the key caps of a control.
 *
 * @param {ControlRow} row - The control.
 * @returns {HTMLDivElement} The key caps.
 */
function drawCaps(row: ControlRow): HTMLDivElement {
  const caps: HTMLDivElement = document.createElement('div');
  caps.className = 'help-caps';
  if (row.caps === 'mouse') {
    const mouse: HTMLDivElement = document.createElement('div');
    mouse.className = 'help-mouse';
    mouse.append(drawMouse());
    caps.append(mouse);
    return caps;
  }
  for (const lines of row.caps) {
    const cluster: HTMLDivElement = document.createElement('div');
    cluster.className = 'help-cap-cluster';
    for (const labels of lines) {
      const line: HTMLDivElement = document.createElement('div');
      line.className = 'help-cap-line';
      for (const label of labels) {
        const cap: HTMLElement = document.createElement('kbd');
        cap.className = WIDE_CAPS.has(label)
          ? 'help-cap is-wide'
          : 'help-cap';
        cap.textContent = label;
        line.append(cap);
      }
      cluster.append(line);
    }
    caps.append(cluster);
  }
  return caps;
}

/**
 * Creates the help sheet of the page: its button right of the icon of the
 * bag, a piece of parchment with a question mark, with the key that opens
 * it, H, on it, and, while the sheet is open, the sheet itself in the
 * middle of the page, with its title, the controls of the game, each with
 * its key caps and what it does, a cross that closes it at its top right,
 * and a button that closes it at its foot.  While the sheet is open, no
 * click on the page outside the panel reaches the game underneath.  What
 * the sheet shows is worded again in each language the page comes to
 * speak.
 *
 * @param {HTMLElement} parent - What the sheet is added to.
 * @param {Translator} translator - The translator of the text of the page.
 * @param {HelpSheet} sheet - The help sheet.
 * @param {() => void} clickButton - Called when the button is clicked.
 * @param {() => void} close - Called when the cross or the button at the
 *   foot of the sheet is clicked.
 * @returns {HelpView} The sheet as shown.
 */
export function createHelpView(
  parent: HTMLElement,
  translator: Translator,
  sheet: HelpSheet,
  clickButton: () => void,
  close: () => void,
): HelpView {
  const button: HTMLDivElement = createClickable('help-button', clickButton);
  const key: HTMLSpanElement = document.createElement('span');
  key.className = 'help-key';
  key.textContent = 'H';
  button.append(drawParchment(), key);

  const veil: HTMLDivElement = document.createElement('div');
  veil.className = 'help';
  const frame: HTMLDivElement = document.createElement('div');
  frame.className = 'help-sheet';
  for (const element of [veil, frame]) {
    for (const type of ['pointerdown', 'click', 'wheel', 'contextmenu']) {
      element.addEventListener(type, (event: Event) => {
        if (type === 'pointerdown' || type === 'contextmenu') {
          event.preventDefault();
        }
        event.stopPropagation();
      });
    }
  }
  frame.setAttribute('role', 'dialog');
  frame.setAttribute('aria-modal', 'true');
  frame.setAttribute('aria-labelledby', 'help-title');
  const title: HTMLHeadingElement = document.createElement('h2');
  title.className = 'help-title';
  title.id = 'help-title';
  const cross: HTMLDivElement = createClickable('help-close', close);
  const list: HTMLDivElement = document.createElement('div');
  list.className = 'help-controls';
  const labels: HTMLDivElement[] = CONTROL_ROWS.map(
    (row: ControlRow): HTMLDivElement => {
      const item: HTMLDivElement = document.createElement('div');
      item.className = 'help-control';
      const label: HTMLDivElement = document.createElement('div');
      label.className = 'help-label';
      item.append(drawCaps(row), label);
      list.append(item);
      return label;
    },
  );
  const ok: HTMLDivElement = createClickable('help-ok', close);
  frame.append(title, cross, list, ok);
  parent.append(button, veil, frame);

  const render = (): void => {
    const label: string = translator.translate('help.icon');
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-expanded', String(sheet.isOpen));
    veil.hidden = !sheet.isOpen;
    frame.hidden = !sheet.isOpen;
    title.textContent = translator.translate('help.title');
    const closeLabel: string = translator.translate('help.close');
    cross.title = closeLabel;
    cross.setAttribute('aria-label', closeLabel);
    CONTROL_ROWS.forEach((row: ControlRow, index: number) => {
      const text: HTMLDivElement | undefined = labels[index];
      if (text !== undefined) {
        text.textContent = translator.translate(row.labelKey);
      }
    });
    ok.textContent = translator.translate('help.ok');
  };
  render();
  translator.addListener(render);
  return { render };
}
