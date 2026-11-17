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
 * @module client/tests/interpolation Tests for showing the past smoothly.
 */

import { describe, expect, it } from 'vitest';

import {
  SIMULATION_RATE,
  createMotion,
  createSnapshotMessage,
} from '@clovervale/shared';
import type { InputProgress, PlayerState } from '@clovervale/shared';

import {
  HISTORY_LIMIT,
  ServerClock,
  SnapshotTimeline,
  interpolateYaw,
} from '../src/interpolation.ts';
import type { PlayersView } from '../src/interpolation.ts';

/** How long one step of the simulation lasts, in milliseconds. */
const STEP: number = 1000 / SIMULATION_RATE;

/** A player to put in snapshots. */
const PLAYER: PlayerState = {
  id: 5,
  appearance: 2,
  x: 1,
  z: -3,
  yaw: 90,
  action: 'Walk',
  actionCount: 1,
};

/** What the snapshots tell the page of its own player. */
const OWN: InputProgress = {
  sequence: 0,
  steps: 0,
  motion: createMotion(PLAYER, PLAYER.yaw),
};

/**
 * Receives a snapshot the moment the server takes it, as if the server and
 * the page shared a clock.
 *
 * @param {SnapshotTimeline} timeline - The timeline that receives it.
 * @param {number} step - The simulation step of the snapshot.
 * @param {readonly PlayerState[]} players - The players in the snapshot.
 */
function receiveAtOnce(
  timeline: SnapshotTimeline,
  step: number,
  players: readonly PlayerState[],
): void {
  timeline.addSnapshot(createSnapshotMessage(step, players, OWN), step * STEP);
}

/**
 * Finds the only player in a view.
 *
 * @param {PlayersView} view - The view.
 * @returns {PlayerState} The player.
 * @throws {Error} If there is not exactly one.
 */
function findOnly(view: PlayersView): PlayerState {
  const [only] = view.players;
  if (only === undefined || view.players.length !== 1) {
    throw new Error(`${String(view.players.length)} players are in view.`);
  }
  return only;
}

describe('interpolateYaw', () => {
  it('turns part of the way from one yaw to another', () => {
    expect(interpolateYaw(10, 50, 0.25)).toBeCloseTo(20);
    expect(interpolateYaw(50, 10, 0.25)).toBeCloseTo(40);
  });

  it('gives the yaws themselves at both ends', () => {
    expect(interpolateYaw(-90, 180, 0)).toBeCloseTo(-90);
    expect(interpolateYaw(-90, 180, 1)).toBeCloseTo(180);
    expect(interpolateYaw(180, 180, 0.5)).toBe(180);
  });

  it('turns the shorter way round, across the back', () => {
    expect(interpolateYaw(170, -170, 0.25)).toBeCloseTo(175);
    expect(interpolateYaw(170, -170, 0.75)).toBeCloseTo(-175);
    expect(interpolateYaw(-170, 170, 0.25)).toBeCloseTo(-175);
  });

  it('turns the shorter way round between yaws counted from 0 to 360', () => {
    expect(interpolateYaw(350, 10, 0.5) % 360).toBeCloseTo(0);
    expect(interpolateYaw(10, 350, 0.25)).toBeCloseTo(5);
  });
});

describe('ServerClock', () => {
  it('cannot tell the time before the server has told it', () => {
    expect(new ServerClock().read(1000)).toBeNull();
  });

  it('tells the time of the server from when its time arrived', () => {
    const clock = new ServerClock();
    clock.observe(5000, 300);
    expect(clock.read(300)).toBe(5000);
    expect(clock.read(316)).toBe(5016);
  });

  it('is not held back by times that arrive late', () => {
    const clock = new ServerClock();
    clock.observe(5000, 300);
    clock.observe(5100, 460);
    clock.observe(5200, 500);
    expect(clock.read(500)).toBe(5200);
    expect(clock.read(550)).toBe(5250);
  });

  it('gives way little by little when every time arrives later', () => {
    const clock = new ServerClock();
    clock.observe(5000, 300);
    let last: number = clock.read(400) ?? NaN;
    expect(last).toBe(5100);
    // From now on everything takes 40 milliseconds longer to arrive.
    for (let time = 100; time <= 6000; time += 100) {
      clock.observe(5000 + time, 340 + time);
      for (const frame of [350, 400]) {
        const now: number | null = clock.read(frame + time);
        expect(now).not.toBeNull();
        expect((now ?? NaN) - last).toBeGreaterThan(0);
        expect((now ?? NaN) - last).toBeLessThanOrEqual(50);
        last = now ?? NaN;
      }
    }
    expect(clock.read(6500)).toBeCloseTo(5000 + 6500 - 340);
  });

  it('starts over at once when the time is far off', () => {
    const clock = new ServerClock();
    clock.observe(5000, 300);
    expect(clock.read(300)).toBe(5000);
    clock.observe(90000, 400);
    expect(clock.read(400)).toBe(90000);
  });

  it('forgets the time of the server when it is reset', () => {
    const clock = new ServerClock();
    clock.observe(5000, 300);
    clock.reset();
    expect(clock.read(300)).toBeNull();
  });
});

describe('SnapshotTimeline', () => {
  it('has nothing to show before the first snapshot', () => {
    const timeline = new SnapshotTimeline();
    expect(timeline.latest).toBeNull();
    expect(timeline.readLatest()).toEqual({ players: [], lag: 0 });
    expect(timeline.readPast(1000, 200)).toEqual({ players: [], lag: 0 });
  });

  it('shows the latest snapshot as it is', () => {
    const timeline = new SnapshotTimeline();
    const moved: PlayerState = { ...PLAYER, x: 1.15 };
    receiveAtOnce(timeline, 2, [PLAYER]);
    receiveAtOnce(timeline, 4, [moved]);
    expect(timeline.latest).toEqual([moved]);
    expect(timeline.readLatest()).toEqual({ players: [moved], lag: 0 });
  });

  it('puts a player between two snapshots, by the time between them', () => {
    const timeline = new SnapshotTimeline();
    receiveAtOnce(timeline, 2, [PLAYER]);
    receiveAtOnce(timeline, 4, [{ ...PLAYER, x: 1.12, z: -3.09 }]);
    receiveAtOnce(timeline, 6, [{ ...PLAYER, x: 1.24, z: -3.18 }]);
    const early: PlayerState = findOnly(timeline.readPast(325, 200));
    expect(early.x).toBeCloseTo(1.03);
    expect(early.z).toBeCloseTo(-3.0225);
    const late: PlayerState = findOnly(timeline.readPast(475, 200));
    expect(late.x).toBeCloseTo(1.21);
    expect(late.z).toBeCloseTo(-3.1575);
  });

  it('tells how far behind the latest snapshot it shows', () => {
    const timeline = new SnapshotTimeline();
    receiveAtOnce(timeline, 2, [PLAYER]);
    receiveAtOnce(timeline, 6, [PLAYER]);
    expect(timeline.readPast(350, 200).lag).toBeCloseTo(150);
    expect(timeline.readPast(350, 0).lag).toBe(0);
  });

  it('shows the past by the delay asked for', () => {
    const timeline = new SnapshotTimeline();
    for (let step = 0; step <= 30; step += 2) {
      receiveAtOnce(timeline, step, [{ ...PLAYER, x: step * 0.05 }]);
    }
    expect(findOnly(timeline.readPast(1500, 1000)).x).toBeCloseTo(0.5);
    expect(findOnly(timeline.readPast(1500, 325)).x).toBeCloseTo(1.175);
    expect(findOnly(timeline.readPast(1500, 0)).x).toBe(30 * 0.05);
  });

  it('moves evenly however unevenly the snapshots arrive', () => {
    const timeline = new SnapshotTimeline();
    const arrivals: [number, number][] = [
      [0, 1000],
      [2, 1100],
      [4, 1290],
      [6, 1300],
      [8, 1400],
    ];
    for (const [step, arrival] of arrivals) {
      const player: PlayerState = { ...PLAYER, x: step * 0.05 };
      timeline.addSnapshot(createSnapshotMessage(step, [player], OWN), arrival);
    }
    const seen: number[] = [1400, 1425, 1450, 1475, 1500].map(
      (time: number) => findOnly(timeline.readPast(time, 200)).x,
    );
    [0.2, 0.225, 0.25, 0.275, 0.3].forEach((x: number, index: number) => {
      expect(seen[index]).toBeCloseTo(x);
    });
  });

  it('turns a player the shorter way round', () => {
    const timeline = new SnapshotTimeline();
    receiveAtOnce(timeline, 2, [{ ...PLAYER, yaw: 170 }]);
    receiveAtOnce(timeline, 4, [{ ...PLAYER, yaw: -170 }]);
    expect(findOnly(timeline.readPast(325, 200)).yaw).toBeCloseTo(175);
    expect(findOnly(timeline.readPast(375, 200)).yaw).toBeCloseTo(-175);
  });

  it('keeps what a player does until the snapshot that changes it', () => {
    const timeline = new SnapshotTimeline();
    const slashing: PlayerState = {
      ...PLAYER,
      x: 1.1,
      action: 'Slash',
      actionCount: 2,
    };
    receiveAtOnce(timeline, 2, [PLAYER]);
    receiveAtOnce(timeline, 4, [slashing]);
    receiveAtOnce(timeline, 6, [slashing]);
    const before: PlayerState = findOnly(timeline.readPast(399, 200));
    expect(before).toMatchObject({ action: 'Walk', actionCount: 1 });
    expect(before.x).toBeLessThan(1.1);
    expect(findOnly(timeline.readPast(400, 200))).toEqual(slashing);
    expect(findOnly(timeline.readPast(450, 200))).toEqual(slashing);
  });

  it('shows nobody before the time of the first snapshot', () => {
    const timeline = new SnapshotTimeline();
    receiveAtOnce(timeline, 20, [PLAYER]);
    expect(timeline.readPast(1100, 200).players).toEqual([]);
    expect(timeline.readPast(1199, 200).players).toEqual([]);
    expect(timeline.readPast(1200, 200).players).toEqual([PLAYER]);
  });

  it('shows a player from the snapshot it appears in', () => {
    const timeline = new SnapshotTimeline();
    const other: PlayerState = { ...PLAYER, id: 6, x: 8 };
    receiveAtOnce(timeline, 2, [PLAYER]);
    receiveAtOnce(timeline, 4, [PLAYER, other]);
    expect(timeline.readPast(399, 200).players).toEqual([PLAYER]);
    expect(timeline.readPast(400, 200).players).toEqual([PLAYER, other]);
  });

  it('shows a player until the snapshot it is gone from', () => {
    const timeline = new SnapshotTimeline();
    const other: PlayerState = { ...PLAYER, id: 6, x: 8 };
    receiveAtOnce(timeline, 2, [PLAYER, other]);
    receiveAtOnce(timeline, 4, [PLAYER]);
    expect(timeline.readPast(399, 200).players).toEqual([PLAYER, other]);
    expect(timeline.readPast(400, 200).players).toEqual([PLAYER]);
  });

  it('holds the last snapshot while the next one has not arrived', () => {
    const timeline = new SnapshotTimeline();
    const moved: PlayerState = { ...PLAYER, x: 1.15 };
    receiveAtOnce(timeline, 2, [PLAYER]);
    receiveAtOnce(timeline, 4, [moved]);
    expect(timeline.readPast(400, 200)).toEqual({ players: [moved], lag: 0 });
    expect(timeline.readPast(900, 200)).toEqual({ players: [moved], lag: 0 });
  });

  it('carries on from where it held once the next snapshot arrives', () => {
    const timeline = new SnapshotTimeline();
    receiveAtOnce(timeline, 2, [PLAYER]);
    receiveAtOnce(timeline, 4, [{ ...PLAYER, x: 1.2 }]);
    expect(findOnly(timeline.readPast(440, 200)).x).toBe(1.2);
    const late = createSnapshotMessage(6, [{ ...PLAYER, x: 1.4 }], OWN);
    timeline.addSnapshot(late, 445);
    expect(findOnly(timeline.readPast(450, 200)).x).toBeCloseTo(1.3);
  });

  it('does not glide a player across a jump', () => {
    const timeline = new SnapshotTimeline();
    const far: PlayerState = { ...PLAYER, x: 9, yaw: -90 };
    receiveAtOnce(timeline, 2, [PLAYER]);
    receiveAtOnce(timeline, 4, [far]);
    expect(timeline.readPast(350, 200).players).toEqual([PLAYER]);
    expect(timeline.readPast(399, 200).players).toEqual([PLAYER]);
    expect(timeline.readPast(400, 200).players).toEqual([far]);
  });

  it('glides a player that walks while a snapshot is missing', () => {
    const timeline = new SnapshotTimeline();
    receiveAtOnce(timeline, 2, [PLAYER]);
    receiveAtOnce(timeline, 6, [{ ...PLAYER, x: 1.3 }]);
    expect(findOnly(timeline.readPast(400, 200)).x).toBeCloseTo(1.15);
  });

  it('keeps only so many snapshots', () => {
    const timeline = new SnapshotTimeline();
    for (let step = 0; step < 2000; step += 2) {
      receiveAtOnce(timeline, step, [{ ...PLAYER, x: step * 0.05 }]);
      expect(timeline.size).toBeLessThanOrEqual(HISTORY_LIMIT);
    }
    expect(timeline.size).toBe(HISTORY_LIMIT);
    const past: PlayersView = timeline.readPast(1998 * STEP, 1000);
    expect(findOnly(past).x).toBeCloseTo(1978 * 0.05);
  });

  it('leaves out a snapshot that is no newer than the latest', () => {
    const timeline = new SnapshotTimeline();
    receiveAtOnce(timeline, 4, [PLAYER]);
    receiveAtOnce(timeline, 4, [{ ...PLAYER, x: 7 }]);
    receiveAtOnce(timeline, 2, [{ ...PLAYER, x: 8 }]);
    expect(timeline.size).toBe(1);
    expect(timeline.latest).toEqual([PLAYER]);
  });

  it('has nothing to show once it is cleared', () => {
    const timeline = new SnapshotTimeline();
    receiveAtOnce(timeline, 4, [PLAYER]);
    timeline.clear();
    expect(timeline.size).toBe(0);
    expect(timeline.latest).toBeNull();
    expect(timeline.readPast(400, 200)).toEqual({ players: [], lag: 0 });
  });
});
