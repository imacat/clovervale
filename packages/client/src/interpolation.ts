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
 * @module client/interpolation Showing the players and the monsters
 *   slightly in the past.
 */

import {
  SNAPSHOT_RATE,
  STEP_MILLISECONDS,
  interpolatePlaced,
  measurePushReach,
} from '@clovervale/shared';
import type {
  MonsterState,
  PlayerState,
  SnapshotMessage,
} from '@clovervale/shared';

import { SlewedClock } from './slewed-clock.ts';

/** How far in the past the players are shown by default, in milliseconds. */
export const DEFAULT_DELAY: number = (2 * 1000) / SNAPSHOT_RATE;

/** The furthest in the past the players can be shown, in milliseconds. */
export const MAX_DELAY = 1000;

/** The most snapshots that are kept to show the past from. */
const HISTORY_LIMIT: number = Math.ceil((MAX_DELAY * SNAPSHOT_RATE) / 1000) + 6;

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

/** The players and the monsters to show at one moment. */
export interface PlayersView {
  /** The players, as they are shown. */
  readonly players: readonly PlayerState[];
  /** The monsters, as they are shown. */
  readonly monsters: readonly MonsterState[];
  /**
   * How long before the latest snapshot the players were as they are shown,
   * in milliseconds.
   */
  readonly lag: number;
  /**
   * The time on the clock of the server when the players were as they are
   * shown, in milliseconds, or `null` before the first snapshot.
   */
  readonly time: number | null;
}

/** A snapshot, and when the server took it. */
interface TimedSnapshot {
  /** When the server took the snapshot, on its own clock, in milliseconds. */
  readonly time: number;
  /** The players in the snapshot. */
  readonly players: readonly PlayerState[];
  /** The monsters in the snapshot. */
  readonly monsters: readonly MonsterState[];
}

/** The view that shows nobody. */
const EMPTY_VIEW: PlayersView = {
  players: [],
  monsters: [],
  lag: 0,
  time: null,
};

/**
 * The clock of the server, as a page can tell it from the snapshots.
 *
 * It runs evenly with the clock of the page, however unevenly the snapshots
 * arrive.  It trails the server by the least time a recent snapshot took to
 * arrive.
 */
export class ServerClock {
  #offsets: number[] = [];
  readonly #slewed = new SlewedClock(CLOCK_SLEW, CLOCK_RESYNC);

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
    const target: number | null = this.#findTarget();
    if (target === null) {
      return null;
    }
    return localTime + this.#slewed.read(target, localTime);
  }

  /**
   * Tells the time of the server that a reading would tell, without
   * reading the clock, so that the next reading is as if this one had not
   * been made.
   *
   * @param {number} localTime - The time on the clock of the page, in
   *   milliseconds, which is no earlier than at the last reading.
   * @returns {number | null} The time on the clock of the server, in
   *   milliseconds, which a reading then tells if no time of the server is
   *   noted before it, or `null` before the first time of the server.
   */
  peek(localTime: number): number | null {
    const target: number | null = this.#findTarget();
    return target === null
      ? null
      : localTime + this.#slewed.peek(target, localTime);
  }

  /** Forgets the time of the server. */
  reset(): void {
    this.#offsets = [];
    this.#slewed.reset();
  }

  /**
   * Finds how far ahead of the clock of the page the clock of the server
   * is, as the times of the server noted tell.
   *
   * @returns {number | null} The difference, in milliseconds, or `null`
   *   before the first time of the server.
   */
  #findTarget(): number | null {
    if (this.#offsets.length === 0) {
      return null;
    }
    // A snapshot can only arrive late, so the quickest one is the truest.
    return Math.max(...this.#offsets);
  }
}

/** The latest snapshots, to show the players and the monsters from. */
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
   * The monsters in the latest snapshot, or `null` before the first one.
   *
   * @returns {(readonly MonsterState[]) | null} The monsters.
   */
  get latestMonsters(): readonly MonsterState[] | null {
    return this.#snapshots.at(-1)?.monsters ?? null;
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
    this.#snapshots.push({
      time,
      players: snapshot.players,
      monsters: snapshot.monsters,
    });
    if (this.#snapshots.length > HISTORY_LIMIT) {
      this.#snapshots.shift();
    }
  }

  /**
   * Tells the players and the monsters exactly as the latest snapshot tells
   * them.
   *
   * @returns {PlayersView} The players and the monsters, or nobody before
   *   the first snapshot.
   */
  readLatest(): PlayersView {
    const newest: TimedSnapshot | undefined = this.#snapshots.at(-1);
    if (newest === undefined) {
      return EMPTY_VIEW;
    }
    const { players, monsters, time } = newest;
    return { players, monsters, lag: 0, time };
  }

  /**
   * Tells the players and the monsters as they were a while ago on the
   * clock of the server.
   *
   * Between two snapshots, a player stands part of the way from where the
   * earlier one tells to where the later one tells, by the time that has
   * passed between them, and is turned likewise, the shorter way round.  It
   * does what the earlier one tells, and is there only if the earlier one
   * tells so.  A player that has moved further than it can walk, and than
   * a villager can have pushed it, stays where it was until the time of the later
   * snapshot.  So does a monster that has moved further than it can walk.
   *
   * Past the latest snapshot, everyone stays as it tells them.  Before the
   * earliest snapshot that is kept, there is nobody.
   *
   * @param {number} localTime - The time on the clock of the page, in
   *   milliseconds, which is no earlier than at the last reading.
   * @param {number} delay - How long ago, in milliseconds.
   * @returns {PlayersView} The players and the monsters, or nobody before
   *   the first snapshot.
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
      return { players: [], monsters: [], lag, time };
    }
    if (after === undefined) {
      const { players, monsters } = before;
      return { players, monsters, lag, time };
    }
    const span: number = after.time - before.time;
    const fraction: number = (time - before.time) / span;
    return {
      players: interpolatePlaced(
        before.players,
        after.players,
        fraction,
        span,
        (player: PlayerState) =>
          measurePushReach(player, after.time / STEP_MILLISECONDS, span),
      ),
      monsters: interpolatePlaced(
        before.monsters,
        after.monsters,
        fraction,
        span,
      ),
      lag,
      time,
    };
  }

  /**
   * Tells the time on the clock of the server at which the players and the
   * monsters were as a page shows them at a time, without reading the clock
   * of the server.
   *
   * @param {number} localTime - The time on the clock of the page, in
   *   milliseconds, which is no earlier than at the last reading.
   * @param {number | null} delay - How long ago the page shows them, in
   *   milliseconds, as {@link SnapshotTimeline.readPast} does, or `null` if
   *   it shows them as {@link SnapshotTimeline.readLatest} does.
   * @returns {number | null} The time, in milliseconds, which is that of
   *   the view then if no snapshot arrives before it, but no later than the
   *   latest snapshot, which tells them as they are shown past it.  It is
   *   `null` before the first snapshot.
   */
  findViewTime(localTime: number, delay: number | null): number | null {
    const newest: TimedSnapshot | undefined = this.#snapshots.at(-1);
    const now: number | null = this.#clock.peek(localTime);
    if (newest === undefined || now === null) {
      return null;
    }
    return delay === null ? newest.time : Math.min(now - delay, newest.time);
  }

  /** Forgets every snapshot, and the time of the server with them. */
  clear(): void {
    this.#snapshots = [];
    this.#clock.reset();
  }
}
