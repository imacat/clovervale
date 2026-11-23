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
 * @module client/view-elements The elements the views of the page are made
 *   of: elements of SVG, small pictures, and elements that are clicked.
 */

/** The namespace of the elements of SVG. */
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Makes an element of SVG.
 *
 * @param {string} name - The name of the element.
 * @param {Readonly<Record<string, string>>} attributes - Its attributes.
 * @returns {SVGElement} The element.
 */
export function createSvgElement(
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
 * Draws a small picture, 64 units square, hidden from assistive
 * technology.
 *
 * @param {readonly SVGElement[]} parts - What the picture is made of.
 * @returns {SVGElement} The picture.
 */
export function drawPicture(parts: readonly SVGElement[]): SVGElement {
  const svg: SVGElement = createSvgElement('svg', {
    viewBox: '0 0 64 64',
    'aria-hidden': 'true',
  });
  svg.append(...parts);
  return svg;
}

/**
 * Makes an element that does something when it is clicked or tapped, and
 * keeps the pointer from the game underneath it and itself from taking the
 * focus.  No click on it reaches the game underneath.
 *
 * @param {string} className - The class of the element.
 * @param {() => void} onClick - What it does when clicked.
 * @returns {HTMLDivElement} The element.
 */
export function createClickable(
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
    onClick();
  });
  return element;
}
