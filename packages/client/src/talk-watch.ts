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
 * @module client/talk-watch Noticing when the player of the page starts to
 *   talk to a villager.
 */

import { TALK_STEPS, findVillager } from '@clovervale/shared';
import type { PlayerMotion, Villager } from '@clovervale/shared';

/** What notices each talk of the player of the page once. */
export class TalkWatch {
  /** The action count of the latest talk noticed, if any. */
  #talkCount: number | null = null;

  /**
   * Notices a talk of the player of the page, the first time its motion
   * shows it.
   *
   * @param {PlayerMotion | null} motion - The motion of the player now, or
   *   `null` while there is none.
   * @param {number} step - The number of the step of the server the motion
   *   is after.
   * @returns {Villager | null} The villager the player talks to, where it
   *   was at the step the talk started, if the motion shows a talk not
   *   noticed before, or `null` otherwise.
   */
  noticeTalk(motion: PlayerMotion | null, step: number): Villager | null {
    if (motion?.action !== 'Talk' || motion.actionCount === this.#talkCount) {
      return null;
    }
    this.#talkCount = motion.actionCount;
    return findVillager(motion, step - (TALK_STEPS - motion.actionSteps));
  }
}
