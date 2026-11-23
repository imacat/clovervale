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
 * @module server/player A player in a world, with everything it takes
 *   along from one world into another, and what it is told.
 */

import {
  DEATH_DURATION,
  PLAYER_HEALTH,
  countSteps,
  hasRoom,
} from '@clovervale/shared';
import type {
  AuthoritativePlayer,
  ItemKindId,
  PhraseCode,
  PlayerState,
  Quest,
  SlashJudgment,
  VillagerId,
} from '@clovervale/shared';

import { QuestBook } from './quest-book.ts';

/** The number of simulation steps a dead player lies where it fell. */
const DEATH_STEPS: number = countSteps(DEATH_DURATION);

/** Who a player is as it comes in, and what it has then. */
export interface PlayerSetup {
  /** The identifier of the player. */
  readonly id: number;
  /** The number of the appearance of the player, from 1. */
  readonly appearance: number;
  /** The player as the inputs of its peer move it. */
  readonly mover: AuthoritativePlayer;
  /** The health of the player, {@link PLAYER_HEALTH} by default. */
  readonly health?: number;
  /** The items the player carries, in order, none by default. */
  readonly inventory?: readonly ItemKindId[];
  /** The number of silver coins the player has, none by default. */
  readonly silver?: number;
  /**
   * The villagers who have told the player who they are, in the order they
   * did, none by default.
   */
  readonly acquaintances?: readonly VillagerId[];
  /**
   * The quests the player has opened, in the order it opened them, each at
   * the stage it has gotten to, none by default.
   */
  readonly quests?: readonly Quest[];
}

/**
 * A player in a world, with everything it takes along from one world into
 * another.
 *
 * A player with no health left dies, out of any dialogue, and lies dead for
 * {@link DEATH_DURATION} seconds, after which it is alive again at full
 * health.
 */
export class Player {
  /** The identifier of the player. */
  readonly id: number;
  /** The number of the appearance of the player, from 1. */
  readonly appearance: number;
  /** The player as the inputs of its peer move it. */
  readonly mover: AuthoritativePlayer;
  /** The quests the player has opened, as the server keeps them going. */
  readonly book: QuestBook;
  /** The latest slash of the player, as judged, or `null` before its first. */
  lastSlash: SlashJudgment | null = null;
  /**
   * The number of the step at which the player last said a line or a
   * phrase, or `null` if it has said neither.
   */
  saidStep: number | null = null;
  #health: number;
  /**
   * The number of steps the player is still to lie dead for, or 0 while it
   * is alive.
   */
  #deathSteps = 0;
  readonly #inventory: ItemKindId[];
  #silver: number;
  readonly #acquaintances: VillagerId[];
  #dialogue: Dialogue | null = null;
  /** The number of lines said to the player in its dialogues so far. */
  #turnCount = 0;
  #speeches: Speech[] = [];
  #sayings: Saying[] = [];

  /**
   * Starts a player alive, in no dialogue, told and having said nothing.
   *
   * @param {PlayerSetup} setup - Who the player is, and what it has.
   */
  constructor({
    id,
    appearance,
    mover,
    health = PLAYER_HEALTH,
    inventory = [],
    silver = 0,
    acquaintances = [],
    quests = [],
  }: PlayerSetup) {
    this.id = id;
    this.appearance = appearance;
    this.mover = mover;
    this.#health = health;
    this.#inventory = [...inventory];
    this.#silver = silver;
    this.#acquaintances = [...acquaintances];
    this.book = new QuestBook(id, quests);
  }

  /**
   * The health of the player.
   *
   * @returns {number} The health.
   */
  get health(): number {
    return this.#health;
  }

  /**
   * Whether the player is alive, rather than lying dead.
   *
   * @returns {boolean} Whether it is.
   */
  get isAlive(): boolean {
    return this.#deathSteps === 0;
  }

  /**
   * The items the player carries, in the order of the slots they fill.
   *
   * @returns {readonly ItemKindId[]} The items.
   */
  get inventory(): readonly ItemKindId[] {
    return this.#inventory;
  }

  /**
   * Whether the inventory of the player has room for another item.
   *
   * @returns {boolean} Whether it has.
   */
  get hasRoom(): boolean {
    return hasRoom(this.#inventory);
  }

  /**
   * The number of silver coins the player has, which take no slot of its
   * inventory.
   *
   * @returns {number} The number of coins.
   */
  get silver(): number {
    return this.#silver;
  }

  /**
   * The villagers who have told the player who they are, in the order they
   * did.
   *
   * @returns {readonly VillagerId[]} The villagers.
   */
  get acquaintances(): readonly VillagerId[] {
    return this.#acquaintances;
  }

  /**
   * The quests the player has opened, in the order it opened them, each at
   * the stage it has gotten to.
   *
   * @returns {readonly Quest[]} The quests.
   */
  get quests(): readonly Quest[] {
    return this.book.quests;
  }

  /**
   * The dialogue the player is in.
   *
   * @returns {Dialogue | null} The dialogue, or `null` while it is in none.
   */
  get dialogue(): Dialogue | null {
    return this.#dialogue;
  }

  /**
   * Takes health from the player, as much as it has at most; with none
   * left, it dies where it stands, out of any dialogue.
   *
   * @param {number} damage - The health to take.
   * @returns {number} The health it lost.
   */
  hurt(damage: number): number {
    const lost: number = Math.min(damage, this.#health);
    this.#health -= lost;
    if (this.#health === 0) {
      this.mover.kill();
      this.#deathSteps = DEATH_STEPS;
      this.#dialogue = null;
    }
    return lost;
  }

  /**
   * Gives the player health back, as much as it lacks of its full health
   * at most.
   *
   * @param {number} amount - The health to give back.
   * @returns {number} The health it gained, which is none at full health.
   */
  heal(amount: number): number {
    const gained: number = Math.max(
      Math.min(amount, PLAYER_HEALTH - this.#health),
      0,
    );
    this.#health += gained;
    return gained;
  }

  /**
   * Counts down one step of the time a dead player lies dead, and has it
   * alive again at full health once that is over.
   *
   * @returns {boolean} Whether the player comes back to life at this step.
   */
  countDownDeath(): boolean {
    if (this.#deathSteps === 0 || --this.#deathSteps > 0) {
      return false;
    }
    this.#health = PLAYER_HEALTH;
    return true;
  }

  /**
   * Puts an item into the inventory of the player, after the others, if it
   * has room for it.
   *
   * @param {ItemKindId} kind - The kind of the item.
   * @returns {boolean} Whether it had room.
   */
  addItem(kind: ItemKindId): boolean {
    if (!this.hasRoom) {
      return false;
    }
    this.#inventory.push(kind);
    return true;
  }

  /**
   * Takes the item out of a slot of the inventory of the player, the items
   * after it closing up.
   *
   * @param {number} slot - The number of the slot, from 0.
   * @returns {ItemKindId | undefined} The item, or `undefined` if the slot
   *   holds none, when nothing changes.
   */
  takeSlot(slot: number): ItemKindId | undefined {
    const [kind] = this.#inventory.splice(slot, 1);
    return kind;
  }

  /**
   * Takes the first item of a kind out of the inventory of the player, the
   * items after it closing up, if it carries one.
   *
   * @param {ItemKindId} kind - The kind of the item.
   */
  takeItem(kind: ItemKindId): void {
    const slot: number = this.#inventory.indexOf(kind);
    if (slot !== -1) {
      this.#inventory.splice(slot, 1);
    }
  }

  /**
   * Gives the player silver coins.
   *
   * @param {number} count - The number of coins.
   */
  earnSilver(count: number): void {
    this.#silver += count;
  }

  /**
   * Takes silver coins from the player, as many as it has at most.
   *
   * @param {number} count - The number of coins.
   */
  paySilver(count: number): void {
    this.#silver -= Math.min(count, this.#silver);
  }

  /**
   * Records that a villager has told the player who it is.
   *
   * @param {VillagerId} villager - The villager.
   */
  meet(villager: VillagerId): void {
    if (!this.#acquaintances.includes(villager)) {
      this.#acquaintances.push(villager);
    }
  }

  /**
   * Has a villager say a line of a dialogue to the player, which the player
   * is in from then on, numbered after every line said to it before.
   *
   * @param {VillagerId} villager - The villager.
   * @param {string} node - The name of the node of the line.
   */
  enterDialogue(villager: VillagerId, node: string): void {
    this.#dialogue = { villager, node, turn: ++this.#turnCount };
  }

  /** Takes the player out of the dialogue it is in, if any. */
  leaveDialogue(): void {
    this.#dialogue = null;
  }

  /**
   * Keeps what a villager says to the player in passing, or within its
   * hearing, for the player to be told once.
   *
   * @param {Speech} speech - What the villager says.
   */
  hear(speech: Speech): void {
    this.#speeches.push(speech);
  }

  /**
   * Takes what the villagers have said to the player in passing, or within
   * its hearing, since it was last taken.
   *
   * @returns {Speech[]} What they said, in the order they said it, each
   *   taken only once.
   */
  takeSpeeches(): Speech[] {
    const speeches: Speech[] = this.#speeches;
    this.#speeches = [];
    return speeches;
  }

  /**
   * Keeps what a player says within the hearing of the player, for the
   * player to be told once.
   *
   * @param {Saying} saying - What is said.
   */
  overhear(saying: Saying): void {
    this.#sayings.push(saying);
  }

  /**
   * Takes what the players nearby, and the player itself, have said within
   * its hearing since it was last taken.
   *
   * @returns {Saying[]} What was said, in the order it was said, each taken
   *   only once.
   */
  takeSayings(): Saying[] {
    const sayings: Saying[] = this.#sayings;
    this.#sayings = [];
    return sayings;
  }
}

/** A dialogue a player is in. */
export interface Dialogue {
  /** The villager the player talks to. */
  readonly villager: VillagerId;
  /** The name of the node of the line the villager has just said. */
  readonly node: string;
  /** The number of the line among every line said to the player, from 1. */
  readonly turn: number;
}

/** What a villager says to a player in passing, outside any dialogue. */
export interface Speech {
  /** The villager who speaks. */
  readonly villager: VillagerId;
  /** The message of what the villager says. */
  readonly line: string;
}

/** A line a player says to the players nearby. */
export interface SaidLine {
  /**
   * The channel it is said on, named after the message a peer sends on
   * it.
   */
  readonly kind: 'say';
  /** The identifier of the player who speaks. */
  readonly player: number;
  /** The line the player says. */
  readonly text: string;
}

/** A phrase a player says to the players nearby. */
export interface SaidPhrase {
  /**
   * The channel it is said on, named after the message a peer sends on
   * it.
   */
  readonly kind: 'phrase';
  /** The identifier of the player who speaks. */
  readonly player: number;
  /** The code of the phrase the player says. */
  readonly phrase: PhraseCode;
}

/** What a player says to the players nearby. */
export type Saying = SaidLine | SaidPhrase;

/**
 * Describes a player as it is now.
 *
 * @param {Player} player - The player.
 * @returns {PlayerState} The state of the player.
 */
export function describePlayer(player: Player): PlayerState {
  const { x, z, yaw, action, actionCount } = player.mover.motion;
  const { id, appearance, health } = player;
  return { id, appearance, x, z, yaw, action, actionCount, health };
}
