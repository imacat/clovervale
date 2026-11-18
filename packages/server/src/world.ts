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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/17
// AI assistance: Claude Code (Anthropic)

/**
 * @module server/world The world the server simulates, its players and its
 *   monster.
 */

import {
  APPEARANCE_COUNT,
  AuthoritativePlayer,
  DEATH_DURATION,
  PLAYER_HEALTH,
  SIMULATION_RATE,
  SLASH_DAMAGE,
  SLASH_REACH,
  SPAWN_POINT_COUNT,
  SPAWN_YAW,
  createMotion,
  findSpawnPoint,
  isWithinStrike,
} from '@clovervale/shared';
import type {
  EntityRef,
  GameEvent,
  GroundVector,
  InputProgress,
  MonsterState,
  PlayerMotion,
  PlayerState,
  StampedInput,
} from '@clovervale/shared';

import {
  MONSTER_ATTACK_DAMAGE,
  MONSTER_ATTACK_REACH,
  MONSTER_ID,
  Monster,
} from './monster.ts';

/** The least distance between a new player and everyone else, in metres. */
const SPAWN_CLEARANCE = 1;

/** The number of simulation steps a dead player lies where it fell. */
const DEATH_STEPS: number = Math.round(DEATH_DURATION * SIMULATION_RATE);

/** A player in the world. */
interface Player {
  /** The identifier of the player. */
  readonly id: number;
  /** The number of the appearance of the player, from 1. */
  readonly appearance: number;
  /** The player as the inputs of its peer move it. */
  readonly mover: AuthoritativePlayer;
  /** The health of the player. */
  health: number;
  /**
   * The number of steps the player is still to lie dead for, or 0 while it
   * is alive.
   */
  deathSteps: number;
}

/** The monster, as the events tell of it. */
const MONSTER_REF: EntityRef = { kind: 'monster', id: MONSTER_ID };

/** The world the server simulates. */
export class World {
  readonly #players = new Map<number, Player>();
  readonly #monster: Monster;
  #lastId = 0;
  #stepCount = 0;
  #events: GameEvent[] = [];
  #lastEventId = 0;

  /**
   * Starts a world without players, with the monster idling at its home.
   *
   * @param {() => number} [drawRandom] - Gives a random number from 0 up to
   *   but not including 1, for what the monster does.  `Math.random` by
   *   default.
   */
  constructor(drawRandom: () => number = Math.random) {
    this.#monster = new Monster(drawRandom);
  }

  /**
   * Lets a new player into the world.
   *
   * The player gets an identifier no player has had before, the appearance
   * the fewest players have (the lowest-numbered one if several tie), and a
   * place on the plaza clear of the obstacles and, while there is room, of
   * everyone else, where it idles facing the fountain, at full health.
   *
   * @returns {PlayerState} The new player.
   */
  addPlayer(): PlayerState {
    const player: Player = {
      id: ++this.#lastId,
      appearance: this.#chooseAppearance(),
      mover: new AuthoritativePlayer(
        createMotion(this.#chooseSpawnPoint(), SPAWN_YAW),
      ),
      health: PLAYER_HEALTH,
      deathSteps: 0,
    };
    this.#players.set(player.id, player);
    return describePlayer(player);
  }

  /**
   * Takes a player out of the world.
   *
   * @param {number} id - The identifier of the player.
   */
  removePlayer(id: number): void {
    this.#players.delete(id);
  }

  /**
   * Receives an input of a player from its peer.
   *
   * A move changes the way the player wants to move, and an interaction
   * makes it slash, unless it is slashing already or dead.  Either shows
   * from the step at which the input comes into effect: no sooner than the
   * next one, and no sooner than the player has taken as many steps since
   * its previous input came into effect as the input tells.
   *
   * @param {number} id - The identifier of the player.
   * @param {StampedInput} input - The input.
   * @returns {boolean} Whether the input was accepted.  It is not if the
   *   player is not in the world, if the number of the input is no higher
   *   than that of the input before it, or if too many inputs of the
   *   player are waiting to come into effect.
   */
  receiveInput(id: number, input: StampedInput): boolean {
    return this.#players.get(id)?.mover.receiveInput(input) ?? false;
  }

  /**
   * Moves the world one step of the simulation forward.
   *
   * A player that slashes stands still, without turning, for as long as a
   * slash lasts.  Any other player that wants to move walks that way, facing
   * it, and idles otherwise.  The monster goes about its business.
   *
   * Then the strikes are judged on where everyone stands after the step.  A
   * slash that starts at the step hits the monster if it is alive, in front
   * of the player and within reach, and a strike of the monster hits every
   * player alive in front of it and within its reach.  The players cannot
   * hurt each other.  Every hit is an event.
   *
   * A player with no health left dies, and lies where it fell for
   * {@link DEATH_DURATION} seconds, neither moving, turning nor slashing,
   * neither hurt nor chased by the monster, though its inputs still change
   * the way it wants to move.  Then it comes back at a spawn point, at full
   * health, idling but wanting to move the way it does by then.
   */
  step(): void {
    this.#stepCount++;
    const slashers: Player[] = [];
    for (const player of this.#players.values()) {
      const before: PlayerMotion = player.mover.motion;
      player.mover.step();
      const after: PlayerMotion = player.mover.motion;
      if (
        after.action === 'Slash' &&
        after.actionCount !== before.actionCount
      ) {
        slashers.push(player);
      }
      if (player.deathSteps > 0 && --player.deathSteps === 0) {
        player.mover.relocate(this.#chooseSpawnPoint(), SPAWN_YAW);
        player.health = PLAYER_HEALTH;
      }
    }
    const living: Player[] = [...this.#players.values()].filter(
      (player: Player) => player.deathSteps === 0,
    );
    const isStriking: boolean = this.#monster.step(
      living.map(({ id, mover }: Player) => ({
        id,
        x: mover.motion.x,
        z: mover.motion.z,
      })),
    );
    for (const player of slashers) {
      if (
        this.#monster.isAlive &&
        isWithinStrike(player.mover.motion, this.#monster.pose, SLASH_REACH)
      ) {
        const damage: number = this.#monster.takeHit(SLASH_DAMAGE, player.id);
        this.#recordHit({ kind: 'player', id: player.id }, MONSTER_REF, damage);
      }
    }
    if (isStriking && this.#monster.isAlive) {
      for (const player of living) {
        if (
          isWithinStrike(
            this.#monster.pose,
            player.mover.motion,
            MONSTER_ATTACK_REACH,
          )
        ) {
          this.#hurtPlayer(player, MONSTER_ATTACK_DAMAGE);
        }
      }
    }
  }

  /**
   * Takes the events that have happened since they were last taken.
   *
   * @returns {GameEvent[]} The events, in the order they happened, each
   *   taken only once.
   */
  takeEvents(): GameEvent[] {
    const events: GameEvent[] = this.#events;
    this.#events = [];
    return events;
  }

  /**
   * Tells how far a player has got with the inputs of its peer.
   *
   * @param {number} id - The identifier of the player.
   * @returns {InputProgress | null} The progress, or `null` if the player
   *   is not in the world.
   */
  findProgress(id: number): InputProgress | null {
    return this.#players.get(id)?.mover.progress ?? null;
  }

  /**
   * Lists every player in the world as it is now.
   *
   * @returns {PlayerState[]} The players, in the order they came in.
   */
  listPlayers(): PlayerState[] {
    return [...this.#players.values()].map(describePlayer);
  }

  /**
   * Lists every monster in the world that is to be seen as it is now.
   *
   * @returns {MonsterState[]} The monsters, which leave out a monster that
   *   has been dead for so long that it is gone.
   */
  listMonsters(): MonsterState[] {
    const state: MonsterState | null = this.#monster.state;
    return state === null ? [] : [state];
  }

  /**
   * Has the monster hurt a player, which dies if that leaves it no
   * health.
   *
   * @param {Player} player - The player.
   * @param {number} damage - The health the hit takes.
   */
  #hurtPlayer(player: Player, damage: number): void {
    const lost: number = Math.min(damage, player.health);
    player.health -= lost;
    this.#recordHit(MONSTER_REF, { kind: 'player', id: player.id }, lost);
    if (player.health === 0) {
      player.mover.kill();
      player.deathSteps = DEATH_STEPS;
    }
  }

  /**
   * Records a hit as an event.
   *
   * @param {EntityRef} attacker - Who struck.
   * @param {EntityRef} target - Who was struck.
   * @param {number} damage - The health the target lost.
   */
  #recordHit(attacker: EntityRef, target: EntityRef, damage: number): void {
    this.#events.push({
      type: 'hit',
      id: ++this.#lastEventId,
      step: this.#stepCount,
      attacker,
      target,
      damage,
    });
  }

  /**
   * Chooses the appearance of a new player.
   *
   * @returns {number} The number of the appearance, from 1.
   */
  #chooseAppearance(): number {
    const uses: number[] = new Array<number>(APPEARANCE_COUNT).fill(0);
    for (const player of this.#players.values()) {
      uses[player.appearance - 1] = (uses[player.appearance - 1] ?? 0) + 1;
    }
    return uses.indexOf(Math.min(...uses)) + 1;
  }

  /**
   * Chooses where a new player comes into the world.
   *
   * @returns {GroundVector} The first spawn point clear of every player, or
   *   if there is none, a spawn point by turns, as the players do not stand
   *   in the way of each other.
   */
  #chooseSpawnPoint(): GroundVector {
    for (let index = 0; index < SPAWN_POINT_COUNT; index++) {
      const point: GroundVector = findSpawnPoint(index);
      const isClear: boolean = [...this.#players.values()].every(
        ({ mover }: Player) =>
          Math.hypot(mover.motion.x - point.x, mover.motion.z - point.z) >=
          SPAWN_CLEARANCE,
      );
      if (isClear) {
        return point;
      }
    }
    return findSpawnPoint(this.#lastId % SPAWN_POINT_COUNT);
  }
}

/**
 * Describes a player as it is now.
 *
 * @param {Player} player - The player.
 * @returns {PlayerState} The state of the player.
 */
function describePlayer(player: Player): PlayerState {
  const { x, z, yaw, action, actionCount } = player.mover.motion;
  const { id, appearance, health } = player;
  return { id, appearance, x, z, yaw, action, actionCount, health };
}
