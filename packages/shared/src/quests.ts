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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/21
// AI assistance: Claude Code (Anthropic)

/**
 * @module shared/quests The quests a player goes on: the errand Toby sends
 *   it on and the main plot, how far it has got with each, what each waits
 *   for to move on, and how each is told on the wire.
 */

import {
  parseList,
  parseMember,
  parseRecord,
  rejectValue,
} from './parse.ts';
import type { VillagerId } from './villagers.ts';
import type { MapId } from './world-map.ts';

/** The identifiers of the quests there are. */
export const QUEST_IDS = ['toby-hurt', 'clovervale'] as const;

/** The identifier of a quest. */
export type QuestId = (typeof QUEST_IDS)[number];

/**
 * The stages of the quest of Toby, hurt: the player has promised him to ask
 * the village chief for help, has been given her ointment, and has put an
 * ointment on him, which it may do with or without hers.
 */
export const TOBY_STAGES = ['started', 'supplied', 'done'] as const;

/** A stage of the quest of Toby, hurt. */
export type TobyStage = (typeof TOBY_STAGES)[number];

/**
 * The stages of the main plot: the player has gone down into the cave; has
 * then got one of its two goals, in either order, the message of Edwin or
 * the token of Martha, the enemy spy, by beating her; and has got both.
 */
export const CLOVERVALE_STAGES = [
  'entered',
  'message',
  'token',
  'done',
] as const;

/** A stage of the main plot. */
export type ClovervaleStage = (typeof CLOVERVALE_STAGES)[number];

/** A stage of any quest. */
export type QuestStage = TobyStage | ClovervaleStage;

/**
 * The type of an event of the story a villager tells of a player: Toby has
 * told it of his fall, Martha has given it her ointment, Toby has had the
 * ointment from it, Edwin has given it his message, or it has beaten
 * Martha.
 */
export type StoryEventType =
  | 'fall-told'
  | 'ointment-given'
  | 'ointment-received'
  | 'message-given'
  | 'martha-beaten';

/** An event of the story, and the villager who tells of it. */
export interface StoryCue {
  /** The villager. */
  readonly villager: VillagerId;
  /** The event. */
  readonly event: StoryEventType;
}

/**
 * What a player needs of a villager in the story: Martha is to know it has
 * found the prisoner in her cave, or it holds the message of Edwin, and
 * her token is to be won from her.
 */
export type StoryNeed = 'prisoner-found' | 'message-held';

/** What a quest asks a villager for a player. */
export interface StoryRequest {
  /** The villager. */
  readonly villager: VillagerId;
  /** What the player needs of the villager. */
  readonly need: StoryNeed;
}

/**
 * What opens a quest for a player: an event of the story, as the villager
 * who tells of it tells of it, or the player coming into a world of a map.
 */
export type QuestOpening =
  | {
      /** That an event of the story opens it. */
      readonly type: 'cue';
      /** The event, and the villager who tells of it. */
      readonly cue: StoryCue;
    }
  | {
      /** That coming into a world of a map opens it. */
      readonly type: 'entry';
      /** The map. */
      readonly map: MapId;
    };

/** A quest there is, which tells what opens it for a player. */
export interface QuestType {
  /** What opens the quest. */
  readonly opening: QuestOpening;

  /**
   * Opens the quest, at its first stage.
   *
   * @returns {Quest} The quest opened.
   */
  new (): Quest;
}

/** A quest as it is told on the wire. */
export interface QuestJSON {
  /** The quest. */
  readonly id: QuestId;
  /** The stage the player has got to. */
  readonly stage: QuestStage;
}

/**
 * A quest a player has opened, and how far it has got with it.  A quest
 * moves on as the events it waits for happen, and never goes back.
 */
export interface Quest {
  /** The quest. */
  readonly id: QuestId;
  /** The stage the player has got to. */
  readonly stage: QuestStage;
  /** Whether the player has done the quest. */
  readonly isDone: boolean;
  /**
   * The events the quest waits for at its stage, any of which moves it on,
   * each with the villager who tells of it, which are none once it is done.
   */
  readonly awaits: readonly StoryCue[];
  /**
   * What the quest asks of a villager for the player whenever it arrives
   * somewhere in particular in the map of that villager, as one that climbs
   * out of the well does, at the stage the quest has got to, or `null` for
   * nothing.
   */
  readonly request: StoryRequest | null;

  /**
   * Moves the quest on, if the event is one it waits for.
   *
   * @param {StoryCue} cue - The event, and the villager who tells of it.
   * @returns {boolean} Whether the quest moved on.
   */
  advance(cue: StoryCue): boolean;

  /**
   * Tells the quest as it is to be told on the wire.
   *
   * @returns {QuestJSON} The quest and its stage.
   */
  toJSON(): QuestJSON;
}

/**
 * Tells whether two events of the story, each with the villager who tells
 * of it, are the same.
 *
 * @param {StoryCue} a - One of them.
 * @param {StoryCue} b - The other.
 * @returns {boolean} Whether they are.
 */
export function isSameCue(a: StoryCue, b: StoryCue): boolean {
  return a.villager === b.villager && a.event === b.event;
}

/** That Martha has given the player her ointment. */
const OINTMENT_GIVEN: StoryCue = { villager: 'martha', event: 'ointment-given' };

/** That Toby has had an ointment from the player. */
const OINTMENT_RECEIVED: StoryCue = {
  villager: 'toby',
  event: 'ointment-received',
};

/** That Edwin has given the player his message. */
const MESSAGE_GIVEN: StoryCue = { villager: 'edwin', event: 'message-given' };

/** That the player has beaten Martha. */
const MARTHA_BEATEN: StoryCue = { villager: 'martha', event: 'martha-beaten' };

/**
 * Parses the stage of a quest told on the wire.
 *
 * @template T - The type of the stages of the quest.
 * @param {unknown} value - The decoded quest.
 * @param {QuestId} id - The quest it is to be.
 * @param {readonly T[]} stages - The stages of the quest.
 * @returns {T} The stage.
 * @throws {Error} If the value is not that quest at one of its stages.
 */
function parseStage<T>(value: unknown, id: QuestId, stages: readonly T[]): T {
  const record: Record<string, unknown> = parseRecord(value);
  if (record.id !== id) {
    rejectValue();
  }
  return parseMember(record.stage, stages);
}

/**
 * The quest of Toby, hurt, which a player opens as Toby tells it of his
 * fall: it waits for Martha to give the player her ointment, or for Toby to
 * have an ointment from the player, which it may have found elsewhere;
 * once given hers, it waits for Toby to have it; and once Toby has had one,
 * it is done.
 */
export class TobyQuest implements Quest {
  /** What opens the quest: Toby telling the player of his fall. */
  static readonly opening: QuestOpening = {
    type: 'cue',
    cue: { villager: 'toby', event: 'fall-told' },
  };

  /** The quest. */
  readonly id = 'toby-hurt';
  /**
   * What the quest asks of a villager as the player arrives somewhere in
   * particular: nothing.
   */
  readonly request: StoryRequest | null = null;
  #stage: TobyStage;

  /**
   * Opens the quest, or takes it up again at a stage.
   *
   * @param {TobyStage} [stage] - The stage, the first by default.
   */
  constructor(stage: TobyStage = 'started') {
    this.#stage = stage;
  }

  /**
   * Rebuilds the quest as it is told on the wire.
   *
   * @param {unknown} value - The decoded quest.
   * @returns {TobyQuest} The quest.
   * @throws {Error} If the value is not this quest at one of its stages.
   */
  static fromJSON(value: unknown): TobyQuest {
    return new TobyQuest(parseStage(value, 'toby-hurt', TOBY_STAGES));
  }

  /**
   * The stage the player has got to.
   *
   * @returns {TobyStage} The stage.
   */
  get stage(): TobyStage {
    return this.#stage;
  }

  /**
   * Whether the player has put an ointment on Toby.
   *
   * @returns {boolean} Whether it has.
   */
  get isDone(): boolean {
    return this.#stage === 'done';
  }

  /**
   * The events the quest waits for: Martha giving her ointment, or Toby
   * having one, and once she has given hers, Toby having it.
   *
   * @returns {readonly StoryCue[]} The events, none once it is done.
   */
  get awaits(): readonly StoryCue[] {
    switch (this.#stage) {
      case 'started':
        return [OINTMENT_GIVEN, OINTMENT_RECEIVED];
      case 'supplied':
        return [OINTMENT_RECEIVED];
      case 'done':
        return [];
    }
  }

  /**
   * Moves the quest on, if the event is one it waits for: Toby having an
   * ointment ends it, and Martha giving hers has the player supplied.
   *
   * @param {StoryCue} cue - The event, and the villager who tells of it.
   * @returns {boolean} Whether the quest moved on.
   */
  advance(cue: StoryCue): boolean {
    if (!this.awaits.some((awaited: StoryCue) => isSameCue(awaited, cue))) {
      return false;
    }
    this.#stage = isSameCue(cue, OINTMENT_RECEIVED) ? 'done' : 'supplied';
    return true;
  }

  /**
   * Tells the quest as it is to be told on the wire.
   *
   * @returns {QuestJSON} The quest and its stage.
   */
  toJSON(): QuestJSON {
    return { id: this.id, stage: this.#stage };
  }
}

/**
 * The main plot, which a player opens the first time it goes down into the
 * cave: it has two goals, which the player may reach in either order, the
 * message of Edwin, as he gives it, and the token of Martha, as the player
 * beats her, and is done once it has reached both.  Until the player has
 * beaten her, it asks Martha for the player whenever it climbs out of the
 * well: as having found the prisoner, or, once it has the message, as
 * holding it.
 */
export class ClovervaleQuest implements Quest {
  /** What opens the quest: the player coming into the cave. */
  static readonly opening: QuestOpening = { type: 'entry', map: 'cave' };

  /** The quest. */
  readonly id = 'clovervale';
  #stage: ClovervaleStage;

  /**
   * Opens the quest, or takes it up again at a stage.
   *
   * @param {ClovervaleStage} [stage] - The stage, the first by default.
   */
  constructor(stage: ClovervaleStage = 'entered') {
    this.#stage = stage;
  }

  /**
   * Rebuilds the quest as it is told on the wire.
   *
   * @param {unknown} value - The decoded quest.
   * @returns {ClovervaleQuest} The quest.
   * @throws {Error} If the value is not this quest at one of its stages.
   */
  static fromJSON(value: unknown): ClovervaleQuest {
    return new ClovervaleQuest(
      parseStage(value, 'clovervale', CLOVERVALE_STAGES),
    );
  }

  /**
   * The stage the player has got to.
   *
   * @returns {ClovervaleStage} The stage.
   */
  get stage(): ClovervaleStage {
    return this.#stage;
  }

  /**
   * Whether the player has both the message of Edwin and the token of
   * Martha.
   *
   * @returns {boolean} Whether it has.
   */
  get isDone(): boolean {
    return this.#stage === 'done';
  }

  /**
   * The events the quest waits for: Edwin giving his message, until he
   * has, and Martha being beaten, until she has been.
   *
   * @returns {readonly StoryCue[]} The events, none once it is done.
   */
  get awaits(): readonly StoryCue[] {
    switch (this.#stage) {
      case 'entered':
        return [MESSAGE_GIVEN, MARTHA_BEATEN];
      case 'message':
        return [MARTHA_BEATEN];
      case 'token':
        return [MESSAGE_GIVEN];
      case 'done':
        return [];
    }
  }

  /**
   * What the quest asks of Martha as the player climbs out of the well,
   * until it has beaten her: that it has found the prisoner, or, once it
   * has his message, that it holds it.
   *
   * @returns {StoryRequest | null} The request, or `null` once the player
   *   has beaten her.
   */
  get request(): StoryRequest | null {
    switch (this.#stage) {
      case 'entered':
        return { villager: 'martha', need: 'prisoner-found' };
      case 'message':
        return { villager: 'martha', need: 'message-held' };
      case 'token':
      case 'done':
        return null;
    }
  }

  /**
   * Moves the quest on, if the event is one it waits for: to the goal it
   * reaches, or to done once it has reached both.
   *
   * @param {StoryCue} cue - The event, and the villager who tells of it.
   * @returns {boolean} Whether the quest moved on.
   */
  advance(cue: StoryCue): boolean {
    if (!this.awaits.some((awaited: StoryCue) => isSameCue(awaited, cue))) {
      return false;
    }
    if (this.#stage === 'entered') {
      this.#stage = isSameCue(cue, MESSAGE_GIVEN) ? 'message' : 'token';
    } else {
      this.#stage = 'done';
    }
    return true;
  }

  /**
   * Tells the quest as it is to be told on the wire.
   *
   * @returns {QuestJSON} The quest and its stage.
   */
  toJSON(): QuestJSON {
    return { id: this.id, stage: this.#stage };
  }
}

/** The quests there are, by their identifiers. */
export const QUEST_TYPES: Readonly<Record<QuestId, QuestType>> = {
  'toby-hurt': TobyQuest,
  clovervale: ClovervaleQuest,
};

/** How each quest is rebuilt as it is told on the wire. */
const QUEST_PARSERS: Readonly<Record<QuestId, (value: unknown) => Quest>> = {
  'toby-hurt': (value: unknown): Quest => TobyQuest.fromJSON(value),
  clovervale: (value: unknown): Quest => ClovervaleQuest.fromJSON(value),
};

/**
 * Rebuilds a quest as it is told on the wire.
 *
 * @param {unknown} value - The decoded quest.
 * @returns {Quest} The quest.
 * @throws {Error} If the value is no quest there is at one of its stages.
 */
export function parseQuest(value: unknown): Quest {
  const id: QuestId = parseMember(parseRecord(value).id, QUEST_IDS);
  return QUEST_PARSERS[id](value);
}

/**
 * Rebuilds the quests a player has opened as they are told on the wire.
 *
 * @param {unknown} value - The decoded quests.
 * @returns {Quest[]} The quests, in order.
 * @throws {Error} If the value is no list of quests there are, each at one
 *   of its stages and each once.
 */
export function parseQuests(value: unknown): Quest[] {
  const quests: Quest[] = parseList(value, parseQuest);
  const ids = new Set<QuestId>(quests.map((quest: Quest) => quest.id));
  if (ids.size !== quests.length) {
    rejectValue();
  }
  return quests;
}

/**
 * Finds a quest among those a player has opened.
 *
 * @param {readonly Quest[]} quests - The quests.
 * @param {QuestId} id - The quest.
 * @returns {Quest | undefined} The quest, or `undefined` if the player has
 *   not opened it.
 */
export function findQuest(
  quests: readonly Quest[],
  id: QuestId,
): Quest | undefined {
  return quests.find((quest: Quest) => quest.id === id);
}
