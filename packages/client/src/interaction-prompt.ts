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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/18
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/interaction-prompt The prompt at the foot of the page that
 *   tells the person at it what the space bar makes its player do.
 */

/** A prompt on the page. */
export interface Prompt {
  /**
   * Shows the prompt with a text, or hides it.
   *
   * @param {string | null} text - The text, or `null` to hide the prompt.
   */
  readonly show: (text: string | null) => void;
}

/**
 * Creates a prompt at the foot of the page, which starts hidden.
 *
 * @param {HTMLElement} parent - What the prompt is added to.
 * @returns {Prompt} The prompt.
 */
export function createPrompt(parent: HTMLElement): Prompt {
  const element: HTMLDivElement = document.createElement('div');
  element.className = 'interaction-prompt';
  element.hidden = true;
  parent.append(element);
  return {
    show: (text: string | null): void => {
      element.hidden = text === null;
      if (text !== null && element.textContent !== text) {
        element.textContent = text;
      }
    },
  };
}
