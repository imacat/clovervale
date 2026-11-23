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
 * @module server/resident The villagers of a world as the server has them
 *   go about their business, tell of themselves in the snapshots, talk with
 *   the players, tell of the story of the players, and deal with the
 *   players the quests ask them to.
 */

import { setMaxListeners } from 'node:events';

import type {
  MonsterState,
  StoryEventType,
  StoryNeed,
  Villager,
  VillagerId,
  WorldItems,
} from '@clovervale/shared';

import type { Strike, Target } from './combatants.ts';
import type { ItemKeeper } from './item-keeper.ts';
import type { Player } from './player.ts';
import type { Roster } from './roster.ts';
import { StoryEvent } from './story.ts';
import type { StoryTeller } from './story.ts';
import type { Talks } from './talks.ts';

/** What a villager deals with in its world. */
export interface ResidentWorld {
  /** The players of the world. */
  readonly roster: Roster;
  /** The talks of the players with the villagers of the world. */
  readonly talks: Talks;
  /** What there is to pick in the world. */
  readonly items: ItemKeeper;
  /**
   * Gives the number of the current step of the world.
   *
   * @returns {number} The number of the step.
   */
  readonly getStep: () => number;
}

/** What a villager adds to a snapshot of its world. */
export interface ResidentView {
  /**
   * The villager as it is to be seen among the monsters of its world, for
   * a villager who fights as a monster, or `null` for any other.
   */
  readonly monster: MonsterState | null;
  /** What the villager tells of the items of its world. */
  readonly items: Partial<WorldItems>;
}

/**
 * A villager of a world, as the server has it, which tells its listeners of
 * the events of the story of the players, each as an event of the story of
 * the type it is named after.
 */
export interface Resident extends StoryTeller {
  /** The villager. */
  readonly villager: Villager;
  /**
   * What the slashes of the players can strike of the villager, for a
   * villager who fights as a monster, or `null` for any other.
   */
  readonly target: Target | null;

  /**
   * Has the villager go about its business at a step, before the players
   * move at it.
   */
  startStep(): void;

  /**
   * Has the villager go about its business at a step, once the players and
   * the monsters have moved at it.
   *
   * @returns {Strike[]} The strikes of the villager that strike at the
   *   step, each at the players it may hit.
   */
  finishStep(): Strike[];

  /**
   * Describes the villager as a snapshot taken now is to tell it.
   *
   * @returns {ResidentView} What it adds to the snapshot.
   */
  describe(): ResidentView;

  /**
   * Starts a talk of a player to the villager.
   *
   * @param {Player} player - The player.
   */
  talk(player: Player): void;

  /**
   * Lets go of everything the villager holds of a player that has left the
   * game.
   *
   * @param {number} player - The identifier of the player.
   */
  forget(player: number): void;

  /**
   * Takes note of a player that leaves the world at a step.
   *
   * @param {Player} player - The player.
   */
  release(player: Player): void;
}

/**
 * A villager who deals with the players the quests ask it to, as it sees
 * fit for what each needs of it in the story.
 */
export interface RequestTaker {
  /**
   * Tells the villager what a player needs of it in the story, as a quest
   * of the player asks, for the villager to deal with the player as it
   * sees fit.
   *
   * @param {number} player - The identifier of the player.
   * @param {StoryNeed} need - What the player needs of it.
   */
  request(player: number, need: StoryNeed): void;

  /**
   * Takes back what has been asked of the villager for a player, if it has
   * not dealt with it yet.
   *
   * @param {number} player - The identifier of the player.
   */
  withdraw(player: number): void;
}

/** What a villager is placed in a world with. */
export interface Casting {
  /** The villager. */
  readonly villager: Villager;
  /** What the villager deals with in the world. */
  readonly world: ResidentWorld;
  /**
   * Gives a villager who fights as a monster its identifier among the
   * monsters of the world, numbered after them and after any villager
   * given one before it.
   *
   * @returns {number} The identifier.
   */
  readonly allotMonsterId: () => number;
  /**
   * Has the world ask a villager to deal with the players the quests ask
   * it to, as {@link RequestTaker} tells.
   *
   * @param {RequestTaker} taker - The villager.
   */
  readonly acceptRequests: (taker: RequestTaker) => void;
}

/**
 * Places a villager in a world, as it goes about its business there.
 *
 * @param {Casting} casting - What the villager is placed with.
 * @returns {Resident} The villager, as the world has it.
 */
export type ResidentFactory = (casting: Casting) => Resident;

/** How each villager is placed in a world, by its identifier. */
export type ResidentFactories = Readonly<Record<VillagerId, ResidentFactory>>;

/**
 * A villager of a world, which talks with the players who talk to it, as
 * {@link Talks.start} tells, and tells its listeners of the events of the
 * story of the players, each as a {@link StoryEvent} of the type it is named
 * after.
 */
export abstract class BaseResident extends EventTarget implements Resident {
  readonly #villager: Villager;
  /** What the villager deals with in its world. */
  protected readonly world: ResidentWorld;

  /**
   * Places a villager in its world.
   *
   * @param {Villager} villager - The villager.
   * @param {ResidentWorld} world - What it deals with in its world.
   */
  constructor(villager: Villager, world: ResidentWorld) {
    super();
    // Each player of the world may listen to the villager.
    setMaxListeners(0, this);
    this.#villager = villager;
    this.world = world;
  }

  /**
   * The villager.
   *
   * @returns {Villager} The villager.
   */
  get villager(): Villager {
    return this.#villager;
  }

  /**
   * What the slashes of the players can strike of the villager, for a
   * villager who fights as a monster, or `null` for any other.
   */
  abstract readonly target: Target | null;

  /**
   * Has the villager go about its business at a step, before the players
   * move at it.
   */
  abstract startStep(): void;

  /**
   * Has the villager go about its business at a step, once the players and
   * the monsters have moved at it.
   *
   * @returns {Strike[]} The strikes of the villager that strike at the
   *   step, each at the players it may hit.
   */
  abstract finishStep(): Strike[];

  /**
   * Describes the villager as a snapshot taken now is to tell it.
   *
   * @returns {ResidentView} What it adds to the snapshot.
   */
  abstract describe(): ResidentView;

  /**
   * Lets go of everything the villager holds of a player that has left the
   * game.
   *
   * @param {number} player - The identifier of the player.
   */
  abstract forget(player: number): void;

  /**
   * Takes note of a player that leaves the world at a step.
   *
   * @param {Player} player - The player.
   */
  abstract release(player: Player): void;

  /**
   * Starts a talk of a player to the villager, as {@link Talks.start}
   * tells.
   *
   * @param {Player} player - The player.
   */
  talk(player: Player): void {
    this.world.talks.start(player, this.#villager.id);
  }

  /**
   * Has the villager tell its listeners of an event of the story of a
   * player, as a {@link StoryEvent} of the type it is named after.
   *
   * @param {StoryEventType} type - What happened.
   * @param {number} player - The identifier of the player it happened to.
   */
  tell(type: StoryEventType, player: number): void {
    this.dispatchEvent(new StoryEvent(type, player));
  }
}

/**
 * A villager who stands where it stands and does nothing but talk with the
 * players who talk to it, as {@link Talks.start} tells: it tells nothing of
 * itself in the snapshots, strikes at nobody, and pays no heed to the
 * players who leave.
 */
export class StandingVillager extends BaseResident {
  /** What the slashes of the players can strike of the villager: nothing. */
  override readonly target: Target | null = null;

  /** Does nothing before the players move at a step. */
  override startStep(): void {
    // A villager who stands where it stands does nothing.
  }

  /**
   * Does nothing once the players and the monsters have moved at a step.
   *
   * @returns {Strike[]} No strikes.
   */
  override finishStep(): Strike[] {
    return [];
  }

  /**
   * Describes the villager as a snapshot taken now is to tell it.
   *
   * @returns {ResidentView} Nothing among the monsters, and nothing of the
   *   items.
   */
  override describe(): ResidentView {
    return { monster: null, items: {} };
  }

  /** Holds nothing of a player that has left the game. */
  override forget(): void {
    // A villager who stands where it stands holds nothing of anybody.
  }

  /** Pays no heed to a player that leaves the world. */
  override release(): void {
    // A villager who stands where it stands lets the player go.
  }
}
