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
  NO_WORLD_ITEMS,
  SIMULATION_RATE,
  TOBY_ENDS,
  TOBY_LOOP_STEPS,
  WALK_SPEED,
  createMotion,
  createSnapshotMessage,
  stepMotion,
} from '@clovervale/shared';
import type {
  InputProgress,
  MonsterState,
  PlayerMotion,
  PlayerState,
  SnapshotMessage,
} from '@clovervale/shared';

import { ServerClock, SnapshotTimeline } from '../src/interpolation.ts';
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
  health: 100,
};

/** What the snapshots tell the page of its own player. */
const OWN: InputProgress = {
  sequence: 0,
  steps: 0,
  motion: createMotion(PLAYER, PLAYER.yaw),
};

/**
 * Creates a snapshot message that tells of the players, the monsters and
 * the inputs alone: with no slash judged, nothing to pick, nothing carried,
 * no silver coins, no dialogue, no acquaintances and no quests.
 *
 * @param {number} step - The number of simulation steps the world has
 *   taken.
 * @param {readonly PlayerState[]} players - The players.
 * @param {readonly MonsterState[]} monsters - The monsters.
 * @param {InputProgress} own - How far the player of the peer has gotten
 *   with the inputs of the peer.
 * @returns {SnapshotMessage} The snapshot message.
 */
function createPlainSnapshot(
  step: number,
  players: readonly PlayerState[],
  monsters: readonly MonsterState[],
  own: InputProgress,
): SnapshotMessage {
  return createSnapshotMessage({
    step,
    players,
    monsters,
    world: NO_WORLD_ITEMS,
    view: {
      own,
      slash: null,
      inventory: [],
      silver: 0,
      dialogue: null,
      acquaintances: [],
      quests: [],
    },
  });
}

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
  timeline.addSnapshot(
    createPlainSnapshot(step, players, [], OWN),
    step * STEP,
  );
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

/**
 * Finds the snapshot after which a player has moved farthest since the
 * snapshot before, among the places of the player after each step.
 *
 * @param {readonly PlayerState[]} places - The player after each step,
 *   from step 1.
 * @returns {number} The number of the step of the snapshot, which is even.
 */
function findFarthestPush(places: readonly PlayerState[]): number {
  let farthest = 0;
  let found = 2;
  for (let step = 4; step <= places.length; step += 2) {
    const before: PlayerState | undefined = places[step - 3];
    const after: PlayerState | undefined = places[step - 1];
    if (before === undefined || after === undefined) {
      continue;
    }
    const distance: number = Math.hypot(after.x - before.x, after.z - before.z);
    if (distance > farthest) {
      farthest = distance;
      found = step;
    }
  }
  return found;
}

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
    let last: number = clock.read(400) ?? Number.NaN;
    expect(last).toBe(5100);
    // From now on everything takes 40 milliseconds longer to arrive.
    for (let time = 100; time <= 6000; time += 100) {
      clock.observe(5000 + time, 340 + time);
      for (const frame of [350, 400]) {
        const now: number | null = clock.read(frame + time);
        expect(now).not.toBeNull();
        expect((now ?? Number.NaN) - last).toBeGreaterThan(0);
        expect((now ?? Number.NaN) - last).toBeLessThanOrEqual(50);
        last = now ?? Number.NaN;
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

  it('tells by a peek what a reading then would tell', () => {
    const clock = new ServerClock();
    expect(clock.peek(300)).toBeNull();
    clock.observe(5000, 300);
    expect(clock.read(400)).toBe(5100);
    // A time arrives 20 milliseconds sooner than the first did.
    clock.observe(5100, 380);
    expect(clock.peek(450)).toBe(5155);
    expect(clock.peek(700)).toBe(5420);
    expect(clock.read(700)).toBe(5420);
  });
});

describe('SnapshotTimeline', () => {
  it('has nothing to show before the first snapshot', () => {
    const timeline = new SnapshotTimeline();
    expect(timeline.latest).toBeNull();
    const nobody = { players: [], monsters: [], lag: 0, time: null };
    expect(timeline.readLatest()).toEqual(nobody);
    expect(timeline.readPast(1000, 200)).toEqual(nobody);
  });

  it('shows the latest snapshot as it is', () => {
    const timeline = new SnapshotTimeline();
    const moved: PlayerState = { ...PLAYER, x: 1.15 };
    receiveAtOnce(timeline, 2, [PLAYER]);
    receiveAtOnce(timeline, 4, [moved]);
    expect(timeline.latest).toEqual([moved]);
    expect(timeline.readLatest()).toEqual({
      players: [moved],
      monsters: [],
      lag: 0,
      time: 4 * STEP,
    });
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
      timeline.addSnapshot(
        createPlainSnapshot(step, [player], [], OWN),
        arrival,
      );
    }
    const seen: number[] = [1400, 1425, 1450, 1475, 1500].map(
      (time: number) => findOnly(timeline.readPast(time, 200)).x,
    );
    [0.2, 0.225, 0.25, 0.275, 0.3].forEach((x: number, index: number) => {
      expect(seen[index]).toBeCloseTo(x);
    });
  });

  it('turns a player the shorter way around', () => {
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
    expect(timeline.readPast(400, 200)).toEqual({
      players: [moved],
      monsters: [],
      lag: 0,
      time: 200,
    });
    expect(timeline.readPast(900, 200)).toEqual({
      players: [moved],
      monsters: [],
      lag: 0,
      time: 700,
    });
  });

  it('carries on from where it held once the next snapshot arrives', () => {
    const timeline = new SnapshotTimeline();
    receiveAtOnce(timeline, 2, [PLAYER]);
    receiveAtOnce(timeline, 4, [{ ...PLAYER, x: 1.2 }]);
    expect(findOnly(timeline.readPast(440, 200)).x).toBe(1.2);
    const late = createPlainSnapshot(6, [{ ...PLAYER, x: 1.4 }], [], OWN);
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

  it('glides a player that Toby pushes aside', () => {
    const [first, second] = TOBY_ENDS;
    let motion: PlayerMotion = createMotion(
      { x: (first.x + second.x) / 2, z: (first.z + second.z) / 2 },
      0,
    );
    const places: PlayerState[] = [];
    for (let step = 1; step <= TOBY_LOOP_STEPS; step++) {
      motion = stepMotion(motion, step, 'village', []);
      places.push({ ...PLAYER, x: motion.x, z: motion.z, yaw: motion.yaw });
    }
    // The step after which the player has been pushed farthest since the
    // snapshot before.
    const step: number = findFarthestPush(places);
    const before: PlayerState = places[step - 3] ?? PLAYER;
    const after: PlayerState = places[step - 1] ?? PLAYER;
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(
      (WALK_SPEED * 2 * STEP) / 1000,
    );
    const timeline = new SnapshotTimeline();
    receiveAtOnce(timeline, step - 2, [before]);
    receiveAtOnce(timeline, step, [after]);
    const halfway: PlayerState = findOnly(
      timeline.readPast((step - 1) * STEP + 200, 200),
    );
    expect(halfway.x).toBeCloseTo((before.x + after.x) / 2, 9);
    expect(halfway.z).toBeCloseTo((before.z + after.z) / 2, 9);
  });

  it('does not glide a player across a jump as short as a push', () => {
    const timeline = new SnapshotTimeline();
    const near: PlayerState = { ...PLAYER, x: PLAYER.x + 0.4 };
    receiveAtOnce(timeline, 2, [PLAYER]);
    receiveAtOnce(timeline, 4, [near]);
    expect(timeline.readPast(350, 200).players).toEqual([PLAYER]);
    expect(timeline.readPast(400, 200).players).toEqual([near]);
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
    }
    const past: PlayersView = timeline.readPast(1998 * STEP, 1000);
    expect(findOnly(past).x).toBeCloseTo(1978 * 0.05);
    expect(timeline.readPast(1998 * STEP, 1997 * STEP).players).toEqual([]);
  });

  it('leaves out a snapshot that is no newer than the latest', () => {
    const timeline = new SnapshotTimeline();
    receiveAtOnce(timeline, 4, [PLAYER]);
    receiveAtOnce(timeline, 4, [{ ...PLAYER, x: 7 }]);
    receiveAtOnce(timeline, 2, [{ ...PLAYER, x: 8 }]);
    expect(timeline.latest).toEqual([PLAYER]);
  });

  it('names the time of what it shows in the past, without moving', () => {
    const timeline = new SnapshotTimeline();
    expect(timeline.findViewTime(400, 200)).toBeNull();
    receiveAtOnce(timeline, 2, [PLAYER]);
    receiveAtOnce(timeline, 6, [PLAYER]);
    expect(timeline.findViewTime(350, 200)).toBe(150);
    expect(timeline.readPast(350, 200).time).toBe(150);
    expect(timeline.findViewTime(500, 260)).toBe(240);
  });

  it('names the time of the latest snapshot for what it shows past it', () => {
    const timeline = new SnapshotTimeline();
    receiveAtOnce(timeline, 2, [PLAYER]);
    receiveAtOnce(timeline, 4, [PLAYER]);
    expect(timeline.findViewTime(400, 100)).toBe(4 * STEP);
    expect(timeline.findViewTime(900, 200)).toBe(4 * STEP);
  });

  it('names the time of the latest snapshot for what it shows as is', () => {
    const timeline = new SnapshotTimeline();
    receiveAtOnce(timeline, 2, [PLAYER]);
    receiveAtOnce(timeline, 4, [PLAYER]);
    expect(timeline.findViewTime(1000, null)).toBe(4 * STEP);
  });

  it('has nothing to show once it is cleared', () => {
    const timeline = new SnapshotTimeline();
    receiveAtOnce(timeline, 4, [PLAYER]);
    timeline.clear();
    expect(timeline.latest).toBeNull();
    expect(timeline.readPast(400, 200)).toEqual({
      players: [],
      monsters: [],
      lag: 0,
      time: null,
    });
    expect(timeline.latestMonsters).toBeNull();
  });

  it('puts a monster between two snapshots, like a player', () => {
    const timeline = new SnapshotTimeline();
    const monster: MonsterState = {
      id: 1,
      kind: 'village-dog',
      x: 10,
      z: 8,
      yaw: 0,
      action: 'Walk',
      actionCount: 3,
      health: 40,
      mode: 'chase',
    };
    const later: MonsterState = { ...monster, x: 10.1, yaw: 90, health: 20 };
    timeline.addSnapshot(
      createPlainSnapshot(2, [PLAYER], [monster], OWN),
      2 * STEP,
    );
    timeline.addSnapshot(
      createPlainSnapshot(4, [PLAYER], [later], OWN),
      4 * STEP,
    );
    expect(timeline.latestMonsters).toEqual([later]);
    const view = timeline.readPast(350, 200);
    expect(view.time).toBe(150);
    expect(view.monsters).toHaveLength(1);
    expect(view.monsters[0]?.x).toBeCloseTo(10.05);
    expect(view.monsters[0]?.yaw).toBeCloseTo(45);
    expect(view.monsters[0]?.health).toBe(40);
  });

  it('leaves out a monster that the earlier snapshot leaves out', () => {
    const timeline = new SnapshotTimeline();
    const monster: MonsterState = {
      id: 1,
      kind: 'village-dog',
      x: 10,
      z: 8,
      yaw: 0,
      action: 'Idle',
      actionCount: 0,
      health: 60,
      mode: 'idle',
    };
    receiveAtOnce(timeline, 2, [PLAYER]);
    timeline.addSnapshot(
      createPlainSnapshot(4, [PLAYER], [monster], OWN),
      4 * STEP,
    );
    expect(timeline.readPast(350, 200).monsters).toEqual([]);
    expect(timeline.readPast(400, 200).monsters).toEqual([monster]);
  });
});
