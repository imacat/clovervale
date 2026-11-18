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
 *   patrols the village.
 */

import {
  INPUT_WAIT_LIMIT,
  PROTOCOL_VERSION,
  SIMULATION_RATE,
  createMoveMessage,
  decodeServerMessage,
  encodeClientMessage,
  findVillagePath,
  isResting,
} from '@clovervale/shared';
import type {
  GroundVector,
  InputProgress,
  ServerMessage,
} from '@clovervale/shared';

import {
  POINTS_OF_INTEREST,
  STEP_DISTANCE,
  chooseNextPoint,
  planEscape,
  planRoute,
} from './patrol.ts';
import type { Leg } from './patrol.ts';

/** How a bot patrols. */
export interface PatrolSettings {
  /** The points the bot walks between, at least one. */
  readonly points: readonly GroundVector[];
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
}

/**
 * How a bot patrols unless told otherwise: between the points of interest
 * of the village, around the obstacles, staying at each for one to three
 * seconds.
 */
export const DEFAULT_PATROL: PatrolSettings = {
  points: POINTS_OF_INTEREST.map(({ position }) => position),
  minPause: 1000,
  maxPause: 3000,
  drawRandom: Math.random,
};

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
 * from there, until it gives up on the point and moves on to another.
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
    let target: GroundVector | null = null;
    let attempts = 0;
    let isStaying = false;
    let readyTime = 0;
    const timers = new Set<NodeJS.Timeout>();
    const findPath = patrol.findPath ?? findVillagePath;
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
    const patrolOn = (own: InputProgress): void => {
      const now: number = performance.now();
      const isReady: boolean =
        timers.size === 0 &&
        own.sequence === sequence &&
        isResting(own.motion) &&
        now >= readyTime;
      if (!isReady) {
        return;
      }
      if (target !== null && !isStaying) {
        if (!isNear(own.motion, target) && attempts < ATTEMPT_LIMIT) {
          setOut(own.motion, target);
          return;
        }
        isStaying = true;
        readyTime =
          now +
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
          patrolOn(message.own);
        }
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
