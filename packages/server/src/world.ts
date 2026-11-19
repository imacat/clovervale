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
  FOUNTAIN_HEALING,
  PLAYER_HEALTH,
  SIMULATION_RATE,
  SLASH_DAMAGE,
  SLASH_REACH,
  SPAWN_POINT_COUNT,
  SPAWN_YAW,
  createMotion,
  findSpawnPoint,
  interpolatePlaced,
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
  SlashJudgement,
  StampedInput,
} from '@clovervale/shared';

import {
  MONSTER_ATTACK_DAMAGE,
  MONSTER_ATTACK_REACH,
  MONSTER_ID,
  Monster,
} from './monster.ts';

/**
 * The furthest back on the clock of the server a slash can be judged on
 * the world as its peer showed it, in milliseconds.  A slash that names an
 * earlier time is judged on the world as it was this long before it.
 */
export const LAG_COMPENSATION_LIMIT = 1000;

/** The least distance between a new player and everyone else, in metres. */
const SPAWN_CLEARANCE = 1;

/** How long one step of the simulation lasts, in milliseconds. */
const STEP_MILLISECONDS: number = 1000 / SIMULATION_RATE;

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
  /** The latest slash of the player, as judged, or `null` before its first. */
  lastSlash: SlashJudgement | null;
}

/** The monsters at one moment, as a snapshot then told them. */
interface MonstersRecord {
  /** The time on the clock of the server, in milliseconds. */
  readonly time: number;
  /** The monsters that were to be seen. */
  readonly monsters: readonly MonsterState[];
}

/** A player whose slash starts at a step, to be judged. */
interface Slasher {
  /** The player. */
  readonly player: Player;
  /**
   * The time on the clock of the server the slash names to be judged on,
   * if it names one.
   */
  readonly viewTime: number | undefined;
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
  #history: MonstersRecord[] = [];

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
      lastSlash: null,
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
   * makes it slash, drink from the fountain or talk to a villager, as the
   * rules tell from where it stands and which way it faces then, unless it
   * is doing any of them already or dead.  Either input shows from the
   * step at which it comes into effect: no sooner than the next one, and no
   * sooner than the player has taken as many steps since its previous input
   * came into effect as the input tells.
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
   * Toby runs his course, as the number of the step tells, and pushes
   * every living player in his way aside.  A player that slashes, drinks
   * from the fountain or talks to a villager stands still, without turning,
   * for as long as that lasts.  Any other player that wants to move walks
   * that way, facing it, and idles otherwise; Toby stands in its way as the
   * obstacles do.  The monster goes about its business, and pays Toby no
   * heed.
   *
   * A drink that starts at the step gives the player back
   * {@link FOUNTAIN_HEALING} health at once, or as much as it lacks of its
   * full health if that is less, which is an event unless it is none.  A
   * drink is never judged on the world as its peer showed it, so the time
   * its interaction names, if any, does not matter.  A talk changes nothing
   * else in the world, and is never judged either.
   *
   * Then the strikes are judged.  A slash that starts at the step hits the
   * monster if the monster is alive, and was alive, in front of the player
   * and within reach in the world at the time the slash names.  That is the
   * world as the snapshots recorded told it, and between two of them, as a
   * peer shows it between two snapshots; after the latest of them, the
   * world after the step counts as one more of them.  The time is no
   * earlier than {@link LAG_COMPENSATION_LIMIT} milliseconds before the
   * step and no later than the step: an earlier or later time counts as the
   * nearest of these, and a slash that names no time is judged on the world
   * as it is after the step.  The player itself stands where it does after
   * the step.  How each slash was judged is kept for its player.  A strike
   * of the monster hits every player alive in front of it and within its
   * reach after the step.  The players cannot hurt each other.  Every hit
   * is an event.
   *
   * A player with no health left dies, and lies where it fell for
   * {@link DEATH_DURATION} seconds, neither moving, turning nor interacting,
   * neither hurt nor chased by the monster, though its inputs still change
   * the way it wants to move.  Then it comes back at a spawn point, at full
   * health, idling but wanting to move the way it does by then.
   */
  step(): void {
    this.#stepCount++;
    const slashers: Slasher[] = [];
    for (const player of this.#players.values()) {
      const before: PlayerMotion = player.mover.motion;
      const applied: StampedInput[] = player.mover.step(this.#stepCount);
      const after: PlayerMotion = player.mover.motion;
      const isStarted: boolean = after.actionCount !== before.actionCount;
      if (isStarted && after.action === 'Drink') {
        this.#healPlayer(player, FOUNTAIN_HEALING);
      }
      if (isStarted && after.action === 'Slash') {
        const interaction: StampedInput | undefined = applied.findLast(
          (input: StampedInput) => input.type === 'interact',
        );
        const viewTime: number | undefined =
          interaction?.type === 'interact' ? interaction.viewTime : undefined;
        slashers.push({ player, viewTime });
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
    for (const slasher of slashers) {
      this.#judgeSlash(slasher);
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
   * Records the monsters as a snapshot taken now tells them, for the slashes
   * to be judged on the world as a peer showed it.
   *
   * Only as many records are kept as it takes to judge a slash on the world
   * up to {@link LAG_COMPENSATION_LIMIT} milliseconds before any later step.
   */
  recordSnapshot(): void {
    const time: number = this.#stepCount * STEP_MILLISECONDS;
    if (this.#history.at(-1)?.time === time) {
      this.#history.pop();
    }
    this.#history.push({ time, monsters: this.listMonsters() });
    const earliest: number = time - LAG_COMPENSATION_LIMIT;
    while ((this.#history[1]?.time ?? Infinity) <= earliest) {
      this.#history.shift();
    }
  }

  /**
   * Tells how the latest slash of a player was judged.
   *
   * @param {number} id - The identifier of the player.
   * @returns {SlashJudgement | null} How it was judged, or `null` if the
   *   player has not slashed yet, or is not in the world.
   */
  findSlash(id: number): SlashJudgement | null {
    return this.#players.get(id)?.lastSlash ?? null;
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
   * Judges a slash that starts at this step, and keeps how it was judged
   * for its player.
   *
   * @param {Slasher} slasher - The player that slashes, and the time the
   *   slash names.
   */
  #judgeSlash({ player, viewTime }: Slasher): void {
    const now: number = this.#stepCount * STEP_MILLISECONDS;
    const time: number =
      viewTime === undefined || !Number.isFinite(viewTime)
        ? now
        : Math.min(Math.max(viewTime, now - LAG_COMPENSATION_LIMIT), now);
    const target: MonsterState | undefined = this.#findMonstersAt(
      time,
      now,
    ).find((monster: MonsterState) => monster.id === MONSTER_ID);
    const isHit: boolean =
      this.#monster.isAlive &&
      target !== undefined &&
      target.mode !== 'dead' &&
      isWithinStrike(player.mover.motion, target, SLASH_REACH);
    player.lastSlash = { step: this.#stepCount, rewind: now - time, isHit };
    if (isHit) {
      const damage: number = this.#monster.takeHit(SLASH_DAMAGE, player.id);
      this.#recordHit({ kind: 'player', id: player.id }, MONSTER_REF, damage);
    }
  }

  /**
   * Finds the monsters as they were at a time, as the snapshots recorded
   * told them, and between two of them as a peer shows them, with the
   * monsters as they are now as one more record after the latest.
   *
   * @param {number} time - The time on the clock of the server, in
   *   milliseconds, no later than now.
   * @param {number} now - The time of the current step, in milliseconds.
   * @returns {readonly MonsterState[]} The monsters that were to be seen
   *   then, which are none before the earliest record.
   */
  #findMonstersAt(time: number, now: number): readonly MonsterState[] {
    const records: MonstersRecord[] = [
      ...this.#history.filter((record: MonstersRecord) => record.time < now),
      { time: now, monsters: this.listMonsters() },
    ];
    const index: number = records.findLastIndex(
      (record: MonstersRecord) => record.time <= time,
    );
    const before: MonstersRecord | undefined = records[index];
    const after: MonstersRecord | undefined = records[index + 1];
    if (before === undefined) {
      return [];
    }
    if (after === undefined) {
      return before.monsters;
    }
    const span: number = after.time - before.time;
    return interpolatePlaced(
      before.monsters,
      after.monsters,
      (time - before.time) / span,
      span,
    );
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
   * Gives a player health back, as much as it lacks of its full health at
   * most, and records it as an event unless it is none.
   *
   * @param {Player} player - The player.
   * @param {number} amount - The health to give back.
   */
  #healPlayer(player: Player, amount: number): void {
    const gained: number = Math.min(amount, PLAYER_HEALTH - player.health);
    if (gained <= 0) {
      return;
    }
    player.health += gained;
    this.#events.push({
      type: 'heal',
      id: ++this.#lastEventId,
      step: this.#stepCount,
      target: { kind: 'player', id: player.id },
      amount: gained,
    });
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
