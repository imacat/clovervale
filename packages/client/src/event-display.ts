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
 * @module client/event-display The hits and the heals the server tells of,
 *   each shown once its moment comes, with a number that floats up from
 *   whoever it befalls.
 */

import type { Object3D } from 'three';

import type {
  EntityRef,
  GameEvent,
  GroundVector,
  HealEvent,
  HitEvent,
  MonsterState,
  PlayerState,
} from '@clovervale/shared';

import { EventSchedule } from './event-schedule.ts';
import { HitMarkers } from './hit-markers.ts';
import type { PlayersView } from './interpolation.ts';
import { MONSTER_MODELS } from './model-catalog.ts';

/** The color of the number of a hit on the player of the page. */
const OWN_HIT_COLOR = '#ff4b3e';
/** The color of the number of a hit on another player. */
const PLAYER_HIT_COLOR = '#ff9a3d';
/** The color of the number of a hit on a monster. */
const MONSTER_HIT_COLOR = '#ffe14d';
/** The color of the number of a heal on any player. */
const HEAL_COLOR = '#7cf5c0';
/**
 * The most hits, and the most heals, that are remembered as shown, for
 * looking at.
 */
const SHOWN_HIT_LIMIT = 100;

/** Whoever an event befalls, as it is shown. */
interface ShownTarget {
  /** Where it stands, which the number floats up from. */
  readonly spot: GroundVector;
  /** The color of the number of a hit on it. */
  readonly hitColor: string;
  /**
   * How high above the ground the number of a hit on it starts, in meters,
   * or `undefined` for the height every number starts at by default.
   */
  readonly hitHeight: number | undefined;
}

/** What the events need to know of a kind of what they can befall. */
interface TargetKind {
  /**
   * Finds whoever of the kind an event befalls, among what is shown.
   *
   * @param {PlayersView} view - The players and the monsters as they are
   *   shown.
   * @param {number} id - The identifier of whoever the event befalls.
   * @param {number | null} ownId - The identifier of the player of the
   *   page, if the server has told it.
   * @returns {ShownTarget | null} Whoever the event befalls, as it is
   *   shown, or `null` if it is not shown.
   */
  readonly findShown: (
    view: PlayersView,
    id: number,
    ownId: number | null,
  ) => ShownTarget | null;
}

/** What the events need to know of each kind of what they can befall. */
const TARGET_KINDS: Readonly<Record<EntityRef['kind'], TargetKind>> = {
  player: {
    findShown: (
      view: PlayersView,
      id: number,
      ownId: number | null,
    ): ShownTarget | null => {
      const player: PlayerState | undefined = view.players.find(
        (shown: PlayerState) => shown.id === id,
      );
      return player === undefined
        ? null
        : {
            spot: player,
            hitColor: id === ownId ? OWN_HIT_COLOR : PLAYER_HIT_COLOR,
            hitHeight: undefined,
          };
    },
  },
  monster: {
    findShown: (view: PlayersView, id: number): ShownTarget | null => {
      const monster: MonsterState | undefined = view.monsters.find(
        (shown: MonsterState) => shown.id === id,
      );
      return monster === undefined
        ? null
        : {
            spot: monster,
            hitColor: MONSTER_HIT_COLOR,
            hitHeight: MONSTER_MODELS[monster.kind].hitHeight ?? undefined,
          };
    },
  },
};

/** The type of an event. */
type GameEventType = GameEvent['type'];

/** The event of a type. */
type GameEventOf<T extends GameEventType> = Extract<GameEvent, { type: T }>;

/** How each type of event is shown, once its moment has come. */
type EventHandlers = {
  readonly [T in GameEventType]: (
    event: GameEventOf<T>,
    target: ShownTarget,
  ) => void;
};

/**
 * The hits and the heals the server tells of, each shown once its moment
 * comes, with a number that floats up from whoever was hit or healed, and
 * the latest of them remembered as shown.
 */
export class EventDisplay {
  /** The numbers of the hits and the heals floating up. */
  readonly #markers: HitMarkers;
  /** The events from the server that are yet to be shown. */
  readonly #schedule = new EventSchedule();
  /** The latest hits that have been shown, the latest last. */
  readonly #shownHits: HitEvent[] = [];
  /** The latest heals that have been shown, the latest last. */
  readonly #shownHeals: HealEvent[] = [];
  /** How each type of event is shown. */
  readonly #handlers: EventHandlers = {
    hit: (event: HitEvent, target: ShownTarget): void => {
      this.#markers.show(
        target.spot,
        `-${String(event.damage)}`,
        target.hitColor,
        target.hitHeight,
      );
      rememberShown(this.#shownHits, event);
    },
    heal: (event: HealEvent, target: ShownTarget): void => {
      this.#markers.show(target.spot, `+${String(event.amount)}`, HEAL_COLOR);
      rememberShown(this.#shownHeals, event);
    },
  };

  /**
   * Starts with no event.
   *
   * @param {Object3D} parent - What the numbers float up on.
   */
  constructor(parent: Object3D) {
    this.#markers = new HitMarkers(parent);
  }

  /**
   * Takes the events the server tells of, to show each once its moment
   * comes.
   *
   * @param {readonly GameEvent[]} events - The events.
   */
  receive(events: readonly GameEvent[]): void {
    this.#schedule.receive(events);
  }

  /**
   * Shows the hits and the heals whose moment has come in what is shown, each
   * once, with a number that floats up from whoever was hit or healed, where
   * it is shown.  A hit or a heal of whoever is not shown is not shown
   * either.
   *
   * @param {PlayersView} view - The players and the monsters as they are
   *   shown.
   * @param {number | null} ownId - The identifier of the player of the
   *   page, if the server has told it.
   */
  show(view: PlayersView, ownId: number | null): void {
    for (const event of this.#schedule.takeDue(view.time)) {
      const { kind, id }: EntityRef = event.target;
      const target: ShownTarget | null = TARGET_KINDS[kind].findShown(
        view,
        id,
        ownId,
      );
      if (target !== null) {
        handleEvent(this.#handlers, event.type, event, target);
      }
    }
  }

  /**
   * Moves the numbers floating up on.
   *
   * @param {number} seconds - The time since the last frame, in seconds.
   */
  update(seconds: number): void {
    this.#markers.update(seconds);
  }

  /** Forgets the events yet to be shown. */
  clearSchedule(): void {
    this.#schedule.clear();
  }

  /**
   * Forgets the events yet to be shown, those shown, and the numbers still
   * floating up.
   */
  clear(): void {
    this.#schedule.clear();
    this.#shownHits.length = 0;
    this.#shownHeals.length = 0;
    this.#markers.clear();
  }

  /**
   * Lists the latest hits that have been shown, the latest last.
   *
   * @returns {HitEvent[]} The hits.
   */
  listShownHits(): HitEvent[] {
    return [...this.#shownHits];
  }

  /**
   * Lists the latest heals that have been shown, the latest last.
   *
   * @returns {HealEvent[]} The heals.
   */
  listShownHeals(): HealEvent[] {
    return [...this.#shownHeals];
  }
}

/**
 * Shows an event of a type, as the handler of the type shows it.
 *
 * @param {EventHandlers} handlers - How each type of event is shown.
 * @param {T} type - The type of the event.
 * @param {GameEventOf<T>} event - The event.
 * @param {ShownTarget} target - Whoever the event befalls, as it is shown.
 * @template T
 */
function handleEvent<T extends GameEventType>(
  handlers: EventHandlers,
  type: T,
  event: GameEventOf<T>,
  target: ShownTarget,
): void {
  handlers[type](event, target);
}

/**
 * Remembers an event as shown, forgetting the earliest of its kind once
 * there are too many to remember.
 *
 * @param {T[]} shown - The events of its kind shown so far, the latest
 *   last.
 * @param {T} event - The event.
 * @template T
 */
function rememberShown<T extends GameEvent>(shown: T[], event: T): void {
  shown.push(event);
  if (shown.length > SHOWN_HIT_LIMIT) {
    shown.shift();
  }
}
