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
 * @module server/monster-body The body every monster moves about in, as the
 *   server moves it: where it stands and faces, what it does, its health,
 *   the way it walks along, and its attacks.
 */

import {
  MONSTER_KINDS,
  SIMULATION_RATE,
  countSteps,
  WORLD_MAPS,
  findMapPath,
  findYaw,
  measureDistance,
} from '@clovervale/shared';
import type {
  GroundVector,
  MapId,
  MonsterAction,
  MonsterKind,
  MonsterKindId,
  MonsterMode,
  MonsterState,
  Pose,
  Terrain,
} from '@clovervale/shared';

/** How long an attack of a monster lasts, in seconds. */
const MONSTER_ATTACK_DURATION = 0.6;

/** How long after a monster starts an attack it strikes, in seconds. */
export const MONSTER_STRIKE_DELAY = 0.3;

/**
 * How long a monster follows a way to the player it goes after before it
 * finds the way again, in seconds.
 */
const MONSTER_REPATH_INTERVAL = 0.5;

/** The number of steps from the start of an attack to its strike. */
const STRIKE_STEPS: number = countSteps(MONSTER_STRIKE_DELAY);
/** The number of steps an attack lasts. */
const ATTACK_STEPS: number = countSteps(MONSTER_ATTACK_DURATION);
/** The number of steps a monster follows a way before it finds it again. */
const REPATH_STEPS: number = countSteps(MONSTER_REPATH_INTERVAL);

/**
 * How a step of the simulation goes for an attack: no attack under way;
 * an attack under way, but not at its strike; or an attack at its strike.
 */
export type AttackStep = 'none' | 'swing' | 'strike';

/**
 * How a step along the way goes: the monster walks on, has got to the end
 * of its way, or has nowhere to go: no way, or an obstacle that stops it.
 */
export type WalkOutcome = 'walking' | 'arrived' | 'stopped';

/**
 * The body of a monster, in the map of its world, with the numbers of its
 * kind, as {@link MONSTER_KINDS} tells them.  It walks along its way,
 * stopped by the obstacles like the players, faces the players, and
 * attacks them once in every interval of a bite of its kind.
 */
export class MonsterBody {
  readonly #id: number;
  readonly #kindId: MonsterKindId;
  readonly #kind: MonsterKind;
  readonly #map: MapId;
  readonly #terrain: Terrain;
  readonly #attackIntervalSteps: number;
  #position: GroundVector;
  #action: MonsterAction = 'Idle';
  #actionCount = 0;
  #attackSteps = 0;
  #cooldownSteps = 0;
  #repathSteps = 0;
  /** Which way the monster faces, in degrees. */
  #yaw: number;
  /** The health the monster has. */
  #health: number;
  /** What the monster is about. */
  #mode: MonsterMode = 'idle';
  /** The points the monster walks to, one after another, if any. */
  #path: GroundVector[] | null = null;

  /**
   * Stands the body at a place, idling, at full health, ready to attack.
   *
   * @param {number} id - The identifier of the monster, which its state
   *   tells.
   * @param {MapId} map - The map of its world, whose ground it walks on.
   * @param {MonsterKindId} kind - The kind of the monster.
   * @param {Pose} pose - Where it stands, and which way it faces.
   */
  constructor(id: number, map: MapId, kind: MonsterKindId, pose: Pose) {
    this.#id = id;
    this.#kindId = kind;
    this.#kind = MONSTER_KINDS[kind];
    this.#map = map;
    this.#terrain = WORLD_MAPS[map].terrain;
    this.#attackIntervalSteps = countSteps(this.#kind.biteInterval);
    this.#position = { x: pose.x, z: pose.z };
    this.#yaw = pose.yaw;
    this.#health = this.#kind.health;
  }

  /**
   * The numbers of the kind of the monster.
   *
   * @returns {MonsterKind} The numbers.
   */
  get kind(): MonsterKind {
    return this.#kind;
  }

  /**
   * Where the monster stands.
   *
   * @returns {GroundVector} The position.
   */
  get position(): GroundVector {
    return this.#position;
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
   * The health the monster has.
   *
   * @returns {number} The health, from 0 up to the full health of its kind.
   */
  get health(): number {
    return this.#health;
  }

  /**
   * What the monster is about.
   *
   * @returns {MonsterMode} What it is about.
   */
  get mode(): MonsterMode {
    return this.#mode;
  }

  /**
   * Whether the monster has a way to walk along.
   *
   * @returns {boolean} Whether it has.
   */
  get hasWay(): boolean {
    return this.#path !== null;
  }

  /**
   * The monster as it is to be seen now.
   *
   * @returns {MonsterState} The state of the monster.
   */
  get state(): MonsterState {
    return {
      id: this.#id,
      kind: this.#kindId,
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
   * Stands the monster at a place, facing a way, at full health, ready to
   * attack at once.
   *
   * @param {Pose} pose - Where it stands, and which way it faces.
   */
  revive(pose: Pose): void {
    this.#position = { x: pose.x, z: pose.z };
    this.#yaw = pose.yaw;
    this.#health = this.#kind.health;
    this.#cooldownSteps = 0;
  }

  /**
   * Takes health from the monster, no more than it has.
   *
   * @param {number} damage - The health to take.
   * @returns {number} The health it lost.
   */
  loseHealth(damage: number): number {
    const lost: number = Math.min(damage, this.#health);
    this.#health -= lost;
    return lost;
  }

  /** Brings the monster back to the full health of its kind. */
  restoreHealth(): void {
    this.#health = this.#kind.health;
  }

  /**
   * Has the monster be about something else from now on, with no way to
   * walk along.
   *
   * @param {MonsterMode} mode - What it is about from now on.
   */
  switchMode(mode: MonsterMode): void {
    this.#mode = mode;
    this.#path = null;
  }

  /**
   * Has the monster set out to a point, around the obstacles, to be about
   * something else, if it finds a way there; it changes nothing otherwise.
   *
   * @param {MonsterMode} mode - What it is about from now on.
   * @param {GroundVector} point - The point.
   * @returns {boolean} Whether it found a way there.
   */
  setOut(mode: MonsterMode, point: GroundVector): boolean {
    const path: GroundVector[] | null = findMapPath(
      this.#map,
      this.#position,
      point,
    );
    if (path === null) {
      return false;
    }
    this.#mode = mode;
    this.#path = path;
    return true;
  }

  /**
   * Finds a way to a point, around the obstacles, which the monster walks
   * along from then on, in place of any it had.
   *
   * @param {GroundVector} point - The point.
   * @returns {boolean} Whether it found one; it has no way to walk along
   *   if not.
   */
  findWay(point: GroundVector): boolean {
    this.#path = findMapPath(this.#map, this.#position, point);
    return this.#path !== null;
  }

  /** Leaves the monster with no way to walk along. */
  dropWay(): void {
    this.#path = null;
  }

  /**
   * Turns to face a way.
   *
   * @param {number} yaw - The way, in degrees.
   */
  turn(yaw: number): void {
    this.#yaw = yaw;
  }

  /**
   * Moves the attacks of the monster one step of the simulation forward:
   * the wait before it can attack again, and the attack under way, which
   * ends in idling.
   *
   * @returns {AttackStep} How the step goes for an attack.
   */
  stepAttack(): AttackStep {
    this.#cooldownSteps = Math.max(this.#cooldownSteps - 1, 0);
    if (this.#action !== 'Attack') {
      return 'none';
    }
    this.#attackSteps++;
    if (this.#attackSteps >= ATTACK_STEPS) {
      this.startAction('Idle');
    }
    return this.#attackSteps === STRIKE_STEPS ? 'strike' : 'swing';
  }

  /**
   * Stops where it is, facing a player within its reach, and attacks it if
   * it can attack again by now, or idles until then.
   *
   * @param {GroundVector} target - Where the player stands.
   */
  attack(target: GroundVector): void {
    this.face(target);
    this.#path = null;
    if (this.#cooldownSteps === 0) {
      this.#attackSteps = 0;
      this.#cooldownSteps = this.#attackIntervalSteps;
      this.startAction('Attack', true);
    } else {
      this.startAction('Idle');
    }
  }

  /**
   * Turns to face a point, unless it stands right there.
   *
   * @param {GroundVector} target - The point.
   */
  face(target: GroundVector): void {
    if (measureDistance(target, this.#position) > 0) {
      this.#yaw = findYaw({
        x: target.x - this.#position.x,
        z: target.z - this.#position.z,
      });
    }
  }

  /**
   * Walks one step along its way, around the obstacles.
   *
   * @param {number} speed - The speed, in metres per second.
   * @returns {WalkOutcome} How the step goes.
   */
  walk(speed: number): WalkOutcome {
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
    const moved: GroundVector = this.#terrain.resolveMove(
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
    this.startAction('Walk');
    return this.#path?.length === 0 ? 'arrived' : 'walking';
  }

  /**
   * Chases a player at the chase speed of its kind: attacks it, as
   * {@link attack} does, once no farther than a distance from it, or else
   * walks one step on the way to it, as {@link pursue} does.
   *
   * @param {GroundVector} target - Where the player stands.
   * @param {number} distance - How near it comes to the player before it
   *   attacks, from centre to centre, in metres.
   * @returns {boolean} Whether it attacks or has a way to the player,
   *   rather than finding no way to it.
   */
  chase(target: GroundVector, distance: number): boolean {
    if (measureDistance(target, this.#position) <= distance) {
      this.attack(target);
      return true;
    }
    return this.pursue(target);
  }

  /**
   * Walks one step on the way to a point that may move, around the
   * obstacles, at the chase speed of its kind, finding the way again
   * whenever it has none, or once it has followed one for half a second.
   *
   * @param {GroundVector} target - The point.
   * @returns {boolean} Whether it has a way there, rather than finding no
   *   way there, when it is left without one.
   */
  pursue(target: GroundVector): boolean {
    if (this.#path === null || --this.#repathSteps <= 0) {
      this.#path = findMapPath(this.#map, this.#position, target);
      this.#repathSteps = REPATH_STEPS;
      if (this.#path === null) {
        return false;
      }
    }
    if (this.walk(this.#kind.chaseSpeed) !== 'walking') {
      this.#path = null;
    }
    return true;
  }

  /** Idles where it is, with no way to walk along. */
  settle(): void {
    this.#mode = 'idle';
    this.#path = null;
    this.startAction('Idle');
  }

  /**
   * Makes the monster do something, unless it is doing just that already.
   *
   * @param {MonsterAction} action - What the monster does from now on.
   * @param {boolean} [isAgain] - Whether to start it over even if it is
   *   doing just that already.  Not by default.
   */
  startAction(action: MonsterAction, isAgain = false): void {
    if (this.#action !== action || isAgain) {
      this.#action = action;
      this.#actionCount++;
    }
  }
}
