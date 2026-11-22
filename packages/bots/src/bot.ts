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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/17
// AI assistance: Claude Code (Anthropic)

/**
 * @module bots/bot A headless peer of the game server, whose player
 *   patrols the village, and says something there now and then.
 */

import {
  INPUT_WAIT_LIMIT,
  PLAYER_HEALTH,
  PROTOCOL_VERSION,
  SIMULATION_RATE,
  createInteractMessage,
  createMoveMessage,
  createPhraseMessage,
  decodeServerMessage,
  encodeClientMessage,
  findInteraction,
  findMapPath,
  isResting,
} from '@clovervale/shared';
import type {
  GroundVector,
  InputProgress,
  PhraseCode,
  PlayerState,
  ServerMessage,
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
import type { Leg, PlaceLines, PointOfInterest } from './patrol.ts';

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
const DEFAULT_PATROL: PatrolSettings = {
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

/** How far a bot has got with a visit to the fountain. */
type FountainVisit = 'none' | 'walking' | 'drinking';

/** A bot connected to a game server. */
export interface RunningBot {
  /** The identifier of the player of the bot. */
  readonly playerId: number;
  /**
   * Settles once the bot has left the server: fulfilled if it was stopped,
   * or rejected if the server disconnected it or misbehaved.
   */
  readonly finished: Promise<void>;
  /** Stops the bot, which leaves the server. */
  stop(): void;
}

/** The direction of a player that stands still. */
const STOP: GroundVector = { x: 0, z: 0 };

/** How long one step of the simulation lasts, in milliseconds. */
const STEP_MILLISECONDS: number = 1000 / SIMULATION_RATE;

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
 * Starts a bot that connects to a game server as a player, and patrols for
 * ever.
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
 *
 * @param {string} url - The WebSocket URL of the server.
 * @param {PatrolSettings} [patrol] - How the bot patrols, or between the
 *   points of interest of the village by default.
 * @returns {Promise<RunningBot>} The bot, once the server has welcomed it.
 * @throws {Error} If the bot cannot connect, or the server leaves, speaks
 *   another protocol version or misbehaves before it welcomes the bot.
 */
export function startBot(
  url: string,
  patrol: PatrolSettings = DEFAULT_PATROL,
): Promise<RunningBot> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let playerId: number | null = null;
    let isStopping = false;
    const finished: PromiseWithResolvers<void> = Promise.withResolvers();
    // Whoever does not wait for the bot to finish need not hear of it.
    finished.promise.catch(() => undefined);
    const fail = (error: Error): void => {
      reject(error);
      finished.reject(error);
    };

    let sequence = 0;
    let point: number | null = null;
    let target: PatrolPoint | null = null;
    let attempts = 0;
    let isStaying = false;
    let readyTime = 0;
    let speechTimer: NodeJS.Timeout | null = null;
    const speechCounts = new Map<PatrolPoint, number>();
    let visit: FountainVisit = 'none';
    const timers = new Set<NodeJS.Timeout>();
    const findPath =
      patrol.findPath ??
      ((from: GroundVector, to: GroundVector): GroundVector[] | null =>
        findMapPath('village', from, to));
    const thirstyHealth: number = patrol.thirstyHealth ?? THIRSTY_HEALTH;
    const sendMove = (after: number, direction: GroundVector): void => {
      if (socket.readyState === WebSocket.OPEN) {
        const stamp = { sequence: ++sequence, after };
        socket.send(encodeClientMessage(createMoveMessage(stamp, direction)));
      }
    };
    const sendLater = (
      steps: number,
      after: number,
      direction: GroundVector,
    ): void => {
      const timer: NodeJS.Timeout = setTimeout(
        () => {
          timers.delete(timer);
          sendMove(after, direction);
        },
        Math.max(steps - STOP_LEAD_STEPS, 0) * STEP_MILLISECONDS,
      );
      timers.add(timer);
    };
    const walk = (legs: readonly Leg[]): void => {
      const [first] = legs;
      if (first === undefined) {
        return;
      }
      // Every walk of the bot starts after its player has come to rest, so
      // its first input comes into effect at the next step.
      sendMove(0, first.direction);
      // Each later input is sent shortly before it is to come into effect.
      let steps = 0;
      legs.forEach((leg: Leg, index: number) => {
        steps += leg.steps;
        sendLater(steps, leg.steps, legs[index + 1]?.direction ?? STOP);
      });
    };
    const setOut = (from: GroundVector, to: GroundVector): void => {
      attempts++;
      const path: GroundVector[] | null = findPath(from, to);
      walk(
        path === null ? [planEscape(patrol.drawRandom)] : planRoute(from, path),
      );
    };
    const drink = (): void => {
      if (socket.readyState === WebSocket.OPEN) {
        const stamp = { sequence: ++sequence, after: 0 };
        socket.send(encodeClientMessage(createInteractMessage(stamp)));
      }
    };
    const setOutToDrink = (from: GroundVector): void => {
      attempts++;
      walk(planDrinkingWalk(from, findPath) ?? [planEscape(patrol.drawRandom)]);
    };
    const stopWalking = (): void => {
      if (timers.size === 0) {
        return;
      }
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();
      sendMove(0, STOP);
    };
    const hush = (): void => {
      if (speechTimer !== null) {
        clearTimeout(speechTimer);
        speechTimer = null;
      }
    };
    /**
     * Has the player of the bot speak at the point it has just got to, if
     * it has something to say there and chances to.
     *
     * @param {PatrolPoint} place - The point.
     * @returns {number} How long the player stands there before it has
     *   spoken, in milliseconds, which is no time if it does not speak.
     */
    const speak = (place: PatrolPoint): number => {
      const lines: PlaceLines = place.lines ?? [];
      if (lines.length === 0 || patrol.drawRandom() >= SPEAK_CHANCE) {
        return 0;
      }
      const turn: number = speechCounts.get(place) ?? 0;
      const code: PhraseCode = choosePhrase(lines, turn, patrol.drawRandom);
      speechCounts.set(place, turn + 1);
      speechTimer = setTimeout(() => {
        speechTimer = null;
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(encodeClientMessage(createPhraseMessage(code)));
        }
      }, SPEAK_DELAY);
      return SPEAK_DELAY;
    };
    /**
     * Has the player of the bot visit the fountain, if it is to.
     *
     * @param {InputProgress} own - How far the player has got with the
     *   inputs of the bot, now that it is ready for the next one.
     * @param {number} health - The health of the player.
     * @param {number} step - The number of the step the server told that
     *   at.
     * @returns {boolean} Whether the player is still on its visit.
     */
    const visitFountain = (
      own: InputProgress,
      health: number,
      step: number,
    ): boolean => {
      if (visit === 'none' && health <= thirstyHealth) {
        visit = 'walking';
        attempts = 0;
      }
      if (visit === 'walking') {
        if (findInteraction(own.motion, step) === 'Drink') {
          visit = 'drinking';
          drink();
          return true;
        }
        if (attempts < ATTEMPT_LIMIT) {
          setOutToDrink(own.motion);
          return true;
        }
      }
      if (visit === 'drinking' && health < PLAYER_HEALTH) {
        drink();
        return true;
      }
      if (visit !== 'none') {
        visit = 'none';
        isStaying = true;
      }
      return false;
    };
    const patrolOn = (
      own: InputProgress,
      health: number,
      step: number,
    ): void => {
      if (own.motion.action === 'Die') {
        // The player comes back elsewhere, where the rest of the walk would
        // lead it astray, so it is to rest by then and set out afresh.
        stopWalking();
        hush();
        visit = 'none';
        return;
      }
      const now: number = performance.now();
      const isReady: boolean =
        timers.size === 0 &&
        own.sequence === sequence &&
        isResting(own.motion) &&
        now >= readyTime;
      if (!isReady || visitFountain(own, health, step)) {
        return;
      }
      if (target !== null && !isStaying) {
        const hasArrived: boolean = isNear(own.motion, target);
        if (!hasArrived && attempts < ATTEMPT_LIMIT) {
          setOut(own.motion, target);
          return;
        }
        isStaying = true;
        readyTime =
          now +
          (hasArrived ? speak(target) : 0) +
          patrol.minPause +
          patrol.drawRandom() * (patrol.maxPause - patrol.minPause);
        return;
      }
      point = chooseNextPoint(patrol.points.length, point, patrol.drawRandom);
      target = patrol.points[point] ?? null;
      isStaying = false;
      attempts = 0;
      if (target !== null) {
        setOut(own.motion, target);
      }
    };

    socket.addEventListener('message', (event) => {
      let message: ServerMessage;
      try {
        message = decodeServerMessage(String(event.data));
      } catch (error: unknown) {
        fail(new Error(`The server at ${url} misbehaved.`, { cause: error }));
        socket.close();
        return;
      }
      if (message.type === 'snapshot') {
        if (playerId !== null && !isStopping) {
          const own: PlayerState | undefined = message.players.find(
            (player: PlayerState) => player.id === playerId,
          );
          patrolOn(message.own, own?.health ?? PLAYER_HEALTH, message.step);
        }
        return;
      }
      // A bot does not fight, and learns its health from the snapshots, so
      // what happens does not concern it.  Nor does it ever go into another
      // map, so it is never told of one, nor talk to a villager, nor heed
      // what the players nearby say.
      if (
        message.type === 'events' ||
        message.type === 'map' ||
        message.type === 'speech' ||
        message.type === 'said' ||
        message.type === 'phrased'
      ) {
        return;
      }
      if (message.protocolVersion !== PROTOCOL_VERSION) {
        const version = String(message.protocolVersion);
        fail(new Error(`The server at ${url} speaks protocol ${version}.`));
        socket.close();
        return;
      }
      playerId = message.playerId;
      resolve({
        playerId,
        finished: finished.promise,
        stop: () => {
          isStopping = true;
          socket.close();
        },
      });
    });
    socket.addEventListener('error', () => {
      if (playerId === null) {
        fail(new Error(`The connection to the server at ${url} failed.`));
      }
    });
    socket.addEventListener('close', () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();
      hush();
      if (playerId === null) {
        fail(new Error(`The server at ${url} left without a welcome.`));
      } else if (isStopping) {
        finished.resolve();
      } else {
        fail(new Error(`The server at ${url} disconnected the bot.`));
      }
    });
  });
}

/**
 * Tells whether a player has got to a point.
 *
 * @param {GroundVector} position - Where the player stands.
 * @param {GroundVector} point - The point.
 * @returns {boolean} Whether the player stands within a step of the point.
 */
function isNear(position: GroundVector, point: GroundVector): boolean {
  const dx: number = position.x - point.x;
  const dz: number = position.z - point.z;
  return Math.sqrt(dx * dx + dz * dz) <= STEP_DISTANCE;
}
