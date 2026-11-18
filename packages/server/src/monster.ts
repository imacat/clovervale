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
 * @module server/monster The monster that lives by the spawn stones, as the
 *   server moves it.
 */

import {
  MONSTER_HEALTH,
  PLAZA_CENTRE,
  SIMULATION_RATE,
  VILLAGE_TERRAIN,
  WAYPOINT_CLEARANCE,
  findPlacement,
  findVillagePath,
  findYaw,
} from '@clovervale/shared';
import type {
  GroundVector,
  MonsterAction,
  MonsterMode,
  MonsterState,
  Pose,
} from '@clovervale/shared';

/** The identifier of the monster. */
export const MONSTER_ID = 1;

/** Where the monster lives and comes back to life: by the spawn stones. */
export const MONSTER_HOME: GroundVector = (() => {
  const { x, z } = findPlacement('prop-spawn-stones.glb');
  return { x, z };
})();

/** The yaw of the monster as it comes to life, facing the plaza. */
export const MONSTER_HOME_YAW: number = findYaw({
  x: PLAZA_CENTRE.x - MONSTER_HOME.x,
  z: PLAZA_CENTRE.z - MONSTER_HOME.z,
});

/** The speed the monster wanders at, in metres per second. */
export const MONSTER_WANDER_SPEED = 0.8;

/**
 * The speed the monster chases a player and walks back home at, in metres
 * per second, a little slower than a player walks, so that a player can
 * get away.
 */
export const MONSTER_CHASE_SPEED = 1.3;

/** The farthest from its home the monster wanders to, in metres. */
export const MONSTER_WANDER_RADIUS = 3;

/** The shortest time the monster idles before it wanders, in seconds. */
export const MONSTER_MIN_IDLE = 2;

/** The longest time the monster idles before it wanders, in seconds. */
export const MONSTER_MAX_IDLE = 5;

/** The farthest the monster notices a player from, in metres. */
export const MONSTER_NOTICE_RANGE = 5;

/**
 * The farthest from the home of the monster a player can be for the
 * monster to chase it, in metres.
 */
export const MONSTER_LEASH_RANGE = 8;

/**
 * The farthest a player can be from the monster for its attack to hit,
 * from centre to centre, in metres.
 */
export const MONSTER_ATTACK_REACH = 1.4;

/**
 * How near the monster comes to the player it chases before it stops and
 * attacks, from centre to centre, in metres.
 */
export const MONSTER_APPROACH_DISTANCE = 1.1;

/** The health an attack of the monster that hits takes from a player. */
export const MONSTER_ATTACK_DAMAGE = 15;

/** How long an attack of the monster lasts, in seconds. */
export const MONSTER_ATTACK_DURATION = 0.6;

/** How long after the monster starts an attack it strikes, in seconds. */
export const MONSTER_STRIKE_DELAY = 0.3;

/**
 * The shortest time from the start of one attack of the monster to the
 * start of the next, in seconds.
 */
export const MONSTER_ATTACK_INTERVAL = 1.5;

/** How long the dead monster lies before it is gone, in seconds. */
export const MONSTER_CORPSE_DURATION = 2;

/**
 * How long after it dies the monster comes back to life at its home, in
 * seconds.
 */
export const MONSTER_RESPAWN_DELAY = 10;

/**
 * How long the monster follows a way to the player it chases before it
 * finds the way again, in seconds.
 */
export const MONSTER_REPATH_INTERVAL = 0.5;

/** The most points the monster tries before it finds one to wander to. */
const WANDER_TRIES = 8;

/**
 * Counts the simulation steps a time lasts.
 *
 * @param {number} seconds - The time, in seconds.
 * @returns {number} The number of steps, at least one.
 */
function countSteps(seconds: number): number {
  return Math.max(Math.round(seconds * SIMULATION_RATE), 1);
}

/** The number of steps from the start of an attack to its strike. */
const STRIKE_STEPS: number = countSteps(MONSTER_STRIKE_DELAY);
/** The number of steps an attack lasts. */
const ATTACK_STEPS: number = countSteps(MONSTER_ATTACK_DURATION);
/** The number of steps from the start of one attack to the next. */
const ATTACK_INTERVAL_STEPS: number = countSteps(MONSTER_ATTACK_INTERVAL);
/** The number of steps the dead monster is seen for. */
const CORPSE_STEPS: number = countSteps(MONSTER_CORPSE_DURATION);
/** The number of steps from the death of the monster to its return. */
const RESPAWN_STEPS: number = countSteps(MONSTER_RESPAWN_DELAY);
/** The number of steps the monster follows a way to its quarry. */
const REPATH_STEPS: number = countSteps(MONSTER_REPATH_INTERVAL);

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
 * Measures how far apart two points are.
 *
 * @param {GroundVector} a - One point.
 * @param {GroundVector} b - The other point.
 * @returns {number} The distance between them, in metres.
 */
function measureDistance(a: GroundVector, b: GroundVector): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * The monster, as the server moves it.
 *
 * It idles at its home, and now and then wanders to a point near it.  When
 * a player comes near, and that player is near its home, it chases the
 * player around the obstacles, and attacks it when it gets near enough,
 * until the player gets too far from its home, when it gives up and walks
 * back home.  It is stopped by the obstacles like the players, but does
 * not stand in their way, nor they in its.  Once dead, it lies there for a
 * while and is gone, and later comes back to life at its home.
 */
export class Monster {
  readonly #drawRandom: () => number;
  #position: GroundVector = MONSTER_HOME;
  #yaw: number = MONSTER_HOME_YAW;
  #action: MonsterAction = 'Idle';
  #actionCount = 0;
  #health: number = MONSTER_HEALTH;
  #mode: MonsterMode = 'idle';
  #path: GroundVector[] | null = null;
  #quarryId: number | null = null;
  #idleSteps: number;
  #repathSteps = 0;
  #attackSteps = 0;
  #cooldownSteps = 0;
  #deadSteps = 0;

  /**
   * Brings the monster to life at its home, idling, at full health.
   *
   * @param {() => number} [drawRandom] - Gives a random number from 0 up to
   *   but not including 1, for how long the monster idles and where it
   *   wanders to.  `Math.random` by default.
   */
  constructor(drawRandom: () => number = Math.random) {
    this.#drawRandom = drawRandom;
    this.#idleSteps = this.#drawIdleSteps();
  }

  /**
   * Whether the monster is alive, and can be hit.
   *
   * @returns {boolean} Whether it is.
   */
  get isAlive(): boolean {
    return this.#mode !== 'dead';
  }

  /**
   * Where the monster stands, and which way it faces.
   *
   * @returns {Pose} The pose.
   */
  get pose(): Pose {
    return { x: this.#position.x, z: this.#position.z, yaw: this.#yaw };
  }

  /**
   * The monster as it is to be seen now.
   *
   * @returns {MonsterState | null} The state of the monster, or `null`
   *   once it has been dead for so long that it is gone.
   */
  get state(): MonsterState | null {
    if (this.#mode === 'dead' && this.#deadSteps >= CORPSE_STEPS) {
      return null;
    }
    return {
      id: MONSTER_ID,
      x: this.#position.x,
      z: this.#position.z,
      yaw: this.#yaw,
      action: this.#action,
      actionCount: this.#actionCount,
      health: this.#health,
      mode: this.#mode,
    };
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
    if (this.#mode === 'dead') {
      if (++this.#deadSteps >= RESPAWN_STEPS) {
        this.#comeBack();
      }
      return false;
    }
    this.#cooldownSteps = Math.max(this.#cooldownSteps - 1, 0);
    if (this.#action === 'Attack') {
      this.#attackSteps++;
      if (this.#attackSteps >= ATTACK_STEPS) {
        this.#startAction('Idle');
      }
      return this.#attackSteps === STRIKE_STEPS;
    }
    if (this.#mode === 'idle' || this.#mode === 'wander') {
      const quarry: Quarry | undefined = this.#findQuarry(players);
      if (quarry !== undefined) {
        this.#startChase(quarry.id);
      }
    }
    switch (this.#mode) {
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
   * Takes a hit.  A monster that is not chasing anyone already chases the
   * player that hit it, and one that has no health left dies.  A dead
   * monster takes no hits.
   *
   * @param {number} damage - The health the hit takes.
   * @param {number} attackerId - The identifier of the player that hit it.
   * @returns {number} The health the monster lost, which is no more than it
   *   had.
   */
  takeHit(damage: number, attackerId: number): number {
    if (this.#mode === 'dead') {
      return 0;
    }
    const lost: number = Math.min(damage, this.#health);
    this.#health -= lost;
    if (this.#health === 0) {
      this.#mode = 'dead';
      this.#deadSteps = 0;
      this.#path = null;
      this.#quarryId = null;
      this.#startAction('Die');
    } else if (this.#mode !== 'chase') {
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
    let least: number = MONSTER_NOTICE_RANGE;
    for (const player of players) {
      const distance: number = measureDistance(player, this.#position);
      if (
        distance <= least &&
        measureDistance(player, MONSTER_HOME) <= MONSTER_LEASH_RANGE
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
    this.#mode = 'chase';
    this.#quarryId = id;
    this.#path = null;
    this.#repathSteps = 0;
  }

  /** Idles, until it is time to wander. */
  #idle(): void {
    this.#startAction('Idle');
    if (--this.#idleSteps > 0) {
      return;
    }
    this.#idleSteps = this.#drawIdleSteps();
    const point: GroundVector | null = this.#chooseWanderPoint();
    const path: GroundVector[] | null =
      point === null ? null : findVillagePath(this.#position, point);
    if (path !== null) {
      this.#mode = 'wander';
      this.#path = path;
    }
  }

  /** Wanders on to the point chosen, and idles once there or stopped. */
  #wander(): void {
    if (this.#walk(MONSTER_WANDER_SPEED) !== 'walking') {
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
      measureDistance(quarry, MONSTER_HOME) > MONSTER_LEASH_RANGE
    ) {
      this.#giveUp();
      return;
    }
    const distance: number = measureDistance(quarry, this.#position);
    if (distance <= MONSTER_APPROACH_DISTANCE) {
      if (distance > 0) {
        this.#yaw = findYaw({
          x: quarry.x - this.#position.x,
          z: quarry.z - this.#position.z,
        });
      }
      this.#path = null;
      if (this.#cooldownSteps === 0) {
        this.#attackSteps = 0;
        this.#cooldownSteps = ATTACK_INTERVAL_STEPS;
        this.#startAction('Attack', true);
      } else {
        this.#startAction('Idle');
      }
      return;
    }
    if (this.#path === null || --this.#repathSteps <= 0) {
      this.#path = findVillagePath(this.#position, quarry);
      this.#repathSteps = REPATH_STEPS;
      if (this.#path === null) {
        this.#giveUp();
        return;
      }
    }
    if (this.#walk(MONSTER_CHASE_SPEED) !== 'walking') {
      this.#path = null;
    }
  }

  /** Gives up the chase, and sets out for home. */
  #giveUp(): void {
    this.#mode = 'return';
    this.#quarryId = null;
    this.#path = findVillagePath(this.#position, MONSTER_HOME);
    if (this.#path === null) {
      this.#settle();
    }
  }

  /** Walks back home, and idles once there, or once it finds no way. */
  #goHome(): void {
    const outcome: string = this.#walk(MONSTER_CHASE_SPEED);
    if (outcome === 'arrived') {
      this.#settle();
    } else if (outcome === 'stopped') {
      this.#path = findVillagePath(this.#position, MONSTER_HOME);
      if (this.#path === null) {
        this.#settle();
      }
    }
  }

  /** Idles where it is, for a while. */
  #settle(): void {
    this.#mode = 'idle';
    this.#path = null;
    this.#idleSteps = this.#drawIdleSteps();
    this.#startAction('Idle');
  }

  /**
   * Walks one step along its way, around the obstacles.
   *
   * @param {number} speed - The speed, in metres per second.
   * @returns {'walking' | 'arrived' | 'stopped'} Whether it walks on, has
   *   got to the end of its way, or has nowhere to go: no way, or an
   *   obstacle that stops it.
   */
  #walk(speed: number): 'walking' | 'arrived' | 'stopped' {
    const next: GroundVector | undefined = this.#path?.[0];
    if (next === undefined) {
      return 'stopped';
    }
    const reach: number = speed / SIMULATION_RATE;
    const distance: number = measureDistance(next, this.#position);
    const direction: GroundVector = {
      x: next.x - this.#position.x,
      z: next.z - this.#position.z,
    };
    const isReached: boolean = distance <= reach;
    const target: GroundVector = isReached
      ? next
      : {
          x: this.#position.x + (direction.x / distance) * reach,
          z: this.#position.z + (direction.z / distance) * reach,
        };
    const moved: GroundVector = VILLAGE_TERRAIN.resolveMove(
      this.#position,
      target,
    );
    if (distance > 0) {
      if (moved.x === this.#position.x && moved.z === this.#position.z) {
        return 'stopped';
      }
      this.#yaw = findYaw(direction);
    }
    this.#position = moved;
    if (isReached) {
      this.#path?.shift();
    }
    this.#startAction('Walk');
    return this.#path?.length === 0 ? 'arrived' : 'walking';
  }

  /**
   * Chooses a point near home to wander to.
   *
   * @returns {GroundVector | null} A point where the monster has room, or
   *   `null` if none was found.
   */
  #chooseWanderPoint(): GroundVector | null {
    for (let tries = 0; tries < WANDER_TRIES; tries++) {
      const angle: number = 2 * Math.PI * this.#drawRandom();
      const radius: number =
        MONSTER_WANDER_RADIUS * Math.sqrt(this.#drawRandom());
      const point: GroundVector = {
        x: MONSTER_HOME.x + radius * Math.sin(angle),
        z: MONSTER_HOME.z + radius * Math.cos(angle),
      };
      if (VILLAGE_TERRAIN.isClear(point, WAYPOINT_CLEARANCE)) {
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
    this.#position = MONSTER_HOME;
    this.#yaw = MONSTER_HOME_YAW;
    this.#health = MONSTER_HEALTH;
    this.#cooldownSteps = 0;
    this.#settle();
  }

  /**
   * Makes the monster do something, unless it is doing just that already.
   *
   * @param {MonsterAction} action - What the monster does from now on.
   * @param {boolean} [isAgain] - Whether to start it over even if it is
   *   doing just that already.  Not by default.
   */
  #startAction(action: MonsterAction, isAgain = false): void {
    if (this.#action !== action || isAgain) {
      this.#action = action;
      this.#actionCount++;
    }
  }
}
