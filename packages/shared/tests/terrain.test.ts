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
 * @module shared/tests/terrain Tests for what stands in the way of the
 *   players.
 */

import { describe, expect, it } from 'vitest';

import { PLAYER_RADIUS, Terrain, placePoint } from '../src/index.ts';
import type { Boundary, GroundVector, Shape } from '../src/index.ts';
import { findTurn, placeShape } from '../src/terrain.ts';

/** A boundary far enough out not to matter. */
const WIDE: Boundary = { x: 0, z: 0, radius: 1000 };

/** A wall two meters wide and half a meter deep, at the origin. */
const WALL: Shape = {
  shape: 'box',
  x: 0,
  z: 0,
  halfWidth: 1,
  halfDepth: 0.25,
  yaw: 0,
};

/** A post with a radius of one meter, at the origin. */
const POST: Shape = { shape: 'circle', x: 0, z: 0, radius: 1 };

/**
 * Walks a player from a point in a direction for a number of steps of a
 * tenth of a meter.
 *
 * @param {Terrain} terrain - The ground.
 * @param {GroundVector} from - Where the player starts.
 * @param {GroundVector} direction - The direction, one meter long.
 * @param {number} steps - The number of steps.
 * @returns {GroundVector} Where the player ends up.
 */
function walk(
  terrain: Terrain,
  from: GroundVector,
  direction: GroundVector,
  steps: number,
): GroundVector {
  let position: GroundVector = from;
  for (let step = 0; step < steps; step++) {
    position = terrain.resolveMove(position, {
      x: position.x + direction.x * 0.1,
      z: position.z + direction.z * 0.1,
    });
  }
  return position;
}

describe('findTurn', () => {
  it('is exact for every multiple of 90 degrees', () => {
    const turns: [number, number, number][] = [
      [0, 1, 0],
      [90, 0, 1],
      [180, -1, 0],
      [-90, 0, -1],
      [270, 0, -1],
      [450, 0, 1],
    ];
    for (const [yaw, cos, sin] of turns) {
      const turn = findTurn(yaw);
      expect(turn.cos + 0).toBe(cos);
      expect(turn.sin + 0).toBe(sin);
    }
  });

  it('agrees with the cosine and the sine of any other turn', () => {
    for (let yaw = -400; yaw <= 400; yaw += 7.3) {
      const radians: number = (yaw * Math.PI) / 180;
      const turn = findTurn(yaw);
      expect(turn.cos).toBeCloseTo(Math.cos(radians), 14);
      expect(turn.sin).toBeCloseTo(Math.sin(radians), 14);
    }
  });
});

describe('placePoint', () => {
  it('turns a point of a model the way the model turns', () => {
    const point: GroundVector = placePoint(
      { x: 10, z: 5, yaw: 90 },
      { x: 0, z: 2 },
    );
    expect(point).toEqual({ x: 12, z: 5 });
  });
});

describe('placeShape', () => {
  it('turns a box of a model along with the model', () => {
    const box: Shape = placeShape({ x: 3, z: 4, yaw: 90 }, WALL);
    expect(box).toMatchObject({ shape: 'box', x: 3, z: 4, yaw: 90 });
  });
});

describe('Terrain.resolveMove', () => {
  it('lets a player walk where nothing is in the way', () => {
    const terrain = new Terrain([WALL], WIDE);
    const to: GroundVector = { x: 5, z: 5.1 };
    expect(terrain.resolveMove({ x: 5, z: 5 }, to)).toEqual(to);
  });

  it('stops a player that walks straight into a wall', () => {
    const terrain = new Terrain([WALL], WIDE);
    const end: GroundVector = walk(
      terrain,
      { x: 0, z: 3 },
      { x: 0, z: -1 },
      40,
    );
    expect(end.x).toBe(0);
    expect(end.z).toBeCloseTo(0.25 + PLAYER_RADIUS, 12);
  });

  it('slides a player along a wall it walks into at an angle', () => {
    const terrain = new Terrain([WALL], WIDE);
    const end: GroundVector = walk(
      terrain,
      { x: 0, z: 1 },
      { x: 0.6, z: -0.8 },
      10,
    );
    expect(end.z).toBeCloseTo(0.25 + PLAYER_RADIUS, 12);
    expect(end.x).toBeCloseTo(0.6, 12);
  });

  it('slides a player along a turned wall', () => {
    const turned: Shape = { ...WALL, yaw: 90 };
    const terrain = new Terrain([turned], WIDE);
    const end: GroundVector = walk(
      terrain,
      { x: 1, z: 0 },
      { x: -0.8, z: 0.6 },
      10,
    );
    expect(end.x).toBeCloseTo(0.25 + PLAYER_RADIUS, 12);
    expect(end.z).toBeCloseTo(0.6, 12);
  });

  it('slides a player around a post it walks into off its middle', () => {
    const terrain = new Terrain([POST], WIDE);
    const end: GroundVector = walk(
      terrain,
      { x: 0.5, z: 3 },
      { x: 0, z: -1 },
      60,
    );
    expect(end.z).toBeLessThan(-1);
    for (let step = 0; step <= 60; step++) {
      const at: GroundVector = walk(
        terrain,
        { x: 0.5, z: 3 },
        { x: 0, z: -1 },
        step,
      );
      expect(Math.hypot(at.x, at.z)).toBeGreaterThan(
        1 + PLAYER_RADIUS - 1e-9,
      );
    }
  });

  it('keeps a player within the boundary', () => {
    const terrain = new Terrain([], { x: 0, z: 0, radius: 5 });
    const end: GroundVector = walk(terrain, { x: 0, z: 0 }, { x: 1, z: 0 }, 80);
    expect(end.x).toBeCloseTo(5 - PLAYER_RADIUS, 12);
    expect(end.z).toBe(0);
  });

  it('lets no player through a gap narrower than itself', () => {
    const narrow = new Terrain(
      [
        { ...WALL, x: -0.5, yaw: 90 },
        { ...WALL, x: 0.5, yaw: 90 },
      ],
      WIDE,
    );
    const end: GroundVector = walk(
      narrow,
      { x: 0.01, z: 3 },
      { x: 0, z: -1 },
      60,
    );
    expect(end.z).toBeGreaterThan(1);
    expect(narrow.isClear(end)).toBe(true);
  });
});

describe('Terrain.isClear', () => {
  it('tells whether a player has room at a point', () => {
    const terrain = new Terrain([POST], { x: 0, z: 0, radius: 10 });
    expect(terrain.isClear({ x: 0, z: 1.2 })).toBe(false);
    expect(terrain.isClear({ x: 0, z: 1 + PLAYER_RADIUS })).toBe(true);
    expect(terrain.isClear({ x: 0, z: 1.4 }, 0.2)).toBe(false);
    expect(terrain.isClear({ x: 0, z: 1.6 }, 0.2)).toBe(true);
    expect(terrain.isClear({ x: 9.9, z: 0 })).toBe(false);
  });
});

describe('Terrain.isPathClear', () => {
  it('tells whether a player can walk straight to another point', () => {
    const terrain = new Terrain([WALL], WIDE);
    expect(terrain.isPathClear({ x: 0, z: 2 }, { x: 0, z: -2 })).toBe(false);
    expect(terrain.isPathClear({ x: 1.5, z: 2 }, { x: 1.5, z: -2 })).toBe(
      true,
    );
    expect(terrain.isPathClear({ x: -3, z: 1 }, { x: 3, z: 1 })).toBe(true);
    expect(terrain.isPathClear({ x: -3, z: 1 }, { x: 3, z: 1 }, 0.5)).toBe(
      false,
    );
  });

  it('sees a corner a walk cuts', () => {
    const terrain = new Terrain([WALL], WIDE);
    expect(
      terrain.isPathClear({ x: 0.5, z: 1 }, { x: 2.5, z: -1 }),
    ).toBe(false);
  });
});
