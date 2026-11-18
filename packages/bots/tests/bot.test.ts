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
 * @module bots/tests/bot Tests for the bot.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startServer } from '@clovervale/server';
import type { RunningServer } from '@clovervale/server';
import {
  PLAYER_HEALTH,
  decodeServerMessage,
  findSpawnPoint,
} from '@clovervale/shared';
import type {
  GroundVector,
  PlayerState,
  ServerMessage,
} from '@clovervale/shared';

import { startBot } from '../src/bot.ts';
import type { PatrolSettings, RunningBot } from '../src/bot.ts';
import { STEP_DISTANCE } from '../src/patrol.ts';

/** How long a test waits for something at most, in milliseconds. */
const WAIT_TIMEOUT = 8000;

/** How long a test may take, in milliseconds. */
const TEST_TIMEOUT = 10_000;

/** Where the first player to enter the village stands. */
const START: GroundVector = findSpawnPoint(0);

/** Two points near where the first player enters the village. */
const POINTS: readonly GroundVector[] = [
  { x: START.x, z: START.z + 0.6 },
  { x: START.x + 1, z: START.z + 0.6 },
];

/**
 * A patrol between the two points, which starts with the first and stays
 * at each for half a second.
 */
const PATROL: PatrolSettings = {
  points: POINTS,
  minPause: 500,
  maxPause: 500,
  drawRandom: () => 0,
};

/** A peer that only watches the snapshots of a server. */
interface Watcher {
  /** Every snapshot of the players so far, the latest last. */
  readonly snapshots: (readonly PlayerState[])[];
  /** Disconnects the watcher. */
  readonly close: () => void;
}

/**
 * Connects a watcher to a server.
 *
 * @param {string} url - The WebSocket URL of the server.
 * @returns {Watcher} The watcher.
 */
function watchServer(url: string): Watcher {
  const socket = new WebSocket(url);
  const snapshots: (readonly PlayerState[])[] = [];
  socket.addEventListener('message', (event) => {
    const message: ServerMessage = decodeServerMessage(String(event.data));
    if (message.type === 'snapshot') {
      snapshots.push(message.players);
    }
  });
  return {
    snapshots,
    close: () => {
      socket.close();
    },
  };
}

/**
 * Waits until something is true.
 *
 * @param {() => boolean} isAwaited - Tells whether it is true.
 * @returns {Promise<void>} A promise fulfilled once it is true, or rejected
 *   if it is not in time.
 */
async function waitUntil(isAwaited: () => boolean): Promise<void> {
  const deadline: number = Date.now() + WAIT_TIMEOUT;
  while (!isAwaited()) {
    if (Date.now() > deadline) {
      throw new Error('What was awaited did not happen in time.');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/**
 * Finds a player in a snapshot.
 *
 * @param {(readonly PlayerState[]) | undefined} players - The players of the
 *   snapshot, if there is one.
 * @param {number} id - The identifier of the player.
 * @returns {PlayerState | undefined} The player, if it is there.
 */
function findPlayer(
  players: readonly PlayerState[] | undefined,
  id: number,
): PlayerState | undefined {
  return players?.find((player: PlayerState) => player.id === id);
}

/**
 * Tells whether a player stands idle at a point, within half a step.
 *
 * @param {PlayerState | undefined} player - The player, if there is one.
 * @param {GroundVector} point - The point.
 * @returns {boolean} Whether the player stands there.
 */
function isIdleAt(
  player: PlayerState | undefined,
  point: GroundVector,
): boolean {
  return (
    player?.action === 'Idle' &&
    Math.hypot(player.x - point.x, player.z - point.z) <=
      STEP_DISTANCE / 2 + 1e-9
  );
}

/**
 * Measures how far a point is from a line segment.
 *
 * @param {GroundVector} point - The point.
 * @param {GroundVector} start - One end of the segment.
 * @param {GroundVector} end - The other end of the segment.
 * @returns {number} The distance.
 */
function measureOffset(
  point: GroundVector,
  start: GroundVector,
  end: GroundVector,
): number {
  const dx: number = end.x - start.x;
  const dz: number = end.z - start.z;
  const projection: number =
    ((point.x - start.x) * dx + (point.z - start.z) * dz) /
    (dx ** 2 + dz ** 2);
  const along: number = Math.min(Math.max(projection, 0), 1);
  return Math.hypot(
    point.x - (start.x + along * dx),
    point.z - (start.z + along * dz),
  );
}

describe('startBot', () => {
  let server: RunningServer | null;
  let url: string;
  const cleanups: (() => void)[] = [];

  beforeEach(async () => {
    server = await startServer(0);
    url = `ws://localhost:${String(server.port)}`;
  });

  afterEach(async () => {
    for (const cleanUp of cleanups.splice(0)) {
      cleanUp();
    }
    await server?.stop();
  });

  /**
   * Starts a bot that is stopped after the test.
   *
   * @param {PatrolSettings} [patrol] - How the bot patrols.
   * @returns {Promise<RunningBot>} The bot.
   */
  const startTestBot = async (patrol?: PatrolSettings): Promise<RunningBot> => {
    const bot: RunningBot = await startBot(url, patrol);
    cleanups.push(() => {
      bot.stop();
    });
    return bot;
  };

  it('enters the village as a player of its own', async () => {
    const watcher: Watcher = watchServer(url);
    cleanups.push(watcher.close);
    const bot: RunningBot = await startTestBot();
    await waitUntil(
      () => findPlayer(watcher.snapshots.at(-1), bot.playerId) !== undefined,
    );
  });

  it(
    'walks straight to a point, stays there, and walks on to another',
    async () => {
      const bot: RunningBot = await startTestBot(PATROL);
      const watcher: Watcher = watchServer(url);
      cleanups.push(watcher.close);
      const [first, second] = POINTS as [GroundVector, GroundVector];
      const findBot = (): PlayerState | undefined =>
        findPlayer(watcher.snapshots.at(-1), bot.playerId);

      await waitUntil(() => isIdleAt(findBot(), first));
      const arrival: number = watcher.snapshots.length;
      await waitUntil(() => findBot()?.action === 'Walk');
      const departure: number = watcher.snapshots.length;
      await waitUntil(() => isIdleAt(findBot(), second));

      // Half a second is about five snapshots.
      expect(departure - arrival).toBeGreaterThanOrEqual(3);
      for (const players of watcher.snapshots) {
        const player: PlayerState | undefined = findPlayer(
          players,
          bot.playerId,
        );
        if (player === undefined) {
          continue;
        }
        const offset: number = Math.min(
          measureOffset(player, START, first),
          measureOffset(player, first, second),
        );
        expect(offset).toBeLessThan(1e-6);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'sets out again when it gets nowhere or somewhere else',
    async () => {
      const [first] = POINTS as [GroundVector];
      const ways: (GroundVector[] | null)[] = [
        [{ x: first.x + 1, z: first.z }],
        null,
      ];
      let count = 0;
      const bot: RunningBot = await startTestBot({
        ...PATROL,
        findPath: (from: GroundVector, to: GroundVector) => {
          count++;
          return ways.length > 0 ? (ways.shift() ?? null) : [to];
        },
      });
      const watcher: Watcher = watchServer(url);
      cleanups.push(watcher.close);
      await waitUntil(() =>
        isIdleAt(findPlayer(watcher.snapshots.at(-1), bot.playerId), first),
      );
      expect(count).toBe(3);
    },
    TEST_TIMEOUT,
  );

  it(
    'drinks from the fountain when its health is low, then patrols on',
    async () => {
      const bot: RunningBot = await startTestBot({
        ...PATROL,
        thirstyHealth: PLAYER_HEALTH,
      });
      const watcher: Watcher = watchServer(url);
      cleanups.push(watcher.close);
      const [first] = POINTS as [GroundVector];
      const findBot = (): PlayerState | undefined =>
        findPlayer(watcher.snapshots.at(-1), bot.playerId);

      await waitUntil(() => findBot()?.action === 'Drink');
      await waitUntil(() => isIdleAt(findBot(), first));
      const drinks: number = new Set(
        watcher.snapshots
          .map((players: readonly PlayerState[]) =>
            findPlayer(players, bot.playerId),
          )
          .filter(
            (player: PlayerState | undefined) => player?.action === 'Drink',
          )
          .map((player: PlayerState | undefined) => player?.actionCount),
      ).size;
      expect(drinks).toBe(1);
    },
    TEST_TIMEOUT * 2,
  );

  it('leaves the village when stopped', async () => {
    const watcher: Watcher = watchServer(url);
    cleanups.push(watcher.close);
    const bot: RunningBot = await startBot(url, PATROL);
    await waitUntil(
      () => findPlayer(watcher.snapshots.at(-1), bot.playerId) !== undefined,
    );
    bot.stop();
    await expect(bot.finished).resolves.toBeUndefined();
    await waitUntil(
      () => findPlayer(watcher.snapshots.at(-1), bot.playerId) === undefined,
    );
  });

  it('fails once the server disconnects it', async () => {
    const bot: RunningBot = await startBot(url, PATROL);
    await server?.stop();
    server = null;
    await expect(bot.finished).rejects.toThrow('disconnected');
  });

  it('fails when no server is listening', async () => {
    await server?.stop();
    server = null;
    await expect(startBot(url)).rejects.toThrow();
  });
});
