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
 * @module bots/patroller What a bot has its player do, snapshot by
 *   snapshot, as it patrols the village.
 */

import {
  INPUT_WAIT_LIMIT,
  PLAYER_HEALTH,
  STEP_MILLISECONDS,
  createInteractMessage,
  createMoveMessage,
  createPhraseMessage,
  findInteraction,
  findMapPath,
  isResting,
  measureDistance,
} from '@clovervale/shared';
import type {
  ClientMessage,
  GroundVector,
  InputProgress,
  PhraseCode,
} from '@clovervale/shared';

import {
  POINTS_OF_INTEREST,
  SPEAK_CHANCE,
  SPEAK_DELAY,
  STEP_DISTANCE,
  chooseNextPoint,
  choosePhrase,
  planDrinkingWalk,
  planEscape,
  planRoute,
} from './patrol.ts';
import type {
  Leg,
  PathFinder,
  PlaceLines,
  PointOfInterest,
} from './patrol.ts';

/** A point a bot walks to. */
export interface PatrolPoint extends GroundVector {
  /** What the bot says there, which is nothing by default. */
  readonly lines?: PlaceLines;
}

/** How a bot patrols. */
export interface PatrolSettings {
  /** The points the bot walks between, at least two. */
  readonly points: readonly PatrolPoint[];
  /** The shortest time the bot stays at a point, in milliseconds. */
  readonly minPause: number;
  /** The longest time the bot stays at a point, in milliseconds. */
  readonly maxPause: number;
  /** Gives a random number from 0 up to but not including 1. */
  readonly drawRandom: () => number;
  /**
   * Finds the way from one point to another, as points to walk to one
   * straight walk after another, or `null` if there is none.  The way
   * around the obstacles of the village by default.
   */
  readonly findPath?: (
    from: GroundVector,
    to: GroundVector,
  ) => GroundVector[] | null;
  /**
   * The health at or below which the bot goes to drink from the fountain
   * before it patrols on.  {@link THIRSTY_HEALTH} by default.
   */
  readonly thirstyHealth?: number;
}

/**
 * The health at or below which a bot goes to drink from the fountain unless
 * told otherwise: half its full health.
 */
export const THIRSTY_HEALTH: number = PLAYER_HEALTH / 2;

/**
 * How a bot patrols unless told otherwise: between the points of interest
 * of the village, around the obstacles, staying at each for one to three
 * seconds, and saying what a bot says there now and then.
 */
export const DEFAULT_PATROL: PatrolSettings = {
  points: POINTS_OF_INTEREST.map(
    ({ position, lines }: PointOfInterest): PatrolPoint => ({
      ...position,
      lines,
    }),
  ),
  minPause: 1000,
  maxPause: 3000,
  drawRandom: Math.random,
};

/**
 * What a bot is doing on its patrol: choosing the next point to walk to,
 * heading for a point, staying at a point, walking to the fountain, or
 * drinking from it.
 */
type PatrolState =
  | ChoosingState
  | HeadingState
  | StayingState
  | SeekingWaterState
  | DrinkingState;

/** A bot about to choose the next point to walk to. */
interface ChoosingState {
  readonly kind: 'choosing';
}

/** A bot heading for a point. */
interface HeadingState {
  readonly kind: 'heading';
  /** The point. */
  readonly target: PatrolPoint;
  /** The number of times the bot has set out for the point. */
  readonly attempts: number;
}

/** A bot staying at a point, or where it gave up on one. */
interface StayingState {
  readonly kind: 'staying';
  /** When the stay ends, in milliseconds, on the clock of the snapshots. */
  readonly until: number;
}

/** A bot walking to the fountain to drink. */
interface SeekingWaterState {
  readonly kind: 'seekingWater';
  /** The number of times the bot has set out for the fountain. */
  readonly attempts: number;
  /**
   * The point the bot was heading for, which it heads for again if it dies
   * on the visit, or `null` if it was heading for none.
   */
  readonly resumeTarget: PatrolPoint | null;
  /** The number of times the bot had set out for that point. */
  readonly resumeAttempts: number;
}

/** A bot drinking from the fountain. */
interface DrinkingState {
  readonly kind: 'drinking';
  /** The number of times the bot set out for the fountain. */
  readonly attempts: number;
  /**
   * The point the bot was heading for, which it heads for again if it dies
   * on the visit, or `null` if it was heading for none.
   */
  readonly resumeTarget: PatrolPoint | null;
  /** The number of times the bot had set out for that point. */
  readonly resumeAttempts: number;
}

/** The state of a bot about to choose the next point to walk to. */
const CHOOSING: ChoosingState = { kind: 'choosing' };

/** The direction of a player that stands still. */
const STOP: GroundVector = { x: 0, z: 0 };

/**
 * The number of steps before a walk is to end that the bot sends the input
 * that ends it, for the input to be there in time, yet not so early that
 * the server stops waiting for its turn.
 */
const STOP_LEAD_STEPS: number = INPUT_WAIT_LIMIT / 2;

/**
 * The number of times a bot sets out for a point without getting there
 * before it gives up on the point.
 */
const ATTEMPT_LIMIT = 5;

/**
 * What a bot has its player do, which it is told of the player snapshot by
 * snapshot, and which it tells as messages to send to the server, some of
 * them at once and some later.
 *
 * Its player walks to one of the points, in a straight line if nothing is
 * in the way or around what is otherwise, stays there for a while, and
 * walks on to another, chosen at random, again and again.  A player that
 * does not get where it is going sets out again from where it ends up, and
 * walks a little way in a direction chosen at random if it finds no way
 * from there, until it gives up on the point and moves on to another.  A
 * player that dies gives up the rest of its walk, and sets out again from
 * where it comes back.
 *
 * On getting to a point where it has something to say, the player speaks
 * with the speak chance of the patrol: it stands there for
 * {@link SPEAK_DELAY} milliseconds, says a phrase to the players nearby,
 * and only then starts its stay.  The lines it has at a point take turns
 * from one time it speaks there to the next, as {@link choosePhrase}
 * tells.  A player that dies before it speaks says nothing.
 *
 * A player whose health has fallen to the thirsty health of the patrol
 * walks to the fountain instead, once it has come to rest, and drinks from
 * it again and again until it is at full health, then patrols on to
 * another point.  It gives up on the fountain as it does on a point it
 * does not get to, and on dying.
 */
export class Patroller {
  readonly #patrol: PatrolSettings;
  readonly #send: (message: ClientMessage) => void;
  readonly #findPath: PathFinder;
  readonly #thirstyHealth: number;
  #sequence = 0;
  #point: number | null = null;
  #state: PatrolState = CHOOSING;
  readonly #timers = new Set<NodeJS.Timeout>();
  #speechTimer: NodeJS.Timeout | null = null;
  readonly #speechCounts = new Map<PatrolPoint, number>();

  /**
   * Creates the patrol of a player that has just entered the village, and
   * has not sent an input yet.
   *
   * @param {PatrolSettings} patrol - How the player patrols.
   * @param {(message: ClientMessage) => void} send - Sends a message to the
   *   server.
   */
  constructor(patrol: PatrolSettings, send: (message: ClientMessage) => void) {
    this.#patrol = patrol;
    this.#send = send;
    this.#findPath =
      patrol.findPath ??
      ((from: GroundVector, to: GroundVector): GroundVector[] | null =>
        findMapPath('village', from, to));
    this.#thirstyHealth = patrol.thirstyHealth ?? THIRSTY_HEALTH;
  }

  /**
   * Takes note of how the player stands in a snapshot of the server, and
   * has it do what it is to do next, if it is ready to.
   *
   * @param {InputProgress} own - How far the player has got with the inputs
   *   sent for it.
   * @param {number} health - The health of the player.
   * @param {number} step - The number of the step of the snapshot.
   * @param {number} localTime - When the snapshot arrived, in milliseconds,
   *   on a clock that never goes back.
   */
  observe(
    own: InputProgress,
    health: number,
    step: number,
    localTime: number,
  ): void {
    if (own.motion.action === 'Die') {
      // The player comes back elsewhere, where the rest of the walk would
      // lead it astray, so it is to rest by then and set out afresh.
      this.#stopWalking();
      this.#hush();
      this.#leaveFountain();
      return;
    }
    const isReady: boolean =
      this.#timers.size === 0 &&
      own.sequence === this.#sequence &&
      isResting(own.motion) &&
      (this.#state.kind !== 'staying' || localTime >= this.#state.until);
    if (!isReady || this.#visitFountain(own, health, step)) {
      return;
    }
    const patrol: PatrolSettings = this.#patrol;
    const state: PatrolState = this.#state;
    if (state.kind === 'heading') {
      const hasArrived: boolean = isNear(own.motion, state.target);
      if (!hasArrived && state.attempts < ATTEMPT_LIMIT) {
        this.#state = { ...state, attempts: state.attempts + 1 };
        this.#setOut(own.motion, state.target);
        return;
      }
      this.#state = {
        kind: 'staying',
        until:
          localTime +
          (hasArrived ? this.#speak(state.target) : 0) +
          patrol.minPause +
          patrol.drawRandom() * (patrol.maxPause - patrol.minPause),
      };
      return;
    }
    this.#point = chooseNextPoint(
      patrol.points.length,
      this.#point,
      patrol.drawRandom,
    );
    const target: PatrolPoint | undefined = patrol.points[this.#point];
    if (target === undefined) {
      this.#state = CHOOSING;
      return;
    }
    this.#state = { kind: 'heading', target, attempts: 1 };
    this.#setOut(own.motion, target);
  }

  /** Stops the patrol, which sends nothing more, now or later. */
  halt(): void {
    for (const timer of this.#timers) {
      clearTimeout(timer);
    }
    this.#timers.clear();
    this.#hush();
  }

  /**
   * Has the player visit the fountain, if it is to.
   *
   * @param {InputProgress} own - How far the player has got with the
   *   inputs of the bot, now that it is ready for the next one.
   * @param {number} health - The health of the player.
   * @param {number} step - The number of the step the server told that at.
   * @returns {boolean} Whether the player is still on its visit, which,
   *   once over, leaves it to choose the next point to walk to.
   */
  #visitFountain(own: InputProgress, health: number, step: number): boolean {
    let state: PatrolState = this.#state;
    if (
      state.kind !== 'seekingWater' &&
      state.kind !== 'drinking' &&
      health <= this.#thirstyHealth
    ) {
      state = {
        kind: 'seekingWater',
        attempts: 0,
        resumeTarget: state.kind === 'heading' ? state.target : null,
        resumeAttempts: state.kind === 'heading' ? state.attempts : 0,
      };
    }
    if (state.kind === 'seekingWater') {
      if (findInteraction(own.motion, step) === 'Drink') {
        this.#state = { ...state, kind: 'drinking' };
        this.#drink();
        return true;
      }
      if (state.attempts < ATTEMPT_LIMIT) {
        this.#state = { ...state, attempts: state.attempts + 1 };
        this.#setOutToDrink(own.motion);
        return true;
      }
    }
    if (state.kind === 'drinking' && health < PLAYER_HEALTH) {
      this.#drink();
      return true;
    }
    if (state.kind === 'seekingWater' || state.kind === 'drinking') {
      this.#state = CHOOSING;
    }
    return false;
  }

  /**
   * Has the player give up its visit to the fountain, if it is on one, and
   * head again for the point it was heading for, if any, having set out for
   * it as many times as it had before the visit.
   */
  #leaveFountain(): void {
    const state: PatrolState = this.#state;
    if (state.kind !== 'seekingWater' && state.kind !== 'drinking') {
      return;
    }
    this.#state =
      state.resumeTarget === null
        ? CHOOSING
        : {
            kind: 'heading',
            target: state.resumeTarget,
            attempts: state.resumeAttempts,
          };
  }

  /**
   * Has the player set out for a point.
   *
   * @param {GroundVector} from - Where the player stands, at rest.
   * @param {GroundVector} to - The point.
   */
  #setOut(from: GroundVector, to: GroundVector): void {
    const path: GroundVector[] | null = this.#findPath(from, to);
    this.#walk(
      path === null
        ? [planEscape(this.#patrol.drawRandom)]
        : planRoute(from, path),
    );
  }

  /**
   * Has the player set out for the spot where it drinks from the fountain.
   *
   * @param {GroundVector} from - Where the player stands, at rest.
   */
  #setOutToDrink(from: GroundVector): void {
    this.#walk(
      planDrinkingWalk(from, this.#findPath) ?? [
        planEscape(this.#patrol.drawRandom),
      ],
    );
  }

  /**
   * Has the player, at rest, walk one straight walk after another, and
   * stop at the end.
   *
   * @param {readonly Leg[]} legs - The straight walks.
   */
  #walk(legs: readonly Leg[]): void {
    const [first] = legs;
    if (first === undefined) {
      return;
    }
    // Every walk of the bot starts after its player has come to rest, so
    // its first input comes into effect at the next step.
    this.#sendMove(0, first.direction);
    // Each later input is sent shortly before it is to come into effect.
    let steps = 0;
    legs.forEach((leg: Leg, index: number) => {
      steps += leg.steps;
      this.#sendMoveLater(steps, leg.steps, legs[index + 1]?.direction ?? STOP);
    });
  }

  /**
   * Stops the player where it is, if it is on a walk.
   */
  #stopWalking(): void {
    if (this.#timers.size === 0) {
      return;
    }
    for (const timer of this.#timers) {
      clearTimeout(timer);
    }
    this.#timers.clear();
    this.#sendMove(0, STOP);
  }

  /**
   * Sends an input that has the player move.
   *
   * @param {number} after - The number of steps after the input before it
   *   that the input comes into effect.
   * @param {GroundVector} direction - The direction to move in.
   */
  #sendMove(after: number, direction: GroundVector): void {
    const stamp = { sequence: ++this.#sequence, after };
    this.#send(createMoveMessage(stamp, direction));
  }

  /**
   * Sends an input that has the player move, shortly before it is to come
   * into effect.
   *
   * @param {number} steps - The number of steps from now that it is to come
   *   into effect.
   * @param {number} after - The number of steps after the input before it
   *   that the input comes into effect.
   * @param {GroundVector} direction - The direction to move in.
   */
  #sendMoveLater(steps: number, after: number, direction: GroundVector): void {
    const timer: NodeJS.Timeout = setTimeout(
      () => {
        this.#timers.delete(timer);
        this.#sendMove(after, direction);
      },
      Math.max(steps - STOP_LEAD_STEPS, 0) * STEP_MILLISECONDS,
    );
    this.#timers.add(timer);
  }

  /** Sends an input that has the player drink from the fountain. */
  #drink(): void {
    const stamp = { sequence: ++this.#sequence, after: 0 };
    this.#send(createInteractMessage(stamp));
  }

  /**
   * Has the player speak at the point it has just got to, if it has
   * something to say there and chances to.
   *
   * @param {PatrolPoint} place - The point.
   * @returns {number} How long the player stands there before it has
   *   spoken, in milliseconds, which is no time if it does not speak.
   */
  #speak(place: PatrolPoint): number {
    const lines: PlaceLines = place.lines ?? [];
    const drawRandom: () => number = this.#patrol.drawRandom;
    if (lines.length === 0 || drawRandom() >= SPEAK_CHANCE) {
      return 0;
    }
    const turn: number = this.#speechCounts.get(place) ?? 0;
    const code: PhraseCode = choosePhrase(lines, turn, drawRandom);
    this.#speechCounts.set(place, turn + 1);
    this.#speechTimer = setTimeout(() => {
      this.#speechTimer = null;
      this.#send(createPhraseMessage(code));
    }, SPEAK_DELAY);
    return SPEAK_DELAY;
  }

  /** Has the player say nothing of what it was about to say. */
  #hush(): void {
    if (this.#speechTimer !== null) {
      clearTimeout(this.#speechTimer);
      this.#speechTimer = null;
    }
  }
}

/**
 * Tells whether a player has got to a point.
 *
 * @param {GroundVector} position - Where the player stands.
 * @param {GroundVector} point - The point.
 * @returns {boolean} Whether the player stands within a step of the point.
 */
function isNear(position: GroundVector, point: GroundVector): boolean {
  return measureDistance(position, point) <= STEP_DISTANCE;
}
