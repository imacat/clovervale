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

import type { MonsterAction } from './actions.ts';
import {
  MARTHA_FIGHT_MODES,
  MARTHA_FREE_MODES,
  MARTHA_MODES,
} from './martha.ts';
import type { MarthaMode } from './martha.ts';
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

/** How a monster that wanders near its home does so. */
export interface MonsterWander {
  /** The speed the monster wanders at, in meters per second. */
  readonly speed: number;
  /** The farthest from its home the monster wanders to, in meters. */
  readonly radius: number;
}

/**
 * The numbers of a kind of monster, which every monster of it shares, and
 * what a monster of it can be up to.
 */
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
   * meters per second.
   */
  readonly chaseSpeed: number;
  /**
   * How the monster wanders near its home, if it does, or left out for a
   * kind that never wanders.
   */
  readonly wander?: MonsterWander;
  /** The farthest the monster notices a player from, in meters. */
  readonly noticeRange: number;
  /**
   * The farthest from the home of the monster a player can be for the
   * monster to chase it, in meters.  Beyond that, it gives up.
   */
  readonly leashRange: number;
  /**
   * How long after it dies the monster comes back to life at its home, in
   * seconds, or, for a kind that never dies, how long one sits on the
   * ground once beaten before it gets up.
   */
  readonly respawnDelay: number;
  /**
   * The most silver coins a monster of the kind gives the player whose
   * strike kills it, each number of coins from none up to it as likely as
   * any other.
   */
  readonly maxSilver: number;
  /** What a monster of the kind can be up to. */
  readonly modes: readonly MonsterMode[];
  /**
   * The modes in which a monster of the kind is in a fight, which a slash
   * can hit, and which a player slashes at rather than talks to a villager.
   */
  readonly fightModes: readonly MonsterMode[];
  /**
   * For a kind a villager fights as, the modes in which the villager is
   * free to be talked to; left out for a kind no villager fights as.
   */
  readonly freeModes?: readonly MonsterMode[];
  /**
   * Whether a monster of the kind holds a weapon now and then, which its
   * state tells, as {@link MonsterState.isArmed}.
   */
  readonly hasWeapon: boolean;
}

/**
 * What a wild monster, one that no villager fights as, can be up to:
 * idling or wandering near its home, chasing a player, walking back home
 * after giving up, or lying dead.
 */
export const BEAST_MODES = [
  'idle',
  'wander',
  'chase',
  'return',
  'dead',
] as const;

/** What a wild monster is up to, as {@link BEAST_MODES} tells. */
export type BeastMode = (typeof BEAST_MODES)[number];

/**
 * What a monster is up to: as a wild monster is, as {@link BEAST_MODES}
 * tells, or, for Martha, who fights as a monster, as she is, as
 * {@link MARTHA_MODES} tells.  Which of them a monster can be up to its
 * kind tells, as {@link MonsterKind.modes}.
 */
export type MonsterMode = BeastMode | MarthaMode;

/** The modes in which a wild monster is in a fight: whenever it is alive. */
const BEAST_FIGHT_MODES: readonly BeastMode[] = [
  'idle',
  'wander',
  'chase',
  'return',
];

/**
 * The numbers of each kind of monster: the wild dog of the village, which
 * a player can get away from, the tougher wild dogs of the cave, which
 * bite more often, and give up only well away from their homes, so most
 * of the cave is within their chase, and Martha, the village chief, who is
 * the enemy spy, and fights with a pitchfork at the pace of the dogs, never
 * wandering from her porch, and giving up well short of the fountain, so
 * that her yard and its well are hers, and the plaza is not.  Her bite is
 * the thrust of her pitchfork, which she holds only now and then, and she
 * is in a fight only while she chases the player she fights.  The wild dog
 * of the village alone gives silver coins when killed.
 */
export const MONSTER_KINDS: Readonly<Record<MonsterKindId, MonsterKind>> = {
  'village-dog': {
    health: 60,
    biteDamage: 15,
    biteInterval: 1.5,
    chaseSpeed: 1.3,
    wander: { speed: 0.8, radius: 3 },
    noticeRange: 5,
    leashRange: 8,
    respawnDelay: 10,
    maxSilver: 2,
    modes: BEAST_MODES,
    fightModes: BEAST_FIGHT_MODES,
    hasWeapon: false,
  },
  'cave-dog': {
    health: 80,
    biteDamage: 15,
    biteInterval: 1.2,
    chaseSpeed: 1.3,
    wander: { speed: 0.8, radius: 1.2 },
    noticeRange: 5,
    leashRange: 12,
    respawnDelay: 300,
    maxSilver: 0,
    modes: BEAST_MODES,
    fightModes: BEAST_FIGHT_MODES,
    hasWeapon: false,
  },
  martha: {
    health: 100,
    biteDamage: 20,
    biteInterval: 1.5,
    chaseSpeed: 1.3,
    noticeRange: 5,
    leashRange: 7,
    respawnDelay: 10,
    maxSilver: 0,
    modes: MARTHA_MODES,
    fightModes: MARTHA_FIGHT_MODES,
    freeModes: MARTHA_FREE_MODES,
    hasWeapon: true,
  },
};

/**
 * Tells whether a value names a kind of monster.
 *
 * @param {unknown} value - The value.
 * @returns {boolean} Whether it does.
 */
export function isMonsterKindId(value: unknown): value is MonsterKindId {
  const ids: readonly unknown[] = MONSTER_KIND_IDS;
  return ids.includes(value);
}

/** A monster, as the server knows it at one moment. */
export interface MonsterState {
  /** The identifier of the monster, unique among the monsters of its world. */
  readonly id: number;
  /** The kind of the monster, which tells its full health. */
  readonly kind: MonsterKindId;
  /** The position along the X axis, in meters. */
  readonly x: number;
  /** The position along the Z axis, in meters. */
  readonly z: number;
  /** The turn around the Y axis from facing +Z toward +X, in degrees. */
  readonly yaw: number;
  /** What the monster is doing. */
  readonly action: MonsterAction;
  /**
   * The number of actions the monster has started so far.  It changes
   * whenever the monster starts an action, even the same one again.
   */
  readonly actionCount: number;
  /** The health of the monster, from 0 to its full health. */
  readonly health: number;
  /** What the monster is up to, among the modes of its kind. */
  readonly mode: MonsterMode;
  /**
   * Whether the monster holds its weapon now, for a kind that holds one
   * now and then, as {@link MonsterKind.hasWeapon} tells, which is left
   * out for any other kind.
   */
  readonly isArmed?: boolean;
}

/**
 * Tells whether a monster is in a fight, which a slash can hit, and which
 * a player slashes at rather than talks to a villager.
 *
 * @param {MonsterState} monster - The monster.
 * @returns {boolean} Whether it is up to one of the modes its kind is in a
 *   fight in, as {@link MonsterKind.fightModes} tells.
 */
export function isFighting(monster: MonsterState): boolean {
  return MONSTER_KINDS[monster.kind].fightModes.includes(monster.mode);
}

/** What can take part in a fight. */
export type EntityKind = 'player' | 'monster';

/** Who takes part in something that happens: a player or a monster. */
export interface EntityRef {
  /** Whether it is a player or a monster. */
  readonly kind: EntityKind;
  /** The identifier of the player or of the monster. */
  readonly id: number;
}

/**
 * The farthest a monster can be from a player whose slash hits it, from
 * center to center, in meters.
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
 * @param {number} reach - The farthest the strike reaches, from center to
 *   center, in meters.
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
