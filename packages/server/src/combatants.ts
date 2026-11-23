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
 * @module server/combatants What the players fight in a world: what their
 *   slashes can strike, and what strikes at them.
 */

import type { ItemKindId, MonsterState, Pose } from '@clovervale/shared';

import type { Player } from './player.ts';

/** What a player gets for beating something it strikes. */
export interface Spoils {
  /**
   * The most silver coins the player gets, from none up to these, each
   * number as likely as any other.
   */
  readonly maxSilver: number;
  /** The item the player gets, or `null` for none. */
  readonly prize: ItemKindId | null;
}

/** Something the slash of a player can strike, among the monsters. */
export interface Target {
  /** The identifier among the monsters of its world. */
  readonly id: number;
  /** How it is to be seen now, or `null` once it is gone. */
  readonly state: MonsterState | null;
  /** Whether a hit has beaten it: killed it, or left it no fight. */
  readonly isBeaten: boolean;
  /** What the player whose hit beats it gets. */
  readonly spoils: Spoils;

  /**
   * Tells whether a player can hit it now, as far as it goes.
   *
   * @param {number} attackerId - The identifier of the player.
   * @returns {boolean} Whether the player can.
   */
  canBeHitBy(attackerId: number): boolean;

  /**
   * Takes a hit.
   *
   * @param {number} damage - The health the hit takes.
   * @param {number} attackerId - The identifier of the player that hit.
   * @returns {number} The health it lost, which is no more than it had.
   */
  takeHit(damage: number, attackerId: number): number;
}

/** Something that strikes at the players, among the monsters. */
export interface Striker {
  /** The identifier among the monsters of its world. */
  readonly id: number;
  /** Where it stands, and which way it faces. */
  readonly pose: Pose;
  /** The health a strike of it that hits takes from a player. */
  readonly biteDamage: number;
  /**
   * The farthest a player can be from it for its strike to hit, from
   * centre to centre, in metres.
   */
  readonly strikeReach: number;

  /**
   * Tells whether a strike of it can hit a player now, as far as it goes.
   *
   * @param {number} playerId - The identifier of the player.
   * @returns {boolean} Whether it can.
   */
  canStrike(playerId: number): boolean;
}

/** A strike that strikes now, at the players it may hit. */
export interface Strike {
  /** What strikes. */
  readonly striker: Striker;
  /** The players it may hit, in order. */
  readonly players: readonly Player[];
}
