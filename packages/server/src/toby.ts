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
 * @module server/toby Toby, the child who hunts for four-leaf clover, as
 *   the server has him take the clovers he finds.
 */

import {
  TOBY_FOUND_LINE,
  findTobyGrab,
  findTobyPose,
} from '@clovervale/shared';
import type { Pose, TobyGrab } from '@clovervale/shared';

import { StandingVillager } from './resident.ts';
import type { ResidentView } from './resident.ts';

/**
 * Toby, the child who hunts for four-leaf clover, who runs his course as
 * the number of the step tells.  At a step at which his hand grabs at a
 * patch of clover, he takes the four-leaf clover of the patch if it has
 * its clover, as what there is to pick in the world tells, and exclaims
 * {@link TOBY_FOUND_LINE} in passing as he does, which every player of the
 * world within hearing of him then hears, and nobody else.
 */
export class Toby extends StandingVillager {
  /**
   * The number of the latest step at which Toby took a four-leaf clover,
   * or `null` if he has taken none.
   */
  #find: number | null = null;

  /**
   * Has Toby take the four-leaf clover of the patch of clover his hand
   * grabs at, if it grabs at this step, as {@link findTobyGrab} tells, and
   * the patch has its clover, before the players pick at it, and exclaim
   * {@link TOBY_FOUND_LINE} as he does.
   */
  override startStep(): void {
    const step: number = this.world.getStep();
    const grab: TobyGrab = findTobyGrab(step);
    if (grab.step !== step || !this.world.items.takeClover(grab.patch)) {
      return;
    }
    this.#find = step;
    const pose: Pose = findTobyPose(step);
    for (const player of this.world.roster.listHearers(pose)) {
      player.hear({ villager: 'toby', line: TOBY_FOUND_LINE });
    }
  }

  /**
   * Describes Toby as a snapshot taken now is to tell him.
   *
   * @returns {ResidentView} Nothing among the monsters, and the latest step
   *   at which he took a four-leaf clover, or `null` if he has taken
   *   none.
   */
  override describe(): ResidentView {
    return { monster: null, items: { tobyFind: this.#find } };
  }
}
