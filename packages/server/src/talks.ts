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
 * @module server/talks The talks of the players with the villagers of a
 *   world, and what comes of them.
 */

import { getVillager, hasServerWords } from '@clovervale/shared';
import type { DialogueView, VillagerId } from '@clovervale/shared';

import {
  chooseChatter,
  findApproach,
  findOpening,
  findReplyNode,
  getDialogueNode,
} from './dialogue.ts';
import type { DialogueNode, DialogueReply } from './dialogue.ts';
import type { ItemKeeper } from './item-keeper.ts';
import type { Dialogue, Player } from './player.ts';
import type { StoryTeller } from './story.ts';

/**
 * The talks of the players with the villagers of a world: the lines the
 * villagers say, the replies of the players, and what the lines bring
 * about.
 *
 * Whenever a line is said to a player, what the line brings about comes
 * about at once: the villager may tell the player who it is; may take an
 * item of the kind it names out of the inventory of the player, the items
 * after it closing up; may take as many of its silver coins as it names,
 * or all it has if it has fewer; may then give it an item, which is laid
 * at its feet as if put down if its inventory has no room for it; and may
 * then tell its listeners of an event of the story of the player, as
 * {@link StoryTeller.tell} tells.
 */
export class Talks {
  readonly #items: ItemKeeper;
  /** Gives a random number from 0 up to but not including 1. */
  readonly #drawRandom: () => number;
  /** Finds a villager of the world, as one who tells of the story. */
  readonly #findTeller: (id: VillagerId) => StoryTeller | undefined;

  /**
   * Starts the talks of a world.
   *
   * @param {ItemKeeper} items - What there is to pick in the world, where
   *   an item given to a player without room is laid.
   * @param {() => number} drawRandom - Gives a random number from 0 up to
   *   but not including 1, for the chatter of the villagers.
   * @param {(id: VillagerId) => StoryTeller | undefined} findTeller - Finds
   *   a villager of the world, which tells of the events of the story the
   *   lines it says bring about.
   */
  constructor(
    items: ItemKeeper,
    drawRandom: () => number,
    findTeller: (id: VillagerId) => StoryTeller | undefined,
  ) {
    this.#items = items;
    this.#drawRandom = drawRandom;
    this.#findTeller = findTeller;
  }

  /**
   * Starts a talk of a player to a villager.
   *
   * A talk to a villager whose words the server chooses for the player, as
   * {@link hasServerWords} tells, opens with the first of the openings of
   * its script whose condition holds of the player, as {@link findOpening}
   * finds, or else with a line of its chatter, as {@link chooseChatter}
   * chooses, if any: a line said in passing is kept for the player to be
   * told once, and any other line starts a dialogue.  Any other talk
   * changes nothing.
   *
   * @param {Player} player - The player.
   * @param {VillagerId} villager - The villager.
   */
  start(player: Player, villager: VillagerId): void {
    if (!hasServerWords(getVillager(villager), player.quests)) {
      return;
    }
    const opening: string | null =
      findOpening(villager, player) ??
      chooseChatter(villager, player, this.#drawRandom);
    if (opening === null) {
      return;
    }
    const node: DialogueNode = getDialogueNode(villager, opening);
    if (node.isRemark === true) {
      player.hear({ villager, line: node.line });
      this.#bringAbout(player, villager, node);
      return;
    }
    this.#reachNode(player, villager, opening);
  }

  /**
   * Has a villager who has come up to a player start a dialogue with it,
   * with the first of the approaches of its script whose condition holds
   * of the player, as {@link findApproach} finds, if any.
   *
   * @param {Player} player - The player.
   * @param {VillagerId} villager - The villager.
   */
  approach(player: Player, villager: VillagerId): void {
    const approach: string | null = findApproach(villager, player);
    if (approach !== null) {
      this.#reachNode(player, villager, approach);
    }
  }

  /**
   * Has a player answer the line said to it in its dialogue, if it is in
   * one, as {@link findReplyNode} tells: the dialogue goes on to the line
   * the reply leads to, or ends, and a reply that names none of those
   * offered does nothing.
   *
   * @param {Player} player - The player.
   * @param {number} choice - The number of the reply among those offered,
   *   from 0.
   */
  answer(player: Player, choice: number): void {
    const { dialogue } = player;
    if (dialogue === null) {
      return;
    }
    const next: string | null | undefined = findReplyNode(
      dialogue.villager,
      dialogue.node,
      choice,
      player,
    );
    if (next === null) {
      player.leaveDialogue();
    } else if (next !== undefined) {
      this.#reachNode(player, dialogue.villager, next);
    }
  }

  /**
   * Has a villager say a line of a dialogue to a player, and has what comes
   * of it come.
   *
   * @param {Player} player - The player.
   * @param {VillagerId} villager - The villager.
   * @param {string} name - The name of the node of the line, whose condition
   *   holds of the player.
   */
  #reachNode(player: Player, villager: VillagerId, name: string): void {
    const node: DialogueNode = getDialogueNode(villager, name);
    player.enterDialogue(villager, name);
    this.#bringAbout(player, villager, node);
  }

  /**
   * Has what comes of a line once it is said to a player come.
   *
   * @param {Player} player - The player.
   * @param {VillagerId} villager - The villager who says it.
   * @param {DialogueNode} node - The line.
   */
  #bringAbout(player: Player, villager: VillagerId, node: DialogueNode): void {
    const {
      introduces = false,
      takes,
      charges = 0,
      gives,
      emits,
    } = node.outcome ?? {};
    if (introduces) {
      player.meet(villager);
    }
    if (takes !== undefined) {
      player.takeItem(takes);
    }
    player.paySilver(charges);
    if (gives !== undefined) {
      this.#items.give(player, gives);
    }
    if (emits !== undefined) {
      this.#findTeller(villager)?.tell(emits, player.id);
    }
  }
}

/**
 * Describes a dialogue a player is in, as the player is to be told of it.
 *
 * @param {Dialogue} dialogue - The dialogue.
 * @returns {DialogueView} The dialogue as it stands.
 */
export function describeDialogue(dialogue: Dialogue): DialogueView {
  const node: DialogueNode = getDialogueNode(dialogue.villager, dialogue.node);
  return {
    villager: dialogue.villager,
    line: node.line,
    replies: node.replies.map((reply: DialogueReply) => reply.text),
    turn: dialogue.turn,
  };
}
