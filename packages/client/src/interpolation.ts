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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/18
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/interpolation Showing the players slightly in the past.
 */

import {
  SIMULATION_RATE,
  SNAPSHOT_RATE,
  WALK_SPEED,
} from '@clovervale/shared';
import type { PlayerState, SnapshotMessage } from '@clovervale/shared';

/** How far in the past the players are shown by default, in milliseconds. */
export const DEFAULT_DELAY: number = (2 * 1000) / SNAPSHOT_RATE;

/** The furthest in the past the players can be shown, in milliseconds. */
export const MAX_DELAY = 1000;

/** The most snapshots that are kept to show the past from. */
export const HISTORY_LIMIT: number =
  Math.ceil((MAX_DELAY * SNAPSHOT_RATE) / 1000) + 6;

/** How long one step of the simulation lasts, in milliseconds. */
const STEP_MILLISECONDS: number = 1000 / SIMULATION_RATE;

/** The number of latest snapshots the time of the server is told from. */
const CLOCK_WINDOW: number = 3 * SNAPSHOT_RATE;

/**
 * The most the clock may run fast or slow to stay with the server, as a
 * fraction of the time that passes.
 */
const CLOCK_SLEW = 0.1;

/**
 * How far off the clock may be, in milliseconds, before it starts over
 * instead of catching up little by little.
 */
const CLOCK_RESYNC = 500;

/**
 * How many times further than it can walk a player must have moved between
 * two snapshots to have jumped.
 */
const JUMP_FACTOR = 1.5;

/** The players to show at one moment. */
export interface PlayersView {
  /** The players, as they are shown. */
  readonly players: readonly PlayerState[];
  /**
   * How long before the latest snapshot the players were as they are shown,
   * in milliseconds.
   */
  readonly lag: number;
}

/** A snapshot, and when the server took it. */
interface TimedSnapshot {
  /** When the server took the snapshot, on its own clock, in milliseconds. */
  readonly time: number;
  /** The players in the snapshot. */
  readonly players: readonly PlayerState[];
}

/** The view that shows nobody. */
const EMPTY_VIEW: PlayersView = { players: [], lag: 0 };

/**
 * Finds the yaw part of the way from one yaw to another, the shorter way
 * round.
 *
 * @param {number} from - The yaw to turn from, in degrees.
 * @param {number} to - The yaw to turn to, in degrees.
 * @param {number} fraction - How much of the turn is made, from 0 to 1.
 * @returns {number} The yaw, in degrees, above -180 and up to 180.
 */
export function interpolateYaw(
  from: number,
  to: number,
  fraction: number,
): number {
  const turn: number = ((((to - from) % 360) + 540) % 360) - 180;
  const yaw: number = from + turn * fraction;
  return 180 - ((((180 - yaw) % 360) + 360) % 360);
}

/**
 * The clock of the server, as a page can tell it from the snapshots.
 *
 * It runs evenly with the clock of the page, however unevenly the snapshots
 * arrive.  It trails the server by the least time a recent snapshot took to
 * arrive.
 */
export class ServerClock {
  #offsets: number[] = [];
  #offset: number | null = null;
  #readTime = 0;

  /**
   * Takes note of a time of the server and of when the page learnt of it.
   *
   * @param {number} serverTime - The time on the clock of the server, in
   *   milliseconds.
   * @param {number} localTime - When it arrived, on the clock of the page,
   *   in milliseconds.
   */
  observe(serverTime: number, localTime: number): void {
    this.#offsets.push(serverTime - localTime);
    if (this.#offsets.length > CLOCK_WINDOW) {
      this.#offsets.shift();
    }
  }

  /**
   * Tells the time of the server.
   *
   * A clock that finds itself a little off catches up little by little, from
   * one reading to the next, without ever running backwards.  One that is
   * far off starts over at once.
   *
   * @param {number} localTime - The time on the clock of the page, in
   *   milliseconds, which is no earlier than at the last reading.
   * @returns {number | null} The time on the clock of the server, in
   *   milliseconds, or `null` before the first time of the server.
   */
  read(localTime: number): number | null {
    if (this.#offsets.length === 0) {
      return null;
    }
    // A snapshot can only arrive late, so the quickest one is the truest.
    const target: number = Math.max(...this.#offsets);
    const error: number =
      this.#offset === null ? Infinity : target - this.#offset;
    if (this.#offset === null || Math.abs(error) > CLOCK_RESYNC) {
      this.#offset = target;
    } else {
      const reach: number =
        CLOCK_SLEW * Math.max(localTime - this.#readTime, 0);
      this.#offset += Math.min(Math.max(error, -reach), reach);
    }
    this.#readTime = localTime;
    return localTime + this.#offset;
  }

  /** Forgets the time of the server. */
  reset(): void {
    this.#offsets = [];
    this.#offset = null;
  }
}

/** The latest snapshots, to show the players from. */
export class SnapshotTimeline {
  readonly #clock = new ServerClock();
  #snapshots: TimedSnapshot[] = [];

  /**
   * The players in the latest snapshot, or `null` before the first one.
   *
   * @returns {(readonly PlayerState[]) | null} The players.
   */
  get latest(): readonly PlayerState[] | null {
    return this.#snapshots.at(-1)?.players ?? null;
  }

  /**
   * The number of snapshots that are kept, which never exceeds
   * {@link HISTORY_LIMIT}.
   *
   * @returns {number} The number of snapshots.
   */
  get size(): number {
    return this.#snapshots.length;
  }

  /**
   * Adds a snapshot that has arrived, unless it is no newer than the latest.
   *
   * @param {SnapshotMessage} snapshot - The snapshot.
   * @param {number} arrivalTime - When it arrived, on the clock of the page,
   *   in milliseconds.
   */
  addSnapshot(snapshot: SnapshotMessage, arrivalTime: number): void {
    const time: number = snapshot.step * STEP_MILLISECONDS;
    const newest: TimedSnapshot | undefined = this.#snapshots.at(-1);
    if (newest !== undefined && time <= newest.time) {
      return;
    }
    this.#clock.observe(time, arrivalTime);
    this.#snapshots.push({ time, players: snapshot.players });
    if (this.#snapshots.length > HISTORY_LIMIT) {
      this.#snapshots.shift();
    }
  }

  /**
   * Tells the players exactly as the latest snapshot tells them.
   *
   * @returns {PlayersView} The players, or nobody before the first
   *   snapshot.
   */
  readLatest(): PlayersView {
    const { latest } = this;
    return latest === null ? EMPTY_VIEW : { players: latest, lag: 0 };
  }

  /**
   * Tells the players as they were a while ago on the clock of the server.
   *
   * Between two snapshots, a player stands part of the way from where the
   * earlier one tells to where the later one tells, by the time that has
   * passed between them, and is turned likewise, the shorter way round.  It
   * does what the earlier one tells, and is there only if the earlier one
   * tells so.  A player that has moved further than it can walk stays where
   * it was until the time of the later snapshot.
   *
   * Past the latest snapshot, the players stay as it tells them.  Before the
   * earliest snapshot that is kept, there is nobody.
   *
   * @param {number} localTime - The time on the clock of the page, in
   *   milliseconds, which is no earlier than at the last reading.
   * @param {number} delay - How long ago, in milliseconds.
   * @returns {PlayersView} The players, or nobody before the first
   *   snapshot.
   */
  readPast(localTime: number, delay: number): PlayersView {
    const now: number | null = this.#clock.read(localTime);
    const newest: TimedSnapshot | undefined = this.#snapshots.at(-1);
    if (now === null || newest === undefined) {
      return EMPTY_VIEW;
    }
    const time: number = now - delay;
    const lag: number = Math.max(newest.time - time, 0);
    const index: number = this.#snapshots.findLastIndex(
      (snapshot: TimedSnapshot) => snapshot.time <= time,
    );
    const before: TimedSnapshot | undefined = this.#snapshots[index];
    const after: TimedSnapshot | undefined = this.#snapshots[index + 1];
    if (before === undefined) {
      return { players: [], lag };
    }
    if (after === undefined) {
      return { players: before.players, lag };
    }
    const span: number = after.time - before.time;
    const fraction: number = (time - before.time) / span;
    const reach: number = (WALK_SPEED * JUMP_FACTOR * span) / 1000;
    const players: PlayerState[] = before.players.map(
      (player: PlayerState) => {
        const next: PlayerState | undefined = after.players.find(
          (other: PlayerState) => other.id === player.id,
        );
        if (
          next === undefined ||
          Math.hypot(next.x - player.x, next.z - player.z) > reach
        ) {
          return player;
        }
        return {
          ...player,
          x: player.x + (next.x - player.x) * fraction,
          z: player.z + (next.z - player.z) * fraction,
          yaw: interpolateYaw(player.yaw, next.yaw, fraction),
        };
      },
    );
    return { players, lag };
  }

  /** Forgets every snapshot, and the time of the server with them. */
  clear(): void {
    this.#snapshots = [];
    this.#clock.reset();
  }
}
