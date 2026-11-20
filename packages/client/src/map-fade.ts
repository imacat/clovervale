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
 * @module client/map-fade Darkening the view for a moment as the player of
 *   the page goes from one map into another.
 */

/** A veil over the view of the world, clear but for a moment. */
export interface MapFade {
  /**
   * Darkens the view at once, and lets it clear again over a short while.
   */
  readonly darken: () => void;
}

/**
 * Creates a veil over the view of the world, below everything else on the
 * page, which starts clear.
 *
 * @param {HTMLElement} parent - What the veil is added to, at its start.
 * @returns {MapFade} The veil.
 */
export function createMapFade(parent: HTMLElement): MapFade {
  const element: HTMLDivElement = document.createElement('div');
  element.className = 'map-fade';
  parent.prepend(element);
  return {
    darken: (): void => {
      element.classList.add('is-dark');
      // Reading the layout settles the dark at once, before it clears.
      element.getBoundingClientRect();
      element.classList.remove('is-dark');
    },
  };
}
