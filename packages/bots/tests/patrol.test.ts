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
 * @module bots/tests/patrol Tests for where a bot walks to, and how, and
 *   what it says there.
 */

import { describe, expect, it } from 'vitest';

import {
  PLAYER_RADIUS,
  SPAWN_POINT_COUNT,
  TOBY_ENDS,
  TOBY_RADIUS,
  VILLAGE_TERRAIN,
  applyInput,
  createMotion,
  findInteraction,
  findPlacement,
  findSpawnPoint,
  findMapPath,
  stepMotion,
} from '@clovervale/shared';
import type {
  GroundVector,
  ModelId,
  PlayerMotion,
} from '@clovervale/shared';
import { TALK_REACH } from '../../shared/src/interaction.ts';

import {
  DRINKING_SPOT,
  ESCAPE_STEPS,
  POINTS_OF_INTEREST,
  STEP_DISTANCE,
  chooseNextPoint,
  choosePhrase,
  planDrinkingWalk,
  planEscape,
  planLeg,
  planRoute,
} from '../src/patrol.ts';
import type { Leg, PlaceLines, PointOfInterest } from '../src/patrol.ts';

/**
 * Finds the way from one point of the village to another, as a bot does.
 *
 * @param {GroundVector} from - Where the way starts.
 * @param {GroundVector} to - Where the way is to end.
 * @returns {GroundVector[] | null} The points to walk to, or `null` if
 *   there is no such way.
 */
function findVillageWay(
  from: GroundVector,
  to: GroundVector,
): GroundVector[] | null {
  return findMapPath('village', from, to);
}

/**
 * Walks a player along a leg by the rules of the server.
 *
 * @param {GroundVector} from - Where the player starts.
 * @param {Leg} leg - The leg.
 * @returns {GroundVector} Where the player ends.
 */
function walkLeg(from: GroundVector, leg: Leg): GroundVector {
  let motion: PlayerMotion = applyInput(createMotion(from, 0), {
    type: 'move',
    direction: leg.direction,
  });
  for (let step = 0; step < leg.steps; step++) {
    motion = stepMotion(motion, 0, 'village', []);
  }
  return { x: motion.x, z: motion.z };
}

/**
 * Measures how far apart two points are.
 *
 * @param {GroundVector} a - One point.
 * @param {GroundVector} b - The other point.
 * @returns {number} The distance between them, in meters.
 */
function measureDistance(a: GroundVector, b: GroundVector): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Measures how far a point is from Toby's run, from one end of it to the
 * other, where he squats, turns and runs.
 *
 * @param {GroundVector} point - The point.
 * @returns {number} The least distance between the point and the run, in
 *   meters.
 */
function measureFromTobyRun(point: GroundVector): number {
  const [start, end] = TOBY_ENDS;
  const run: GroundVector = { x: end.x - start.x, z: end.z - start.z };
  const share: number = Math.min(
    Math.max(
      ((point.x - start.x) * run.x + (point.z - start.z) * run.z) /
        (run.x ** 2 + run.z ** 2),
      0,
    ),
    1,
  );
  return measureDistance(point, {
    x: start.x + run.x * share,
    z: start.z + run.z * share,
  });
}

/**
 * Walks a player along a route by the rules of the server, and tells where
 * it is at every step.
 *
 * @param {GroundVector} from - Where the player starts.
 * @param {readonly Leg[]} legs - The legs of the route.
 * @returns {GroundVector[]} Where the player is at the start and after
 *   every step.
 */
function traceRoute(from: GroundVector, legs: readonly Leg[]): GroundVector[] {
  const trace: GroundVector[] = [from];
  let motion: PlayerMotion = createMotion(from, 0);
  for (const leg of legs) {
    motion = applyInput(motion, { type: 'move', direction: leg.direction });
    for (let step = 0; step < leg.steps; step++) {
      motion = stepMotion(motion, 0, 'village', []);
      trace.push({ x: motion.x, z: motion.z });
    }
  }
  return trace;
}

/** The least distance between the centers of Toby and a player. */
const TOBY_REACH: number = TOBY_RADIUS + PLAYER_RADIUS;

describe('POINTS_OF_INTEREST', () => {
  it('lets a player stand at every point', () => {
    for (const { position } of POINTS_OF_INTEREST) {
      expect(VILLAGE_TERRAIN.isClear(position)).toBe(true);
    }
  });

  it('keeps out of talking reach of Nancy, Emma and Basil', () => {
    for (const model of ['nancy', 'emma', 'basil'] as const) {
      const villager: GroundVector = findPlacement(model);
      for (const { position } of POINTS_OF_INTEREST) {
        expect(measureDistance(position, villager)).toBeGreaterThan(
          TALK_REACH,
        );
      }
    }
  });

  it("stands beside the middle of Toby's run, out of his way", () => {
    const [start, end] = TOBY_ENDS;
    const middle: GroundVector = {
      x: (start.x + end.x) / 2,
      z: (start.z + end.z) / 2,
    };
    const beside: boolean = POINTS_OF_INTEREST.some(
      ({ position }) =>
        measureDistance(position, middle) <= TALK_REACH &&
        measureFromTobyRun(position) > TOBY_REACH,
    );
    expect(beside).toBe(true);
  });

  it('stands in front of Martha, within talking reach of her', () => {
    const martha: GroundVector = findPlacement('martha');
    const near: boolean = POINTS_OF_INTEREST.some(
      ({ position }) => measureDistance(position, martha) <= TALK_REACH,
    );
    expect(near).toBe(true);
  });
});

describe('what a bot says at the points of interest', () => {
  /**
   * Finds the point of interest nearest a model of the village.
   *
   * @param {ModelId} model - The identifier of the model.
   * @returns {PointOfInterest} The point.
   */
  const findPointBy = (model: ModelId): PointOfInterest => {
    const place: GroundVector = findPlacement(model);
    return POINTS_OF_INTEREST.reduce((nearest, point) =>
      measureDistance(point.position, place) <
      measureDistance(nearest.position, place)
        ? point
        : nearest,
    );
  };
  /** The points of interest where a bot says nothing. */
  const silent: PointOfInterest[] = [
    findPointBy('fountain'),
    findPointBy('spawn-stones'),
  ];

  it('is nothing at the fountain or the spawn point of the monster', () => {
    expect(silent.map(({ lines }) => lines)).toEqual([[], []]);
  });

  it('is two lines in turn everywhere else', () => {
    const others: PointOfInterest[] = POINTS_OF_INTEREST.filter(
      (point) => !silent.includes(point),
    );
    expect(others).toHaveLength(POINTS_OF_INTEREST.length - 2);
    for (const { lines } of others) {
      expect(lines).toHaveLength(2);
    }
  });

  it('asks Martha for an inn, then the way to one of four', () => {
    const { lines } = findPointBy('martha');
    const draws: number[] = [0, 0.3, 0.6, 0.9];
    expect(choosePhrase(lines, 0, () => 0.9)).toBe('askInn');
    expect(draws.map((draw) => choosePhrase(lines, 1, () => draw))).toEqual([
      'askApothecary',
      'askEmma',
      'askBasil',
      'askNancy',
    ]);
  });
});

describe('choosePhrase', () => {
  /** Two lines, the second of which is one of three phrases. */
  const LINES: PlaceLines = [
    ['swordPrice'],
    ['askEmma', 'askBasil', 'askNancy'],
  ];

  it('says the lines in turn, over and over', () => {
    const said = [0, 1, 2, 3, 4].map((turn: number) =>
      choosePhrase(LINES, turn, () => 0),
    );
    expect(said).toEqual([
      'swordPrice',
      'askEmma',
      'swordPrice',
      'askEmma',
      'swordPrice',
    ]);
  });

  it('picks any phrase of a line, each as likely as the others', () => {
    const draws: number[] = [0, 0.33, 0.34, 0.66, 0.67, 0.99];
    expect(draws.map((draw) => choosePhrase(LINES, 1, () => draw))).toEqual([
      'askEmma',
      'askEmma',
      'askBasil',
      'askBasil',
      'askNancy',
      'askNancy',
    ]);
  });
});

describe('planLeg', () => {
  it('walks to within half a step of where nothing is in the way', () => {
    const from: GroundVector = { x: -0.8, z: -3.5 };
    const to: GroundVector = { x: 2.3, z: -1.2 };
    const end: GroundVector = walkLeg(from, planLeg(from, to));
    expect(measureDistance(end, to)).toBeLessThanOrEqual(
      STEP_DISTANCE / 2 + 1e-9,
    );
  });

  it('takes no steps to where it already is', () => {
    const from: GroundVector = { x: 1, z: 2 };
    expect(planLeg(from, { x: 1.01, z: 2 }).steps).toBe(0);
  });
});

describe('planRoute', () => {
  it.each(
    POINTS_OF_INTEREST.flatMap(({ position: from }) =>
      POINTS_OF_INTEREST.map(({ position: to }) => [from, to]),
    ),
  )(
    'walks around the obstacles from %j to within half a step of %j',
    (from, to) => {
      const path: GroundVector[] | null = findMapPath('village', from, to);
      expect(path).not.toBeNull();
      let end: GroundVector = from;
      for (const leg of planRoute(from, path ?? [])) {
        end = walkLeg(end, leg);
      }
      expect(measureDistance(end, to)).toBeLessThanOrEqual(
        STEP_DISTANCE / 2 + 1e-9,
      );
    },
  );

  it('walks from every spawn point to every point of interest', () => {
    for (let index = 0; index < SPAWN_POINT_COUNT; index++) {
      const from: GroundVector = findSpawnPoint(index);
      for (const { position: to } of POINTS_OF_INTEREST) {
        let end: GroundVector = from;
        for (const leg of planRoute(from, findMapPath('village', from, to) ?? [])) {
          end = walkLeg(end, leg);
        }
        expect(measureDistance(end, to)).toBeLessThanOrEqual(
          STEP_DISTANCE / 2 + 1e-9,
        );
      }
    }
  });

  it("keeps out of Toby's way on every walk between the points", () => {
    for (const { position: from } of POINTS_OF_INTEREST) {
      const routes: Leg[][] = [
        ...POINTS_OF_INTEREST.map(({ position: to }) =>
          planRoute(from, findMapPath('village', from, to) ?? []),
        ),
        planDrinkingWalk(from, findVillageWay) ?? [],
      ];
      for (const legs of routes) {
        for (const point of traceRoute(from, legs)) {
          expect(measureFromTobyRun(point)).toBeGreaterThan(TOBY_REACH);
        }
      }
    }
  });

  it('leaves out the points it is at already', () => {
    const from: GroundVector = { x: 1, z: 2 };
    const legs = planRoute(from, [{ x: 1.01, z: 2 }, { x: 1.01, z: 3 }]);
    expect(legs).toHaveLength(1);
  });
});

describe('planDrinkingWalk', () => {
  it('walks to the fountain, facing it, from everywhere a bot goes', () => {
    const starts: GroundVector[] = [
      ...POINTS_OF_INTEREST.map(({ position }) => position),
      findSpawnPoint(0),
      DRINKING_SPOT,
    ];
    for (const start of starts) {
      const legs: Leg[] | null = planDrinkingWalk(start, findVillageWay);
      expect(legs).not.toBeNull();
      let motion: PlayerMotion = createMotion(start, 0);
      for (const leg of legs ?? []) {
        motion = applyInput(motion, { type: 'move', direction: leg.direction });
        for (let step = 0; step < leg.steps; step++) {
          motion = stepMotion(motion, 0, 'village', []);
        }
      }
      motion = stepMotion(
        applyInput(motion, { type: 'move', direction: { x: 0, z: 0 } }),
        0,
        'village',
        [],
      );
      expect(measureDistance(motion, DRINKING_SPOT)).toBeLessThanOrEqual(
        STEP_DISTANCE / 2 + 1e-9,
      );
      expect(findInteraction(motion, 0)).toBe('Drink');
    }
  });

  it('finds no walk where there is no way', () => {
    expect(planDrinkingWalk({ x: 0, z: 0 }, () => null)).toBeNull();
  });
});

describe('planEscape', () => {
  it('walks a short way in a direction chosen at random', () => {
    const north = planEscape(() => 0);
    const south = planEscape(() => 0.5);
    expect(north.steps).toBe(ESCAPE_STEPS);
    expect(north.direction.x).toBeCloseTo(0);
    expect(north.direction.z).toBeCloseTo(1);
    expect(south.direction.z).toBeCloseTo(-1);
  });
});

describe('chooseNextPoint', () => {
  /**
   * Makes a source of random numbers that gives the same number again and
   * again.
   *
   * @param {number} value - The number.
   * @returns {() => number} The source.
   */
  const repeat =
    (value: number): (() => number) =>
    () =>
      value;
  const randoms: number[] = [0, 0.2, 0.4, 0.6, 0.8, 0.999];

  it('chooses any point first', () => {
    const chosen = new Set<number>(
      randoms.map((value: number) => chooseNextPoint(4, null, repeat(value))),
    );
    expect([...chosen].sort()).toEqual([0, 1, 2, 3]);
  });

  it('chooses every point but the current one next', () => {
    for (let current = 0; current < 4; current++) {
      const chosen = new Set<number>(
        randoms.map((value: number) =>
          chooseNextPoint(4, current, repeat(value)),
        ),
      );
      expect([...chosen].sort()).toEqual(
        [0, 1, 2, 3].filter((index: number) => index !== current),
      );
    }
  });
});
