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
  WORLD_MAPS,
  createEventsMessage,
  createSnapshotMessage,
  createSpeechMessage,
} from '@clovervale/shared';
import type {
  EventsMessage,
  GameEvent,
  MonsterState,
  PlayerState,
  PrivateView,
  ServerMessage,
  StampedInput,
  WorldItems,
} from '@clovervale/shared';

import { hearChat, tellSaying } from './chat-channels.ts';
import type { ChatMessage } from './chat-channels.ts';
import type { Saying, Speech } from './player.ts';
import type { ResidentFactories } from './resident.ts';
import { World } from './world.ts';
import type { Departure } from './world.ts';

/** What a player alone is to be told now, taken from its world. */
interface PlayerNews {
  /** The identifier of the player. */
  readonly id: number;
  /** What the player alone is told of itself. */
  readonly view: PrivateView;
  /** What the villagers have said to it in passing, in order. */
  readonly speeches: readonly Speech[];
  /** What the players have said within its hearing, in order. */
  readonly sayings: readonly Saying[];
}

/** What the players of a world are to be told now, taken from it. */
interface WorldNews {
  /** The players to be seen in the world. */
  readonly players: PlayerState[];
  /** The monsters to be seen in the world. */
  readonly monsters: MonsterState[];
  /** What there is to pick in the world. */
  readonly items: WorldItems;
  /** The events that have happened in the world, in order. */
  readonly events: readonly GameEvent[];
  /** What each player alone is to be told, in the order they came in. */
  readonly news: readonly PlayerNews[];
}

/**
 * Every world the server holds: the village, which every player comes into
 * and shares, and a cave of its own for every player who has gone down into
 * one, which no other player sees.  A player is in exactly one of them.
 * All of them take their steps together, on one clock, so that the time of
 * day is the same in every one.
 */
export class Realm {
  readonly #residents: ResidentFactories;
  readonly #drawRandom: () => number;
  readonly #village: World;
  readonly #caves = new Map<number, World>();
  #stepCount = 0;

  /**
   * Starts with the village alone, without players.
   *
   * @param {ResidentFactories} residents - How each villager is placed in
   *   every world.
   * @param {() => number} [drawRandom] - Gives a random number from 0 up to
   *   but not including 1, for what the monsters do.  `Math.random` by
   *   default.
   */
  constructor(
    residents: ResidentFactories,
    drawRandom: () => number = Math.random,
  ) {
    this.#residents = residents;
    this.#drawRandom = drawRandom;
    this.#village = new World(drawRandom, residents);
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
    return this.#village.addPlayer(elsewhere);
  }

  /**
   * Takes a player that leaves the game out of the world it is in, with
   * whatever it carries, has the villagers of the village let go of it, as
   * {@link World.removePlayer} tells, and lets its cave go, with everything
   * in it, if it is in one.
   *
   * @param {number} id - The identifier of the player.
   */
  removePlayer(id: number): void {
    this.#village.removePlayer(id);
    this.#caves.delete(id);
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
    return this.#village.hasPlayer(id) ? this.#village : null;
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
   * Has a player say what its peer sent to the players nearby in the world
   * it is in, as {@link hearChat} tells, which no player of any other world
   * hears.
   *
   * @param {number} id - The identifier of the player.
   * @param {ChatMessage} message - What its peer sent.
   */
  receiveChat(id: number, message: ChatMessage): void {
    const world: World | null = this.findWorld(id);
    if (world !== null) {
      hearChat(world, id, message);
    }
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
      if (WORLD_MAPS[destination].isShared) {
        this.#village.admitPlayer(player, arrival);
        continue;
      }
      const cave = new World(this.#drawRandom, this.#residents, {
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
   * Each player is sent, first, a snapshot of the world it is in, with
   * every player and monster to be seen there, what there is to pick there
   * and, in its cave, which of the chests and barrels it has looted, and
   * with what that player alone is told of itself: what it carries, its
   * silver coins, the dialogue it is in, the villagers who have told it who
   * they are, and how far it has gotten with the quests; then what the
   * villagers have said to it in passing since the last snapshots, each
   * once; then what the players have said within its hearing since, each
   * once; and then the events that have happened in that world since the
   * last snapshots, if any have, so that each player hears of each event of
   * the world it is in once.  A player is told nothing of any other world.
   *
   * @returns {Map<number, ServerMessage[]>} The messages, by the identifier
   *   of the player, for every player in a world.
   */
  composeMessages(): Map<number, ServerMessage[]> {
    const worlds: World[] = [this.#village, ...this.#caves.values()];
    this.#recordSnapshots(worlds);
    return this.#buildMessages(
      worlds.map((world: World) => this.#takeNews(world)),
    );
  }

  /**
   * Records a snapshot of every world, as a snapshot taken now tells it.
   *
   * @param {readonly World[]} worlds - The worlds.
   */
  #recordSnapshots(worlds: readonly World[]): void {
    for (const world of worlds) {
      world.recordSnapshot();
    }
  }

  /**
   * Takes what the players of a world are to be told now, each thing that
   * is to be told once taken only once.
   *
   * @param {World} world - The world.
   * @returns {WorldNews} What they are to be told.
   */
  #takeNews(world: World): WorldNews {
    const players: PlayerState[] = world.listPlayers();
    return {
      players,
      monsters: world.listMonsters(),
      items: world.describeItems(),
      events: world.takeEvents(),
      news: players.flatMap(({ id }: PlayerState): PlayerNews[] => {
        const view: PrivateView | null = world.describePrivateView(id);
        return view === null
          ? []
          : [
              {
                id,
                view,
                speeches: world.takeSpeeches(id),
                sayings: world.takeSayings(id),
              },
            ];
      }),
    };
  }

  /**
   * Builds the messages every player is to be sent from what it is to be
   * told.
   *
   * @param {readonly WorldNews[]} worlds - What the players of each world
   *   are to be told.
   * @returns {Map<number, ServerMessage[]>} The messages, by the identifier
   *   of the player.
   */
  #buildMessages(
    worlds: readonly WorldNews[],
  ): Map<number, ServerMessage[]> {
    const composed = new Map<number, ServerMessage[]>();
    for (const { players, monsters, items, events, news } of worlds) {
      const eventsMessage: EventsMessage | null =
        events.length === 0 ? null : createEventsMessage(events);
      for (const { id, view, speeches, sayings } of news) {
        const messages: ServerMessage[] = [
          createSnapshotMessage({
            step: this.#stepCount,
            players,
            monsters,
            world: items,
            view,
          }),
          ...speeches.map(({ villager, line }: Speech) =>
            createSpeechMessage(villager, line),
          ),
          ...sayings.map(tellSaying),
        ];
        if (eventsMessage !== null) {
          messages.push(eventsMessage);
        }
        composed.set(id, messages);
      }
    }
    return composed;
  }
}
