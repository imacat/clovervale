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
 * @module server/monster The monsters, as the server moves them, and where
 *   each map has them live: the wild dog in the burrow among the spawn
 *   stones of the village, and the wild dogs in the passage of the cave.
 */

import {
  CAVE_DOG_HOMES,
  SPAWN_STONES_POSE,
  WAYPOINT_CLEARANCE,
  WORLD_MAPS,
  countSteps,
  measureDistance,
} from '@clovervale/shared';
import type {
  GroundVector,
  MapId,
  MonsterKind,
  MonsterKindId,
  MonsterState,
  MonsterWander,
  Pose,
  Terrain,
} from '@clovervale/shared';

import type { Spoils, Striker, Target } from './combatants.ts';
import { MonsterBody } from './monster-body.ts';
import type { AttackStep, WalkOutcome } from './monster-body.ts';

/**
 * The way the mouth of the burrow among the spawn stones faces, as the
 * model of the stones has it before it is placed, in degrees.
 */
const BURROW_MOUTH_YAW = -72;

/** Where a monster lives, and of what kind it is. */
export interface MonsterSpawn {
  /** The kind of the monster. */
  readonly kind: MonsterKindId;
  /**
   * Where the monster lives and comes back to life, and which way it faces
   * as it does.
   */
  readonly home: Pose;
}

/**
 * The monsters each map has, in the order they are numbered from 1 in a
 * world of it: in the village, the wild dog at the mouth of its burrow in
 * the middle of the spawn stones, facing out of it; and in the cave, a
 * wild dog at each of {@link CAVE_DOG_HOMES}.
 */
export const MONSTER_SPAWNS: Readonly<Record<MapId, readonly MonsterSpawn[]>> =
  (() => {
    const { x, z, yaw } = SPAWN_STONES_POSE;
    return {
      village: [
        { kind: 'village-dog', home: { x, z, yaw: yaw + BURROW_MOUTH_YAW } },
      ],
      cave: CAVE_DOG_HOMES.map(
        (home: Pose): MonsterSpawn => ({ kind: 'cave-dog', home }),
      ),
    };
  })();

/** The shortest time a monster idles before it wanders, in seconds. */
const MONSTER_MIN_IDLE = 2;

/** The longest time a monster idles before it wanders, in seconds. */
const MONSTER_MAX_IDLE = 5;

/**
 * The farthest a player can be from a monster for its attack to hit, from
 * centre to centre, in metres.
 */
export const MONSTER_ATTACK_REACH = 1.4;

/**
 * How near a monster comes to the player it chases before it stops and
 * attacks, from centre to centre, in metres.
 */
export const MONSTER_APPROACH_DISTANCE = 1.1;

/** How long a dead monster lies before it is gone, in seconds. */
export const MONSTER_CORPSE_DURATION = 2;

/** The most points the monster tries before it finds one to wander to. */
const WANDER_TRIES = 8;

/** The number of steps a dead monster is seen for. */
const CORPSE_STEPS: number = countSteps(MONSTER_CORPSE_DURATION);

/** A player the monster can chase. */
export interface Quarry {
  /** The identifier of the player. */
  readonly id: number;
  /** The position along the X axis, in metres. */
  readonly x: number;
  /** The position along the Z axis, in metres. */
  readonly z: number;
}

/**
 * A monster, as the server moves it, in the map of its world, with the
 * numbers of its kind, as `MONSTER_KINDS` tells them.
 *
 * It idles at its home, and now and then wanders to a point near it, if
 * its kind wanders.  When
 * a player comes within its notice, and that player is near enough to its
 * home, it chases the player around the obstacles, and attacks it when it
 * gets near enough, until the player gets too far from its home, when it
 * gives up and walks back home.  It is stopped by the obstacles like the
 * players, but does not stand in their way, nor they in its.  Once dead,
 * it lies there for a while and is gone, and later comes back to life at
 * its home.
 */
export class Monster implements Target, Striker {
  readonly #id: number;
  readonly #kind: MonsterKind;
  readonly #home: Pose;
  readonly #terrain: Terrain;
  readonly #respawnSteps: number;
  readonly #drawRandom: () => number;
  readonly #body: MonsterBody;
  #quarryId: number | null = null;
  #idleSteps: number;
  #deadSteps = 0;

  /**
   * Brings the monster to life at its home, facing the way it faces there,
   * idling, at full health.
   *
   * @param {number} id - The identifier of the monster, which its state
   *   tells.
   * @param {MapId} map - The map of its world, whose ground it walks on.
   * @param {MonsterSpawn} spawn - Its kind, and where it lives.
   * @param {() => number} drawRandom - Gives a random number from 0 up to
   *   but not including 1, for how long the monster idles and where it
   *   wanders to.
   */
  constructor(
    id: number,
    map: MapId,
    { kind, home }: MonsterSpawn,
    drawRandom: () => number,
  ) {
    this.#id = id;
    this.#body = new MonsterBody(id, map, kind, home);
    this.#kind = this.#body.kind;
    this.#home = home;
    this.#terrain = WORLD_MAPS[map].terrain;
    this.#respawnSteps = countSteps(this.#kind.respawnDelay);
    this.#drawRandom = drawRandom;
    this.#idleSteps = this.#drawIdleSteps();
  }

  /**
   * The identifier of the monster.
   *
   * @returns {number} The identifier.
   */
  get id(): number {
    return this.#id;
  }

  /**
   * The health a bite of the monster that hits takes from a player.
   *
   * @returns {number} The health.
   */
  get biteDamage(): number {
    return this.#kind.biteDamage;
  }

  /**
   * The most silver coins the monster gives the player whose strike kills
   * it.
   *
   * @returns {number} The number of coins.
   */
  get maxSilver(): number {
    return this.#kind.maxSilver;
  }

  /**
   * What the player whose strike kills the monster gets: as many silver
   * coins as {@link Monster.maxSilver} at most, and nothing else.
   *
   * @returns {Spoils} The spoils.
   */
  get spoils(): Spoils {
    return { maxSilver: this.maxSilver, prize: null };
  }

  /**
   * The farthest a player can be from the monster for its attack to hit,
   * {@link MONSTER_ATTACK_REACH}.
   *
   * @returns {number} The reach, in metres.
   */
  get strikeReach(): number {
    return MONSTER_ATTACK_REACH;
  }

  /**
   * Whether the monster is alive, and can be hit.
   *
   * @returns {boolean} Whether it is.
   */
  get isAlive(): boolean {
    return this.#body.mode !== 'dead';
  }

  /**
   * Whether the monster is dead.
   *
   * @returns {boolean} Whether it is.
   */
  get isBeaten(): boolean {
    return !this.isAlive;
  }

  /**
   * Where the monster stands, and which way it faces.
   *
   * @returns {Pose} The pose.
   */
  get pose(): Pose {
    return this.#body.pose;
  }

  /**
   * The monster as it is to be seen now.
   *
   * @returns {MonsterState | null} The state of the monster, or `null`
   *   once it has been dead for so long that it is gone.
   */
  get state(): MonsterState | null {
    if (this.#body.mode === 'dead' && this.#deadSteps >= CORPSE_STEPS) {
      return null;
    }
    return this.#body.state;
  }

  /**
   * Tells whether a player can hit the monster now: whenever it is alive.
   *
   * @returns {boolean} Whether it is alive.
   */
  canBeHitBy(): boolean {
    return this.isAlive;
  }

  /**
   * Tells whether an attack of the monster can hit a player now: whenever
   * it is alive.
   *
   * @returns {boolean} Whether it is alive.
   */
  canStrike(): boolean {
    return this.isAlive;
  }

  /**
   * Moves the monster one step of the simulation forward.
   *
   * @param {readonly Quarry[]} players - The players it can chase, where
   *   they stand now.
   * @returns {boolean} Whether the monster strikes at this step, which it
   *   does once in every attack, partway through.
   */
  step(players: readonly Quarry[]): boolean {
    if (this.#body.mode === 'dead') {
      if (++this.#deadSteps >= this.#respawnSteps) {
        this.#comeBack();
      }
      return false;
    }
    const attack: AttackStep = this.#body.stepAttack();
    if (attack !== 'none') {
      return attack === 'strike';
    }
    if (this.#body.mode === 'idle' || this.#body.mode === 'wander') {
      const quarry: Quarry | undefined = this.#findQuarry(players);
      if (quarry !== undefined) {
        this.#startChase(quarry.id);
      }
    }
    switch (this.#body.mode) {
      case 'idle':
        this.#idle();
        break;
      case 'wander':
        this.#wander();
        break;
      case 'chase':
        this.#chase(players);
        break;
      case 'return':
        this.#goHome();
        break;
    }
    return false;
  }

  /**
   * Takes a hit, which only a monster that is alive can.  A monster that
   * is not chasing anyone already chases the player that hit it, and one
   * that has no health left dies.
   *
   * @param {number} damage - The health the hit takes.
   * @param {number} attackerId - The identifier of the player that hit it.
   * @returns {number} The health the monster lost, which is no more than it
   *   had.
   */
  takeHit(damage: number, attackerId: number): number {
    const lost: number = this.#body.loseHealth(damage);
    if (this.#body.health === 0) {
      this.#body.switchMode('dead');
      this.#deadSteps = 0;
      this.#quarryId = null;
      this.#body.startAction('Die');
    } else if (this.#body.mode !== 'chase') {
      this.#startChase(attackerId);
    }
    return lost;
  }

  /**
   * Finds the nearest player the monster notices and may chase.
   *
   * @param {readonly Quarry[]} players - The players.
   * @returns {Quarry | undefined} The player, if there is one.
   */
  #findQuarry(players: readonly Quarry[]): Quarry | undefined {
    let nearest: Quarry | undefined;
    let least: number = this.#kind.noticeRange;
    for (const player of players) {
      const distance: number = measureDistance(player, this.#body.position);
      if (
        distance <= least &&
        measureDistance(player, this.#home) <= this.#kind.leashRange
      ) {
        nearest = player;
        least = distance;
      }
    }
    return nearest;
  }

  /**
   * Starts chasing a player.
   *
   * @param {number} id - The identifier of the player.
   */
  #startChase(id: number): void {
    this.#body.switchMode('chase');
    this.#quarryId = id;
  }

  /** Idles, until it is time to wander. */
  #idle(): void {
    if (--this.#idleSteps > 0) {
      return;
    }
    this.#idleSteps = this.#drawIdleSteps();
    const { wander } = this.#kind;
    const point: GroundVector | null =
      wander === undefined ? null : this.#chooseWanderPoint(wander);
    if (point !== null) {
      this.#body.setOut('wander', point);
    }
  }

  /** Wanders on to the point chosen, and idles once there or stopped. */
  #wander(): void {
    const { wander } = this.#kind;
    if (wander === undefined || this.#body.walk(wander.speed) !== 'walking') {
      this.#settle();
    }
  }

  /**
   * Chases the player it is after, around the obstacles, and attacks it
   * once near enough.  It gives up and goes home if the player is gone or
   * too far from home, or if it finds no way to the player.
   *
   * @param {readonly Quarry[]} players - The players.
   */
  #chase(players: readonly Quarry[]): void {
    const quarry: Quarry | undefined = players.find(
      (player: Quarry) => player.id === this.#quarryId,
    );
    if (
      quarry === undefined ||
      measureDistance(quarry, this.#home) > this.#kind.leashRange
    ) {
      this.#giveUp();
      return;
    }
    if (!this.#body.chase(quarry, MONSTER_APPROACH_DISTANCE)) {
      this.#giveUp();
    }
  }

  /** Gives up the chase, and sets out for home. */
  #giveUp(): void {
    this.#quarryId = null;
    if (!this.#body.setOut('return', this.#home)) {
      this.#settle();
    }
  }

  /** Walks back home, and idles once there, or once it finds no way. */
  #goHome(): void {
    const outcome: WalkOutcome = this.#body.walk(this.#kind.chaseSpeed);
    if (outcome === 'arrived') {
      this.#settle();
    } else if (outcome === 'stopped' && !this.#body.findWay(this.#home)) {
      this.#settle();
    }
  }

  /** Idles where it is, for a while. */
  #settle(): void {
    this.#body.settle();
    this.#idleSteps = this.#drawIdleSteps();
  }

  /**
   * Chooses a point near home to wander to.
   *
   * @param {MonsterWander} wander - How the monster wanders.
   * @returns {GroundVector | null} A point where the monster has room, or
   *   `null` if none was found.
   */
  #chooseWanderPoint(wander: MonsterWander): GroundVector | null {
    for (let tries = 0; tries < WANDER_TRIES; tries++) {
      const angle: number = 2 * Math.PI * this.#drawRandom();
      const radius: number = wander.radius * Math.sqrt(this.#drawRandom());
      const point: GroundVector = {
        x: this.#home.x + radius * Math.sin(angle),
        z: this.#home.z + radius * Math.cos(angle),
      };
      if (this.#terrain.isClear(point, WAYPOINT_CLEARANCE)) {
        return point;
      }
    }
    return null;
  }

  /**
   * Draws how long the monster idles for.
   *
   * @returns {number} The number of steps.
   */
  #drawIdleSteps(): number {
    const seconds: number =
      MONSTER_MIN_IDLE +
      this.#drawRandom() * (MONSTER_MAX_IDLE - MONSTER_MIN_IDLE);
    return countSteps(seconds);
  }

  /** Comes back to life at home, idling, at full health. */
  #comeBack(): void {
    this.#body.revive(this.#home);
    this.#settle();
  }
}
