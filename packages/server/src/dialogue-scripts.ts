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
 * @module server/dialogue-scripts What the villagers with something to tell
 *   say to a player who talks to them, or whom they come up to, and what
 *   comes of it.
 */

import { CLOVER_KIND, HEALING_POTION_PRICE } from '@clovervale/shared';
import type { ItemKindId, QuestId, VillagerId } from '@clovervale/shared';

import type {
  DialogueReply,
  DialogueScript,
  QuestCondition,
} from './dialogue.ts';

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
 * written again.  Whenever he gives the message, he tells of it as
 * `message-given`.
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
      outcome: { gives: EDWIN_MESSAGE, emits: 'message-given' },
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
      outcome: { gives: EDWIN_MESSAGE, emits: 'message-given' },
    },
  },
  openings: ['plea', 'reminder', 'wonder'],
};

/**
 * What Toby, the child who hunts for four-leaved clover, says of his fall:
 * to a player who has not taken on {@link TOBY_HURT}, that he has fallen
 * and hurt himself, with his parents out in the fields, and that his
 * mother told him to go to the village chief, which he tells of as
 * `fall-told`, and which the player answers by promising to ask her; to a
 * player on it without {@link MARTHA_OINTMENT}, in passing, that it still
 * hurts; and to a player on it with the ointment, that it still hurts,
 * which the player answers by putting the ointment on and telling him to
 * take care, and his promise to, with his thanks, with which he takes the
 * ointment, gives the player a four-leaved clover, and tells of having had
 * the ointment as `ointment-received`.  To a player who has done the
 * quest, he only chatters in passing: one of his lines, or, while the
 * inventory of the player has room, the line with which he gives the player
 * a four-leaved clover as well.
 */
const TOBY_SCRIPT: DialogueScript = {
  nodes: {
    hurt: {
      condition: { quest: { id: TOBY_HURT, stages: [null] } },
      line: 'dialogue.toby.hurt',
      replies: [{ text: 'dialogue.toby.promise', next: null }],
      outcome: { emits: 'fall-told' },
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
        emits: 'ointment-received',
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
    line1: {
      line: 'villager.toby.line.1',
      replies: [],
      isRemark: true,
    },
    line2: {
      line: 'villager.toby.line.2',
      replies: [],
      isRemark: true,
    },
    line3: {
      line: 'villager.toby.line.3',
      replies: [],
      isRemark: true,
    },
    gift: {
      condition: { hasRoom: true },
      line: 'villager.toby.gift',
      replies: [],
      outcome: { gives: CLOVER_KIND },
      isRemark: true,
    },
  },
  openings: ['hurt', 'ache', 'moan'],
  chatter: ['line1', 'line2', 'line3', 'gift'],
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
 * with it, she tells it in passing to hurry to him.  Whenever she gives her
 * ointment, she tells of it as `ointment-given`.  To any other player who
 * talks to her, she only chatters.
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
        emits: 'ointment-given',
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
      outcome: { gives: MARTHA_OINTMENT, emits: 'ointment-given' },
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
 * without a script says nothing the server chooses.
 */
export const DIALOGUE_SCRIPTS: Readonly<
  Partial<Record<VillagerId, DialogueScript>>
> = {
  toby: TOBY_SCRIPT,
  edwin: EDWIN_SCRIPT,
  martha: MARTHA_SCRIPT,
  basil: BASIL_SCRIPT,
};
