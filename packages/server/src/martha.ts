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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/20
// AI assistance: Claude Code (Anthropic)

/**
 * @module server/martha Martha, the village chief, who is the enemy spy,
 *   as the server moves her: she comes up to whoever climbs out of her
 *   well, talks with it, and fights it with her pitchfork.
 */

import {
  MONSTER_KINDS,
  PITCHFORK_STAND,
  SIMULATION_RATE,
  findMapPath,
  findMapTerrain,
  findPlacement,
  findYaw,
} from '@clovervale/shared';
import type {
  GroundVector,
  MonsterAction,
  MonsterKind,
  MonsterMode,
  MonsterState,
  Pose,
  Terrain,
} from '@clovervale/shared';

import {
  MONSTER_ATTACK_DURATION,
  MONSTER_REPATH_INTERVAL,
  MONSTER_STRIKE_DELAY,
} from './monster.ts';

/**
 * Where Martha stands on the porch of her house, and which way she faces
 * there, which she comes back to whenever she has nobody to deal with.
 */
export const MARTHA_HOME: Pose = (() => {
  const { x, z, yaw } = findPlacement('npc-martha.glb');
  return { x, z, yaw };
})();

/**
 * The farthest a player can be from Martha for a thrust of her pitchfork
 * to hit, from centre to centre, in metres: farther than a slash of a
 * player reaches.
 */
export const MARTHA_STRIKE_REACH = 2;

/**
 * How near Martha comes to the player she fights before she stops and
 * thrusts, from centre to centre, in metres: well within the reach of a
 * slash of a player, so that the two can trade blows where they stand,
 * and well short of her own reach, so that a player that steps back as
 * she thrusts is still hit.
 */
export const MARTHA_ATTACK_DISTANCE = 1.4;

/**
 * How near Martha comes to a player she walks up to before she talks with
 * it, from centre to centre, in metres.
 */
export const MARTHA_GREETING_DISTANCE = 1.2;

/** The numbers of Martha. */
const KIND: MonsterKind = MONSTER_KINDS.martha;

/**
 * Counts the simulation steps a time lasts.
 *
 * @param {number} seconds - The time, in seconds.
 * @returns {number} The number of steps, at least one.
 */
function countSteps(seconds: number): number {
  return Math.max(Math.round(seconds * SIMULATION_RATE), 1);
}

/** The number of steps from the start of a thrust to its strike. */
const STRIKE_STEPS: number = countSteps(MONSTER_STRIKE_DELAY);
/** The number of steps a thrust lasts. */
const ATTACK_STEPS: number = countSteps(MONSTER_ATTACK_DURATION);
/** The number of steps Martha follows a way before she finds it again. */
const REPATH_STEPS: number = countSteps(MONSTER_REPATH_INTERVAL);
/** The number of steps from the start of one thrust to the next. */
const THRUST_INTERVAL_STEPS: number = countSteps(KIND.biteInterval);
/** The number of steps Martha sits on the ground once beaten. */
const SIT_STEPS: number = countSteps(KIND.respawnDelay);

/** A player, as far as Martha goes. */
export interface Suspect {
  /** The identifier of the player. */
  readonly id: number;
  /** The position along the X axis, in metres. */
  readonly x: number;
  /** The position along the Z axis, in metres. */
  readonly z: number;
  /** Whether the player is alive. */
  readonly isAlive: boolean;
  /** Whether Martha hunts the player. */
  readonly isHunted: boolean;
  /** Whether the player is in a dialogue. */
  readonly isInDialogue: boolean;
}

/**
 * What Martha does to a player at a step: opens a dialogue with it, as
 * she has come up to it; strikes at it with her pitchfork; or loses it in a
 * fight, as it has got away or died, so that she hunts it from then on.
 */
export interface MarthaDeed {
  /** What she does. */
  readonly type: 'greet' | 'strike' | 'hunt';
  /** The identifier of the player. */
  readonly player: number;
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
 * Tells whether a player is in Martha's area: no farther from her home
 * than her leash.
 *
 * @param {GroundVector} player - Where the player stands.
 * @returns {boolean} Whether it is.
 */
function isInArea(player: GroundVector): boolean {
  return measureDistance(player, MARTHA_HOME) <= KIND.leashRange;
}

/**
 * Martha, the village chief, who is the enemy spy, as the server moves
 * her, with the numbers {@link MONSTER_KINDS} tells of her.
 *
 * She deals with one player at a time, and the others she is to deal with
 * wait in the order they came, each as long as it stays in her area, no
 * farther from her home than her leash.  To a player that has climbed out
 * of her well she walks up, around the obstacles, and once near enough
 * opens a dialogue with it; once the dialogue is over, she fights it.  A
 * player she hunts she fights at once, without a word, and she hunts a
 * player she notices, within her notice, in her area.  Whenever she sets
 * out to a player without her pitchfork, she first takes it up from the
 * wall of her house, at {@link PITCHFORK_STAND}, and she comes up to the
 * player, and fights it, only with it in her hands; and whenever she
 * walks back home with it, she first leans it against the wall again.  In
 * a fight, she chases the player and thrusts her pitchfork at it whenever
 * near enough, until it gets out of her area or dies, when she hunts it
 * from then on, or until it beats her, when she drops her pitchfork beside
 * her and sits on the ground for a while, then gets up at full health and
 * takes it up again.  Whenever a fight ends with her not beaten, she is
 * at full health again at once.  A player who leaves her area, or who
 * dies, before she has come up to it she lets go.  With nobody to deal with, she
 * walks back home and stands there as she does.  Only the player she
 * fights can hurt her.  She is stopped by the obstacles like the players,
 * but does not stand in their way, nor they in hers.
 */
export class Martha {
  readonly #id: number;
  readonly #terrain: Terrain = findMapTerrain('village');
  #position: GroundVector = { x: MARTHA_HOME.x, z: MARTHA_HOME.z };
  #yaw: number = MARTHA_HOME.yaw;
  #action: MonsterAction = 'Idle';
  #actionCount = 0;
  #health: number = KIND.health;
  #mode: MonsterMode = 'idle';
  #isArmed = false;
  #path: GroundVector[] | null = null;
  #targetId: number | null = null;
  #queue: number[] = [];
  #repathSteps = 0;
  #attackSteps = 0;
  #cooldownSteps = 0;
  #sitSteps = 0;

  /**
   * Stands Martha at her home, facing the way she faces there, idling, at
   * full health, with nobody to deal with.
   *
   * @param {number} id - The identifier of Martha among the monsters of
   *   the village, which her state tells.
   */
  constructor(id: number) {
    this.#id = id;
  }

  /**
   * The identifier of Martha among the monsters of the village.
   *
   * @returns {number} The identifier.
   */
  get id(): number {
    return this.#id;
  }

  /**
   * The health a thrust of her pitchfork that hits takes from a player.
   *
   * @returns {number} The health.
   */
  get biteDamage(): number {
    return KIND.biteDamage;
  }

  /**
   * Where Martha stands, and which way she faces.
   *
   * @returns {Pose} The pose.
   */
  get pose(): Pose {
    return { x: this.#position.x, z: this.#position.z, yaw: this.#yaw };
  }

  /**
   * Martha as she is to be seen now, as a monster of her own kind.
   *
   * @returns {MonsterState} Her state.
   */
  get state(): MonsterState {
    return {
      id: this.#id,
      kind: 'martha',
      x: this.#position.x,
      z: this.#position.z,
      yaw: this.#yaw,
      action: this.#action,
      actionCount: this.#actionCount,
      health: this.#health,
      mode: this.#mode,
      isArmed: this.#isArmed,
    };
  }

  /**
   * Tells whether Martha fights a player now, so that the player alone
   * can hurt her and she strikes at it alone.
   *
   * @param {number} id - The identifier of the player.
   * @returns {boolean} Whether she does.
   */
  isFightingWith(id: number): boolean {
    return this.#mode === 'chase' && this.#targetId === id;
  }

  /**
   * Has Martha deal with a player that has climbed out of her well, once
   * she is done with those before it, unless she deals with it already or
   * it waits for her already.
   *
   * @param {number} id - The identifier of the player.
   */
  summon(id: number): void {
    if (id !== this.#targetId && !this.#queue.includes(id)) {
      this.#queue.push(id);
    }
  }

  /**
   * Moves Martha one step of the simulation forward.
   *
   * @param {readonly Suspect[]} players - The players of the village, where
   *   they stand now.
   * @returns {MarthaDeed[]} What she does to the players at this step: she
   *   strikes once in every thrust, partway through.
   */
  step(players: readonly Suspect[]): MarthaDeed[] {
    const deeds: MarthaDeed[] = [];
    this.#queue = this.#queue.filter((id: number) => {
      const player: Suspect | undefined = findSuspect(players, id);
      return player !== undefined && isInArea(player);
    });
    for (const player of players) {
      if (
        player.isHunted &&
        player.isAlive &&
        player.id !== this.#targetId &&
        !this.#queue.includes(player.id) &&
        measureDistance(player, this.#position) <= KIND.noticeRange &&
        isInArea(player)
      ) {
        this.#queue.push(player.id);
      }
    }
    if (this.#mode === 'sit') {
      if (--this.#sitSteps <= 0) {
        this.#health = KIND.health;
        this.#isArmed = true;
        this.#targetId = null;
        this.#startAction('Idle');
        this.#serveNext(players);
      }
      return deeds;
    }
    this.#cooldownSteps = Math.max(this.#cooldownSteps - 1, 0);
    if (this.#action === 'Attack') {
      this.#attackSteps++;
      if (this.#attackSteps >= ATTACK_STEPS) {
        this.#startAction('Idle');
      }
      if (this.#attackSteps === STRIKE_STEPS && this.#targetId !== null) {
        deeds.push({ type: 'strike', player: this.#targetId });
      }
      return deeds;
    }
    const target: Suspect | undefined =
      this.#targetId === null
        ? undefined
        : findSuspect(players, this.#targetId);
    switch (this.#mode) {
      case 'approach':
        this.#approach(target, players, deeds);
        break;
      case 'talk':
        this.#talk(target, players);
        break;
      case 'chase':
        this.#chase(target, players, deeds);
        break;
      default:
        if (this.#queue.length > 0) {
          this.#serveNext(players);
        } else if (this.#mode === 'return') {
          this.#goHome();
        } else {
          this.#startAction('Idle');
        }
    }
    return deeds;
  }

  /**
   * Takes a hit, which only the player she fights can deal.  With no
   * health left, she sits on the ground, beaten.
   *
   * @param {number} damage - The health the hit takes.
   * @param {number} attackerId - The identifier of the player that hit her.
   * @returns {number} The health she lost, which is none from anyone but
   *   the player she fights, and no more than she had.
   */
  takeHit(damage: number, attackerId: number): number {
    if (!this.isFightingWith(attackerId)) {
      return 0;
    }
    const lost: number = Math.min(damage, this.#health);
    this.#health -= lost;
    if (this.#health === 0) {
      this.#mode = 'sit';
      this.#sitSteps = SIT_STEPS;
      this.#isArmed = false;
      this.#path = null;
      this.#targetId = null;
      this.#startAction('Sit');
    }
    return lost;
  }

  /**
   * Walks up to the player she is to talk with, and opens a dialogue with
   * it once near enough.  She lets it go if it is gone, dead or out of her
   * area.
   *
   * @param {Suspect | undefined} target - The player, if it is in the
   *   village.
   * @param {readonly Suspect[]} players - The players.
   * @param {MarthaDeed[]} deeds - What she does at the step, which this
   *   adds to.
   */
  #approach(
    target: Suspect | undefined,
    players: readonly Suspect[],
    deeds: MarthaDeed[],
  ): void {
    if (target === undefined || !target.isAlive || !isInArea(target)) {
      this.#serveNext(players);
      return;
    }
    if (!this.#isArmed) {
      this.#fetchPitchfork();
      return;
    }
    if (measureDistance(target, this.#position) <= MARTHA_GREETING_DISTANCE) {
      this.#face(target);
      this.#path = null;
      this.#mode = 'talk';
      this.#startAction('Idle');
      deeds.push({ type: 'greet', player: target.id });
      return;
    }
    this.#follow(target, players);
  }

  /**
   * Stands facing the player she talks with, and fights it once the
   * dialogue is over.  She lets it go if it is gone or dead.
   *
   * @param {Suspect | undefined} target - The player, if it is in the
   *   village.
   * @param {readonly Suspect[]} players - The players.
   */
  #talk(target: Suspect | undefined, players: readonly Suspect[]): void {
    if (target?.isAlive !== true) {
      this.#serveNext(players);
      return;
    }
    this.#face(target);
    if (!target.isInDialogue) {
      this.#mode = 'chase';
      this.#path = null;
      this.#repathSteps = 0;
    }
  }

  /**
   * Chases the player she fights, around the obstacles, and thrusts at it
   * once near enough.  She gives up if it is gone, and hunts it from then
   * on if it is dead or out of her area.
   *
   * @param {Suspect | undefined} target - The player, if it is in the
   *   village.
   * @param {readonly Suspect[]} players - The players.
   * @param {MarthaDeed[]} deeds - What she does at the step, which this
   *   adds to.
   */
  #chase(
    target: Suspect | undefined,
    players: readonly Suspect[],
    deeds: MarthaDeed[],
  ): void {
    if (target === undefined) {
      this.#serveNext(players);
      return;
    }
    if (!target.isAlive || !isInArea(target)) {
      deeds.push({ type: 'hunt', player: target.id });
      this.#serveNext(players);
      return;
    }
    if (!this.#isArmed) {
      this.#fetchPitchfork();
      return;
    }
    if (measureDistance(target, this.#position) <= MARTHA_ATTACK_DISTANCE) {
      this.#face(target);
      this.#path = null;
      if (this.#cooldownSteps === 0) {
        this.#attackSteps = 0;
        this.#cooldownSteps = THRUST_INTERVAL_STEPS;
        this.#startAction('Attack', true);
      } else {
        this.#startAction('Idle');
      }
      return;
    }
    this.#follow(target, players);
  }

  /**
   * Walks one step on the way to a player, finding the way again now and
   * then, as the player moves.  She lets the player go if she finds no
   * way to it.
   *
   * @param {Suspect} target - The player.
   * @param {readonly Suspect[]} players - The players.
   */
  #follow(target: Suspect, players: readonly Suspect[]): void {
    if (this.#path === null || --this.#repathSteps <= 0) {
      this.#path = findMapPath('village', this.#position, target);
      this.#repathSteps = REPATH_STEPS;
      if (this.#path === null) {
        this.#serveNext(players);
        return;
      }
    }
    if (this.#walk() !== 'walking') {
      this.#path = null;
    }
  }

  /**
   * Turns to the next player waiting for her, if any, to walk up to it, or
   * to fight it at once if she hunts it, or else sets out for home, at
   * full health either way.
   *
   * @param {readonly Suspect[]} players - The players.
   */
  #serveNext(players: readonly Suspect[]): void {
    this.#health = KIND.health;
    this.#path = null;
    this.#repathSteps = 0;
    for (;;) {
      const id: number | undefined = this.#queue.shift();
      if (id === undefined) {
        break;
      }
      const next: Suspect | undefined = findSuspect(players, id);
      if (next === undefined) {
        continue;
      }
      this.#targetId = id;
      this.#mode = next.isHunted ? 'chase' : 'approach';
      return;
    }
    this.#targetId = null;
    this.#mode = 'return';
    this.#goHome();
  }

  /**
   * Walks to the pitchfork against the wall of her house, and takes it up
   * once there, or once she finds no way there.
   */
  #fetchPitchfork(): void {
    if (this.#walkTo(PITCHFORK_STAND) !== 'walking') {
      this.#isArmed = true;
      this.#path = null;
      this.#repathSteps = 0;
    }
  }

  /**
   * Walks back home, by way of the wall of her house to lean her pitchfork
   * against it if she holds it, and stands there once there, or once she
   * finds no way.
   */
  #goHome(): void {
    if (this.#isArmed) {
      if (this.#walkTo(PITCHFORK_STAND) !== 'walking') {
        this.#isArmed = false;
        this.#path = null;
      }
      return;
    }
    if (this.#walkTo(MARTHA_HOME) !== 'walking') {
      this.#settle();
    }
  }

  /**
   * Walks one step towards a point, around the obstacles, finding the way
   * there whenever she has none, or is stopped.
   *
   * @param {GroundVector} point - The point.
   * @returns {'walking' | 'arrived' | 'lost'} Whether she walks on, is
   *   there, or finds no way there.
   */
  #walkTo(point: GroundVector): 'walking' | 'arrived' | 'lost' {
    if (measureDistance(point, this.#position) === 0) {
      return 'arrived';
    }
    this.#path ??= findMapPath('village', this.#position, point);
    if (this.#path === null) {
      return 'lost';
    }
    const outcome: string = this.#walk();
    if (outcome === 'stopped') {
      this.#path = null;
    }
    return outcome === 'arrived' ? 'arrived' : 'walking';
  }

  /** Stands idling where she is, facing as she does at home if there. */
  #settle(): void {
    this.#mode = 'idle';
    this.#path = null;
    if (measureDistance(this.#position, MARTHA_HOME) === 0) {
      this.#yaw = MARTHA_HOME.yaw;
    }
    this.#startAction('Idle');
  }

  /**
   * Turns to face a player.
   *
   * @param {GroundVector} target - Where the player stands.
   */
  #face(target: GroundVector): void {
    if (measureDistance(target, this.#position) > 0) {
      this.#yaw = findYaw({
        x: target.x - this.#position.x,
        z: target.z - this.#position.z,
      });
    }
  }

  /**
   * Walks one step along her way, around the obstacles, at the speed she
   * chases at.
   *
   * @returns {'walking' | 'arrived' | 'stopped'} Whether she walks on, has
   *   got to the end of her way, or has nowhere to go: no way, or an
   *   obstacle that stops her.
   */
  #walk(): 'walking' | 'arrived' | 'stopped' {
    const next: GroundVector | undefined = this.#path?.[0];
    if (next === undefined) {
      return 'stopped';
    }
    const reach: number = KIND.chaseSpeed / SIMULATION_RATE;
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
    this.#startAction('Walk');
    return this.#path?.length === 0 ? 'arrived' : 'walking';
  }

  /**
   * Makes Martha do something, unless she is doing just that already.
   *
   * @param {MonsterAction} action - What she does from now on.
   * @param {boolean} [isAgain] - Whether to start it over even if she is
   *   doing just that already.  Not by default.
   */
  #startAction(action: MonsterAction, isAgain = false): void {
    if (this.#action !== action || isAgain) {
      this.#action = action;
      this.#actionCount++;
    }
  }
}

/**
 * Finds a player among the players.
 *
 * @param {readonly Suspect[]} players - The players.
 * @param {number} id - The identifier of the player.
 * @returns {Suspect | undefined} The player, if it is among them.
 */
function findSuspect(
  players: readonly Suspect[],
  id: number,
): Suspect | undefined {
  return players.find((player: Suspect) => player.id === id);
}
