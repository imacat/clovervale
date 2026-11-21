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
 * @module shared/combat How much a player and each kind of monster can
 *   take and deal, how they go about it, and what a strike reaches.
 */

import type { GroundVector } from './movement.ts';
import type { Pose } from './terrain.ts';

/** The health of a player at full health. */
export const PLAYER_HEALTH = 100;

/**
 * How long a dead player lies where it fell before it comes back, in
 * seconds.
 */
export const DEATH_DURATION = 2;

/** The kinds of monster there are. */
export const MONSTER_KIND_IDS = ['village-dog', 'cave-dog', 'martha'] as const;

/** A kind of monster. */
export type MonsterKindId = (typeof MONSTER_KIND_IDS)[number];

/** The numbers of a kind of monster, which every monster of it shares. */
export interface MonsterKind {
  /** The health of a monster of the kind at full health. */
  readonly health: number;
  /** The health a bite of the monster that hits takes from a player. */
  readonly biteDamage: number;
  /**
   * The shortest time from the start of one bite of the monster to the
   * start of the next, in seconds.
   */
  readonly biteInterval: number;
  /**
   * The speed the monster chases a player and walks back home at, in
   * metres per second.
   */
  readonly chaseSpeed: number;
  /** The speed the monster wanders at, in metres per second. */
  readonly wanderSpeed: number;
  /** The farthest from its home the monster wanders to, in metres. */
  readonly wanderRadius: number;
  /** The farthest the monster notices a player from, in metres. */
  readonly noticeRange: number;
  /**
   * The farthest from the home of the monster a player can be for the
   * monster to chase it, in metres.  Beyond that, it gives up.
   */
  readonly leashRange: number;
  /**
   * How long after it dies the monster comes back to life at its home, in
   * seconds, or, for Martha, who never dies, how long she sits on the
   * ground once beaten before she gets up.
   */
  readonly respawnDelay: number;
  /**
   * The most silver coins a monster of the kind gives the player whose
   * strike kills it, each number of coins from none up to it as likely as
   * any other.
   */
  readonly maxSilver: number;
}

/**
 * The numbers of each kind of monster: the wild dog of the village, which
 * a player can get away from, the tougher wild dogs of the cave, which
 * bite more often, and give up only well away from their homes, so most
 * of the cave is within their chase, and Martha, the village chief, who is
 * the enemy spy, and fights with a pitchfork at the pace of the dogs, never
 * wandering from her porch, and giving up well short of the fountain, so
 * that her yard and its well are hers, and the plaza is not.  Her bite is
 * the thrust of her pitchfork.  The wild dog of the village alone gives
 * silver coins when killed.
 */
export const MONSTER_KINDS: Readonly<Record<MonsterKindId, MonsterKind>> = {
  'village-dog': {
    health: 60,
    biteDamage: 15,
    biteInterval: 1.5,
    chaseSpeed: 1.3,
    wanderSpeed: 0.8,
    wanderRadius: 3,
    noticeRange: 5,
    leashRange: 8,
    respawnDelay: 10,
    maxSilver: 2,
  },
  'cave-dog': {
    health: 80,
    biteDamage: 15,
    biteInterval: 1.2,
    chaseSpeed: 1.3,
    wanderSpeed: 0.8,
    wanderRadius: 1.2,
    noticeRange: 5,
    leashRange: 12,
    respawnDelay: 300,
    maxSilver: 0,
  },
  martha: {
    health: 100,
    biteDamage: 20,
    biteInterval: 1.5,
    chaseSpeed: 1.3,
    wanderSpeed: 0.8,
    wanderRadius: 0,
    noticeRange: 5,
    leashRange: 7,
    respawnDelay: 10,
    maxSilver: 0,
  },
};

/**
 * Tells whether a value names a kind of monster.
 *
 * @param {unknown} value - The value.
 * @returns {boolean} Whether it does.
 */
export function isMonsterKindId(value: unknown): value is MonsterKindId {
  return MONSTER_KIND_IDS.some((kind: MonsterKindId) => kind === value);
}

/**
 * The farthest a monster can be from a player whose slash hits it, from
 * centre to centre, in metres.
 */
export const SLASH_REACH = 1.6;

/** The health a slash that hits takes from a monster. */
export const SLASH_DAMAGE = 20;

/**
 * The widest a strike reaches to either side of the way the striker faces,
 * in degrees.
 */
export const STRIKE_HALF_ANGLE = 60;

/**
 * Tells whether a strike reaches something: whether it is in front of the
 * striker and within reach.
 *
 * @param {Pose} striker - Where the striker stands, and which way it faces.
 * @param {GroundVector} target - Where the one struck at stands.
 * @param {number} reach - The farthest the strike reaches, from centre to
 *   centre, in metres.
 * @returns {boolean} Whether the target is within reach, and no more than
 *   {@link STRIKE_HALF_ANGLE} to either side of the way the striker faces.
 *   A target that stands right where the striker does is reached.
 */
export function isWithinStrike(
  striker: Pose,
  target: GroundVector,
  reach: number,
): boolean {
  const dx: number = target.x - striker.x;
  const dz: number = target.z - striker.z;
  const distance: number = Math.hypot(dx, dz);
  if (distance > reach) {
    return false;
  }
  if (distance === 0) {
    return true;
  }
  const yaw: number = (striker.yaw * Math.PI) / 180;
  const along: number = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / distance;
  return along >= Math.cos((STRIKE_HALF_ANGLE * Math.PI) / 180);
}
