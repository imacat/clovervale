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
 * @module client/tests/trailing-camera Tests for the camera that trails
 *   behind the way the player goes.
 */

import { describe, expect, it } from 'vitest';

import { WALK_SPEED } from '@clovervale/shared';
import type { GroundVector } from '@clovervale/shared';

import {
  DEFAULT_TRAILING_CAMERA,
  TrailingCamera,
} from '../src/trailing-camera.ts';
import type { TrailingCameraSettings } from '../src/trailing-camera.ts';

/** How long the page takes from frame to frame, in seconds. */
const FRAME: number = 1 / 60;

/** The settings of the tests, as the panel has them by default. */
const SETTINGS: Readonly<TrailingCameraSettings> = DEFAULT_TRAILING_CAMERA;

/** The same settings with the trailing camera switched off. */
const FIXED: Readonly<TrailingCameraSettings> = {
  ...DEFAULT_TRAILING_CAMERA,
  isEnabled: false,
};

/** A walk of the followed player, frame by frame, and the camera's turn. */
interface Walk {
  /** The heading of the camera after each frame, in degrees. */
  readonly headings: number[];
  /** Where the player stands after the walk. */
  readonly end: GroundVector;
}

/**
 * Finds the signed difference between two headings.
 *
 * @param {number} to - The heading turned to, in degrees.
 * @param {number} from - The heading turned from, in degrees.
 * @returns {number} The turn from one to the other, above -180 and up to
 *   180 degrees.
 */
function findTurn(to: number, from: number): number {
  const turn: number = (((to - from) % 360) + 360) % 360;
  return turn > 180 ? turn - 360 : turn;
}

/**
 * Walks the followed player at walking speed with a steady yaw, frame by
 * frame, and steers the camera after it.
 *
 * @param {TrailingCamera} camera - The camera.
 * @param {number} heading - The heading of the camera at first, in degrees.
 * @param {GroundVector} start - Where the player starts.
 * @param {number | null} yaw - The way the player walks, as the turn from
 *   +Z toward +X in degrees, or `null` to stand still.
 * @param {number} seconds - How long the player walks for.
 * @param {Readonly<TrailingCameraSettings>} [settings] - The settings.
 * @param {boolean} [isTouched] - Whether the owner handles the camera all
 *   along.
 * @returns {Walk} The headings of the camera and where the player ends.
 */
function walk(
  camera: TrailingCamera,
  heading: number,
  start: GroundVector,
  yaw: number | null,
  seconds: number,
  settings: Readonly<TrailingCameraSettings> = SETTINGS,
  isTouched = false,
): Walk {
  const headings: number[] = [];
  let focus: GroundVector = start;
  let current: number = heading;
  const turn: number = ((yaw ?? 0) * Math.PI) / 180;
  const step: number = yaw === null ? 0 : WALK_SPEED * FRAME;
  for (let frame = 0; frame < Math.round(seconds / FRAME); frame++) {
    focus = {
      x: focus.x + step * Math.sin(turn),
      z: focus.z + step * Math.cos(turn),
    };
    current = camera.steer(current, focus, FRAME, settings, isTouched);
    headings.push(current);
  }
  return { headings, end: focus };
}

/**
 * Finds the fastest the camera turned from one frame to the next, from a
 * heading of 0 before the first frame.
 *
 * @param {readonly number[]} headings - The headings after each frame.
 * @returns {number} The fastest turning rate, in degrees per second.
 */
function findFastestTurn(headings: readonly number[]): number {
  let fastest = 0;
  let last = 0;
  for (const next of headings) {
    fastest = Math.max(fastest, Math.abs(findTurn(next, last)) / FRAME);
    last = next;
  }
  return fastest;
}

describe('TrailingCamera', () => {
  it('does not turn while the player stands still', () => {
    const camera = new TrailingCamera();
    const { headings } = walk(camera, 30, { x: 4, z: -2 }, null, 5);
    expect(headings.every((heading: number) => heading === 30)).toBe(true);
  });

  it('does not turn before the player has gone forward a while', () => {
    const camera = new TrailingCamera();
    const { headings } = walk(camera, 0, { x: 0, z: 0 }, 45, 10);
    const waiting: number[] = headings.slice(0, SETTINGS.delay / FRAME);
    expect(waiting.every((heading: number) => heading === 0)).toBe(true);
    expect(headings.at(-1)).toBeGreaterThan(0);
  });

  it('comes around behind a diagonal travel forward and stays', () => {
    const camera = new TrailingCamera();
    const { headings } = walk(camera, 0, { x: 0, z: 0 }, 45, 15);
    // It stays there for the last seconds of the walk.
    const settled: number[] = headings.slice(-5 / FRAME);
    for (const heading of settled) {
      expect(Math.abs(findTurn(45, heading))).toBeLessThan(1e-6);
    }
  });

  it('never overshoots the direction of travel', () => {
    for (const yaw of [30, -30, 55, -55]) {
      const camera = new TrailingCamera();
      const { headings } = walk(camera, 0, { x: 0, z: 0 }, yaw, 15);
      let distance: number = Math.abs(yaw);
      for (const heading of headings) {
        const offset: number = findTurn(yaw, heading);
        // The offset keeps its side, but for rounding, and only ever
        // shrinks.
        expect(
          Math.abs(offset) < 1e-9 || Math.sign(offset) === Math.sign(yaw),
        ).toBe(true);
        expect(Math.abs(offset)).toBeLessThanOrEqual(distance + 1e-9);
        distance = Math.abs(offset);
      }
      expect(distance).toBeLessThan(1e-6);
    }
  });

  it('does not turn for a change of direction within the dead zone', () => {
    const camera = new TrailingCamera();
    const yaw: number = SETTINGS.deadZone * 0.8;
    const { headings } = walk(camera, 0, { x: 0, z: 0 }, yaw, 10);
    expect(headings.every((heading: number) => heading === 0)).toBe(true);
  });

  it('does not turn when the player goes sideways or toward it', () => {
    for (const yaw of [90, -90, 120, -150, 180]) {
      const camera = new TrailingCamera();
      const { headings } = walk(camera, 0, { x: 0, z: 0 }, yaw, 10);
      expect(headings.every((heading: number) => heading === 0)).toBe(true);
    }
  });

  it('does not turn beyond the angle limit', () => {
    const settings: TrailingCameraSettings = { ...SETTINGS, angleLimit: 50 };
    for (const yaw of [55, -70]) {
      const camera = new TrailingCamera();
      const { headings } = walk(camera, 0, { x: 0, z: 0 }, yaw, 10, settings);
      expect(headings.every((heading: number) => heading === 0)).toBe(true);
    }
  });

  it('never turns faster than the turning rate', () => {
    for (const settings of [
      SETTINGS,
      { ...SETTINGS, turnRate: 90, easeTime: 0, delay: 0 },
      { ...SETTINGS, turnRate: 10, easeTime: 2 },
    ]) {
      const camera = new TrailingCamera();
      const first: Walk = walk(camera, 0, { x: 0, z: 0 }, 55, 4, settings);
      const second: Walk = walk(
        camera,
        first.headings.at(-1) ?? NaN,
        first.end,
        0,
        6,
        settings,
      );
      const headings: number[] = [...first.headings, ...second.headings];
      expect(findFastestTurn(headings)).toBeLessThanOrEqual(
        settings.turnRate + 1e-9,
      );
    }
  });

  it('eases into a turn rather than starting at full rate', () => {
    const camera = new TrailingCamera();
    const { headings } = walk(camera, 0, { x: 0, z: 0 }, 45, 5);
    const moving: number = headings.findIndex(
      (heading: number) => heading !== 0,
    );
    expect(moving).toBeGreaterThanOrEqual(0);
    const firstTurn: number = Math.abs(headings[moving] ?? NaN) / FRAME;
    expect(firstTurn).toBeLessThan(SETTINGS.turnRate / 10);
  });

  it('eases out of a turn once handled, and waits again after', () => {
    const camera = new TrailingCamera();
    const turning: Walk = walk(camera, 0, { x: 0, z: 0 }, 50, 2.5);
    const before: number = turning.headings.at(-1) ?? NaN;
    const previous: number = turning.headings.at(-2) ?? NaN;
    expect(before).toBeGreaterThan(previous);
    const handled: Walk = walk(
      camera,
      before,
      turning.end,
      50,
      SETTINGS.easeTime + 0.5,
      SETTINGS,
      true,
    );
    // Each frame turns less than the one before, until it stops.
    let last: number = before;
    let lastTurn: number = before - previous;
    for (const heading of handled.headings) {
      const turn: number = heading - last;
      expect(turn).toBeLessThanOrEqual(lastTurn + 1e-9);
      expect(turn).toBeGreaterThanOrEqual(0);
      last = heading;
      lastTurn = turn;
    }
    expect(lastTurn).toBe(0);
    const released: Walk = walk(camera, last, handled.end, 50, 10);
    const waiting: number[] = released.headings.slice(
      0,
      SETTINGS.delay / FRAME - 1,
    );
    expect(waiting.every((heading: number) => heading === last)).toBe(true);
    expect(released.headings.at(-1)).toBeGreaterThan(last);
  });

  it('comes to rest soon after the player stops, and stays', () => {
    const camera = new TrailingCamera();
    const first: Walk = walk(camera, 0, { x: 0, z: 0 }, 50, 2.5);
    const heading: number = first.headings.at(-1) ?? NaN;
    expect(heading).toBeGreaterThan(0);
    const rest: Walk = walk(camera, heading, first.end, null, 5);
    const settled: number = rest.headings.at(-1) ?? NaN;
    expect(settled).toBeLessThanOrEqual(50);
    const later: number[] = rest.headings.slice(-3 / FRAME);
    expect(later.every((next: number) => next === settled)).toBe(true);
  });

  it('does not take a jump for travel', () => {
    const camera = new TrailingCamera();
    const settings: TrailingCameraSettings = { ...SETTINGS, delay: 0 };
    camera.steer(0, { x: 0, z: 0 }, FRAME, settings, false);
    let heading: number = camera.steer(
      0,
      { x: 10, z: 10 },
      FRAME,
      settings,
      false,
    );
    for (let frame = 0; frame < 120; frame++) {
      heading = camera.steer(heading, { x: 10, z: 10 }, FRAME, settings, false);
    }
    expect(heading).toBe(0);
  });

  it('keeps its heading whatever the player does when switched off', () => {
    const camera = new TrailingCamera();
    const first: Walk = walk(camera, 45, { x: 0, z: 0 }, 75, 5, FIXED);
    const second: Walk = walk(camera, 45, first.end, 20, 5, FIXED);
    const headings: number[] = [...first.headings, ...second.headings];
    expect(headings.every((heading: number) => heading === 45)).toBe(true);
  });
});
