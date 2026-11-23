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
 * @module server/dialogue How the dialogues of the villagers go: which line
 *   a talk opens with, which a reply leads to, and what must hold of a
 *   player for a line to be said to it.
 */

import { findQuest, hasRoom } from '@clovervale/shared';
import type {
  ItemKindId,
  Quest,
  QuestId,
  QuestStage,
  StoryEventType,
  VillagerId,
} from '@clovervale/shared';

import { DIALOGUE_SCRIPTS } from './dialogue-scripts.ts';

/** How far a player must have gotten with a quest. */
export interface QuestCondition {
  /** The quest. */
  readonly id: QuestId;
  /**
   * The stages the player must have gotten to one of, among which `null`
   * stands for not having opened the quest.
   */
  readonly stages: readonly (QuestStage | null)[];
}

/**
 * What must hold of a player for a line to be said to it.  Whatever is left
 * out does not matter.
 */
export interface DialogueCondition {
  /**
   * Whether the villager must have told the player who it is, or must not
   * have.
   */
  readonly isAcquainted?: boolean;
  /** An item the player must carry. */
  readonly carries?: ItemKindId;
  /** An item the player must not carry. */
  readonly lacks?: ItemKindId;
  /** Another villager who must have told the player who it is. */
  readonly knows?: VillagerId;
  /** How far the player must have gotten with a quest. */
  readonly quest?: QuestCondition;
  /** The fewest silver coins the player must have. */
  readonly hasSilver?: number;
  /** The number of silver coins the player must have fewer than. */
  readonly lacksSilver?: number;
  /**
   * Whether the inventory of the player must have room for another item,
   * or must be full.
   */
  readonly hasRoom?: boolean;
}

/** What comes of a line once it is said to a player. */
export interface DialogueOutcome {
  /** Whether the villager tells the player who it is with the line. */
  readonly introduces?: boolean;
  /**
   * An item the villager takes from the player with the line, before it
   * gives any.
   */
  readonly takes?: ItemKindId;
  /**
   * The number of silver coins the villager takes from the player with the
   * line, before it gives anything.
   */
  readonly charges?: number;
  /** An item the villager gives the player with the line. */
  readonly gives?: ItemKindId;
  /**
   * The event of the story of the player the villager tells of with the
   * line, once everything else has come of it.
   */
  readonly emits?: StoryEventType;
}

/** A reply a player is offered after a line. */
export interface DialogueReply {
  /** The message of the reply. */
  readonly text: string;
  /**
   * The name of the node the reply leads to, or the names of the nodes it
   * may lead to, in order, of which it leads to the first whose condition
   * holds of the player, or `null` for a reply that ends the dialogue.
   */
  readonly next: string | readonly string[] | null;
}

/** A line a villager says, and what a player can reply. */
export interface DialogueNode {
  /** What must hold of the player for the line to be said to it. */
  readonly condition?: DialogueCondition;
  /** The message of the line. */
  readonly line: string;
  /**
   * The replies the player is offered, in order, no more than three.  With
   * none, the player can only end the dialogue.
   */
  readonly replies: readonly DialogueReply[];
  /** What comes of the line once it is said. */
  readonly outcome?: DialogueOutcome;
  /**
   * Whether the line is said in passing, outside any dialogue, as a talk
   * that opens with it is.  Such a line offers no replies.
   */
  readonly isRemark?: boolean;
}

/** Everything a villager can say in its dialogues. */
export interface DialogueScript {
  /** The lines, by the names of their nodes. */
  readonly nodes: Readonly<Record<string, DialogueNode>>;
  /**
   * The names of the nodes a talk can open with, in order: a talk opens
   * with the first whose condition holds.
   */
  readonly openings: readonly string[];
  /**
   * The names of the nodes a dialogue the villager opens itself, on coming
   * up to a player, can start with, in order: it starts with the first
   * whose condition holds.  None if left out.
   */
  readonly approaches?: readonly string[];
  /**
   * The names of the nodes a talk opens with when none of its openings
   * does, of which it opens with one whose condition holds, at random,
   * each as likely as any other.  None if left out.
   */
  readonly chatter?: readonly string[];
}

/** What a player is, as far as a dialogue goes. */
export interface Listener {
  /** The items the player carries. */
  readonly inventory: readonly ItemKindId[];
  /** The villagers who have told the player who they are. */
  readonly acquaintances: readonly VillagerId[];
  /**
   * The quests the player has opened, each at the stage it has gotten to.
   */
  readonly quests: readonly Quest[];
  /** The number of silver coins the player has. */
  readonly silver: number;
}

/**
 * Gets a line of a villager.
 *
 * @param {VillagerId} villager - The villager.
 * @param {string} name - The name of the node of the line.
 * @returns {DialogueNode} The line.
 * @throws {Error} If the villager has no such line.
 */
export function getDialogueNode(
  villager: VillagerId,
  name: string,
): DialogueNode {
  const node: DialogueNode | undefined =
    DIALOGUE_SCRIPTS[villager]?.nodes[name];
  if (node === undefined) {
    throw new Error(`${villager} has no line ${name}.`);
  }
  return node;
}

/**
 * Finds the line a talk of a player to a villager opens with.
 *
 * @param {VillagerId} villager - The villager.
 * @param {Listener} listener - The player.
 * @returns {string | null} The name of the node of the first opening of
 *   the script of the villager whose condition holds of the player, or
 *   `null` if none does, or if the villager has no script.
 */
export function findOpening(
  villager: VillagerId,
  listener: Listener,
): string | null {
  return findFirstMet(
    villager,
    DIALOGUE_SCRIPTS[villager]?.openings ?? [],
    listener,
  );
}

/**
 * Chooses the line a talk of a player to a villager opens with when none
 * of the openings of its script does.
 *
 * @param {VillagerId} villager - The villager.
 * @param {Listener} listener - The player.
 * @param {() => number} drawRandom - Gives a random number from 0 up to
 *   but not including 1, which is drawn once if there is a line to choose.
 * @returns {string | null} The name of the node of one of the lines of the
 *   chatter of the script of the villager whose condition holds of the
 *   player, at random, each as likely as any other, or `null` if none does,
 *   or if the villager has no script.
 */
export function chooseChatter(
  villager: VillagerId,
  listener: Listener,
  drawRandom: () => number,
): string | null {
  const lines: string[] = (DIALOGUE_SCRIPTS[villager]?.chatter ?? []).filter(
    (name: string) =>
      meetsCondition(getDialogueNode(villager, name), villager, listener),
  );
  if (lines.length === 0) {
    return null;
  }
  return lines[Math.floor(drawRandom() * lines.length)] ?? null;
}

/**
 * Finds the line a dialogue a villager opens itself with a player, on
 * coming up to it, starts with.
 *
 * @param {VillagerId} villager - The villager.
 * @param {Listener} listener - The player.
 * @returns {string | null} The name of the node of the first of the
 *   approaches of the script of the villager whose condition holds of the
 *   player, or `null` if none does, or if the villager has no script.
 */
export function findApproach(
  villager: VillagerId,
  listener: Listener,
): string | null {
  return findFirstMet(
    villager,
    DIALOGUE_SCRIPTS[villager]?.approaches ?? [],
    listener,
  );
}

/**
 * Finds the line a reply of a player to a line of a villager takes the
 * dialogue on to.
 *
 * @param {VillagerId} villager - The villager.
 * @param {string} name - The name of the node of the line the player
 *   replies to.
 * @param {number} choice - The number of the reply among those offered,
 *   from 0.
 * @param {Listener} listener - The player.
 * @returns {string | null | undefined} The name of the node of the first
 *   line the reply leads to whose condition holds of the player; `null` if
 *   the reply ends the dialogue, as one that leads to no such line does,
 *   and as any reply to a line that offers none does; or `undefined` if
 *   the line offers replies but none numbered so.
 * @throws {Error} If the villager has no such line.
 */
export function findReplyNode(
  villager: VillagerId,
  name: string,
  choice: number,
  listener: Listener,
): string | null | undefined {
  const { replies } = getDialogueNode(villager, name);
  if (replies.length === 0) {
    return null;
  }
  const reply: DialogueReply | undefined = replies[choice];
  if (reply === undefined) {
    return undefined;
  }
  if (reply.next === null) {
    return null;
  }
  return findFirstMet(
    villager,
    typeof reply.next === 'string' ? [reply.next] : reply.next,
    listener,
  );
}

/**
 * Finds the first of some lines of a villager whose condition holds of a
 * player.
 *
 * @param {VillagerId} villager - The villager.
 * @param {readonly string[]} names - The names of the nodes of the lines,
 *   in order.
 * @param {Listener} listener - The player.
 * @returns {string | null} The name of the node of the first line whose
 *   condition holds of the player, or `null` if none does.
 * @throws {Error} If the villager has no such line.
 */
function findFirstMet(
  villager: VillagerId,
  names: readonly string[],
  listener: Listener,
): string | null {
  return (
    names.find((name: string) =>
      meetsCondition(getDialogueNode(villager, name), villager, listener),
    ) ?? null
  );
}

/**
 * Tells whether the condition of a line holds of a player.
 *
 * @param {DialogueNode} node - The line.
 * @param {VillagerId} villager - The villager who says it.
 * @param {Listener} listener - The player.
 * @returns {boolean} Whether it holds, as it does of a line without one.
 */
function meetsCondition(
  node: DialogueNode,
  villager: VillagerId,
  listener: Listener,
): boolean {
  const {
    isAcquainted,
    carries,
    lacks,
    knows,
    quest,
    hasSilver,
    lacksSilver,
    hasRoom: needsRoom,
  } = node.condition ?? {};
  return (
    (quest === undefined ||
      quest.stages.includes(
        findQuest(listener.quests, quest.id)?.stage ?? null,
      )) &&
    (hasSilver === undefined || listener.silver >= hasSilver) &&
    (lacksSilver === undefined || listener.silver < lacksSilver) &&
    (needsRoom === undefined || hasRoom(listener.inventory) === needsRoom) &&
    (isAcquainted === undefined ||
      listener.acquaintances.includes(villager) === isAcquainted) &&
    (carries === undefined || listener.inventory.includes(carries)) &&
    (lacks === undefined || !listener.inventory.includes(lacks)) &&
    (knows === undefined || listener.acquaintances.includes(knows))
  );
}
