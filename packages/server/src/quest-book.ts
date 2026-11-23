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
 * @module server/quest-book The quests of a player as the server keeps them
 *   going: which it opens, and which events of the story move them on.
 */

import {
  QUEST_IDS,
  QUEST_TYPES,
  findQuest,
  isSameCue,
} from '@clovervale/shared';
import type {
  Quest,
  QuestId,
  QuestType,
  StoryCue,
  StoryNeed,
  VillagerId,
} from '@clovervale/shared';

import type { RequestTaker } from './resident.ts';
import { MAP_ENTRY, MapEntryEvent, StoryEvent } from './story.ts';

/**
 * A world as the quests of a player in it deal with it, which tells its
 * listeners of every player that comes into it, as a {@link MapEntryEvent}.
 */
export interface QuestWorld extends EventTarget {
  /**
   * Finds a villager of the world, which tells its listeners of the events
   * of the story of the players, each as a {@link StoryEvent} of the type
   * it is named after.
   *
   * @param {VillagerId} id - The identifier of the villager.
   * @returns {EventTarget | undefined} The villager, if it is in the world.
   */
  findResident(id: VillagerId): EventTarget | undefined;

  /**
   * Finds a villager of the world who deals with the players the quests
   * ask it to.
   *
   * @param {VillagerId} id - The identifier of the villager.
   * @returns {RequestTaker | undefined} The villager, if it is in the world
   *   and deals with the players the quests ask it to.
   */
  findRequestTaker(id: VillagerId): RequestTaker | undefined;
}

/** An event a quest listens for, and what stops the listening. */
interface Listening {
  /** The event, and the villager who tells of it. */
  readonly cue: StoryCue;
  /** Stops the listening. */
  readonly controller: AbortController;
}

/** A villager a quest has asked for its player, and what it asked. */
interface AskedVillager {
  /** The identifier of the villager. */
  readonly villager: VillagerId;
  /** The villager, as one who deals with the players it is asked to. */
  readonly taker: RequestTaker;
  /** What the player needs of it. */
  readonly need: StoryNeed;
}

/**
 * The quests a player has opened, in the order it opened them, as the
 * server keeps them going in the world the player is in.
 *
 * In a world it has been taken into, the book opens each quest there is,
 * unless the player has opened it already, as what opens it, as
 * {@link QuestType.opening} tells, happens there: as the villager of the
 * world who tells of the event that opens it tells of it for the player,
 * or as the world tells of the player coming into it, if it is of the map
 * that opens it.  An open quest listens to each villager of the
 * world that tells of an event it waits for, and moves on as soon as one
 * does, and only then.  As the event arrives, the quest no longer listens
 * for it, nor for any other it no longer waits for, and listens for those
 * it waits for from then on.  As the world tells of the player arriving
 * somewhere in particular in it, as one that climbs out of the well does,
 * each quest asks the villager of the world it asks of what the player
 * needs of it, as {@link Quest.request} tells.  Once the quest moves on to
 * ask that villager for another need, the request is replaced; once it
 * moves on to ask nothing, the request is taken back, unless the event of
 * that villager moved it on, which fulfils the request.  Once the book is
 * taken out of the world, nothing there moves the quests on, and every
 * request is taken back.
 */
export class QuestBook {
  readonly #player: number;
  readonly #quests: Quest[];
  /** The world the player is in, or `null` while it is in none. */
  #world: QuestWorld | null = null;
  /** Ends whatever the book listens to in the world the player is in. */
  #stay: AbortController | null = null;
  /** The villagers asked for the player, by the quest that asked. */
  readonly #requests = new Map<Quest, AskedVillager>();
  /** The events each quest listens for in the world the player is in. */
  readonly #listenings = new Map<Quest, Listening[]>();

  /**
   * Starts the book of a player, in no world.
   *
   * @param {number} player - The identifier of the player.
   * @param {readonly Quest[]} [quests] - The quests the player has opened,
   *   in order, none by default.
   */
  constructor(player: number, quests: readonly Quest[] = []) {
    this.#player = player;
    this.#quests = [...quests];
  }

  /**
   * The quests the player has opened, in the order it opened them.
   *
   * @returns {readonly Quest[]} The quests.
   */
  get quests(): readonly Quest[] {
    return this.#quests;
  }

  /**
   * Takes the book into a world the player comes into, out of any it was
   * in before.
   *
   * @param {QuestWorld} world - The world.
   */
  enter(world: QuestWorld): void {
    this.leave();
    const stay = new AbortController();
    this.#world = world;
    this.#stay = stay;
    world.addEventListener(
      MAP_ENTRY,
      (event: Event): void => {
        if (event instanceof MapEntryEvent && event.player === this.#player) {
          this.#noteEntry(event);
        }
      },
      { signal: stay.signal },
    );
    for (const type of this.#listUnopened()) {
      const { opening } = type;
      if (opening.type === 'cue') {
        this.#listen(opening.cue, (): void => {
          this.#open(new type());
        });
      }
    }
    for (const quest of this.#quests) {
      this.#follow(quest);
    }
  }

  /**
   * Takes the book out of the world the player is in, if any: nothing there
   * moves its quests on from then on, and every request is taken back.
   */
  leave(): void {
    this.#stay?.abort();
    this.#stay = null;
    this.#world = null;
    this.#listenings.clear();
    for (const { taker } of this.#requests.values()) {
      taker.withdraw(this.#player);
    }
    this.#requests.clear();
  }

  /**
   * Lists the quests there are that the player has not opened.
   *
   * @returns {QuestType[]} The quests, in the order their identifiers are
   *   told.
   */
  #listUnopened(): QuestType[] {
    return QUEST_IDS.filter(
      (id: QuestId) => findQuest(this.#quests, id) === undefined,
    ).map((id: QuestId) => QUEST_TYPES[id]);
  }

  /**
   * Opens each quest the player has not opened that coming into a world of
   * the map opens, and has each quest ask the villager of the world it asks
   * of what the player needs, as the player arrives somewhere in
   * particular.
   *
   * @param {MapEntryEvent} entry - That the player came into the world.
   */
  #noteEntry({ map, arrival }: MapEntryEvent): void {
    for (const type of this.#listUnopened()) {
      const { opening } = type;
      if (opening.type === 'entry' && opening.map === map) {
        this.#open(new type());
      }
    }
    if (arrival === null) {
      return;
    }
    for (const quest of this.#quests) {
      const { request } = quest;
      if (request === null) {
        continue;
      }
      const taker: RequestTaker | undefined = this.#world?.findRequestTaker(
        request.villager,
      );
      if (taker !== undefined) {
        taker.request(this.#player, request.need);
        this.#requests.set(quest, {
          villager: request.villager,
          taker,
          need: request.need,
        });
      }
    }
  }

  /**
   * Opens a quest, and follows it from then on.
   *
   * @param {Quest} quest - The quest.
   */
  #open(quest: Quest): void {
    this.#quests.push(quest);
    this.#follow(quest);
  }

  /**
   * Listens, in the world the player is in, for each event a quest waits
   * for that it does not listen for yet.
   *
   * @param {Quest} quest - The quest.
   */
  #follow(quest: Quest): void {
    const listenings: Listening[] = this.#listenings.get(quest) ?? [];
    for (const cue of quest.awaits) {
      const isListening: boolean = listenings.some((listening: Listening) =>
        isSameCue(listening.cue, cue),
      );
      const controller: AbortController | null = isListening
        ? null
        : this.#listen(cue, (): void => {
            this.#hear(quest, cue);
          });
      if (controller !== null) {
        listenings.push({ cue, controller });
      }
    }
    this.#listenings.set(quest, listenings);
  }

  /**
   * Moves a quest on as an event it waits for arrives: it no longer listens
   * for that event, nor for any other it no longer waits for, listens for
   * those it waits for from then on, and changes what it asks, if it does.
   *
   * @param {Quest} quest - The quest.
   * @param {StoryCue} cue - The event, and the villager who tells of it.
   */
  #hear(quest: Quest, cue: StoryCue): void {
    quest.advance(cue);
    const kept: Listening[] = [];
    for (const listening of this.#listenings.get(quest) ?? []) {
      if (
        !isSameCue(listening.cue, cue) &&
        quest.awaits.some((awaited: StoryCue) =>
          isSameCue(awaited, listening.cue),
        )
      ) {
        kept.push(listening);
      } else {
        listening.controller.abort();
      }
    }
    this.#listenings.set(quest, kept);
    this.#follow(quest);
    this.#updateRequest(quest, cue);
  }

  /**
   * Listens, in the world the player is in, for an event of the player
   * once, until it happens or the book leaves the world.
   *
   * @param {StoryCue} cue - The event, and the villager who tells of it.
   * @param {() => void} react - What comes of the event.
   * @returns {AbortController | null} What stops the listening, or `null`
   *   if the villager is not in the world.
   */
  #listen(cue: StoryCue, react: () => void): AbortController | null {
    const resident: EventTarget | undefined = this.#world?.findResident(
      cue.villager,
    );
    if (resident === undefined || this.#stay === null) {
      return null;
    }
    const heard = new AbortController();
    resident.addEventListener(
      cue.event,
      (event: Event): void => {
        if (event instanceof StoryEvent && event.player === this.#player) {
          heard.abort();
          react();
        }
      },
      { signal: AbortSignal.any([this.#stay.signal, heard.signal]) },
    );
    return heard;
  }

  /**
   * Changes the request of a quest that has moved on, if it has one out:
   * replaces it if the quest asks the same villager for another need,
   * forgets it if the quest asks nothing and the event of that villager
   * moved it on, which fulfils it, and takes it back otherwise, if the
   * quest no longer asks it.
   *
   * @param {Quest} quest - The quest.
   * @param {StoryCue} cue - The event that moved the quest on.
   */
  #updateRequest(quest: Quest, cue: StoryCue): void {
    const asked: AskedVillager | undefined = this.#requests.get(quest);
    if (asked === undefined) {
      return;
    }
    const { villager, taker } = asked;
    const { request } = quest;
    if (request?.villager === villager) {
      if (request.need !== asked.need) {
        taker.request(this.#player, request.need);
        this.#requests.set(quest, { villager, taker, need: request.need });
      }
      return;
    }
    if (request !== null || cue.villager !== villager) {
      taker.withdraw(this.#player);
    }
    this.#requests.delete(quest);
  }
}
