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
 * @module shared/villagers The villagers a player can talk to, and what
 *   they say.
 */

/** A villager a player can talk to. */
export interface Villager {
  /**
   * The file name of the model of the villager, which the village has a
   * place for.
   */
  readonly file: string;
  /** The name of the villager. */
  readonly name: string;
  /** What the villager says when a player talks to it. */
  readonly line: string;
}

/** The villagers a player can talk to. */
export const VILLAGERS: readonly Villager[] = [
  {
    file: 'npc-nancy.glb',
    name: 'Nancy',
    line:
      'Wild dogs prowl outside the village, and no one dares to go out any ' +
      'more. What are we to do?',
  },
];
