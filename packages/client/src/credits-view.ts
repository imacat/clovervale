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
 * @module client/credits-view The credits of the game as the page shows
 *   them, alike on the scroll of the ending and on the last page of the
 *   help sheet.
 */

import {
  AI_ASSISTANCE,
  GAME_LICENSE,
  GAME_VERSION,
  LIBRARY_CREDITS,
  MUSIC_CREDITS,
} from './credits.ts';
import type { LibraryCredit, MusicCredit } from './credits.ts';
import type { PlainMessageId } from './messages/en.ts';
import type { Translator } from './translator.ts';

/** The credits as the page shows them. */
export interface CreditsView {
  /** What the credits are drawn in. */
  readonly element: HTMLDivElement;
  /** Their title. */
  readonly title: HTMLHeadingElement;
  /** Words the credits again in the language the page speaks now. */
  readonly relabel: () => void;
}

/**
 * Makes an element with a class.
 *
 * @param {K} name - The name of the element.
 * @param {string} className - Its class.
 * @returns {HTMLElementTagNameMap[K]} The element.
 * @template K
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  name: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const element: HTMLElementTagNameMap[K] = document.createElement(name);
  element.className = className;
  return element;
}

/**
 * Draws the credits of the game, centered: their title, the name and the
 * version of the game, its author, the AI that assisted, the music, the
 * libraries the client comes with, each under its license, and the license
 * of the game.  The names of people, of works, of libraries and of
 * licenses are the same in every language, and the rest is worded in the
 * language the page speaks.
 *
 * @param {Translator} translator - The translator of the text of the page.
 * @returns {CreditsView} The credits as drawn.
 */
export function drawCredits(translator: Translator): CreditsView {
  const element: HTMLDivElement = createElement('div', 'credits');
  const title: HTMLHeadingElement = createElement('h2', 'credits-title');
  const game: HTMLDivElement = createElement('div', 'credits-game');
  const name: HTMLDivElement = createElement('div', 'credits-name');
  const version: HTMLDivElement = createElement('div', 'credits-version');
  game.append(name, version);

  // The words of the credits, told afresh in every language.
  const worded: [HTMLElement, () => string][] = [
    [title, () => translator.translate('credits.title')],
    [name, () => translator.translate('title')],
    [
      version,
      () => translator.translate('credits.version', { version: GAME_VERSION }),
    ],
  ];
  /**
   * Adds a section of the credits, under a heading.
   *
   * @param {string} className - The class of the section.
   * @param {PlainMessageId} heading - The message of its heading.
   * @param {readonly [string, () => string][]} lines - The class and the
   *   words of each of its lines.
   * @returns {HTMLElement} The section.
   */
  const addSection = (
    className: string,
    heading: PlainMessageId,
    lines: readonly [string, () => string][],
  ): HTMLElement => {
    const section: HTMLElement = createElement(
      'section',
      `credits-section ${className}`,
    );
    const head: HTMLHeadingElement = createElement('h3', 'credits-heading');
    worded.push([head, () => translator.translate(heading)]);
    section.append(head);
    for (const [lineClass, words] of lines) {
      const line: HTMLParagraphElement = createElement('p', lineClass);
      worded.push([line, words]);
      section.append(line);
    }
    return section;
  };
  const sections: HTMLElement[] = [
    addSection('is-author', 'credits.author', [
      ['credits-line', () => translator.translate('credits.authorName')],
    ]),
    addSection(
      'is-ai',
      'credits.ai',
      AI_ASSISTANCE.map((name: string): [string, () => string] => [
        'credits-line',
        () => name,
      ]),
    ),
    addSection(
      'is-music',
      'credits.music',
      MUSIC_CREDITS.flatMap(
        (music: MusicCredit): [string, () => string][] => [
          [
            'credits-line credits-work',
            () =>
              translator.translate('credits.musicTitle', {
                title: music.title,
              }),
          ],
          [
            'credits-line',
            () =>
              translator.translate('credits.musicSource', {
                author: music.author,
                source: music.source,
              }),
          ],
          ['credits-line credits-license', () => music.license],
        ],
      ),
    ),
    addSection(
      'is-libraries',
      'credits.libraries',
      LIBRARY_CREDITS.map((library: LibraryCredit): [string, () => string] => [
        'credits-line',
        () => `${library.name} — ${library.license}`,
      ]),
    ),
    addSection('is-license', 'credits.license', [
      [
        'credits-line',
        () =>
          translator.translate('credits.gameLicense', {
            license: GAME_LICENSE,
          }),
      ],
    ]),
  ];
  element.append(title, game, ...sections);
  const relabel = (): void => {
    for (const [shown, words] of worded) {
      shown.textContent = words();
    }
  };
  relabel();
  return { element, title, relabel };
}
