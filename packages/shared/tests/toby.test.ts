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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/19
// AI assistance: Claude Code (Anthropic)

/**
 * @module shared/tests/toby Tests for Toby, the child who hunts for
 *   four-leaf clover between the cottage and the village gate.
 */

import { describe, expect, it } from 'vitest';

import {
  CLOVER_PATCHES,
  PLAYER_RADIUS,
  SIMULATION_RATE,
  SPAWN_POINT_COUNT,
  TOBY_GRAB_STEPS,
  TOBY_LOOP_STEPS,
  TOBY_RADIUS,
  Terrain,
  VILLAGE_PLACEMENTS,
  VILLAGE_TERRAIN,
  WALK_SPEED,
  findPlacement,
  findSpawnPoint,
  findTobyGrab,
  findTobyPose,
  measurePushReach,
  placePoint,
  pushAside,
} from '../src/index.ts';
import type {
  GroundVector,
  Placement,
  Shape,
  TobyActivity,
  TobyGrab,
  TobyPose,
} from '../src/index.ts';
import { findTurn, turnVector } from '../src/terrain.ts';
import { TOBY_CLOVERS, resolveWalk } from '../src/toby.ts';

/** The least room between the body of Toby and the body of a player. */
const REACH: number = TOBY_RADIUS + PLAYER_RADIUS;

/** The steps of one whole loop of his course, from the first. */
const LOOP: readonly number[] = Array.from(
  { length: TOBY_LOOP_STEPS },
  (_, step: number) => step,
);

/** The poses of Toby over one whole loop of his course, step by step. */
const POSES: readonly TobyPose[] = LOOP.map(findTobyPose);

/** The clover patches of the village. */
const CLOVERS: readonly Placement[] = VILLAGE_PLACEMENTS.filter(
  (placement: Placement) => placement.model === 'clover',
);

/**
 * How far either way from the middle of the gate the earth of the way in
 * through it reaches, in meters.
 */
const WAY_IN_HALF_WIDTH = 2.6;

/**
 * The cottage on the left of the plaza as one looks into the village from
 * the gate, which faces the plaza.
 */
const COTTAGE: Placement = findPlacement('cottage');

/**
 * The door of that cottage, on its front, which faces the plaza, 0.9 m to
 * one side of the middle, as the model has it.
 */
const COTTAGE_DOOR: GroundVector = placePoint(COTTAGE, { x: 0.9, z: 2.35 });

/**
 * Measures how far apart two points are.
 *
 * @param {GroundVector} a - One point.
 * @param {GroundVector} b - The other point.
 * @returns {number} The distance, in meters.
 */
function measureDistance(a: GroundVector, b: GroundVector): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Finds the way something faces.
 *
 * @param {number} yaw - The turn around the Y axis from facing +Z toward
 *   +X, in degrees.
 * @returns {GroundVector} The way it faces, one meter long.
 */
function findFront(yaw: number): GroundVector {
  return turnVector({ x: 0, z: 1 }, findTurn(yaw));
}

/**
 * Lists the stretches of a loop of his course that he spends at each of
 * his activities, in the order he does them.
 *
 * @returns {{ activity: TobyActivity; poses: TobyPose[] }[]} The
 *   stretches, from the first step of a loop.
 */
function listStretches(): { activity: TobyActivity; poses: TobyPose[] }[] {
  const stretches: { activity: TobyActivity; poses: TobyPose[] }[] = [];
  for (const pose of POSES) {
    const last = stretches.at(-1);
    if (last?.activity === pose.activity) {
      last.poses.push(pose);
    } else {
      stretches.push({ activity: pose.activity, poses: [pose] });
    }
  }
  return stretches;
}

/**
 * Takes an item of a list that must have it.
 *
 * @param {readonly T[]} items - The list.
 * @param {number} index - The position of the item, from the end if
 *   negative.
 * @returns {T} The item.
 * @throws {Error} If the list has no item there.
 * @template T
 */
function takeItem<T>(items: readonly T[], index: number): T {
  const item: T | undefined = items.at(index);
  if (item === undefined) {
    throw new Error(`The list has no item at ${String(index)}.`);
  }
  return item;
}

/**
 * Finds the first pose of Toby in a loop of his course that is as told.
 *
 * @param {(pose: TobyPose) => boolean} isWanted - Tells whether a pose is
 *   as told.
 * @returns {TobyPose} The pose.
 * @throws {Error} If no pose is as told.
 */
function findPose(isWanted: (pose: TobyPose) => boolean): TobyPose {
  return takeItem(POSES.filter(isWanted), 0);
}

describe('the course of Toby', () => {
  it('goes around again and again, the same at every loop', () => {
    for (const step of LOOP) {
      const pose: TobyPose = findTobyPose(step);
      expect(findTobyPose(step + TOBY_LOOP_STEPS)).toEqual(pose);
      expect(findTobyPose(step + 9 * TOBY_LOOP_STEPS)).toEqual(pose);
    }
  });

  it('squats, picks, stands up, turns around and runs, at both ends', () => {
    const order: TobyActivity[] = listStretches().map(
      ({ activity }) => activity,
    );
    expect(order).toEqual([
      'Squat',
      'Pick',
      'Rise',
      'Turn',
      'Run',
      'Squat',
      'Pick',
      'Rise',
      'Turn',
      'Run',
    ]);
  });

  it('picks at the clover for a few seconds at a time', () => {
    for (const { activity, poses } of listStretches()) {
      if (activity === 'Pick') {
        expect(poses.length / SIMULATION_RATE).toBeGreaterThanOrEqual(3);
        expect(poses.length / SIMULATION_RATE).toBeLessThanOrEqual(6);
      }
    }
  });

  it('stays on the open ground, clear of everything', () => {
    for (const pose of POSES) {
      // A quarter of a meter at least between him and anything else, which
      // he has least of as he passes the end of the fence by the gate.
      expect(
        VILLAGE_TERRAIN.isClear(pose, TOBY_RADIUS + 0.25 - PLAYER_RADIUS),
      ).toBe(true);
    }
  });

  it('runs between the patch by the cottage and the one by the gate', () => {
    for (const patch of TOBY_CLOVERS) {
      expect(
        CLOVERS.filter(
          (clover: Placement) => clover.x === patch.x && clover.z === patch.z,
        ),
      ).toHaveLength(1);
    }
  });

  it('runs on the side of the cottage toward the gate, off its door', () => {
    for (const pose of POSES) {
      expect(pose.z - TOBY_RADIUS).toBeGreaterThan(COTTAGE.z);
      expect(measureDistance(pose, COTTAGE_DOOR)).toBeGreaterThan(4);
    }
  });

  it('keeps off the way in from the gate', () => {
    for (const pose of POSES) {
      expect(pose.x + TOBY_RADIUS).toBeLessThan(-WAY_IN_HALF_WIDTH);
    }
  });

  it('pushes a player who appears in his way into the clear', () => {
    for (const pose of POSES) {
      for (let index = 0; index < SPAWN_POINT_COUNT; index++) {
        const spawn: GroundVector = findSpawnPoint(index);
        if (measureDistance(pose, spawn) >= REACH) {
          continue;
        }
        const pushed: GroundVector = pushAside(spawn, pose, VILLAGE_TERRAIN);
        expect(measureDistance(pushed, pose)).toBeGreaterThan(REACH - 1e-9);
        expect(VILLAGE_TERRAIN.isClear(pushed, PLAYER_RADIUS)).toBe(true);
      }
    }
  });

  it('runs, never walks, in a straight line from one patch to the other', () => {
    const runs = listStretches().filter(({ activity }) => activity === 'Run');
    expect(runs).toHaveLength(2);
    for (const { poses } of runs) {
      const start: TobyPose = takeItem(poses, 0);
      const end: TobyPose = findTobyPose(
        POSES.indexOf(takeItem(poses, -1)) + 1,
      );
      const length: number = measureDistance(start, end);
      expect(length).toBeGreaterThanOrEqual(4);
      expect(length).toBeLessThanOrEqual(5);
      const way: GroundVector = {
        x: (end.x - start.x) / length,
        z: (end.z - start.z) / length,
      };
      expect(
        VILLAGE_TERRAIN.isPathClear(start, end, TOBY_RADIUS - PLAYER_RADIUS),
      ).toBe(true);
      [...poses, end].forEach((pose: TobyPose, index: number) => {
        const along: number = index * (length / poses.length);
        expect(pose.x).toBeCloseTo(start.x + way.x * along, 9);
        expect(pose.z).toBeCloseTo(start.z + way.z * along, 9);
      });
      for (const pose of poses) {
        const front: GroundVector = findFront(pose.yaw);
        expect(front.x).toBeCloseTo(way.x, 9);
        expect(front.z).toBeCloseTo(way.z, 9);
      }
      const speed: number = (length / poses.length) * SIMULATION_RATE;
      expect(speed).toBeGreaterThan(WALK_SPEED * 1.5);
    }
  });

  it('squats still at the edge of a patch of clover, facing it', () => {
    const ends: GroundVector[] = [];
    for (const { activity, poses } of listStretches()) {
      if (activity !== 'Squat' && activity !== 'Pick' && activity !== 'Rise') {
        continue;
      }
      const first: TobyPose = takeItem(poses, 0);
      for (const pose of poses) {
        expect(pose).toMatchObject({ x: first.x, z: first.z, yaw: first.yaw });
      }
      const front: GroundVector = findFront(first.yaw);
      const facing: Placement[] = CLOVERS.filter((clover: Placement) => {
        const ahead: number =
          (clover.x - first.x) * front.x + (clover.z - first.z) * front.z;
        const aside: number = Math.abs(
          (clover.x - first.x) * front.z - (clover.z - first.z) * front.x,
        );
        return ahead >= 0.5 && ahead <= 0.8 && aside <= 0.05;
      });
      expect(facing).toHaveLength(1);
      ends.push(first);
    }
    // He squats at two places, one at each end of his run.
    const places = new Set(ends.map(({ x, z }) => `${String(x)},${String(z)}`));
    expect(places.size).toBe(2);
  });

  it('turns around in place, facing the fence side of his run halfway', () => {
    for (const { activity, poses } of listStretches()) {
      if (activity !== 'Turn') {
        continue;
      }
      const first: TobyPose = takeItem(poses, 0);
      const before: TobyPose = findTobyPose(POSES.indexOf(first) - 1);
      const after: TobyPose = findTobyPose(
        POSES.indexOf(takeItem(poses, -1)) + 1,
      );
      expect(after.activity).toBe('Run');
      // From facing the clover to facing the way back.
      const from: GroundVector = findFront(before.yaw);
      const to: GroundVector = findFront(after.yaw);
      expect(from.x * to.x + from.z * to.z).toBeCloseTo(-1, 9);
      let fronts: GroundVector[] = [];
      for (const pose of poses) {
        expect(pose).toMatchObject({ x: before.x, z: before.z });
        fronts = [...fronts, findFront(pose.yaw)];
      }
      // Square to his run, on the side of the fence.
      const square: GroundVector = { x: -to.z, z: to.x };
      const side: GroundVector =
        square.z > 0 ? square : { x: -square.x, z: -square.z };
      expect(
        Math.max(...fronts.map(({ x, z }) => x * side.x + z * side.z)),
      ).toBeGreaterThan(0.99);
    }
  });

  it('tells how long he has been at what he is doing', () => {
    for (const { poses } of listStretches()) {
      poses.forEach((pose: TobyPose, index: number) => {
        expect(pose.elapsed).toBeCloseTo(index / SIMULATION_RATE, 9);
      });
    }
    const halfway: TobyPose = findTobyPose(1.5);
    expect(halfway.elapsed).toBeCloseTo(1.5 / SIMULATION_RATE, 9);
  });
});

describe('findTobyGrab', () => {
  /** The steps of the loop at which his hand grabs at the clover. */
  const GRABS: readonly number[] = LOOP.filter(
    (step: number) => findTobyGrab(step).step === step,
  );

  it('grabs once at each end of his run, as he picks there', () => {
    expect(GRABS).toHaveLength(2);
    for (const step of GRABS) {
      const pose: TobyPose = findTobyPose(step);
      expect(pose.activity).toBe('Pick');
      expect(pose.elapsed * SIMULATION_RATE).toBeCloseTo(TOBY_GRAB_STEPS, 9);
    }
  });

  it('grabs at the patch in front of him', () => {
    for (const step of GRABS) {
      const { patch }: TobyGrab = findTobyGrab(step);
      const center: GroundVector | undefined = CLOVER_PATCHES[patch];
      const pose: TobyPose = findTobyPose(step);
      expect(center).toBeDefined();
      expect(
        Math.min(
          ...TOBY_CLOVERS.map((clover: GroundVector) =>
            measureDistance(clover, pose),
          ),
        ),
      ).toBeCloseTo(measureDistance(center ?? pose, pose), 9);
      expect(measureDistance(center ?? pose, pose)).toBeLessThan(1);
    }
  });

  it('tells the latest grab at a step or before it, loop after loop', () => {
    for (const step of [-500, -1, 0, 1, 77.5, 100, 400, 12_345]) {
      const grab: TobyGrab = findTobyGrab(step);
      expect(grab.step).toBeLessThanOrEqual(step);
      const later: number = grab.step + TOBY_LOOP_STEPS;
      expect(findTobyGrab(later)).toEqual({
        step: later,
        patch: grab.patch,
      });
      for (let between = grab.step + 1; between <= step; between++) {
        expect(findTobyGrab(between)).toEqual(grab);
      }
    }
  });
});

describe('pushAside', () => {
  /** A step at which Toby runs, and where he is then. */
  const RUNNING: TobyPose = findPose(
    (pose: TobyPose) => pose.activity === 'Run' && pose.elapsed > 1,
  );

  /** The way he runs at that step. */
  const AHEAD: GroundVector = findFront(RUNNING.yaw);

  /** His left at that step, as he runs. */
  const LEFT: GroundVector = { x: AHEAD.z, z: -AHEAD.x };

  /**
   * Finds a point near him.
   *
   * @param {number} ahead - How far ahead of him, in meters.
   * @param {number} left - How far to his left, in meters.
   * @returns {GroundVector} The point.
   */
  const placeNear = (ahead: number, left: number): GroundVector => ({
    x: RUNNING.x + AHEAD.x * ahead + LEFT.x * left,
    z: RUNNING.z + AHEAD.z * ahead + LEFT.z * left,
  });

  it('leaves a player alone who is not in his way', () => {
    const point: GroundVector = placeNear(0.2, REACH + 0.01);
    expect(pushAside(point, RUNNING, VILLAGE_TERRAIN)).toEqual(point);
  });

  it('pushes a player out of his way to the side it is on', () => {
    const left: GroundVector = pushAside(
      placeNear(0.3, 0.1),
      RUNNING,
      VILLAGE_TERRAIN,
    );
    expect(measureDistance(left, RUNNING)).toBeCloseTo(REACH, 9);
    const leftAhead: number =
      (left.x - RUNNING.x) * AHEAD.x + (left.z - RUNNING.z) * AHEAD.z;
    expect(leftAhead).toBeCloseTo(0.3, 9);
    expect(
      (left.x - RUNNING.x) * LEFT.x + (left.z - RUNNING.z) * LEFT.z,
    ).toBeCloseTo(Math.sqrt(REACH * REACH - 0.3 * 0.3), 9);
    const right: GroundVector = pushAside(
      placeNear(0.3, -0.1),
      RUNNING,
      VILLAGE_TERRAIN,
    );
    expect(
      (right.x - RUNNING.x) * LEFT.x + (right.z - RUNNING.z) * LEFT.z,
    ).toBeLessThan(-0.4);
  });

  it('pushes a player square in his way toward the back of the village', () => {
    const point: GroundVector = placeNear(0.4, 0);
    const pushed: GroundVector = pushAside(point, RUNNING, VILLAGE_TERRAIN);
    expect(measureDistance(pushed, RUNNING)).toBeCloseTo(REACH, 9);
    // Square to his run, on the side away from the fence.
    expect(
      (pushed.x - RUNNING.x) * AHEAD.x + (pushed.z - RUNNING.z) * AHEAD.z,
    ).toBeCloseTo(0.4, 9);
    expect(pushed.z).toBeLessThan(point.z - 0.2);
  });

  it('pushes a player no farther than walls let it go', () => {
    // A wall runs along his left, so close that a player can stand
    // between the two only overlapping him.
    const wall: Shape = {
      shape: 'box',
      ...placeNear(0, 0.45 + PLAYER_RADIUS + 0.5),
      halfWidth: 0.5,
      halfDepth: 3,
      yaw: RUNNING.yaw,
    };
    const terrain = new Terrain([wall], VILLAGE_TERRAIN.boundary);
    const point: GroundVector = placeNear(0.1, 0.3);
    expect(terrain.isClear(point)).toBe(true);
    const pushed: GroundVector = pushAside(point, RUNNING, terrain);
    expect(terrain.isClear(pushed)).toBe(true);
    expect(terrain.isPathClear(point, pushed)).toBe(true);
    expect(measureDistance(pushed, RUNNING)).toBeLessThan(REACH);
    expect(measureDistance(pushed, RUNNING)).toBeGreaterThanOrEqual(
      measureDistance(point, RUNNING),
    );
  });

  it('never pushes a player through a fence beside him', () => {
    // A fence runs along his left, so close that the push would take a
    // player between the two to the other side of it.
    const fence: Shape = {
      shape: 'box',
      ...placeNear(0, 0.43),
      halfWidth: 0.08,
      halfDepth: 3,
      yaw: RUNNING.yaw,
    };
    const terrain = new Terrain([fence], VILLAGE_TERRAIN.boundary);
    const point: GroundVector = placeNear(0.1, 0.02);
    expect(terrain.isClear(point)).toBe(true);
    const pushed: GroundVector = pushAside(point, RUNNING, terrain);
    expect(terrain.isPathClear(point, pushed)).toBe(true);
    expect(pushed).toEqual(point);
  });

  it('leaves a player where it is if walls on both sides box it in', () => {
    // The walls leave room for a player between them, and no more.
    const walls: Shape[] = [1, -1].map(
      (side: number): Shape => ({
        shape: 'box',
        ...placeNear(0, side * (PLAYER_RADIUS + 0.5)),
        halfWidth: 0.5,
        halfDepth: 3,
        yaw: RUNNING.yaw,
      }),
    );
    const terrain = new Terrain(walls, VILLAGE_TERRAIN.boundary);
    const point: GroundVector = placeNear(0.1, 0);
    expect(terrain.isClear(point)).toBe(true);
    const pushed: GroundVector = pushAside(point, RUNNING, terrain);
    expect(pushed.x).toBeCloseTo(point.x, 9);
    expect(pushed.z).toBeCloseTo(point.z, 9);
  });

  it('never pushes a player out of the village', () => {
    const edge: GroundVector = placeNear(0, -0.1);
    const terrain = new Terrain([], {
      x: edge.x - LEFT.x * 0.2,
      z: edge.z - LEFT.z * 0.2,
      radius: 0.5,
    });
    expect(terrain.isClear(edge)).toBe(true);
    const pushed: GroundVector = pushAside(edge, RUNNING, terrain);
    expect(terrain.isClear(pushed)).toBe(true);
  });
});

describe('resolveWalk', () => {
  /** A step at which Toby squats, and where he is then. */
  const SQUATTING: TobyPose = findPose(
    (pose: TobyPose) => pose.activity === 'Pick',
  );

  it('walks a player freely away from him', () => {
    const from: GroundVector = { x: SQUATTING.x, z: SQUATTING.z - 1 };
    const to: GroundVector = { x: SQUATTING.x, z: SQUATTING.z - 1.075 };
    expect(resolveWalk(from, to, SQUATTING, VILLAGE_TERRAIN)).toEqual(to);
  });

  it('stops a player that walks straight into him', () => {
    const from: GroundVector = { x: SQUATTING.x, z: SQUATTING.z - REACH };
    const to: GroundVector = { x: SQUATTING.x, z: SQUATTING.z - REACH + 0.075 };
    const walked: GroundVector = resolveWalk(
      from,
      to,
      SQUATTING,
      VILLAGE_TERRAIN,
    );
    expect(walked.x).toBeCloseTo(from.x, 9);
    expect(walked.z).toBeCloseTo(from.z, 9);
  });

  it('slides a player that walks into him at an angle around him', () => {
    const from: GroundVector = {
      x: SQUATTING.x - 0.2,
      z: SQUATTING.z - REACH - 0.01,
    };
    const to: GroundVector = { x: from.x, z: from.z + 0.075 };
    const walked: GroundVector = resolveWalk(
      from,
      to,
      SQUATTING,
      VILLAGE_TERRAIN,
    );
    expect(measureDistance(walked, SQUATTING)).toBeCloseTo(REACH, 9);
    expect(walked.x).toBeLessThan(from.x);
    expect(walked.z).toBeGreaterThan(from.z);
  });

  it('stops a player that would slide around him into a wall', () => {
    // A wall stands beside him, too close for a player to pass between.
    const wall: Shape = {
      shape: 'box',
      x: SQUATTING.x + 1.05,
      z: SQUATTING.z,
      halfWidth: 0.5,
      halfDepth: 3,
      yaw: 0,
    };
    const terrain = new Terrain([wall], VILLAGE_TERRAIN.boundary);
    const from: GroundVector = { x: SQUATTING.x + 0.25, z: SQUATTING.z - 0.5 };
    const to: GroundVector = { x: from.x, z: from.z + 0.075 };
    expect(terrain.isClear(from)).toBe(true);
    expect(measureDistance(from, SQUATTING)).toBeGreaterThan(REACH);
    const walked: GroundVector = resolveWalk(from, to, SQUATTING, terrain);
    expect(terrain.isClear(walked)).toBe(true);
    expect(measureDistance(walked, SQUATTING)).toBeGreaterThanOrEqual(
      REACH - 1e-9,
    );
  });

  it('lets a player that overlaps him walk out, but not farther in', () => {
    const from: GroundVector = { x: SQUATTING.x, z: SQUATTING.z - 0.4 };
    const out: GroundVector = { x: from.x, z: from.z - 0.075 };
    expect(resolveWalk(from, out, SQUATTING, VILLAGE_TERRAIN)).toEqual(out);
    const into: GroundVector = { x: from.x, z: from.z + 0.075 };
    const walked: GroundVector = resolveWalk(
      from,
      into,
      SQUATTING,
      VILLAGE_TERRAIN,
    );
    expect(measureDistance(walked, SQUATTING)).toBeGreaterThanOrEqual(
      measureDistance(from, SQUATTING),
    );
  });
});

describe('measurePushReach', () => {
  /** How long one step of the simulation lasts, in milliseconds. */
  const STEP_MILLISECONDS: number = 1000 / SIMULATION_RATE;

  /** A step at which Toby runs. */
  const RUNNING_STEP: number = LOOP.findIndex(
    (step: number) =>
      findTobyPose(step).activity === 'Run' && findTobyPose(step).elapsed > 0.5,
  );

  /** Where a player stands after he pushes it aside at that step. */
  const PUSHED: GroundVector = (() => {
    const toby: TobyPose = findTobyPose(RUNNING_STEP);
    const ahead: GroundVector = findFront(toby.yaw);
    // Beside him, on his left, overlapping him.
    return pushAside(
      { x: toby.x + ahead.z * 0.3, z: toby.z - ahead.x * 0.3 },
      toby,
      VILLAGE_TERRAIN,
    );
  })();

  it('allows for his push on a player he has run on from since', () => {
    const later: number = RUNNING_STEP + 2;
    expect(measureDistance(PUSHED, findTobyPose(RUNNING_STEP))).toBeCloseTo(
      REACH,
      9,
    );
    expect(measureDistance(PUSHED, findTobyPose(later))).toBeGreaterThan(
      REACH + 0.05,
    );
    expect(measurePushReach(PUSHED, later, 2 * STEP_MILLISECONDS)).toBe(REACH);
  });

  it('allows for no push on a player too far from him to have had one', () => {
    const later: number = RUNNING_STEP + 2;
    const far: GroundVector = { x: PUSHED.x, z: PUSHED.z - 2 };
    expect(measurePushReach(far, later, 2 * STEP_MILLISECONDS)).toBe(0);
  });
});
