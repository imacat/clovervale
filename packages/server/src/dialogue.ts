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

import {
  CLOVER_KIND,
  HEALING_POTION_PRICE,
  hasRoom,
} from '@clovervale/shared';
import type {
  ItemKindId,
  QuestId,
  QuestLog,
  QuestStage,
  VillagerId,
} from '@clovervale/shared';

/** How far a player must have got with a quest. */
export interface QuestCondition {
  /** The quest. */
  readonly id: QuestId;
  /**
   * The stages the player must have got to one of, among which `null`
   * stands for not having taken the quest on.
   */
  readonly stages: readonly (QuestStage | null)[];
}

/** A stage a player gets to in a quest. */
export interface QuestStep {
  /** The quest. */
  readonly id: QuestId;
  /** The stage. */
  readonly stage: QuestStage;
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
  /** How far the player must have got with a quest. */
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
  /** The stage the player gets to in a quest with the line. */
  readonly sets?: QuestStep;
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
interface DialogueScript {
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
  /** How far the player has got with each quest it has taken on. */
  readonly quests: QuestLog;
  /** The number of silver coins the player has. */
  readonly silver: number;
}

/**
 * The messages of the lines Toby says in passing to a player who talks to
 * him, one of them each time, at random.
 */
export const TOBY_LINES: readonly string[] = [
  'villager.toby.line.1',
  'villager.toby.line.2',
  'villager.toby.line.3',
];

/**
 * The message of the line Toby says in passing as he gives a player a
 * four-leaved clover.
 */
export const TOBY_GIFT_LINE = 'villager.toby.gift';

/** The quest in which Toby, who has hurt himself, waits for ointment. */
const TOBY_HURT: QuestId = 'toby-hurt';

/** That a player is on {@link TOBY_HURT}, given the ointment or not. */
const ON_TOBY_HURT: QuestCondition = {
  id: TOBY_HURT,
  stages: ['started', 'supplied'],
};

/** The item Martha gives a player to take to Toby, hurt. */
const MARTHA_OINTMENT: ItemKindId = 'martha-ointment';

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
 * What Toby, the child who hunts for four-leaved clover, says of his fall:
 * to a player who has not taken on {@link TOBY_HURT}, that he has fallen
 * and hurt himself, with his parents out in the fields, and that his
 * mother told him to go to the village chief, which has the player take
 * it on and promise to ask her; to a player on it without
 * {@link MARTHA_OINTMENT}, in passing, that it still hurts; and to a player
 * on it with the ointment, that it still hurts, which the player answers
 * by putting the ointment on and telling him to take care, and his promise
 * to, with his thanks, with which he takes the ointment, the quest is done,
 * and he gives the player a four-leaved clover.  To a player who has done
 * the quest, he only chatters.
 */
const TOBY_SCRIPT: DialogueScript = {
  nodes: {
    hurt: {
      condition: { quest: { id: TOBY_HURT, stages: [null] } },
      line: 'dialogue.toby.hurt',
      replies: [{ text: 'dialogue.toby.promise', next: null }],
      outcome: { sets: { id: TOBY_HURT, stage: 'started' } },
    },
    ache: {
      condition: {
        quest: ON_TOBY_HURT,
        carries: MARTHA_OINTMENT,
      },
      line: 'dialogue.toby.moan',
      replies: [{ text: 'dialogue.toby.dress', next: 'thank' }],
    },
    thank: {
      condition: {
        quest: ON_TOBY_HURT,
        carries: MARTHA_OINTMENT,
      },
      line: 'dialogue.toby.thanks',
      replies: [],
      outcome: {
        takes: MARTHA_OINTMENT,
        gives: CLOVER_KIND,
        sets: { id: TOBY_HURT, stage: 'done' },
      },
    },
    moan: {
      condition: {
        quest: ON_TOBY_HURT,
        lacks: MARTHA_OINTMENT,
      },
      line: 'dialogue.toby.moan',
      replies: [],
      isRemark: true,
    },
  },
  openings: ['hurt', 'ache', 'moan'],
};

/**
 * What Martha, the village chief, who is the enemy spy, says.  To a player
 * she has come up to as it climbs out of her well: she asks who it is and
 * why it has come out of the well; the player tells her of the envoy of
 * the kingdom shut in down there, if Edwin has told it who he is, or else
 * of somebody shut in down there; and she owns up to being the spy, and
 * tells the player it is to stay down there too.  To a player who talks
 * to her on {@link TOBY_HURT}: without {@link MARTHA_OINTMENT}, before she
 * has given it any, she welcomes it, is told of Toby's fall, and gives it
 * her ointment for him; without it, once she has given it some, she asks
 * after Toby, is told the ointment is lost, and gives it another jar; and
 * with it, she tells it in passing to hurry to him.  To any other
 * player who talks to her, she only chatters.
 */
const MARTHA_SCRIPT: DialogueScript = {
  nodes: {
    welcome: {
      condition: {
        quest: { id: TOBY_HURT, stages: ['started'] },
        lacks: MARTHA_OINTMENT,
      },
      line: 'dialogue.martha.welcome',
      replies: [{ text: 'dialogue.martha.askMedicine', next: 'ointment' }],
    },
    ointment: {
      line: 'dialogue.martha.ointment',
      replies: [],
      outcome: {
        gives: MARTHA_OINTMENT,
        sets: { id: TOBY_HURT, stage: 'supplied' },
      },
    },
    wonder: {
      condition: {
        quest: { id: TOBY_HURT, stages: ['supplied'] },
        lacks: MARTHA_OINTMENT,
      },
      line: 'dialogue.martha.wonder',
      replies: [{ text: 'dialogue.martha.tellLost', next: 'replace' }],
    },
    replace: {
      line: 'dialogue.martha.replace',
      replies: [],
      outcome: { gives: MARTHA_OINTMENT },
    },
    hurry: {
      condition: {
        quest: ON_TOBY_HURT,
        carries: MARTHA_OINTMENT,
      },
      line: 'dialogue.martha.hurry',
      replies: [],
      isRemark: true,
    },
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
  openings: ['welcome', 'wonder', 'hurry'],
  approaches: ['askEnvoy', 'ask'],
};

/** The item Basil the apothecary sells. */
const HEALING_POTION: ItemKindId = 'healing-potion';

/** The reply with which a player buys a healing potion from Basil. */
const BUY_POTION: DialogueReply = {
  text: 'dialogue.basil.buy',
  next: ['sold', 'short', 'full'],
};

/** The reply with which a player buys nothing from Basil. */
const DECLINE_POTION: DialogueReply = {
  text: 'dialogue.basil.decline',
  next: 'farewell',
};

/**
 * What Basil the apothecary says, who has nothing to say but to sell his
 * healing potions, at {@link HEALING_POTION_PRICE} silver coins a bottle.
 * To any player who talks to him, he offers a potion at that price, which
 * the player may buy or not.  A player with as many coins and with room in
 * its inventory pays them and gets a potion, and is offered another; one
 * with too few coins is told so, before being told its inventory is full
 * if it is, and one with no room is told so, and either gets nothing and
 * pays nothing.  A player who buys nothing is bidden farewell.
 */
const BASIL_SCRIPT: DialogueScript = {
  nodes: {
    offer: {
      line: 'dialogue.basil.offer',
      replies: [BUY_POTION, DECLINE_POTION],
    },
    sold: {
      condition: { hasSilver: HEALING_POTION_PRICE, hasRoom: true },
      line: 'dialogue.basil.sold',
      replies: [BUY_POTION, DECLINE_POTION],
      outcome: { charges: HEALING_POTION_PRICE, gives: HEALING_POTION },
    },
    short: {
      condition: { lacksSilver: HEALING_POTION_PRICE },
      line: 'dialogue.basil.short',
      replies: [],
    },
    full: {
      condition: { hasRoom: false },
      line: 'dialogue.basil.full',
      replies: [],
    },
    farewell: {
      line: 'dialogue.basil.farewell',
      replies: [],
    },
  },
  openings: ['offer'],
};

/**
 * What the villagers with something to tell say, by villager.  A villager
 * without a script, or without an opening for a player, only chatters,
 * which the peers word themselves, but for Toby, whose chatter the server
 * chooses.
 */
const DIALOGUE_SCRIPTS: Readonly<
  Partial<Record<VillagerId, DialogueScript>>
> = {
  toby: TOBY_SCRIPT,
  edwin: EDWIN_SCRIPT,
  martha: MARTHA_SCRIPT,
  basil: BASIL_SCRIPT,
};

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
  const openings: readonly string[] =
    DIALOGUE_SCRIPTS[villager]?.openings ?? [];
  return (
    openings.find((name: string) =>
      meetsCondition(getDialogueNode(villager, name), villager, listener),
    ) ?? null
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
    approaches.find((name: string) =>
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
export function meetsCondition(
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
      quest.stages.includes(listener.quests[quest.id] ?? null)) &&
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
