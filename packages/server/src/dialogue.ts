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
 * @module server/dialogue What the villagers with something to tell say to
 *   a player who talks to them, or whom they come up to, and what comes of
 *   it.
 */

import type { ItemKindId, VillagerId } from '@clovervale/shared';

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
}

/** What comes of a line once it is said to a player. */
export interface DialogueOutcome {
  /** Whether the villager tells the player who it is with the line. */
  readonly introduces?: boolean;
  /** An item the villager gives the player with the line. */
  readonly gives?: ItemKindId;
}

/** A reply a player is offered after a line. */
export interface DialogueReply {
  /** The message of the reply. */
  readonly text: string;
  /**
   * The name of the node the reply leads to, or `null` for a reply that
   * ends the dialogue.
   */
  readonly next: string | null;
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
}

/** What a player is, as far as a dialogue goes. */
export interface Listener {
  /** The items the player carries. */
  readonly inventory: readonly ItemKindId[];
  /** The villagers who have told the player who they are. */
  readonly acquaintances: readonly VillagerId[];
}

/** The item Edwin gives a player to take to the king. */
const EDWIN_MESSAGE: ItemKindId = 'clovervale-message';

/**
 * What Edwin, the prisoner in the cave, says: to a player he has not told
 * who he is, a plea for help, who he is, and a message to take to the king
 * at once; to a player he has, and who carries the message, a reminder in
 * passing to hurry; and to one who does not carry it any more, the message
 * written again.
 */
const EDWIN_SCRIPT: DialogueScript = {
  nodes: {
    plea: {
      condition: { isAcquainted: false },
      line: 'dialogue.edwin.plea',
      replies: [{ text: 'dialogue.edwin.askWho', next: 'identity' }],
    },
    identity: {
      line: 'dialogue.edwin.identity',
      replies: [{ text: 'dialogue.edwin.offerKey', next: 'errand' }],
      outcome: { introduces: true },
    },
    errand: {
      line: 'dialogue.edwin.errand',
      replies: [],
      outcome: { gives: EDWIN_MESSAGE },
    },
    reminder: {
      condition: { isAcquainted: true, carries: EDWIN_MESSAGE },
      line: 'dialogue.edwin.reminder',
      replies: [],
      isRemark: true,
    },
    wonder: {
      condition: { isAcquainted: true, lacks: EDWIN_MESSAGE },
      line: 'dialogue.edwin.wonder',
      replies: [{ text: 'dialogue.edwin.tellLost', next: 'rewrite' }],
    },
    rewrite: {
      line: 'dialogue.edwin.rewrite',
      replies: [],
      outcome: { gives: EDWIN_MESSAGE },
    },
  },
  openings: ['plea', 'reminder', 'wonder'],
};

/**
 * What Martha, the village chief, who is the enemy spy, says to a player
 * she has come up to as it climbs out of her well: she asks who it is and
 * why it has come out of the well; the player tells her of the envoy of
 * the kingdom shut in down there, if Edwin has told it who he is, or else
 * of somebody shut in down there; and she owns up to being the spy, and
 * tells the player it is to stay down there too.  None of it is said
 * when the player talks to her: she only chatters then.
 */
const MARTHA_SCRIPT: DialogueScript = {
  nodes: {
    askEnvoy: {
      condition: { knows: 'edwin' },
      line: 'dialogue.martha.ask',
      replies: [{ text: 'dialogue.martha.tellEnvoy', next: 'confession' }],
    },
    ask: {
      line: 'dialogue.martha.ask',
      replies: [{ text: 'dialogue.martha.tellPrisoner', next: 'confession' }],
    },
    confession: {
      line: 'dialogue.martha.confession',
      replies: [],
    },
  },
  openings: [],
  approaches: ['askEnvoy', 'ask'],
};

/**
 * What the villagers with something to tell say, by villager.  A villager
 * without a script only chatters, which the peers word themselves.
 */
export const DIALOGUE_SCRIPTS: Readonly<
  Partial<Record<VillagerId, DialogueScript>>
> = {
  edwin: EDWIN_SCRIPT,
  martha: MARTHA_SCRIPT,
};

/**
 * Finds a line of a villager.
 *
 * @param {VillagerId} villager - The villager.
 * @param {string} name - The name of the node of the line.
 * @returns {DialogueNode | null} The line, or `null` if the villager has no
 *   such line.
 */
export function findDialogueNode(
  villager: VillagerId,
  name: string,
): DialogueNode | null {
  const nodes: Readonly<Record<string, DialogueNode>> | undefined =
    DIALOGUE_SCRIPTS[villager]?.nodes;
  return nodes !== undefined && Object.hasOwn(nodes, name)
    ? (nodes[name] ?? null)
    : null;
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
  const openings: readonly string[] =
    DIALOGUE_SCRIPTS[villager]?.openings ?? [];
  return (
    openings.find((name: string) => {
      const node: DialogueNode | null = findDialogueNode(villager, name);
      return node !== null && meetsCondition(node, villager, listener);
    }) ?? null
  );
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
  const approaches: readonly string[] =
    DIALOGUE_SCRIPTS[villager]?.approaches ?? [];
  return (
    approaches.find((name: string) => {
      const node: DialogueNode | null = findDialogueNode(villager, name);
      return node !== null && meetsCondition(node, villager, listener);
    }) ?? null
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
export function meetsCondition(
  node: DialogueNode,
  villager: VillagerId,
  listener: Listener,
): boolean {
  const { isAcquainted, carries, lacks, knows } = node.condition ?? {};
  return (
    (isAcquainted === undefined ||
      listener.acquaintances.includes(villager) === isAcquainted) &&
    (carries === undefined || listener.inventory.includes(carries)) &&
    (lacks === undefined || !listener.inventory.includes(lacks)) &&
    (knows === undefined || listener.acquaintances.includes(knows))
  );
}
