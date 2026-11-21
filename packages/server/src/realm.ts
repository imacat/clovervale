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
 * @module server/realm Every world the server holds at once: the village,
 *   which every player shares, and the caves, one for each player in one,
 *   and the players going from one into another.
 */

import {
  createEventsMessage,
  createMapMessage,
  createSnapshotMessage,
  createSpeechMessage,
} from '@clovervale/shared';
import type {
  EventsMessage,
  GameEvent,
  InputProgress,
  MapId,
  MonsterState,
  PlayerState,
  ServerMessage,
  StampedInput,
  WorldItems,
} from '@clovervale/shared';

import { World } from './world.ts';
import type { Departure, Speech } from './world.ts';

/**
 * Every world the server holds: the village, which every player comes into
 * and shares, and a cave of its own for every player who has gone down into
 * one, which no other player sees.  A player is in exactly one of them.
 * All of them take their steps together, on one clock, so that the time of
 * day is the same in every one.
 */
export class Realm {
  readonly #drawRandom: () => number;
  readonly #village: World;
  readonly #caves = new Map<number, World>();
  readonly #toldMaps = new Map<number, MapId>();
  #stepCount = 0;

  /**
   * Starts with the village alone, without players.
   *
   * @param {() => number} [drawRandom] - Gives a random number from 0 up to
   *   but not including 1, for what the monsters do.  `Math.random` by
   *   default.
   */
  constructor(drawRandom: () => number = Math.random) {
    this.#drawRandom = drawRandom;
    this.#village = new World(drawRandom);
  }

  /**
   * The number of simulation steps the worlds have taken.
   *
   * @returns {number} The number of steps.
   */
  get stepCount(): number {
    return this.#stepCount;
  }

  /**
   * The number of caves the realm holds now, one for each player in one.
   *
   * @returns {number} The number of caves.
   */
  get caveCount(): number {
    return this.#caves.size;
  }

  /**
   * Lets a new player into the village, as {@link World.addPlayer} tells,
   * with an appearance chosen among the players of every world.
   *
   * @returns {PlayerState} The new player.
   */
  addPlayer(): PlayerState {
    const elsewhere: number[] = [...this.#caves.values()].flatMap(
      (cave: World) =>
        cave.listPlayers().map((player: PlayerState) => player.appearance),
    );
    const player: PlayerState = this.#village.addPlayer(elsewhere);
    this.#toldMaps.set(player.id, 'village');
    return player;
  }

  /**
   * Takes a player out of the world it is in, with whatever it carries,
   * and lets its cave go, if it is in one.
   *
   * @param {number} id - The identifier of the player.
   */
  removePlayer(id: number): void {
    this.#village.removePlayer(id);
    this.#caves.delete(id);
    this.#toldMaps.delete(id);
  }

  /**
   * Finds the world a player is in.
   *
   * @param {number} id - The identifier of the player.
   * @returns {World | null} The world, or `null` if the player is in none.
   */
  findWorld(id: number): World | null {
    const cave: World | undefined = this.#caves.get(id);
    if (cave !== undefined) {
      return cave;
    }
    return this.#village.findProgress(id) === null ? null : this.#village;
  }

  /**
   * Finds the map a player is in.
   *
   * @param {number} id - The identifier of the player.
   * @returns {MapId | null} The map, or `null` if the player is in none.
   */
  findMap(id: number): MapId | null {
    return this.findWorld(id)?.map ?? null;
  }

  /**
   * Receives an input of a player from its peer, for the world the player
   * is in, as {@link World.receiveInput} tells.  The inputs of a player go
   * along with it from one world into another.
   *
   * @param {number} id - The identifier of the player.
   * @param {StampedInput} input - The input.
   * @returns {boolean} Whether the input was accepted.
   */
  receiveInput(id: number, input: StampedInput): boolean {
    return this.findWorld(id)?.receiveInput(id, input) ?? false;
  }

  /**
   * Moves every world one step of the simulation forward, as
   * {@link World.step} tells, and then has every player who has left a
   * world arrive in the one it goes to.
   *
   * A player who goes down into the cave arrives in a fresh cave of its
   * own, and a player who leaves its cave, up the rope or by dying there,
   * arrives in the village, and its cave is let go.  The other players and
   * the monsters of the world it left take no notice of its going but that
   * it is gone.
   */
  step(): void {
    this.#stepCount++;
    const departures: Departure[] = [];
    for (const world of [this.#village, ...this.#caves.values()]) {
      world.step();
      departures.push(...world.takeDepartures());
    }
    for (const { player, destination, arrival } of departures) {
      this.#caves.delete(player.id);
      if (destination === 'village') {
        this.#village.admitPlayer(player, arrival);
        continue;
      }
      const cave = new World(this.#drawRandom, {
        map: destination,
        step: this.#stepCount,
      });
      cave.admitPlayer(player, arrival);
      this.#caves.set(player.id, cave);
    }
  }

  /**
   * Composes what every player is to be sent now, and records a snapshot
   * of every world, for the slashes to be judged on the world as a peer
   * showed it.
   *
   * Each player is sent, first, which map it is in, if that is not the map
   * it was last told of, the village if it was told of none; then a
   * snapshot of the world it is in, with every player and monster to be
   * seen there, what there is to pick there and, in its cave, which of the
   * chests and barrels it has looted, and with what that player alone is
   * told of itself: what it carries, its silver coins, the dialogue it is
   * in, the villagers who have told it who they are, and how far it has
   * got with the quests; then what the villagers have
   * said to it in passing since the last snapshots, each once; and then the
   * events that have happened in that world since the last snapshots, if
   * any have, so that each player hears of each event of the world it is
   * in once.  A player is told nothing of any other world.
   *
   * @returns {Map<number, ServerMessage[]>} The messages, by the identifier
   *   of the player, for every player in a world.
   */
  composeMessages(): Map<number, ServerMessage[]> {
    const composed = new Map<number, ServerMessage[]>();
    for (const world of [this.#village, ...this.#caves.values()]) {
      world.recordSnapshot();
      const players: PlayerState[] = world.listPlayers();
      const monsters: MonsterState[] = world.listMonsters();
      const items: WorldItems = world.describeItems();
      const events: GameEvent[] = world.takeEvents();
      const eventsMessage: EventsMessage | null =
        events.length === 0 ? null : createEventsMessage(events);
      for (const { id } of players) {
        const own: InputProgress | null = world.findProgress(id);
        if (own === null) {
          continue;
        }
        const messages: ServerMessage[] = [];
        if (this.#toldMaps.get(id) !== world.map) {
          this.#toldMaps.set(id, world.map);
          messages.push(createMapMessage(world.map));
        }
        messages.push(
          createSnapshotMessage(
            this.#stepCount,
            players,
            monsters,
            own,
            world.findSlash(id),
            items,
            world.findInventory(id) ?? [],
            world.findDialogue(id),
            world.findAcquaintances(id),
            world.findQuests(id),
            world.findSilver(id) ?? 0,
          ),
          ...world
            .takeSpeeches(id)
            .map(({ villager, line }: Speech) =>
              createSpeechMessage(villager, line),
            ),
        );
        if (eventsMessage !== null) {
          messages.push(eventsMessage);
        }
        composed.set(id, messages);
      }
    }
    return composed;
  }
}
