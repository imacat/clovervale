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
 * @module server/hunt-record The players Martha hunts.
 */

/** The players Martha hunts, by their identifiers, none at first. */
export class HuntRecord {
  readonly #hunted = new Set<number>();

  /**
   * Tells whether Martha hunts a player.
   *
   * @param {number} id - The identifier of the player.
   * @returns {boolean} Whether she does.
   */
  isHunted(id: number): boolean {
    return this.#hunted.has(id);
  }

  /**
   * Has Martha hunt a player from now on.
   *
   * @param {number} id - The identifier of the player.
   */
  hunt(id: number): void {
    this.#hunted.add(id);
  }

  /**
   * Has Martha no longer hunt a player, if she does.
   *
   * @param {number} id - The identifier of the player.
   */
  spare(id: number): void {
    this.#hunted.delete(id);
  }
}
