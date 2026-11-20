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
 * @module server/world A world the server simulates, in one map, with its
 *   players, its monsters, its items and its containers.
 */

import {
  APPEARANCE_COUNT,
  AuthoritativePlayer,
  CLOVER_PATCHES,
  CLOVER_REGROW_DURATION,
  DEATH_DURATION,
  FOUNTAIN_HEALING,
  GROUND_ITEM_DURATION,
  PLAYER_HEALTH,
  SIMULATION_RATE,
  SLASH_DAMAGE,
  SLASH_REACH,
  SPAWN_POINT_COUNT,
  SPAWN_YAW,
  canInteract,
  createMotion,
  findPassage,
  findPickTarget,
  findSpawnPoint,
  hasRoom,
  interpolatePlaced,
  isWithinStrike,
} from '@clovervale/shared';
import type {
  EntityRef,
  GameEvent,
  GroundItem,
  GroundVector,
  InputProgress,
  ItemKindId,
  MapId,
  MonsterState,
  Passage,
  PickTarget,
  PlayerMotion,
  PlayerState,
  Pose,
  SlashJudgement,
  StampedInput,
  WorldItems,
} from '@clovervale/shared';

import { MONSTER_ATTACK_REACH, MONSTER_SPAWNS, Monster } from './monster.ts';
import type { MonsterSpawn, Quarry } from './monster.ts';

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

/** The number of simulation steps a picked patch of clover takes to regrow. */
const REGROW_STEPS: number = Math.round(
  CLOVER_REGROW_DURATION * SIMULATION_RATE,
);

/** The number of simulation steps an item put down lies on the ground. */
const GROUND_ITEM_STEPS: number = Math.round(
  GROUND_ITEM_DURATION * SIMULATION_RATE,
);

/** The number of decimal places the place of an item put down keeps. */
const ITEM_PLACE_PRECISION = 2;

/**
 * A player in a world, with everything it takes along from one world into
 * another.
 */
export interface Player {
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
  /** The items the player carries, in the order of the slots they fill. */
  readonly inventory: ItemKindId[];
}

/** An item that lies on the ground, and until when. */
interface LyingItem {
  /** The item. */
  readonly item: GroundItem;
  /** The number of the step at which the item is gone. */
  readonly goneStep: number;
}

/** A player that has left a world for a world of another map. */
export interface Departure {
  /** The player. */
  readonly player: Player;
  /** The map of the world it is to go into. */
  readonly destination: MapId;
  /**
   * Where it is to stand there, and which way it is to face, or `null` for
   * a spawn point on the plaza of the village.
   */
  readonly arrival: Pose | null;
}

/** The map a world is of, the step it starts at, and its monsters. */
export interface WorldOptions {
  /** The map of the world, the village by default. */
  readonly map?: MapId;
  /**
   * The monsters of the world, numbered from 1 in this order, those
   * {@link MONSTER_SPAWNS} tells of its map by default.
   */
  readonly monsters?: readonly MonsterSpawn[];
  /**
   * The number of simulation steps the server has taken when the world
   * starts, which the world goes on counting from, 0 by default.
   */
  readonly step?: number;
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

/**
 * Tells of a monster as the events do.
 *
 * @param {Monster} monster - The monster.
 * @returns {EntityRef} Who the monster is.
 */
function referToMonster(monster: Monster): EntityRef {
  return { kind: 'monster', id: monster.id };
}

/**
 * A world the server simulates, in one map: the village, with its wild
 * dog and its clover, or a cave, with its two wild dogs, its chests and
 * barrels full, and nobody else in it but its player and the prisoner
 * behind the bars of his cell.
 */
export class World {
  readonly #map: MapId;
  readonly #players = new Map<number, Player>();
  readonly #monsters: readonly Monster[];
  #lastId = 0;
  #stepCount: number;
  #departures: Departure[] = [];
  #events: GameEvent[] = [];
  #lastEventId = 0;
  #history: MonstersRecord[] = [];
  /**
   * The number of the step at which each patch of clover has its clover
   * again, by the number of the patch, which is no later than the current
   * step while it has it.
   */
  readonly #regrowSteps: number[];
  #lyingItems: LyingItem[] = [];
  #lastItemId = 0;
  /** The numbers of the containers of the cave that have been looted. */
  readonly #looted = new Set<number>();

  /**
   * Starts a world without players and with nothing on the ground, with
   * every monster idling at its home at full health: in the village, with
   * a four-leaved clover in every patch of clover, and in a cave, with
   * every chest and barrel holding what it holds.
   *
   * @param {() => number} [drawRandom] - Gives a random number from 0 up to
   *   but not including 1, for what the monsters do.  `Math.random` by
   *   default.
   * @param {WorldOptions} [options] - The map of the world, the step it
   *   starts at, and its monsters.
   */
  constructor(
    drawRandom: () => number = Math.random,
    { map = 'village', step = 0, monsters }: WorldOptions = {},
  ) {
    this.#map = map;
    this.#stepCount = step;
    this.#monsters = (monsters ?? MONSTER_SPAWNS[map]).map(
      (spawn: MonsterSpawn, index: number) =>
        new Monster(index + 1, map, spawn, drawRandom),
    );
    this.#regrowSteps =
      map === 'village' ? CLOVER_PATCHES.map(() => 0) : [];
  }

  /**
   * The map of the world.
   *
   * @returns {MapId} The map.
   */
  get map(): MapId {
    return this.#map;
  }

  /**
   * Lets a new player into the world.
   *
   * The player gets an identifier no player of the world has had before,
   * the appearance the fewest players have, here and elsewhere (the
   * lowest-numbered one if several tie), and a place on the plaza clear of
   * the obstacles and, while there is room, of everyone else, where it
   * idles facing the fountain, at full health, and carrying nothing.
   *
   * @param {readonly number[]} [elsewhere] - The appearances of the players
   *   in other worlds, none by default.
   * @returns {PlayerState} The new player.
   */
  addPlayer(elsewhere: readonly number[] = []): PlayerState {
    const player: Player = {
      id: ++this.#lastId,
      appearance: this.#chooseAppearance(elsewhere),
      mover: new AuthoritativePlayer(
        createMotion(this.#chooseSpawnPoint(), SPAWN_YAW),
      ),
      health: PLAYER_HEALTH,
      deathSteps: 0,
      lastSlash: null,
      inventory: [],
    };
    this.#players.set(player.id, player);
    return describePlayer(player);
  }

  /**
   * Takes a player out of the world, with whatever it carries.
   *
   * @param {number} id - The identifier of the player.
   */
  removePlayer(id: number): void {
    this.#players.delete(id);
  }

  /**
   * Brings a player from another world into this one, with its health,
   * what it carries and the inputs of its peer still to come.  It stops
   * whatever it was doing and idles where it arrives, but still wants to
   * move the way it did.
   *
   * @param {Player} player - The player, as it left the other world.
   * @param {Pose | null} arrival - Where it is to stand, and which way it
   *   is to face, or `null` for where a new player would, facing the
   *   fountain.
   */
  admitPlayer(player: Player, arrival: Pose | null): void {
    if (arrival === null) {
      player.mover.relocate(this.#chooseSpawnPoint(), SPAWN_YAW);
    } else {
      player.mover.relocate(arrival, arrival.yaw);
    }
    this.#players.set(player.id, player);
  }

  /**
   * Takes the players that have left the world for a world of another map
   * since they were last taken.
   *
   * @returns {Departure[]} The players, each taken only once, with where
   *   they are to go.
   */
  takeDepartures(): Departure[] {
    const departures: Departure[] = this.#departures;
    this.#departures = [];
    return departures;
  }

  /**
   * Receives an input of a player from its peer.
   *
   * A move changes the way the player wants to move, and an interaction
   * makes it slash, drink from the fountain or talk to a villager, as the
   * rules tell from where it stands and which way it faces then, unless it
   * is doing any of them already or dead.  A pick or a put-down changes
   * what the player carries, as a step of the world tells.  Any input shows
   * from the step at which it comes into effect: no sooner than the next
   * one, and no sooner than the player has taken as many steps since its
   * previous input came into effect as the input tells.
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
   * In the village, Toby runs his course, as the number of the step tells,
   * and pushes every living player in his way aside.  A player that
   * slashes, drinks from the fountain or talks to a villager stands still,
   * without turning, for as long as that lasts.  Any other player that
   * wants to move walks that way, facing it, and idles otherwise, on the
   * ground of the map of the world; Toby stands in its way as the obstacles
   * do.  Each monster goes about its business, as the numbers of its kind
   * tell, and pays Toby no heed.
   *
   * A drink that starts at the step gives the player back
   * {@link FOUNTAIN_HEALING} health at once, or as much as it lacks of its
   * full health if that is less, which is an event unless it is none.  A
   * drink is never judged on the world as its peer showed it, so the time
   * its interaction names, if any, does not matter.  A talk changes nothing
   * else in the world, and is never judged either.
   *
   * Then the strikes are judged.  A slash that starts at the step hits
   * every monster that is alive, and was alive, in front of the player and
   * within reach in the world at the time the slash names, each by where
   * that monster was then.  That is the
   * world as the snapshots recorded told it, and between two of them, as a
   * peer shows it between two snapshots; after the latest of them, the
   * world after the step counts as one more of them.  The time is no
   * earlier than {@link LAG_COMPENSATION_LIMIT} milliseconds before the
   * step and no later than the step: an earlier or later time counts as the
   * nearest of these, and a slash that names no time is judged on the world
   * as it is after the step.  The player itself stands where it does after
   * the step.  How each slash was judged is kept for its player: as a hit
   * if it hit any monster.  A strike of a living monster hits every player
   * alive in front of it and within its reach after the step, for the bite
   * damage of its kind; a player killed by one strike is not hit by
   * another.  The players cannot hurt each other.  Every hit is an event,
   * which names the monster by its identifier.
   *
   * A player with no health left dies, and lies where it fell for
   * {@link DEATH_DURATION} seconds, neither moving, turning, interacting,
   * picking nor putting down, neither hurt nor chased by the monsters,
   * though its inputs still change the way it wants to move.  Then it comes
   * back at a spawn point, at full health, idling but wanting to move the
   * way it does by then, and carrying what it carried: in the village, at
   * once, and from a cave, by leaving it for the village.
   *
   * A travel that comes into effect at the step, while the player could
   * start to interact, takes the player out of the world, if
   * {@link findPassage} finds a way within its reach from where it stands
   * after the step, with the monsters as they were before the step: it
   * leaves for a world of the map the way leads into, to arrive where the
   * way leads.  A player that leaves is neither struck nor judged at the
   * step.
   *
   * A pick that comes into effect at the step, while the player could start
   * to interact, gets the player what {@link findPickTarget} finds within
   * its reach, from where it stands after the step, if its inventory has
   * room for it.  A four-leaved clover so picked from a patch is gone from
   * the patch until it regrows {@link CLOVER_REGROW_DURATION} seconds
   * later, an item picked up from the ground is gone from there, and a
   * chest or a barrel in the cave so looted holds nothing from then on.  A
   * container that holds nothing gives nothing, whether or not the
   * inventory has room.  The
   * picks are judged player by player, in the order the players came in, so
   * that of two players who pick the same thing at the same step, the one
   * who came in first gets it, and the other gets nothing.  A put-down that
   * comes into effect at the step, while the player is alive, takes the
   * item out of the slot of the inventory of the player it names, the items
   * after it closing up, and lays it on the ground where the player stands
   * after the step, where it lies for {@link GROUND_ITEM_DURATION} seconds
   * and is then gone.  A put-down that names an empty slot, or one the
   * inventory does not have, does nothing.  Picking and putting down
   * neither move the player nor change what it is doing.
   */
  step(): void {
    this.#stepCount++;
    this.#lyingItems = this.#lyingItems.filter(
      (lying: LyingItem) => lying.goneStep > this.#stepCount,
    );
    const slashers: Slasher[] = [];
    const monsters: MonsterState[] = this.listMonsters();
    const leaving = new Set<Player>();
    for (const player of this.#players.values()) {
      const before: PlayerMotion = player.mover.motion;
      const applied: StampedInput[] = player.mover.step(
        this.#stepCount,
        this.#map,
      );
      const after: PlayerMotion = player.mover.motion;
      for (const input of applied) {
        if (input.type === 'pick' && canInteract(before)) {
          this.#pickItem(player);
        }
        if (input.type === 'drop' && before.action !== 'Die') {
          this.#dropItem(player, input.slot);
        }
        const passage: Passage | null =
          input.type === 'travel' && canInteract(before) && !leaving.has(player)
            ? findPassage(after, this.#stepCount, this.#map, monsters)
            : null;
        if (passage !== null) {
          leaving.add(player);
          this.#departures.push({
            player,
            destination: passage.destination,
            arrival: passage.arrival,
          });
        }
      }
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
        player.health = PLAYER_HEALTH;
        if (this.#map === 'village') {
          player.mover.relocate(this.#chooseSpawnPoint(), SPAWN_YAW);
        } else {
          leaving.add(player);
          this.#departures.push({
            player,
            destination: 'village',
            arrival: null,
          });
        }
      }
    }
    for (const player of leaving) {
      this.#players.delete(player.id);
    }
    const living: Player[] = [...this.#players.values()].filter(
      (player: Player) => player.deathSteps === 0,
    );
    const quarries: Quarry[] = living.map(({ id, mover }: Player) => ({
      id,
      x: mover.motion.x,
      z: mover.motion.z,
    }));
    const strikers: Monster[] = this.#monsters.filter((monster: Monster) =>
      monster.step(quarries),
    );
    for (const slasher of slashers) {
      if (!leaving.has(slasher.player)) {
        this.#judgeSlash(slasher);
      }
    }
    for (const monster of strikers) {
      if (!monster.isAlive) {
        continue;
      }
      for (const player of living) {
        if (
          player.deathSteps === 0 &&
          isWithinStrike(
            monster.pose,
            player.mover.motion,
            MONSTER_ATTACK_REACH,
          )
        ) {
          this.#hurtPlayer(player, monster);
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
   * Tells what a player carries, which only the player itself is to be told.
   *
   * @param {number} id - The identifier of the player.
   * @returns {ItemKindId[] | null} The items, in the order of the slots they
   *   fill, or `null` if the player is not in the world.
   */
  findInventory(id: number): ItemKindId[] | null {
    const inventory: ItemKindId[] | undefined =
      this.#players.get(id)?.inventory;
    return inventory === undefined ? null : [...inventory];
  }

  /**
   * Describes what there is to pick in the world as it is now, which
   * everyone is to be told.
   *
   * @returns {WorldItems} The patches of clover that have their clover, the
   *   items on the ground, in the order they were put down, and the
   *   containers that have been looted, in ascending order.
   */
  describeItems(): WorldItems {
    const clovers: number[] = [];
    this.#regrowSteps.forEach((regrowStep: number, patch: number) => {
      if (regrowStep <= this.#stepCount) {
        clovers.push(patch);
      }
    });
    const items: GroundItem[] = this.#lyingItems.map(
      (lying: LyingItem) => lying.item,
    );
    const looted: number[] = [...this.#looted].sort(
      (a: number, b: number) => a - b,
    );
    return { clovers, items, looted };
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
    return this.#monsters.flatMap((monster: Monster) => {
      const state: MonsterState | null = monster.state;
      return state === null ? [] : [state];
    });
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
    const seen: readonly MonsterState[] = this.#findMonstersAt(time, now);
    const hit: Monster[] = this.#monsters.filter((monster: Monster) => {
      const target: MonsterState | undefined = seen.find(
        (state: MonsterState) => state.id === monster.id,
      );
      return (
        monster.isAlive &&
        target !== undefined &&
        target.mode !== 'dead' &&
        isWithinStrike(player.mover.motion, target, SLASH_REACH)
      );
    });
    player.lastSlash = {
      step: this.#stepCount,
      rewind: now - time,
      isHit: hit.length > 0,
    };
    for (const monster of hit) {
      const damage: number = monster.takeHit(SLASH_DAMAGE, player.id);
      this.#recordHit(
        { kind: 'player', id: player.id },
        referToMonster(monster),
        damage,
      );
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
   * Has a player pick what is within its reach as it stands now, if it has
   * room for it.
   *
   * @param {Player} player - The player.
   */
  #pickItem(player: Player): void {
    if (!hasRoom(player.inventory)) {
      return;
    }
    const target: PickTarget | null = findPickTarget(
      player.mover.motion,
      this.#stepCount,
      this.describeItems(),
      this.#map,
    );
    const kind: ItemKindId | null = target?.kind ?? null;
    if (target === null || kind === null) {
      return;
    }
    if (target.source === 'patch') {
      this.#regrowSteps[target.id] = this.#stepCount + REGROW_STEPS;
    } else if (target.source === 'container') {
      this.#looted.add(target.id);
    } else {
      this.#lyingItems = this.#lyingItems.filter(
        (lying: LyingItem) => lying.item.id !== target.id,
      );
    }
    player.inventory.push(kind);
  }

  /**
   * Has a player put the item of a slot of its inventory down where it
   * stands now, the items after it closing up, if the slot holds one.
   *
   * @param {Player} player - The player.
   * @param {number} slot - The number of the slot, from 0.
   */
  #dropItem(player: Player, slot: number): void {
    if (!Number.isInteger(slot) || slot < 0) {
      return;
    }
    const [kind] = player.inventory.splice(slot, 1);
    if (kind === undefined) {
      return;
    }
    const { x, z } = player.mover.motion;
    this.#lyingItems.push({
      item: {
        id: ++this.#lastItemId,
        kind,
        x: roundPlace(x),
        z: roundPlace(z),
      },
      goneStep: this.#stepCount + GROUND_ITEM_STEPS,
    });
  }

  /**
   * Has a monster bite a player, which dies if that leaves it no health.
   *
   * @param {Player} player - The player.
   * @param {Monster} monster - The monster.
   */
  #hurtPlayer(player: Player, monster: Monster): void {
    const lost: number = Math.min(monster.biteDamage, player.health);
    player.health -= lost;
    this.#recordHit(
      referToMonster(monster),
      { kind: 'player', id: player.id },
      lost,
    );
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
   * @param {readonly number[]} elsewhere - The appearances of the players
   *   in other worlds.
   * @returns {number} The number of the appearance, from 1.
   */
  #chooseAppearance(elsewhere: readonly number[]): number {
    const uses: number[] = new Array<number>(APPEARANCE_COUNT).fill(0);
    const appearances: number[] = [
      ...[...this.#players.values()].map((player: Player) => player.appearance),
      ...elsewhere,
    ];
    for (const appearance of appearances) {
      uses[appearance - 1] = (uses[appearance - 1] ?? 0) + 1;
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

/**
 * Rounds where an item is put down along an axis, so that it takes few
 * digits to tell.
 *
 * @param {number} value - The position along the axis, in metres.
 * @returns {number} The rounded position.
 */
function roundPlace(value: number): number {
  const scale: number = 10 ** ITEM_PLACE_PRECISION;
  // Adding zero turns a negative zero into a plain one.
  return Math.round(value * scale) / scale + 0;
}
