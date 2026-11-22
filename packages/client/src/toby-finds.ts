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
 * @module client/toby-finds What the page makes of the four-leaved clovers
 *   Toby takes from the patches of clover, at the step it shows him at,
 *   which may be ahead of the latest snapshot or behind it.
 *
 * The server tells, in every snapshot, the latest step at which he took a
 * clover.  For a grab of his that the latest snapshot was taken at or
 * after, that tells whether he found one.  For a grab still to come as far
 * as the latest snapshot goes, the page foresees, by the rules of the
 * server, that he finds one if the patch had its clover then: it can be
 * wrong only if a player picks the clover, or it regrows, in between, and
 * the snapshot that tells of the grab sets it right.
 */

import { TOBY_LOOP_STEPS, findTobyGrab } from '@clovervale/shared';
import type { TobyGrab, WorldItems } from '@clovervale/shared';

/** What the page last heard of the world from the server. */
export interface WorldNews {
  /** The step of the snapshot that told it. */
  readonly step: number;
  /** What there was to pick in the world then. */
  readonly items: WorldItems;
}

/**
 * Tells whether Toby found a four-leaved clover at a grab of his, as far
 * as the page can tell.
 *
 * @param {TobyGrab} grab - The grab.
 * @param {WorldNews | null} news - What the page last heard, or `null` if
 *   it has heard nothing.
 * @returns {boolean} Whether the server told he took a clover at the grab,
 *   for a grab no later than the snapshot; whether the patch had its
 *   clover as the snapshot told, for a later grab; and `false` if the page
 *   has heard nothing.
 */
export function hasTobyFound(
  grab: TobyGrab,
  news: WorldNews | null,
): boolean {
  if (news === null) {
    return false;
  }
  if (grab.step <= news.step) {
    return news.items.tobyFind === grab.step;
  }
  return news.items.clovers.includes(grab.patch);
}

/**
 * Finds what there is to pick in the world at a step, as far as the
 * clovers Toby takes go, from what the page last heard.
 *
 * @param {WorldNews} news - What the page last heard.
 * @param {number} step - The step, which may fall between two steps,
 *   ahead of the snapshot or behind it.
 * @returns {WorldItems} What the snapshot told, but without the clover of
 *   a patch his hand has grabbed at by the step, after the snapshot, as
 *   {@link hasTobyFound} foresees he finds it, and with the clover of a
 *   patch his hand grabs at after the step, by the snapshot, as the
 *   snapshot tells he found it.
 */
export function findShownItems(news: WorldNews, step: number): WorldItems {
  const { items } = news;
  const grab: TobyGrab = findTobyGrab(step);
  const next: TobyGrab = findTobyGrab(grab.step + TOBY_LOOP_STEPS / 2);
  let clovers: readonly number[] = items.clovers;
  if (grab.step > news.step && hasTobyFound(grab, news)) {
    clovers = clovers.filter((patch: number) => patch !== grab.patch);
  }
  if (
    next.step <= news.step &&
    hasTobyFound(next, news) &&
    !clovers.includes(next.patch)
  ) {
    clovers = [...clovers, next.patch].sort((a: number, b: number) => a - b);
  }
  return clovers === items.clovers ? items : { ...items, clovers };
}
