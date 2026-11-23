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
 * @module client/tests/correction-smoothing Tests for drawing the
 *   corrections of the player of the page smoothly.
 */

import { describe, expect, it } from 'vitest';

import {
  AuthoritativePlayer,
  SIMULATION_RATE,
  SNAPSHOT_RATE,
  SPAWN_YAW,
  TOBY_ENDS,
  createMotion,
} from '@clovervale/shared';
import type {
  GroundVector,
  InputProgress,
  PlayerMotion,
} from '@clovervale/shared';
import { killMotion } from '../../shared/src/player-motion.ts';

import {
  CorrectionSmoothing,
  SMOOTHING_DURATION,
  SMOOTHING_LIMIT,
  reconcileSmoothly,
} from '../src/correction-smoothing.ts';
import type { SmoothingSettings } from '../src/correction-smoothing.ts';
import { PlayerPrediction } from '../src/prediction.ts';
import type { PredictionSettings } from '../src/prediction.ts';

/** How long one step of the simulation lasts, in milliseconds. */
const STEP: number = 1000 / SIMULATION_RATE;

/** The number of simulation steps from one snapshot to the next. */
const SNAPSHOT_STEPS: number = SIMULATION_RATE / SNAPSHOT_RATE;

/** How long the page takes from frame to frame, in milliseconds. */
const FRAME = 16;

/**
 * The most the drawn player may move from one frame to the next while it
 * rests and corrections move it, in meters.
 */
const FRAME_STEP_BOUND = 0.1;

/** Prediction switched on, as the tests have it unless they say otherwise. */
const PREDICTED: Readonly<PredictionSettings> = { isEnabled: true };

/** Where the player of the tests stands before a correction. */
const BEFORE: PlayerMotion = createMotion({ x: 2, z: -3 }, 180);

/** Where a small correction puts the player of the tests. */
const AFTER: PlayerMotion = createMotion({ x: 2.3, z: -3 }, 180);

/**
 * Measures how far apart two places are.
 *
 * @param {GroundVector} a - One place.
 * @param {GroundVector} b - The other place.
 * @returns {number} The distance, in meters.
 */
function measureApart(a: GroundVector, b: GroundVector): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Moves a motion to another place, keeping everything else.
 *
 * @param {PlayerMotion} motion - The motion.
 * @param {number} x - The position along the X axis, in meters.
 * @param {number} z - The position along the Z axis, in meters.
 * @returns {PlayerMotion} The motion at that place.
 */
function moveTo(motion: PlayerMotion, x: number, z: number): PlayerMotion {
  return { ...motion, x, z };
}

/** How a player resting in the way of Toby was drawn, frame by frame. */
interface RestingRun {
  /** The places the player was drawn at, one for each frame. */
  readonly drawn: readonly GroundVector[];
  /** The places the player truly was at, one for each frame. */
  readonly truth: readonly PlayerMotion[];
  /** The times of the frames on the clock of the page, in milliseconds. */
  readonly times: readonly number[];
  /** When the last correction came, in milliseconds, or `null`. */
  readonly lastCorrection: number | null;
  /** The number of corrections. */
  readonly correctionCount: number;
  /** How far the largest correction moved the player, in meters. */
  readonly largestCorrection: number;
  /**
   * Whether the prediction, set right with its corrections smoothed, told
   * the place the server told at once, at every snapshot.
   */
  readonly isTrueAtOnce: boolean;
}

/**
 * Plays a player that rests in the way of Toby, where the server pushes it
 * aside, with the page drawing it with its corrections smoothed.
 *
 * @param {number} latency - How long a snapshot takes to reach the page,
 *   in whole milliseconds.
 * @param {number} offRun - How far off the line of his run the player
 *   rests, in meters.
 * @returns {RestingRun} How the player was drawn.
 */
function playResting(latency: number, offRun: number): RestingRun {
  const [first, second] = TOBY_ENDS;
  const length: number = measureApart(first, second);
  const start: PlayerMotion = createMotion(
    {
      x: (first.x + second.x) / 2 + ((second.z - first.z) / length) * offRun,
      z: (first.z + second.z) / 2 - ((second.x - first.x) / length) * offRun,
    },
    SPAWN_YAW,
  );
  const server = new AuthoritativePlayer(start);
  const prediction = new PlayerPrediction(start, 0, 0, 'village');
  const smoothing = new CorrectionSmoothing({ isEnabled: true }, PREDICTED);
  const snapshots = new Map<number, [number, InputProgress]>();
  const drawn: GroundVector[] = [];
  const truth: PlayerMotion[] = [];
  const times: number[] = [];
  let lastCorrection: number | null = null;
  let largestCorrection = 0;
  let isTrueAtOnce = true;
  let step = 0;
  for (let time = 0; time <= 20_000; time++) {
    if (time % STEP === 0 && time > 0) {
      step++;
      server.step(step, 'village', false, []);
      if (step % SNAPSHOT_STEPS === 0) {
        snapshots.set(time + latency, [step, server.progress]);
      }
    }
    const snapshot: [number, InputProgress] | undefined = snapshots.get(time);
    if (snapshot !== undefined) {
      const [told, progress] = snapshot;
      const count: number = prediction.correctionCount;
      reconcileSmoothly(prediction, smoothing, progress, told, time);
      if (prediction.correctionCount !== count) {
        lastCorrection = time;
        largestCorrection = Math.max(
          largestCorrection,
          prediction.lastCorrection ?? 0,
        );
      }
      isTrueAtOnce &&=
        prediction.motion.x === progress.motion.x &&
        prediction.motion.z === progress.motion.z;
    }
    if (time % FRAME === 0) {
      const motion: PlayerMotion = prediction.readDrawn(time);
      truth.push(motion);
      drawn.push(smoothing.readDrawn(motion, time));
      times.push(time);
    }
  }
  return {
    drawn,
    truth,
    times,
    lastCorrection,
    correctionCount: prediction.correctionCount,
    largestCorrection,
    isTrueAtOnce,
  };
}

describe('the smoothing of corrections', () => {
  it('draws a correction as a glide that ends at the true place', () => {
    const smoothing = new CorrectionSmoothing({ isEnabled: true }, PREDICTED);
    smoothing.noticeCorrection(BEFORE, AFTER, 1000);
    expect(smoothing.readDrawn(AFTER, 1000).x).toBe(BEFORE.x);
    let last: number = BEFORE.x;
    for (
      let time = 1000 + FRAME;
      time < 1000 + SMOOTHING_DURATION;
      time += FRAME
    ) {
      const drawn: PlayerMotion = smoothing.readDrawn(AFTER, time);
      expect(drawn.x).toBeGreaterThan(last);
      expect(drawn.x).toBeLessThan(AFTER.x);
      expect(drawn.z).toBe(AFTER.z);
      last = drawn.x;
    }
    expect(smoothing.readDrawn(AFTER, 1000 + SMOOTHING_DURATION)).toBe(AFTER);
    expect(smoothing.readDrawn(AFTER, 5000)).toBe(AFTER);
  });

  it('draws the true place exactly when there is no correction', () => {
    const smoothing = new CorrectionSmoothing({ isEnabled: true }, PREDICTED);
    for (let time = 0; time < 1000; time += FRAME) {
      const motion: PlayerMotion = moveTo(BEFORE, time / 1000, -3);
      expect(smoothing.readDrawn(motion, time)).toBe(motion);
    }
    // Nor is a reconciliation that leaves the drawn place as it was one.
    smoothing.noticeCorrection(AFTER, AFTER, 1000);
    expect(smoothing.readDrawn(AFTER, 1000)).toBe(AFTER);
  });

  it('moves the drawn place by the walk of the player as it glides', () => {
    const smoothing = new CorrectionSmoothing({ isEnabled: true }, PREDICTED);
    smoothing.noticeCorrection(BEFORE, AFTER, 1000);
    const early: PlayerMotion = smoothing.readDrawn(AFTER, 1050);
    const walked: PlayerMotion = moveTo(AFTER, AFTER.x, AFTER.z + 0.1);
    const later: PlayerMotion = smoothing.readDrawn(walked, 1050);
    expect(later.z - early.z).toBeCloseTo(0.1, 12);
    expect(later.x).toBe(early.x);
  });

  it('draws a run of corrections as one continuous movement', () => {
    const smoothing = new CorrectionSmoothing({ isEnabled: true }, PREDICTED);
    let truth: PlayerMotion = BEFORE;
    let last: number = BEFORE.x;
    for (let time = 1000; time < 2000; time += FRAME / 4) {
      if (time % 100 === 0) {
        const pushed: PlayerMotion = moveTo(truth, truth.x + 0.3, truth.z);
        smoothing.noticeCorrection(truth, pushed, time);
        truth = pushed;
      }
      if (time % FRAME === 0) {
        const drawn: number = smoothing.readDrawn(truth, time).x;
        expect(drawn).toBeGreaterThan(last);
        expect(drawn - last).toBeLessThan(FRAME_STEP_BOUND);
        last = drawn;
      }
    }
    expect(smoothing.readDrawn(truth, 1900 + SMOOTHING_DURATION)).toBe(truth);
  });

  it('never lets the drawn place fall further behind than the limit', () => {
    const smoothing = new CorrectionSmoothing({ isEnabled: true }, PREDICTED);
    let truth: PlayerMotion = BEFORE;
    for (let time = 1000; time < 1500; time += 5) {
      const pushed: PlayerMotion = moveTo(truth, truth.x + 0.2, truth.z);
      smoothing.noticeCorrection(truth, pushed, time);
      truth = pushed;
      const drawn: PlayerMotion = smoothing.readDrawn(truth, time);
      expect(measureApart(drawn, truth)).toBeLessThan(SMOOTHING_LIMIT);
    }
  });

  it('jumps over a correction of the limit or more, whatever is left', () => {
    const smoothing = new CorrectionSmoothing({ isEnabled: true }, PREDICTED);
    smoothing.noticeCorrection(moveTo(BEFORE, 2.5, -3), BEFORE, 1000);
    expect(smoothing.readDrawn(BEFORE, 1000).x).toBeCloseTo(2.5, 12);
    // Back the other way, it would leave the player drawn 0.7 m behind.
    const far: PlayerMotion = moveTo(BEFORE, 2 + 1.2, -3);
    smoothing.noticeCorrection(BEFORE, far, 1000);
    expect(smoothing.readDrawn(far, 1000)).toBe(far);
    expect(smoothing.readDrawn(far, 1050)).toBe(far);
  });

  it('jumps when a correction would leave it the limit behind', () => {
    const smoothing = new CorrectionSmoothing({ isEnabled: true }, PREDICTED);
    const middle: PlayerMotion = moveTo(BEFORE, 2 + 0.6, -3);
    smoothing.noticeCorrection(BEFORE, middle, 1000);
    expect(smoothing.readDrawn(middle, 1000).x).toBeCloseTo(2, 12);
    const far: PlayerMotion = moveTo(BEFORE, 2 + 1.2, -3);
    smoothing.noticeCorrection(middle, far, 1000);
    expect(smoothing.readDrawn(far, 1000)).toBe(far);
    expect(smoothing.readDrawn(far, 1050)).toBe(far);
  });

  it('draws coming back from death at once, however near', () => {
    const smoothing = new CorrectionSmoothing({ isEnabled: true }, PREDICTED);
    const dead: PlayerMotion = moveTo(killMotion(BEFORE), 2.1, -3);
    smoothing.noticeCorrection(BEFORE, dead, 1000);
    expect(smoothing.readDrawn(dead, 1050)).not.toBe(dead);
    const back: PlayerMotion = createMotion({ x: 2.2, z: -3 }, SPAWN_YAW);
    smoothing.noticeCorrection(dead, back, 1050);
    expect(smoothing.readDrawn(back, 1050)).toBe(back);
  });

  it('leaves the motion it is given as it was', () => {
    const smoothing = new CorrectionSmoothing({ isEnabled: true }, PREDICTED);
    smoothing.noticeCorrection(BEFORE, AFTER, 1000);
    const motion: PlayerMotion = { ...AFTER };
    expect(smoothing.readDrawn(motion, 1050)).not.toEqual(AFTER);
    expect(motion).toEqual(AFTER);
  });

  it('draws the true place at once when switched off', () => {
    const settings: SmoothingSettings = { isEnabled: false };
    const smoothing = new CorrectionSmoothing(settings, PREDICTED);
    smoothing.noticeCorrection(BEFORE, AFTER, 1000);
    expect(smoothing.readDrawn(AFTER, 1000)).toBe(AFTER);
    settings.isEnabled = true;
    smoothing.noticeCorrection(AFTER, BEFORE, 2000);
    expect(smoothing.readDrawn(BEFORE, 2050)).not.toBe(BEFORE);
    // Switched off as it glides, it draws the true place from then on.
    settings.isEnabled = false;
    expect(smoothing.readDrawn(BEFORE, 2060)).toBe(BEFORE);
    settings.isEnabled = true;
    expect(smoothing.readDrawn(BEFORE, 2070)).toBe(BEFORE);
  });

  it('leaves nothing to glide over from while it was switched off', () => {
    const settings: SmoothingSettings = { isEnabled: false };
    const smoothing = new CorrectionSmoothing(settings, PREDICTED);
    smoothing.noticeCorrection(BEFORE, AFTER, 1000);
    settings.isEnabled = true;
    expect(smoothing.readDrawn(AFTER, 1000)).toBe(AFTER);
  });

  it('leaves no glide when prediction is switched off or on', () => {
    const prediction: PredictionSettings = { isEnabled: true };
    const smoothing = new CorrectionSmoothing({ isEnabled: true }, prediction);
    smoothing.noticeCorrection(BEFORE, AFTER, 1000);
    expect(smoothing.readDrawn(AFTER, 1016)).not.toBe(AFTER);
    // Switched off as it glides, it draws the true place from then on.
    prediction.isEnabled = false;
    expect(smoothing.readDrawn(AFTER, 1032)).toBe(AFTER);
    prediction.isEnabled = true;
    expect(smoothing.readDrawn(AFTER, 1048)).toBe(AFTER);
    // A correction while it is switched off leaves nothing to glide over.
    prediction.isEnabled = false;
    smoothing.noticeCorrection(AFTER, BEFORE, 2000);
    prediction.isEnabled = true;
    expect(smoothing.readDrawn(BEFORE, 2000)).toBe(BEFORE);
  });

  it('glides a player that Toby pushes, and sees it where it is at once', () => {
    for (const latency of [0, 80, 150, 300]) {
      for (const offRun of [0, 0.2]) {
        const run: RestingRun = playResting(latency, offRun);
        const told = `${String(latency)} ms, ${String(offRun)} m off his run`;
        expect(run.correctionCount, told).toBeGreaterThan(1);
        expect(run.largestCorrection, told).toBeGreaterThan(FRAME_STEP_BOUND);
        expect(run.isTrueAtOnce, told).toBe(true);
        run.drawn.slice(1).forEach((drawn: GroundVector, index: number) => {
          const previous: GroundVector = run.drawn[index] ?? drawn;
          expect(measureApart(drawn, previous), told).toBeLessThan(
            FRAME_STEP_BOUND,
          );
        });
        const settled: number = (run.lastCorrection ?? 0) + SMOOTHING_DURATION;
        run.times.forEach((time: number, index: number) => {
          if (time >= settled) {
            expect(run.drawn[index], told).toBe(run.truth[index]);
          }
        });
      }
    }
  });
});
