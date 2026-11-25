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

import { setMaxListeners } from 'node:events';

import {
  FOUNTAIN_HEALING,
  SPAWN_YAW,
  VILLAGERS,
  WORLD_MAPS,
  areMonstersPaused,
  assertNever,
  canInteract,
  canUseItem,
  cleanSayText,
  findInteractable,
  findItemKind,
  isPhraseCode,
} from '@clovervale/shared';
import type {
  GameEvent,
  Interactable,
  InteractionInput,
  ItemKind,
  ItemKindId,
  MapId,
  MonsterState,
  PlayerMotion,
  PlayerState,
  Pose,
  PrivateView,
  StampedInput,
  Villager,
  VillagerId,
  WorldItems,
} from '@clovervale/shared';

import type { Strike, Target } from './combatants.ts';
import { ItemKeeper } from './item-keeper.ts';
import { MONSTER_SPAWNS, Monster } from './monster.ts';
import type { MonsterSpawn, Quarry } from './monster.ts';
import { describePlayer } from './player.ts';
import type { Player, Saying, Speech } from './player.ts';
import type { QuestWorld } from './quest-book.ts';
import { Referee } from './referee.ts';
import type { Slasher } from './referee.ts';
import type {
  RequestTaker,
  Resident,
  ResidentFactories,
  ResidentView,
  ResidentWorld,
} from './resident.ts';
import { Roster } from './roster.ts';
import { SlashHistory } from './slash-history.ts';
import { MapEntryEvent } from './story.ts';
import { Talks, describeDialogue } from './talks.ts';

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

/** A player as it has moved at a step, before anything else comes of it. */
interface MovedPlayer {
  /** The player. */
  readonly player: Player;
  /** The inputs of the player that came into effect at the step. */
  readonly applied: readonly StampedInput[];
  /** The motion of the player before the step. */
  readonly before: PlayerMotion;
  /** The motion of the player after the step. */
  readonly after: PlayerMotion;
  /** Whether the player was held in place for a dialogue at the step. */
  readonly isHeld: boolean;
}

/** The villagers of a world. */
interface Cast {
  /** The villagers, in the order they are told. */
  readonly residents: readonly Resident[];
  /**
   * The villagers who deal with the players the quests ask them to, by
   * their identifiers.
   */
  readonly requestTakers: ReadonlyMap<VillagerId, RequestTaker>;
}

/** What comes of a step of a player for the rest of the world. */
interface PlayerTurn {
  /** The player. */
  readonly player: Player;
  /** The slash of the player that starts at the step, or `null` if none. */
  readonly slasher: Slasher | null;
  /** Whether the player leaves the world at the step. */
  readonly isLeaving: boolean;
}

/**
 * A world the server simulates, in one map: the village, with its wild
 * dog and its clover, or a cave, with its two wild dogs and its chests and
 * barrels full, and in either, the villagers of its map, each placed in it
 * as it is told to be, as a {@link Resident} that goes about its business
 * at every step.
 *
 * Whenever a player comes into the world, the world takes the quests of
 * the player in, as the book of its quests, {@link Player.book}, tells,
 * and then tells its listeners of it, as a {@link MapEntryEvent}; whenever
 * a player leaves the world, the world takes its quests out.
 */
export class World extends EventTarget implements QuestWorld {
  readonly #map: MapId;
  readonly #roster: Roster;
  readonly #monsters: readonly Monster[];
  /** The villagers of the map of the world, in the order they are told. */
  readonly #residents: readonly Resident[];
  /** The villagers who deal with the players the quests ask them to. */
  readonly #requestTakers: ReadonlyMap<VillagerId, RequestTaker>;
  /**
   * What the slashes of the players can strike: the monsters, and the
   * villagers who fight as monsters after them, as Martha does in the
   * village.
   */
  readonly #targets: readonly Target[];
  readonly #items: ItemKeeper;
  readonly #talks: Talks;
  readonly #history = new SlashHistory();
  readonly #referee: Referee;
  #stepCount: number;
  #departures: Departure[] = [];

  /**
   * Starts a world without players and with nothing on the ground, with
   * every monster idling at its home at full health, and with every
   * villager of its map placed in it as its factory places it: in the
   * village, with a four-leaf clover in every patch of clover, and in a
   * cave, with every chest and barrel holding what it holds.
   *
   * @param {() => number} drawRandom - Gives a random number from 0 up to
   *   but not including 1, for what the monsters and the villagers do and
   *   say.
   * @param {ResidentFactories} residents - How each villager is placed in
   *   the world.
   * @param {WorldOptions} [options] - The map of the world, the step it
   *   starts at, and its monsters.
   */
  constructor(
    drawRandom: () => number,
    residents: ResidentFactories,
    { map = 'village', step = 0, monsters }: WorldOptions = {},
  ) {
    super();
    // Each player of the world listens to it.
    setMaxListeners(0, this);
    const getStep = (): number => this.#stepCount;
    this.#map = map;
    this.#stepCount = step;
    this.#roster = new Roster(getStep);
    this.#monsters = (monsters ?? MONSTER_SPAWNS[map]).map(
      (spawn: MonsterSpawn, index: number) =>
        new Monster(index + 1, map, spawn, drawRandom),
    );
    this.#items = new ItemKeeper(map, getStep);
    this.#talks = new Talks(this.#items, drawRandom, (id: VillagerId) =>
      this.findResident(id),
    );
    const cast: Cast = createResidents(
      map,
      this.#monsters.length,
      {
        roster: this.#roster,
        talks: this.#talks,
        items: this.#items,
        getStep,
      },
      residents,
    );
    this.#residents = cast.residents;
    this.#requestTakers = cast.requestTakers;
    this.#targets = [
      ...this.#monsters,
      ...this.#residents.flatMap((resident: Resident) =>
        resident.target === null ? [] : [resident.target],
      ),
    ];
    this.#referee = new Referee({
      targets: this.#targets,
      history: this.#history,
      items: this.#items,
      drawRandom,
      getStep,
    });
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
   * idles facing the fountain, at full health, carrying nothing and with
   * no silver coins, in no dialogue, told by no villager who it is, on no
   * quest, and not hunted by Martha.
   *
   * @param {readonly number[]} elsewhere - The appearances of the players
   *   in other worlds.
   * @returns {PlayerState} The new player.
   */
  addPlayer(elsewhere: readonly number[]): PlayerState {
    const player: Player = this.#roster.create(elsewhere);
    this.#enter(player, null);
    return describePlayer(player);
  }

  /**
   * Takes a player that leaves the game out of the world, if it is in it,
   * with whatever it carries, and its quests with it, and has every
   * villager of the world let go of it, as {@link Resident.forget} tells,
   * whether it was in the world or not.
   *
   * @param {number} id - The identifier of the player.
   */
  removePlayer(id: number): void {
    this.#roster.find(id)?.book.leave();
    this.#roster.remove(id);
    for (const resident of this.#residents) {
      resident.forget(id);
    }
  }

  /**
   * Brings a player from another world into this one, with its health,
   * what it carries, its silver coins, the villagers who have told it who
   * they are, how far it has gotten with the quests, whether it has reached
   * the end of the story, and the inputs of its peer still to come.  It
   * stops whatever it was doing and idles where it arrives, but still
   * wants to move the way it did, and is told nothing more of what was
   * said within its hearing in the world it left.
   *
   * @param {Player} player - The player, as it left the other world.
   * @param {Pose | null} arrival - Where it is to stand, and which way it
   *   is to face, or `null` for where a new player would, facing the
   *   fountain.
   */
  admitPlayer(player: Player, arrival: Pose | null): void {
    this.#roster.admit(player, arrival);
    this.#enter(player, arrival);
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
   * is doing any of them already or dead.  A pick, a put-down or a use
   * changes what the player carries, and a reply the dialogue it is in, as
   * a step of the world tells.  Any input shows from the step at which it
   * comes into effect: no sooner than the next one, and no sooner than the
   * player has taken as many steps since its previous input came into
   * effect as the input tells.
   *
   * @param {number} id - The identifier of the player.
   * @param {StampedInput} input - The input.
   * @returns {boolean} Whether the input was accepted.  It is not if the
   *   player is not in the world, if the number of the input is no higher
   *   than that of the input before it, or if too many inputs of the
   *   player are waiting to come into effect.
   */
  receiveInput(id: number, input: StampedInput): boolean {
    return this.#roster.find(id)?.mover.receiveInput(input) ?? false;
  }

  /**
   * Moves the world one step of the simulation forward.
   *
   * First, every villager of the world goes about its business, as
   * {@link Resident.startStep} tells, before any player moves or picks at
   * the step, and with the players as they stand before the step.  Every
   * living player in the way of a villager who pushes the players aside, as
   * {@link Villager.pusher} tells, is pushed aside.
   *
   * A player that slashes, drinks from the fountain or talks to a villager
   * stands still, without turning, for as long as that lasts.  Any other
   * player that wants to move walks that way, facing it, and idles
   * otherwise, on the ground of the map of the world; a villager who pushes
   * the players aside stands in its way as the obstacles do.  Each monster
   * goes about its business, as the numbers of its kind tell, and pays the
   * villagers no heed.
   *
   * A player that crosses the line where the story ends in the map of the
   * world outward at the step, as the map tells by its checkpoint of the
   * ending, reaches the end of the story, if it is done with the main plot
   * and has not reached it before, in this world or another.  The line
   * never stands in its way.
   *
   * A drink that starts at the step gives the player back
   * {@link FOUNTAIN_HEALING} health at once, or as much as it lacks of its
   * full health if that is less, which is an event unless it is none.  A
   * drink is never judged on the world as its peer showed it, so the time
   * its interaction names, if any, does not matter.  A talk is never judged
   * either.  An interaction slashes rather than talks while a living
   * monster, as it was before the step, is in front of the player and
   * within the reach of its slash.  A talk that starts at the step to a
   * villager opens as {@link Talks.start} tells, and a reply that comes
   * into effect at the step, while the player is in a dialogue, is
   * answered as {@link Talks.answer} tells; whenever a line is said to a
   * player, what the line brings about comes about at once, as
   * {@link Talks} tells.  A player that dies leaves its dialogue.  A player
   * in a dialogue at the start of a step is held in place at the step, and
   * neither picks nor travels.  The monsters of a cave whose player is in a
   * dialogue do nothing at all at the step.  The village is never held
   * still for a dialogue.
   *
   * Every villager of the world then goes about its business again, as
   * {@link Resident.finishStep} tells, with every player of the world as it
   * stands after the step, once each player that leaves the world at the
   * step has been taken note of, as {@link Resident.release} tells.
   *
   * Then the strikes are judged, as {@link Referee} tells.  A slash that
   * starts at the step is judged as {@link Referee.judgeSlash} tells, on
   * the world as the snapshots recorded told it, with the world after the
   * step as one more of them, and with the player itself where it stands
   * after the step.  A strike of a living monster hits every player alive
   * in front of it and within its reach after the step, for the bite damage
   * of its kind, and a strike of a villager hits only those of the players
   * it strikes at that it can strike then, as {@link Referee.letStrike}
   * tells, before the monsters strike; a player killed by one strike is not
   * hit by another.  The players cannot hurt
   * each other.  Every hit is an event, which names the monster by its
   * identifier.
   *
   * A player with no health left dies, and lies where it fell for a while,
   * neither moving, turning, interacting, picking nor putting down, neither
   * hurt nor chased by the monsters, though its inputs still change the way
   * it wants to move.  Then it comes back at a spawn point, at full health,
   * idling but wanting to move the way it does by then, and carrying what
   * it carried, with its silver coins: in the village, at once, and from a
   * cave, by leaving it for the village.
   *
   * A travel that comes into effect at the step, while the player could
   * start to interact, takes the player out of the world, if
   * {@link findInteractable} finds a way within its reach from where it
   * stands after the step, with the monsters as they were before the step,
   * for a travel to use: it
   * leaves for a world of the map the way leads into, to arrive where the
   * way leads.  A player that leaves is neither struck nor judged at the
   * step.
   *
   * A pick that comes into effect at the step, while the player could start
   * to interact, gets the player what {@link findInteractable} finds within
   * its reach for a pick to use, from where it stands after the step, with
   * the monsters as they were before the step, as {@link ItemKeeper.pick}
   * tells.  The picks are judged player by
   * player, in the order the players came in, so that of two players who
   * pick the same thing at the same step, the one who came in first gets
   * it, and the other gets nothing.  A put-down that comes into effect at
   * the step, while the player is alive, takes the item out of the slot of
   * the inventory of the player it names and lays it on the ground where
   * the player stands after the step, as {@link ItemKeeper.drop} tells.  A
   * put-down that names an empty slot, or one the inventory does not have,
   * does nothing.  A use that comes into effect at the step, while the
   * player is alive and lacks health, uses up the item in the slot it
   * names, if that item can be used: the item is taken out of the
   * inventory, the items after it closing up, and the player gets back the
   * health of its kind at once, or as much as it lacks of its full health
   * if that is less, which is an event.  A use that names an empty slot,
   * one the inventory does not have, or an item that cannot be used, or
   * that comes at full health, does nothing, and the item stays where it
   * is.  Picking, putting down and using neither move the player nor change
   * what it is doing.
   */
  step(): void {
    this.#stepCount++;
    this.#items.removeExpired();
    for (const resident of this.#residents) {
      resident.startStep();
    }
    const monsters: MonsterState[] = this.listMonsters();
    const turns: PlayerTurn[] = this.#roster
      .list()
      .map((player: Player) => this.#stepPlayer(player, monsters));
    this.#letLeave(turns);
    const living: Player[] = this.#roster
      .list()
      .filter((player: Player) => player.isAlive);
    const bites: Strike[] = this.#stepMonsters(living);
    const thrusts: Strike[] = this.#residents.flatMap((resident: Resident) =>
      resident.finishStep(),
    );
    this.#judgeSlashes(turns);
    this.#referee.letStrike([...thrusts, ...bites]);
  }

  /**
   * Takes the events that have happened since they were last taken.
   *
   * @returns {GameEvent[]} The events, in the order they happened, each
   *   taken only once.
   */
  takeEvents(): GameEvent[] {
    return this.#referee.takeEvents();
  }

  /**
   * Records the monsters as a snapshot taken now tells them, for the slashes
   * to be judged on the world as a peer showed it, as
   * {@link SlashHistory.record} tells.
   */
  recordSnapshot(): void {
    this.#history.record(this.#stepCount, this.listMonsters());
  }

  /**
   * Describes what only a player itself is to be told of itself, as it is
   * now.
   *
   * @param {number} id - The identifier of the player.
   * @returns {PrivateView | null} How far the player has gotten with the
   *   inputs of its peer, how its latest slash was judged, or `null` before
   *   its first, what it carries, in the order of the slots, its silver
   *   coins, the dialogue it is in as it stands, or `null` if none, the
   *   villagers who have told it who they are, in the order they did, the
   *   stage of each quest it has taken on, and whether it has reached the
   *   end of the story; or `null` if the player is not in the world.
   */
  describePrivateView(id: number): PrivateView | null {
    const player: Player | undefined = this.#roster.find(id);
    if (player === undefined) {
      return null;
    }
    return {
      own: player.mover.progress,
      slash: player.lastSlash,
      inventory: [...player.inventory],
      silver: player.silver,
      dialogue:
        player.dialogue === null ? null : describeDialogue(player.dialogue),
      acquaintances: [...player.acquaintances],
      quests: [...player.quests],
      isEndingReached: player.isEndingReached,
    };
  }

  /**
   * Takes what the villagers have said to a player in passing, or within
   * its hearing, since it was last taken, which only the player itself is
   * to be told.
   *
   * @param {number} id - The identifier of the player.
   * @returns {Speech[]} What they said, in the order they said it, each
   *   taken only once, which is nothing if the player is not in the world.
   */
  takeSpeeches(id: number): Speech[] {
    return this.#roster.find(id)?.takeSpeeches() ?? [];
  }

  /**
   * Has a player say a line to the players nearby, at once.
   *
   * The line is made of the text as {@link cleanSayText} tells, and is
   * heard as {@link Roster.tellNearby} tells: by every player of the world
   * within hearing of the player then, the player itself among them, and
   * by nobody else.  Nothing is said if the player is not in the world, if
   * nothing is left of the text to say, or if the player said its last
   * line or phrase too short a while ago, in this world or another.
   *
   * @param {number} id - The identifier of the player.
   * @param {string} text - The text its peer sent.
   */
  say(id: number, text: string): void {
    const line: string | null = cleanSayText(text);
    if (line !== null) {
      this.#roster.tellNearby(id, { kind: 'say', player: id, text: line });
    }
  }

  /**
   * Has a player say a phrase to the players nearby, at once.
   *
   * The phrase is heard as a line is, as {@link World.say} tells: by every
   * player of the world within hearing of the player then, the player
   * itself among them, and by nobody else.  Nothing is said if the player
   * is not in the world, if the code is not that of a phrase a player can
   * say, as {@link isPhraseCode} tells, or if the player said its last line
   * or phrase too short a while ago, in this world or another.
   *
   * @param {number} id - The identifier of the player.
   * @param {string} code - The code its peer sent.
   */
  sayPhrase(id: number, code: string): void {
    if (isPhraseCode(code)) {
      this.#roster.tellNearby(id, { kind: 'phrase', player: id, phrase: code });
    }
  }

  /**
   * Takes what was said within the hearing of a player since it was last
   * taken, which only the players who heard it are to be told.
   *
   * @param {number} id - The identifier of the player.
   * @returns {Saying[]} What was said, in the order it was said, each
   *   taken only once, which is nothing if the player is not in the world.
   */
  takeSayings(id: number): Saying[] {
    return this.#roster.find(id)?.takeSayings() ?? [];
  }

  /**
   * Describes what there is to pick in the world as it is now, which
   * everyone is to be told.
   *
   * @returns {WorldItems} The patches of clover that have their clover, the
   *   items on the ground, in the order they were put down, the
   *   containers that have been looted, in ascending order, and, in the
   *   village, the latest step at which Toby took a four-leaf clover.
   */
  describeItems(): WorldItems {
    return this.#residents.reduce(
      (items: WorldItems, resident: Resident): WorldItems => ({
        ...items,
        ...resident.describe().items,
      }),
      this.#items.describe(),
    );
  }

  /**
   * Tells whether a player is in the world.
   *
   * @param {number} id - The identifier of the player.
   * @returns {boolean} Whether it is.
   */
  hasPlayer(id: number): boolean {
    return this.#roster.has(id);
  }

  /**
   * Lists every player in the world as it is now.
   *
   * @returns {PlayerState[]} The players, in the order they came in.
   */
  listPlayers(): PlayerState[] {
    return this.#roster.list().map(describePlayer);
  }

  /**
   * Lists every monster in the world that is to be seen as it is now.
   *
   * @returns {MonsterState[]} The monsters, which leave out a monster that
   *   has been dead for so long that it is gone, and Martha last, in the
   *   village.
   */
  listMonsters(): MonsterState[] {
    const monsters: MonsterState[] = this.#monsters.flatMap(
      (monster: Monster) => (monster.state === null ? [] : [monster.state]),
    );
    const villagers: MonsterState[] = this.#residents.flatMap(
      (resident: Resident) => {
        const { monster }: ResidentView = resident.describe();
        return monster === null ? [] : [monster];
      },
    );
    return [...monsters, ...villagers];
  }

  /**
   * Takes the quests of a player that comes into the world in, and tells
   * the listeners of the world of it.
   *
   * @param {Player} player - The player.
   * @param {Pose | null} arrival - Where it arrives somewhere in particular,
   *   or `null` for where a new player would.
   */
  #enter(player: Player, arrival: Pose | null): void {
    player.book.enter(this);
    this.dispatchEvent(new MapEntryEvent(player.id, this.#map, arrival));
  }

  /**
   * Moves a player one step forward: applies the inputs of its peer that
   * come into effect, starts what it starts to do, and brings it back to
   * life once it has lain dead long enough.
   *
   * @param {Player} player - The player.
   * @param {readonly MonsterState[]} monsters - The monsters as they were
   *   before the step.
   * @returns {PlayerTurn} What comes of it for the rest of the world.
   */
  #stepPlayer(player: Player, monsters: readonly MonsterState[]): PlayerTurn {
    const before: PlayerMotion = player.mover.motion;
    const isHeld: boolean = player.dialogue !== null;
    const applied: StampedInput[] = player.mover.step(
      this.#stepCount,
      this.#map,
      isHeld,
      monsters,
    );
    const after: PlayerMotion = player.mover.motion;
    if (
      WORLD_MAPS[this.#map].endingCheckpoint?.isCrossedOutward(
        before,
        after,
      ) === true
    ) {
      player.reachEnding();
    }
    const moved: MovedPlayer = { player, applied, before, after, isHeld };
    const travel: Departure | null = this.#applyInputs(moved, monsters);
    const slasher: Slasher | null = this.#startAction(moved, monsters);
    const revival: Departure | null = this.#comeBackToLife(player);
    for (const departure of [travel, revival]) {
      if (departure !== null) {
        this.#departures.push(departure);
      }
    }
    return {
      player,
      slasher,
      isLeaving: travel !== null || revival !== null,
    };
  }

  /**
   * Has a player pick, put down, use, reply and travel, as the inputs that
   * came into effect at the step tell.
   *
   * @param {MovedPlayer} moved - The player, as it has moved at the step.
   * @param {readonly MonsterState[]} monsters - The monsters as they were
   *   before the step.
   * @returns {Departure | null} Where the player leaves for, or `null` if
   *   it does not travel.
   */
  #applyInputs(
    moved: MovedPlayer,
    monsters: readonly MonsterState[],
  ): Departure | null {
    let departure: Departure | null = null;
    for (const input of moved.applied) {
      const leaving: Departure | null = this.#applyInput(
        moved,
        input,
        monsters,
        departure === null,
      );
      if (leaving !== null) {
        departure = leaving;
      }
    }
    return departure;
  }

  /**
   * Has a player pick, put down, use, reply or travel, as one input that
   * came into effect at the step tells.
   *
   * @param {MovedPlayer} moved - The player, as it has moved at the step.
   * @param {StampedInput} input - The input.
   * @param {readonly MonsterState[]} monsters - The monsters as they were
   *   before the step.
   * @param {boolean} canTravel - Whether the player may still travel at
   *   the step.
   * @returns {Departure | null} Where the player leaves for, or `null` if
   *   it does not travel.
   */
  #applyInput(
    { player, before, after, isHeld }: MovedPlayer,
    input: StampedInput,
    monsters: readonly MonsterState[],
    canTravel: boolean,
  ): Departure | null {
    const isFree: boolean = canInteract(before) && !isHeld;
    const isAlive: boolean = before.action !== 'Die';
    if (input.type === 'pick' && isFree) {
      this.#use(player, after, monsters, 'pick');
    }
    if (input.type === 'drop' && isAlive) {
      this.#items.drop(player, input.slot);
    }
    if (input.type === 'use' && isAlive) {
      this.#useItem(player, input.slot);
    }
    if (input.type === 'reply') {
      this.#talks.answer(player, input.choice);
    }
    if (input.type === 'travel' && isFree && canTravel) {
      return this.#use(player, after, monsters, 'travel');
    }
    return null;
  }

  /**
   * Has what a player starts to do at the step begin: a drink heals it, a
   * talk starts with the villager it faces, and a slash is to be judged.
   *
   * @param {MovedPlayer} moved - The player, as it has moved at the step.
   * @param {readonly MonsterState[]} monsters - The monsters as they were
   *   before the step.
   * @returns {Slasher | null} The slash that starts, to be judged, or
   *   `null` if none does.
   */
  #startAction(
    { player, applied, before, after }: MovedPlayer,
    monsters: readonly MonsterState[],
  ): Slasher | null {
    if (after.actionCount === before.actionCount) {
      return null;
    }
    if (after.action === 'Slash') {
      const interaction: StampedInput | undefined = applied.findLast(
        (input: StampedInput) => input.type === 'interact',
      );
      const viewTime: number | undefined =
        interaction?.type === 'interact' ? interaction.viewTime : undefined;
      return { player, viewTime };
    }
    if (after.action === 'Drink' || after.action === 'Talk') {
      this.#use(player, after, monsters, 'interact');
    }
    return null;
  }

  /**
   * Has a player use what {@link findInteractable} finds within its reach
   * for an input to use, if anything: a drink from the fountain gives it
   * back {@link FOUNTAIN_HEALING} health, a talk starts with the villager,
   * a way takes it out of the world, and a pick gets it what it picks, as
   * {@link ItemKeeper.pick} tells.
   *
   * @param {Player} player - The player.
   * @param {Pose} pose - Where the player stands, and which way it faces.
   * @param {readonly MonsterState[]} monsters - The monsters as they were
   *   before the step.
   * @param {InteractionInput} input - The input the player uses it with.
   * @returns {Departure | null} Where the player leaves for, or `null` if
   *   it does not leave.
   */
  #use(
    player: Player,
    pose: Pose,
    monsters: readonly MonsterState[],
    input: InteractionInput,
  ): Departure | null {
    const target: Interactable | null = findInteractable(
      pose,
      this.#stepCount,
      { map: this.#map, monsters, items: this.#items.describe() },
      input,
    );
    switch (target?.type) {
      case undefined:
        return null;
      case 'fountain':
        this.#referee.heal(player, FOUNTAIN_HEALING);
        return null;
      case 'villager':
        this.findResident(target.villager.id)?.talk(player);
        return null;
      case 'passage':
        return {
          player,
          destination: target.destination,
          arrival: target.arrival,
        };
      case 'patch':
      case 'ground':
      case 'container':
        this.#items.pick(player, target);
        return null;
      default:
        return assertNever(target);
    }
  }

  /**
   * Counts down the time a dead player lies where it fell, and brings it
   * back to life at full health once it is over: at a spawn point in the
   * village, or by leaving a cave for the village.
   *
   * @param {Player} player - The player.
   * @returns {Departure | null} Where the player leaves for, or `null` if
   *   it does not leave.
   */
  #comeBackToLife(player: Player): Departure | null {
    if (!player.countDownDeath()) {
      return null;
    }
    const { revivalMap } = WORLD_MAPS[this.#map];
    if (revivalMap === this.#map) {
      player.mover.relocate(this.#roster.chooseSpawnPoint(), SPAWN_YAW);
      return null;
    }
    return { player, destination: revivalMap, arrival: null };
  }

  /**
   * Takes the players that leave at the step out of the world, with their
   * quests, which Martha hunts from then on if she fights them.
   *
   * @param {readonly PlayerTurn[]} turns - What came of the step of each
   *   player.
   */
  #letLeave(turns: readonly PlayerTurn[]): void {
    for (const { player, isLeaving } of turns) {
      if (isLeaving) {
        for (const resident of this.#residents) {
          resident.release(player);
        }
        player.book.leave();
        this.#roster.remove(player.id);
      }
    }
  }

  /**
   * Has every monster go about its business for one step, unless the
   * monsters of the world are held still for a dialogue.
   *
   * @param {readonly Player[]} living - The players alive.
   * @returns {Strike[]} The strikes of the monsters that strike at the
   *   step, each at every player alive.
   */
  #stepMonsters(living: readonly Player[]): Strike[] {
    const quarries: Quarry[] = living.map(({ id, mover }: Player) => ({
      id,
      x: mover.motion.x,
      z: mover.motion.z,
    }));
    const isPaused: boolean = areMonstersPaused(
      this.#map,
      this.#roster.list().some((player: Player) => player.dialogue !== null),
    );
    return isPaused
      ? []
      : this.#monsters
          .filter((monster: Monster) => monster.step(quarries))
          .map(
            (monster: Monster): Strike => ({
              striker: monster,
              players: living,
            }),
          );
  }

  /**
   * Judges the slashes that start at the step, of the players that stay.
   *
   * @param {readonly PlayerTurn[]} turns - What came of the step of each
   *   player.
   */
  #judgeSlashes(turns: readonly PlayerTurn[]): void {
    for (const { slasher, isLeaving } of turns) {
      if (slasher !== null && !isLeaving) {
        this.#referee.judgeSlash(slasher, this.listMonsters());
      }
    }
  }

  /**
   * Finds a villager of the map of the world.
   *
   * @param {VillagerId} id - The identifier of the villager.
   * @returns {Resident | undefined} The villager, if it is in the map.
   */
  findResident(id: VillagerId): Resident | undefined {
    return this.#residents.find(
      (resident: Resident) => resident.villager.id === id,
    );
  }

  /**
   * Finds a villager of the map of the world who deals with the players
   * the quests ask it to.
   *
   * @param {VillagerId} id - The identifier of the villager.
   * @returns {RequestTaker | undefined} The villager, if it is in the map
   *   and deals with the players the quests ask it to.
   */
  findRequestTaker(id: VillagerId): RequestTaker | undefined {
    return this.#requestTakers.get(id);
  }

  /**
   * Has a player use the item of a slot of its inventory, the items after
   * it closing up, if the slot holds an item that can be used and the
   * player lacks health for it to give back.
   *
   * @param {Player} player - The player.
   * @param {number} slot - The number of the slot, from 0.
   */
  #useItem(player: Player, slot: number): void {
    const kind: ItemKindId | undefined = player.inventory[slot];
    if (kind === undefined || !canUseItem(kind, player.health)) {
      return;
    }
    player.takeSlot(slot);
    const used: ItemKind = findItemKind(kind);
    this.#referee.heal(player, used.healing ?? 0);
  }
}

/**
 * Places the villagers of a map in a world of it, each as its factory
 * places it: a villager given an identifier among the monsters is numbered
 * after them, in the order the villagers are placed.
 *
 * @param {MapId} map - The map.
 * @param {number} monsterCount - The number of the monsters of the world.
 * @param {ResidentWorld} world - What the villagers deal with in the world.
 * @param {ResidentFactories} factories - How each villager is placed.
 * @returns {Cast} The villagers of the map, in the order {@link VILLAGERS}
 *   tells them, and those of them who deal with the players the quests ask
 *   them to.
 */
function createResidents(
  map: MapId,
  monsterCount: number,
  world: ResidentWorld,
  factories: ResidentFactories,
): Cast {
  let lastTargetId: number = monsterCount;
  const requestTakers = new Map<VillagerId, RequestTaker>();
  const residents: Resident[] = VILLAGERS.filter(
    (villager: Villager) => villager.map === map,
  ).map(
    (villager: Villager): Resident =>
      factories[villager.id]({
        villager,
        world,
        allotMonsterId: (): number => ++lastTargetId,
        acceptRequests: (taker: RequestTaker): void => {
          requestTakers.set(villager.id, taker);
        },
      }),
  );
  return { residents, requestTakers };
}
