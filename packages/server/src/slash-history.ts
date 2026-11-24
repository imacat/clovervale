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
 * @module server/slash-history The monsters of a world as the latest
 *   snapshots told them, for the slashes to be judged on the world as a
 *   peer showed it.
 */

import { STEP_MILLISECONDS, interpolatePlaced } from '@clovervale/shared';
import type { MonsterState } from '@clovervale/shared';

/**
 * The furthest back on the clock of the server a slash can be judged on
 * the world as its peer showed it, in milliseconds.  A slash that names an
 * earlier time is judged on the world as it was this long before it.
 */
export const LAG_COMPENSATION_LIMIT = 1000;

/** The monsters at one moment, as a snapshot then told them. */
interface MonstersRecord {
  /** The time on the clock of the server, in milliseconds. */
  readonly time: number;
  /** The monsters that were to be seen. */
  readonly monsters: readonly MonsterState[];
}

/** The monsters as they were at the time a slash is judged on. */
export interface RecalledMonsters {
  /**
   * How long before the current step the time is, in milliseconds, which
   * is 0 for a slash judged on the world as it is now.
   */
  readonly rewind: number;
  /** The monsters that were to be seen then. */
  readonly monsters: readonly MonsterState[];
}

/**
 * The monsters of a world as the snapshots recorded told them, kept for as
 * long as a slash may still be judged on any of them.
 */
export class SlashHistory {
  readonly #records: MonstersRecord[] = [];

  /**
   * Records the monsters as a snapshot taken at a step tells them.
   *
   * Only as many records are kept as it takes to judge a slash on the world
   * up to {@link LAG_COMPENSATION_LIMIT} milliseconds before any later step.
   *
   * @param {number} step - The number of the step.
   * @param {readonly MonsterState[]} monsters - The monsters to be seen.
   */
  record(step: number, monsters: readonly MonsterState[]): void {
    const time: number = step * STEP_MILLISECONDS;
    this.#records.push({ time, monsters });
    const earliest: number = time - LAG_COMPENSATION_LIMIT;
    while ((this.#records[1]?.time ?? Infinity) <= earliest) {
      this.#records.shift();
    }
  }

  /**
   * Recalls the monsters a slash that starts at a step is to be judged on.
   *
   * The time is the one the slash names, but no earlier than
   * {@link LAG_COMPENSATION_LIMIT} milliseconds before the step and no
   * later than the step: an earlier or later time counts as the nearest of
   * these, and a slash that names no time is judged at the step.  The
   * monsters are as the snapshots recorded told them, and between two of
   * them, as a peer shows them between two snapshots; after the latest of
   * them, the monsters as they are now count as one more of them.
   *
   * @param {number | undefined} viewTime - The time on the clock of the
   *   server the slash names, in milliseconds, if it names one.
   * @param {number} step - The number of the step.
   * @param {readonly MonsterState[]} current - The monsters to be seen now.
   * @returns {RecalledMonsters} How far back the slash is judged, and the
   *   monsters that were to be seen then, which are none before the
   *   earliest record.
   */
  recall(
    viewTime: number | undefined,
    step: number,
    current: readonly MonsterState[],
  ): RecalledMonsters {
    const now: number = step * STEP_MILLISECONDS;
    const time: number =
      viewTime === undefined
        ? now
        : Math.min(Math.max(viewTime, now - LAG_COMPENSATION_LIMIT), now);
    const records: MonstersRecord[] = [
      ...this.#records,
      { time: now, monsters: current },
    ];
    const index: number = records.findLastIndex(
      (record: MonstersRecord) => record.time <= time,
    );
    const before: MonstersRecord | undefined = records[index];
    const after: MonstersRecord | undefined = records[index + 1];
    const rewind: number = now - time;
    if (before === undefined) {
      return { rewind, monsters: [] };
    }
    if (after === undefined) {
      return { rewind, monsters: before.monsters };
    }
    const span: number = after.time - before.time;
    return {
      rewind,
      monsters: interpolatePlaced(
        before.monsters,
        after.monsters,
        (time - before.time) / span,
        span,
      ),
    };
  }
}
