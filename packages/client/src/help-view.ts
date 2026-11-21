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
 *   middle of the page that lists the controls of the game, on a page of
 *   the keyboard and the mouse, a page of the gamepad and a page of touch.
 */

import { drawBag } from './bag-view.ts';
import { drawCredits } from './credits-view.ts';
import type { CreditsView } from './credits-view.ts';
import type { HelpSheet } from './help-sheet.ts';
import type { PlainMessageId } from './messages/en.ts';
import { drawHand } from './touch-view.ts';
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
 * A button or a stick of a gamepad, as the sheet draws it: a face button,
 * coloured as on a Logitech F310, a shoulder button, Start, or a stick.
 */
type PadBadge =
  | { readonly kind: 'face'; readonly label: 'A' | 'B' | 'X' | 'Y' }
  | { readonly kind: 'shoulder'; readonly label: 'LB' | 'RB' }
  | { readonly kind: 'start' }
  | { readonly kind: 'stick'; readonly label: 'L' | 'R' };

/** A control of the gamepad, as the sheet lists it. */
interface PadRow {
  /** The buttons and sticks of the control, side by side. */
  readonly badges: readonly PadBadge[];
  /** The message that tells what the control does. */
  readonly labelKey: PlainMessageId;
}

/**
 * A touch control, as the sheet draws it: the stick, a finger dragged, two
 * fingers pinching, the action button, a finger tapping, or the buttons of
 * the bag and the help sheet.
 */
type TouchBadge = 'stick' | 'drag' | 'pinch' | 'action' | 'tap' | 'buttons';

/** A touch control, as the sheet lists it. */
interface TouchRow {
  /** What the control is drawn as. */
  readonly badge: TouchBadge;
  /** The message that tells what the control does. */
  readonly labelKey: PlainMessageId;
}

/**
 * The controls of the keyboard and the mouse the sheet lists, in the order
 * it lists them: first those of play, and then those of the bag, the
 * dialogues and the sheet itself.
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

/**
 * The controls of the gamepad the sheet lists, in the order it lists them,
 * as on the page of the keyboard.
 */
const PAD_ROWS: readonly PadRow[] = [
  { badges: [{ kind: 'stick', label: 'L' }], labelKey: 'help.walk' },
  { badges: [{ kind: 'stick', label: 'R' }], labelKey: 'help.turn' },
  {
    badges: [
      { kind: 'shoulder', label: 'LB' },
      { kind: 'shoulder', label: 'RB' },
    ],
    labelKey: 'help.zoom',
  },
  { badges: [{ kind: 'face', label: 'A' }], labelKey: 'help.padInteract' },
  { badges: [{ kind: 'face', label: 'Y' }], labelKey: 'help.padBag' },
  {
    badges: [
      { kind: 'stick', label: 'L' },
      { kind: 'face', label: 'A' },
    ],
    labelKey: 'help.choose',
  },
  { badges: [{ kind: 'face', label: 'B' }], labelKey: 'help.escape' },
  { badges: [{ kind: 'start' }], labelKey: 'help.padHelp' },
];

/** The touch controls the sheet lists, in the order it lists them. */
const TOUCH_ROWS: readonly TouchRow[] = [
  { badge: 'stick', labelKey: 'help.touchWalk' },
  { badge: 'drag', labelKey: 'help.touchTurn' },
  { badge: 'pinch', labelKey: 'help.touchZoom' },
  { badge: 'action', labelKey: 'help.touchAction' },
  { badge: 'tap', labelKey: 'help.touchChoose' },
  { badge: 'buttons', labelKey: 'help.touchButtons' },
];

/** The messages that name the pages, in the order of the pages. */
const PAGE_NAMES: readonly PlainMessageId[] = [
  'help.keyboard',
  'help.gamepad',
  'help.touch',
  'help.credits',
];

/**
 * The arrows of the four ways a stick is pushed or a finger dragged, round
 * the edge of a picture.
 */
const ARROWS_PATH =
  'M32 2 L37 8 L27 8Z M32 62 L37 56 L27 56Z ' +
  'M2 32 L8 27 L8 37Z M62 32 L56 27 L56 37Z';

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
 * Draws a stick of a gamepad from above, with arrows of the ways it is
 * pushed round it, and the side it is on in the middle.
 *
 * @param {'L' | 'R'} label - The side of the stick.
 * @returns {SVGElement} The stick.
 */
function drawStick(label: 'L' | 'R'): SVGElement {
  const text: SVGElement = createSvgElement('text', {
    x: '32',
    y: '33',
    class: 'help-pad-stick-label',
  });
  text.textContent = label;
  return drawPicture([
    createSvgElement('path', { d: ARROWS_PATH, class: 'help-pad-arrow' }),
    createSvgElement('circle', {
      cx: '32',
      cy: '32',
      r: '22',
      class: 'help-pad-stick-ring',
    }),
    createSvgElement('circle', {
      cx: '32',
      cy: '32',
      r: '15',
      class: 'help-pad-stick-cap',
    }),
    text,
  ]);
}

/**
 * Draws a button or a stick of a gamepad.
 *
 * @param {PadBadge} badge - The button or the stick.
 * @returns {HTMLElement} What it is drawn as.
 */
function drawBadge(badge: PadBadge): HTMLElement {
  if (badge.kind === 'stick') {
    const picture: HTMLDivElement = document.createElement('div');
    picture.className = 'help-pad-picture';
    picture.append(drawStick(badge.label));
    return picture;
  }
  const button: HTMLElement = document.createElement('kbd');
  if (badge.kind === 'face') {
    button.className = `help-pad-face is-${badge.label.toLowerCase()}`;
    button.textContent = badge.label;
  } else if (badge.kind === 'shoulder') {
    button.className = 'help-pad-shoulder';
    button.textContent = badge.label;
  } else {
    button.className = 'help-pad-start';
    button.textContent = 'START';
  }
  return button;
}

/**
 * Draws the buttons and sticks of a control of the gamepad.
 *
 * @param {PadRow} row - The control.
 * @returns {HTMLDivElement} The buttons and sticks.
 */
function drawBadges(row: PadRow): HTMLDivElement {
  const caps: HTMLDivElement = document.createElement('div');
  caps.className = 'help-caps is-pad';
  caps.append(...row.badges.map(drawBadge));
  return caps;
}

/**
 * Draws a fingertip, as a round mark.
 *
 * @param {number} x - Its middle, across the picture.
 * @param {number} y - Its middle, down the picture.
 * @param {number} radius - Its radius.
 * @returns {SVGElement} The fingertip.
 */
function drawFingertip(x: number, y: number, radius: number): SVGElement {
  return createSvgElement('circle', {
    cx: String(x),
    cy: String(y),
    r: String(radius),
    class: 'help-touch-finger',
  });
}

/**
 * Draws a touch control in a picture.
 *
 * @param {TouchBadge} badge - The control.
 * @returns {HTMLDivElement} The picture.
 */
function drawTouchPicture(badge: TouchBadge): HTMLDivElement {
  const picture: HTMLDivElement = document.createElement('div');
  picture.className = 'help-touch-picture';
  if (badge === 'stick') {
    picture.append(
      drawPicture([
        createSvgElement('path', { d: ARROWS_PATH, class: 'help-pad-arrow' }),
        createSvgElement('circle', {
          cx: '32',
          cy: '32',
          r: '22',
          class: 'help-touch-base',
        }),
        createSvgElement('circle', {
          cx: '39',
          cy: '25',
          r: '11',
          class: 'help-touch-knob',
        }),
      ]),
    );
  } else if (badge === 'drag') {
    picture.append(
      drawPicture([
        createSvgElement('path', { d: ARROWS_PATH, class: 'help-pad-arrow' }),
        drawFingertip(32, 32, 10),
      ]),
    );
  } else if (badge === 'pinch') {
    picture.append(
      drawPicture([
        createSvgElement('path', {
          d: 'M8 56 L56 8 M8 56 L8 45 M8 56 L19 56 M56 8 L45 8 M56 8 L56 19',
          class: 'help-touch-line',
        }),
        drawFingertip(22, 42, 8),
        drawFingertip(42, 22, 8),
      ]),
    );
  } else if (badge === 'action') {
    const button: HTMLDivElement = document.createElement('div');
    button.className = 'help-touch-action';
    button.append(drawHand());
    picture.append(button);
  } else if (badge === 'tap') {
    picture.append(
      drawPicture([
        createSvgElement('circle', {
          cx: '32',
          cy: '32',
          r: '26',
          class: 'help-touch-ripple',
        }),
        createSvgElement('circle', {
          cx: '32',
          cy: '32',
          r: '18',
          class: 'help-touch-ripple',
        }),
        drawFingertip(32, 32, 9),
      ]),
    );
  } else {
    picture.classList.add('is-wide');
    for (const draw of [drawBag, drawParchment]) {
      const button: HTMLDivElement = document.createElement('div');
      button.className = 'help-touch-button';
      button.append(draw());
      picture.append(button);
    }
  }
  return picture;
}

/**
 * Draws a touch control in its place on the sheet.
 *
 * @param {TouchRow} row - The control.
 * @returns {HTMLDivElement} The control drawn.
 */
function drawTouchBadge(row: TouchRow): HTMLDivElement {
  const caps: HTMLDivElement = document.createElement('div');
  caps.className = 'help-caps is-pad';
  caps.append(drawTouchPicture(row.badge));
  return caps;
}

/**
 * Draws a page of the sheet: a list of controls, each with its keys and
 * what it does, which is to be told.
 *
 * @param {readonly HTMLDivElement[]} keys - The keys of each control.
 * @returns {[HTMLDivElement, HTMLDivElement[]]} The page, and the places
 *   to tell what each control does in.
 */
function drawPage(
  keys: readonly HTMLDivElement[],
): [HTMLDivElement, HTMLDivElement[]] {
  const list: HTMLDivElement = document.createElement('div');
  list.className = 'help-controls';
  const labels: HTMLDivElement[] = keys.map(
    (caps: HTMLDivElement): HTMLDivElement => {
      const item: HTMLDivElement = document.createElement('div');
      item.className = 'help-control';
      const label: HTMLDivElement = document.createElement('div');
      label.className = 'help-label';
      item.append(caps, label);
      list.append(item);
      return label;
    },
  );
  return [list, labels];
}

/**
 * Creates the help sheet of the page: its button right of the icon of the
 * bag, a piece of parchment with a question mark, with the key that opens
 * it, H, on it, and, while the sheet is open, the sheet itself in the
 * middle of the page, with its title, under it the name of its page and a
 * dot for each page, the dot of the page shown marked, between arrows that
 * turn to the page before and after, the controls of the page, each with
 * its keys and what it does, a cross that closes it at its top right, and a
 * button that closes it at its foot.  The first page tells the keyboard
 * and the mouse, the second the gamepad, its buttons drawn as on a
 * Logitech F310, and the third the touch controls, drawn as small
 * pictures; while the sheet offers the credits of the game, a fourth page
 * tells them, and before that there is no trace of it.  While the sheet is
 * open, no
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
  const subtitle: HTMLDivElement = document.createElement('div');
  subtitle.className = 'help-subtitle';
  const cross: HTMLDivElement = createClickable('help-close', close);
  const [keyboardPage, keyboardLabels] = drawPage(CONTROL_ROWS.map(drawCaps));
  const [padPage, padLabels] = drawPage(PAD_ROWS.map(drawBadges));
  const [touchPage, touchLabels] = drawPage(TOUCH_ROWS.map(drawTouchBadge));
  touchPage.classList.add('is-touch-page');
  const credits: CreditsView = drawCredits(translator);
  const creditsPage: HTMLDivElement = document.createElement('div');
  creditsPage.className = 'help-credits-page';
  creditsPage.append(credits.element);
  const pages: readonly HTMLDivElement[] = [
    keyboardPage,
    padPage,
    touchPage,
    creditsPage,
  ];
  const turnBy = (step: number): void => {
    sheet.turnToPage(sheet.page + step);
    render();
  };
  const previous: HTMLDivElement = createClickable('help-previous', () => {
    turnBy(-1);
  });
  const next: HTMLDivElement = createClickable('help-next', () => {
    turnBy(1);
  });
  const dots: HTMLDivElement = document.createElement('div');
  dots.className = 'help-dots';
  dots.setAttribute('role', 'img');
  const dotList: HTMLSpanElement[] = pages.map((): HTMLSpanElement => {
    const dot: HTMLSpanElement = document.createElement('span');
    dot.className = 'help-dot';
    dots.append(dot);
    return dot;
  });
  const pager: HTMLDivElement = document.createElement('div');
  pager.className = 'help-pager';
  pager.append(previous, subtitle, dots, next);
  const ok: HTMLDivElement = createClickable('help-ok', close);
  frame.append(title, cross, pager, ...pages, ok);
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
    const tellLabels = (
      rows: readonly (ControlRow | PadRow | TouchRow)[],
      labels: readonly HTMLDivElement[],
    ): void => {
      rows.forEach((row: ControlRow | PadRow | TouchRow, index: number) => {
        const text: HTMLDivElement | undefined = labels[index];
        if (text !== undefined) {
          text.textContent = translator.translate(row.labelKey);
        }
      });
    };
    tellLabels(CONTROL_ROWS, keyboardLabels);
    tellLabels(PAD_ROWS, padLabels);
    tellLabels(TOUCH_ROWS, touchLabels);
    credits.relabel();
    const { page, pageCount } = sheet;
    pages.forEach((shown: HTMLDivElement, index: number) => {
      shown.hidden = index !== page;
    });
    dotList.forEach((dot: HTMLSpanElement, index: number) => {
      dot.classList.toggle('is-current', index === page);
      dot.hidden = index >= pageCount;
    });
    dots.setAttribute(
      'aria-label',
      translator.translate('help.page', {
        page: String(page + 1),
        count: String(pageCount),
      }),
    );
    subtitle.textContent = translator.translate(
      PAGE_NAMES[page] ?? 'help.keyboard',
    );
    const arrows: readonly [HTMLDivElement, PlainMessageId, boolean][] = [
      [previous, 'help.previous', page > 0],
      [next, 'help.next', page < pageCount - 1],
    ];
    for (const [arrow, key, isEnabled] of arrows) {
      const arrowLabel: string = translator.translate(key);
      arrow.title = arrowLabel;
      arrow.setAttribute('aria-label', arrowLabel);
      arrow.setAttribute('aria-disabled', String(!isEnabled));
      arrow.classList.toggle('is-disabled', !isEnabled);
    }
    ok.textContent = translator.translate('help.ok');
  };
  render();
  translator.addListener(render);
  return { render };
}
