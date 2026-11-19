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
 * @module client/tests/push-forecast Tests for drawing the player of the
 *   page pushed out of the way of Toby before the server tells of it.
 */

import { describe, expect, it } from 'vitest';

import {
  AuthoritativePlayer,
  DEATH_DURATION,
  PLAYER_RADIUS,
  SIMULATION_RATE,
  SNAPSHOT_RATE,
  SPAWN_YAW,
  TOBY_ACTIVITY_STEPS,
  TOBY_ENDS,
  TOBY_RADIUS,
  TOBY_RUN_SPEED,
  VILLAGE_TERRAIN,
  createMotion,
  findSpawnPoint,
  findTobyPose,
  isResting,
} from '@clovervale/shared';
import type {
  GroundVector,
  InputProgress,
  PlayerInput,
  PlayerMotion,
  StampedInput,
  TobyPose,
} from '@clovervale/shared';

import {
  CorrectionSmoothing,
  SMOOTHING_DURATION,
  reconcileSmoothly,
} from '../src/correction-smoothing.ts';
import type { SmoothingSettings } from '../src/correction-smoothing.ts';
import type { PredictionSettings } from '../src/panel.ts';
import { PlayerPrediction } from '../src/prediction.ts';
import {
  FORECAST_HORIZON,
  PUSH_SPEED,
  PushForecast,
} from '../src/push-forecast.ts';
import type { PushForecastSettings } from '../src/push-forecast.ts';

/** How long one step of the simulation lasts, in milliseconds. */
const STEP: number = 1000 / SIMULATION_RATE;

/** The number of simulation steps from one snapshot to the next. */
const SNAPSHOT_STEPS: number = SIMULATION_RATE / SNAPSHOT_RATE;

/** The number of frames the page draws in a second. */
const FRAME_RATE = 60;

/** The least distance between the centres of Toby and a player, in metres. */
const REACH: number = TOBY_RADIUS + PLAYER_RADIUS;

/** How far apart two places may be and still count as one, for rounding. */
const PLACE_TOLERANCE = 1e-9;

/**
 * How much farther from where the server has the player it may be drawn
 * than without the forecast as it glides over a correction, in metres: the
 * glide the forecast takes over by may start a frame after the one it takes
 * over from.
 */
const GLIDE_SLACK = 0.01;

/**
 * How much faster than the clock of the page Toby may be drawn running, as
 * he catches up with where the page reckons he is.
 */
const DRAWN_STEP_SLEW = 0.1;

/**
 * How far the player resting in his way may be drawn into Toby, in metres:
 * as he first touches it, he runs on into it faster than the forecast
 * draws it pushed aside, until it is pushed far enough to the side.  Drawn
 * moving square to his run at {@link PUSH_SPEED} from where he first
 * touches it, as he runs at his speed, a little faster as he is drawn
 * catching up, it comes nearest his middle at this much less than the
 * least distance, and the rest is for rounding.
 */
const SINK_BOUND: number = (() => {
  const ratio: number = PUSH_SPEED / (TOBY_RUN_SPEED * (1 + DRAWN_STEP_SLEW));
  return REACH * (1 - ratio / Math.sqrt(1 + ratio * ratio)) + 1e-6;
})();

/**
 * How much farther the player may be drawn moving from one frame to the
 * next than without the forecast, in metres: a frame's share of
 * {@link PUSH_SPEED}, or of a glide over as far as Toby pushes a player,
 * whichever is more, and a little to spare.
 */
const FRAME_EXCESS: number =
  Math.max(PUSH_SPEED, (REACH * 1000) / SMOOTHING_DURATION) *
    (17 / 1000) +
  0.01;

/** The number of steps a dead player lies dead before it comes back. */
const DEATH_STEPS: number = Math.round(DEATH_DURATION * SIMULATION_RATE);

/** Prediction switched on, as the tests have it unless they say otherwise. */
const PREDICTED: Readonly<PredictionSettings> = { isEnabled: true };

/** The latencies the tests play over, each way, in milliseconds. */
const LATENCIES: readonly number[] = [0, 80, 150, 300];

/** The way Toby runs from the end of his run by the cottage, one metre long. */
const RUN_WAY: GroundVector = (() => {
  const [first, second] = TOBY_ENDS;
  const length: number = Math.hypot(second.x - first.x, second.z - first.z);
  return {
    x: (second.x - first.x) / length,
    z: (second.z - first.z) / length,
  };
})();

/** The length of the run of Toby, in metres. */
const RUN_LENGTH: number = Math.hypot(
  TOBY_ENDS[1].x - TOBY_ENDS[0].x,
  TOBY_ENDS[1].z - TOBY_ENDS[0].z,
);

/**
 * The way square to his run towards the back of the village, away from the
 * fence, one metre long.
 */
const OFF_RUN: GroundVector = { x: RUN_WAY.z, z: -RUN_WAY.x };

/** A spawn point by his run, where he pushes a player resting there. */
const SPAWN_ON_RUN: GroundVector = findSpawnPoint(30);

/** The step at which Toby first sets off from the end by the cottage. */
const FIRST_RUN_STEP: number = (() => {
  for (let step = 0; ; step++) {
    if (findTobyPose(step).activity === 'Run') {
      return step;
    }
  }
})();

/**
 * The places along his run the player rests at, in metres from the end by
 * the cottage, and off its line, in metres, on the side away from the
 * fence, or on the side of the fence when negative: all with room for the
 * server to push the player until it just touches him.
 */
const RESTING_PLACES: readonly (readonly [number, number])[] = [
  1,
  2.2,
  3,
].flatMap((along: number) =>
  [-0.3, -0.1, 0, 0.1, 0.3].map(
    (off: number): readonly [number, number] => [along, off],
  ),
);

/**
 * Places by his run near the fence and the gate, where the server pushes
 * the player along what stops it, or not all the way.
 */
const FENCE_PLACES: readonly (readonly [number, number])[] = [
  [3, -0.5],
  [3.5, -0.25],
  [3.75, -0.2],
  [3.75, 0.1],
  [4, 0],
];

/** The eight ways a player sets off in, along his run and square to it. */
const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

/**
 * A walk a short way along his run and back, well before he runs, from
 * which the page learns when the server takes its inputs in, and a rest.
 */
const SETTLING: readonly TimedInput[] = [
  { time: 300, input: steerByRun(1, 0) },
  { time: 500, input: steerByRun(0, 0) },
  { time: 1300, input: steerByRun(-1, 0) },
  { time: 1500, input: steerByRun(0, 0) },
];

/** An input of the page, and when the page has it. */
interface TimedInput {
  /** When the page has the input, in whole milliseconds. */
  readonly time: number;
  /** The input. */
  readonly input: PlayerInput;
  /**
   * How much longer than the latency the input takes to reach the server,
   * in whole milliseconds, if any.
   */
  readonly delay?: number;
}

/** A switch of the panel the owner flips, and when. */
interface Toggle {
  /** When the owner flips it, in whole milliseconds. */
  readonly time: number;
  /** Which switch. */
  readonly name: 'forecast' | 'smoothing' | 'prediction';
  /** Whether it is switched on. */
  readonly isEnabled: boolean;
}

/** What happens to a player over a link, as a test plays it. */
interface Scenario {
  /** How long a message takes either way, in whole milliseconds. */
  readonly latency: number;
  /** Where the player starts. */
  readonly start: GroundVector;
  /** The inputs, in the order of their times. */
  readonly inputs: readonly TimedInput[];
  /** Whether the page foresees the pushes of Toby at first. */
  readonly isForeseen: boolean;
  /**
   * Whether the page leaves the forecast out altogether, drawing the player
   * by the smoothing of its corrections alone.
   */
  readonly isForecastLeftOut?: boolean;
  /** How long to play, in whole milliseconds. */
  readonly duration: number;
  /** The switches the owner flips, in the order of their times. */
  readonly toggles?: readonly Toggle[];
  /**
   * When the server kills the player, in whole milliseconds, a multiple of
   * a step, and where it comes back to life.
   */
  readonly death?: { readonly time: number; readonly respawn: GroundVector };
  /**
   * The span in which every snapshot the server sends is lost, or held back
   * and sent together at its end, if it is held.
   */
  readonly silence?: {
    readonly from: number;
    readonly to: number;
    readonly isHeld?: boolean;
  };
  /** The span in which the page draws no frame, as when it is hidden. */
  readonly pause?: { readonly from: number; readonly to: number };
}

/** The player of the page as the page has it in a frame. */
interface Frame {
  /** The time of the frame on the clock of the page, in milliseconds. */
  readonly time: number;
  /** The step of the server Toby is drawn at, which may fall between two. */
  readonly tobyStep: number;
  /** The player as the prediction draws it. */
  readonly truth: PlayerMotion;
  /** The player as the page draws it. */
  readonly drawn: PlayerMotion;
  /** The predicted motion of the player. */
  readonly motion: PlayerMotion;
}

/** What came of playing a player over a link. */
interface Run {
  /** The frames, in order. */
  readonly frames: readonly Frame[];
  /** The inputs as the page stamped them, in order. */
  readonly stamps: readonly StampedInput[];
  /** How far each correction moved the player, in order, in metres. */
  readonly corrections: readonly number[];
  /** The number of corrections the prediction counted. */
  readonly correctionCount: number;
  /** The motion of the player on the server after each step, by step. */
  readonly server: readonly PlayerMotion[];
}

/**
 * Makes the input that steers a player along the run of Toby and square to
 * it.
 *
 * @param {number} along - How much of the way goes along his run, towards
 *   the gate.
 * @param {number} off - How much goes square to it, away from the fence.
 * @returns {PlayerInput} The input.
 */
function steerByRun(along: number, off: number): PlayerInput {
  return {
    type: 'move',
    direction: {
      x: RUN_WAY.x * along + OFF_RUN.x * off,
      z: RUN_WAY.z * along + OFF_RUN.z * off,
    },
  };
}

/**
 * Finds a place by his run for a player to stand at, which the test fails
 * unless a player can stand there.
 *
 * @param {number} along - How far along his run, from the end by the
 *   cottage, in metres.
 * @param {number} off - How far off its line, away from the fence, in
 *   metres.
 * @returns {GroundVector} The place.
 */
function placeByRun(along: number, off: number): GroundVector {
  const [first] = TOBY_ENDS;
  const place: GroundVector = {
    x: first.x + RUN_WAY.x * along + OFF_RUN.x * off,
    z: first.z + RUN_WAY.z * along + OFF_RUN.z * off,
  };
  expect(
    VILLAGE_TERRAIN.isClear(place),
    `${String(along)} m along, ${String(off)} m off`,
  ).toBe(true);
  return place;
}

/**
 * Measures how far along the run of Toby a point lies, from the end by the
 * cottage.
 *
 * @param {GroundVector} point - The point.
 * @returns {number} The distance, in metres.
 */
function measureAlongRun(point: GroundVector): number {
  const [first] = TOBY_ENDS;
  return (point.x - first.x) * RUN_WAY.x + (point.z - first.z) * RUN_WAY.z;
}

/**
 * Measures how far a point lies from the line of the run of Toby, on the
 * side away from the fence.
 *
 * @param {GroundVector} point - The point.
 * @returns {number} The distance, in metres, negative on the side of the
 *   fence.
 */
function measureOffRun(point: GroundVector): number {
  const [first] = TOBY_ENDS;
  return (point.x - first.x) * OFF_RUN.x + (point.z - first.z) * OFF_RUN.z;
}

/**
 * Measures how far apart two places are.
 *
 * @param {GroundVector} a - One place.
 * @param {GroundVector} b - The other place.
 * @returns {number} The distance, in metres.
 */
function measureApart(a: GroundVector, b: GroundVector): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Tells whether two places are the very same.
 *
 * @param {GroundVector} a - One place.
 * @param {GroundVector} b - The other place.
 * @returns {boolean} Whether they are.
 */
function isSamePlace(a: GroundVector, b: GroundVector): boolean {
  return a.x === b.x && a.z === b.z;
}

/**
 * Measures how far a point lies from a stretch between two places.
 *
 * @param {GroundVector} point - The point.
 * @param {GroundVector} from - One end of the stretch.
 * @param {GroundVector} to - The other end.
 * @returns {number} The distance, in metres.
 */
function measureFromStretch(
  point: GroundVector,
  from: GroundVector,
  to: GroundVector,
): number {
  const dx: number = to.x - from.x;
  const dz: number = to.z - from.z;
  const length: number = dx * dx + dz * dz;
  const share: number =
    length === 0
      ? 0
      : Math.min(
          Math.max(
            ((point.x - from.x) * dx + (point.z - from.z) * dz) / length,
            0,
          ),
          1,
        );
  return Math.hypot(
    point.x - from.x - dx * share,
    point.z - from.z - dz * share,
  );
}

/**
 * Measures how far the player drawn in a frame reaches into Toby as he is
 * drawn then.
 *
 * @param {Frame} frame - The frame.
 * @returns {number} How far, in metres, or 0 if it does not reach into him.
 */
function measureDepth(frame: Frame): number {
  const toby: TobyPose = findTobyPose(frame.tobyStep);
  return Math.max(REACH - measureApart(frame.drawn, toby), 0);
}

/**
 * Finds when the page draws Toby, on his first run towards the gate,
 * square on a place along his run.
 *
 * @param {number} along - How far along his run, in metres.
 * @param {number} latency - How long a message takes either way, in whole
 *   milliseconds.
 * @returns {number} The time on the clock of the page, in whole
 *   milliseconds.
 */
function findPassTime(along: number, latency: number): number {
  const step: number =
    FIRST_RUN_STEP + (TOBY_ACTIVITY_STEPS.Run * along) / RUN_LENGTH;
  return Math.round((step + 0.5) * STEP - latency);
}

/**
 * Plays a player over a link to a server that moves it by the shared rules
 * and sends the page a snapshot every other step, with the page drawing it
 * as the client does, at 60 frames a second.
 *
 * @param {Scenario} scenario - What happens.
 * @param {Readonly<PredictionSettings>} [prediction] - Whether the page
 *   predicts the player, {@link PREDICTED} by default.
 * @returns {Run} What came of it.
 */
function play(
  scenario: Scenario,
  prediction: Readonly<PredictionSettings> = PREDICTED,
): Run {
  const { latency } = scenario;
  const start: PlayerMotion = createMotion(scenario.start, SPAWN_YAW);
  const server = new AuthoritativePlayer(start);
  const predicted = new PlayerPrediction(start, 0, 0);
  const smoothingSettings: SmoothingSettings = { isEnabled: true };
  const predictionSettings: PredictionSettings = { ...prediction };
  const settings: PushForecastSettings = { isEnabled: scenario.isForeseen };
  const smoothing = new CorrectionSmoothing(
    smoothingSettings,
    predictionSettings,
  );
  const forecast = new PushForecast(
    settings,
    smoothingSettings,
    predictionSettings,
  );
  const upward = new Map<number, StampedInput[]>();
  const downward = new Map<number, [number, InputProgress][]>();
  const pending: TimedInput[] = [...scenario.inputs];
  const toggles: Toggle[] = [...(scenario.toggles ?? [])];
  const frames: Frame[] = [];
  const stamps: StampedInput[] = [];
  const corrections: number[] = [];
  const motions: PlayerMotion[] = [start];
  let step = 0;
  let frameCount = 0;
  let deathStep: number | null = null;
  for (let time = 0; time <= scenario.duration; time++) {
    for (
      let next: Toggle | undefined = toggles[0];
      next !== undefined && next.time <= time;
      next = toggles[0]
    ) {
      toggles.shift();
      if (next.name === 'forecast') {
        settings.isEnabled = next.isEnabled;
      } else if (next.name === 'smoothing') {
        smoothingSettings.isEnabled = next.isEnabled;
      } else {
        predictionSettings.isEnabled = next.isEnabled;
      }
    }
    for (
      let next: TimedInput | undefined = pending[0];
      next !== undefined && next.time <= time;
      next = pending[0]
    ) {
      pending.shift();
      const stamped: StampedInput = predicted.issueInput(next.input, time);
      stamps.push(stamped);
      const arrival: number = time + latency + (next.delay ?? 0);
      upward.set(arrival, [...(upward.get(arrival) ?? []), stamped]);
    }
    for (const input of upward.get(time) ?? []) {
      server.receiveInput(input);
    }
    if (time % STEP === 0 && time > 0) {
      step++;
      server.step(step);
      if (scenario.death?.time === time) {
        server.kill();
        deathStep = step;
      }
      if (deathStep !== null && step === deathStep + DEATH_STEPS) {
        server.relocate(scenario.death?.respawn ?? scenario.start, SPAWN_YAW);
      }
      motions.push(server.motion);
      const { silence } = scenario;
      const isSilent: boolean =
        silence !== undefined && time >= silence.from && time < silence.to;
      if (
        step % SNAPSHOT_STEPS === 0 &&
        (!isSilent || silence?.isHeld === true)
      ) {
        const arrival: number =
          (isSilent ? (silence?.to ?? time) : time) + latency;
        downward.set(arrival, [
          ...(downward.get(arrival) ?? []),
          [step, server.progress],
        ]);
      }
    }
    for (const [told, progress] of downward.get(time) ?? []) {
      const count: number = predicted.correctionCount;
      reconcileSmoothly(predicted, smoothing, progress, told, time);
      if (predicted.correctionCount !== count) {
        corrections.push(predicted.lastCorrection ?? 0);
      }
    }
    const { pause } = scenario;
    if (time === Math.round((frameCount * 1000) / FRAME_RATE)) {
      frameCount++;
      if (pause !== undefined && time >= pause.from && time < pause.to) {
        continue;
      }
      predicted.advance(time);
      let tobyStep: number;
      let drawn: PlayerMotion;
      if (scenario.isForecastLeftOut === true) {
        drawn = smoothing.readDrawn(predicted.readDrawn(time), time);
        tobyStep = predicted.readDrawnStep(time);
      } else {
        tobyStep = predicted.readDrawnStep(time);
        drawn = forecast.advance(predicted, smoothing, time, tobyStep);
      }
      const truth: PlayerMotion = predicted.readDrawn(time);
      frames.push({ time, tobyStep, truth, drawn, motion: predicted.motion });
    }
  }
  return {
    frames,
    stamps,
    corrections,
    correctionCount: predicted.correctionCount,
    server: motions,
  };
}

/**
 * Plays a player both with the forecast and without it, the same way.
 *
 * @param {Scenario} scenario - What happens, with the forecast switched on
 *   at first.
 * @returns {[Run, Run]} What came of it with the forecast, and without it
 *   all along.
 */
function playBoth(scenario: Scenario): [Run, Run] {
  const toggles: Toggle[] = (scenario.toggles ?? []).filter(
    (toggle: Toggle) => toggle.name !== 'forecast',
  );
  return [
    play(scenario),
    play({ ...scenario, isForeseen: false, toggles }),
  ];
}

/**
 * Plays a player that rests by the run of Toby as he runs past it both
 * ways, after a short walk.
 *
 * @param {number} latency - How long a message takes either way, in whole
 *   milliseconds.
 * @param {readonly [number, number]} place - Where it rests: how far along
 *   his run and how far off its line, in metres.
 * @param {boolean} isForeseen - Whether the page foresees his pushes.
 * @returns {Run} What came of it.
 */
function playResting(
  latency: number,
  place: readonly [number, number],
  isForeseen: boolean,
): Run {
  return play({
    latency,
    start: placeByRun(...place),
    inputs: SETTLING,
    isForeseen,
    duration: 16_000,
  });
}

/**
 * Names a run for the messages of the tests.
 *
 * @param {number} latency - The latency each way, in milliseconds.
 * @param {readonly [number, number]} place - Where the player rests.
 * @returns {string} The name.
 */
function nameRun(latency: number, place: readonly [number, number]): string {
  const [along, off] = place;
  const where = `${String(along)} m along, ${String(off)} m off`;
  return `${String(latency)} ms, ${where}`;
}

/**
 * Checks that the player drawn with the forecast moves from one frame to
 * the next by no more than {@link FRAME_EXCESS} farther than without it.
 *
 * @param {Run} on - What came of it with the forecast.
 * @param {Run} off - What came of it without the forecast.
 * @param {string} told - The name of the run, for the messages.
 */
function expectNoJump(on: Run, off: Run, told: string): void {
  on.frames.slice(1).forEach((frame: Frame, index: number) => {
    const previous: Frame | undefined = on.frames[index];
    const without: Frame | undefined = off.frames[index + 1];
    const withoutBefore: Frame | undefined = off.frames[index];
    if (
      previous === undefined ||
      without === undefined ||
      withoutBefore === undefined
    ) {
      return;
    }
    const move: number = measureApart(frame.drawn, previous.drawn);
    const moveWithout: number = measureApart(
      without.drawn,
      withoutBefore.drawn,
    );
    expect(move, `${told}, ${String(frame.time)} ms`).toBeLessThanOrEqual(
      moveWithout + FRAME_EXCESS,
    );
  });
}

/**
 * Checks that the player drawn as it walks is drawn just where it is drawn
 * without the forecast, once {@link SMOOTHING_DURATION} has passed since it
 * set off from rest.
 *
 * @param {Run} on - What came of it with the forecast.
 * @param {Run} off - What came of it without the forecast.
 * @param {string} told - The name of the run, for the messages.
 */
function expectWalkingAsWithout(on: Run, off: Run, told: string): void {
  let setOff: number = Number.NEGATIVE_INFINITY;
  on.frames.forEach((frame: Frame, index: number) => {
    if (isResting(frame.truth)) {
      setOff = Number.POSITIVE_INFINITY;
      return;
    }
    if (setOff === Number.POSITIVE_INFINITY) {
      setOff = frame.time;
    }
    const without: Frame | undefined = off.frames[index];
    if (without === undefined || frame.time < setOff + SMOOTHING_DURATION) {
      return;
    }
    expect(
      isSamePlace(frame.drawn, without.drawn),
      `${told}, ${String(frame.time)} ms, set off at ${String(setOff)} ms`,
    ).toBe(true);
  });
}

/**
 * Checks that the player that sets off from rest drawn elsewhere than
 * without the forecast never goes beyond both where it was drawn last at
 * rest and where it is drawn without the forecast, the way it was drawn
 * off from where it is drawn without it, as it glides over the difference.
 *
 * @param {Run} on - What came of it with the forecast.
 * @param {Run} off - What came of it without the forecast.
 * @param {string} told - The name of the run, for the messages.
 */
function expectNoOvershoot(on: Run, off: Run, told: string): void {
  on.frames.forEach((frame: Frame, index: number) => {
    const last: Frame | undefined = on.frames[index - 1];
    const lastWithout: Frame | undefined = off.frames[index - 1];
    if (
      last === undefined ||
      lastWithout === undefined ||
      isResting(frame.truth) ||
      !isResting(last.truth)
    ) {
      return;
    }
    const apart: number = measureApart(last.drawn, lastWithout.drawn);
    if (apart === 0) {
      return;
    }
    const wayX: number = (last.drawn.x - lastWithout.drawn.x) / apart;
    const wayZ: number = (last.drawn.z - lastWithout.drawn.z) / apart;
    const reach: number = last.drawn.x * wayX + last.drawn.z * wayZ;
    for (
      let next: number = index;
      (on.frames[next]?.time ?? Infinity) <= frame.time + SMOOTHING_DURATION;
      next++
    ) {
      const drawn: PlayerMotion | undefined = on.frames[next]?.drawn;
      const without: PlayerMotion | undefined = off.frames[next]?.drawn;
      if (drawn === undefined || without === undefined) {
        return;
      }
      expect(
        drawn.x * wayX + drawn.z * wayZ,
        `${told}, ${String(on.frames[next]?.time)} ms`,
      ).toBeLessThanOrEqual(
        Math.max(reach, without.x * wayX + without.z * wayZ) + PLACE_TOLERANCE,
      );
    }
  });
}

/**
 * Measures how far a point lies from the places the server has the player
 * at up to the step after a step Toby is drawn at, and the stretches
 * between them.
 *
 * @param {Run} run - What came of playing the player.
 * @param {GroundVector} point - The point.
 * @param {number} tobyStep - The step Toby is drawn at.
 * @returns {number} The distance, in metres.
 */
function measureFromServer(
  run: Run,
  point: GroundVector,
  tobyStep: number,
): number {
  const last: number = Math.floor(tobyStep) + 1;
  let nearest: number = Number.POSITIVE_INFINITY;
  for (let step = 0; step < last && step + 1 < run.server.length; step++) {
    const here: PlayerMotion | undefined = run.server[step];
    const next: PlayerMotion | undefined = run.server[step + 1];
    if (here !== undefined && next !== undefined) {
      nearest = Math.min(nearest, measureFromStretch(point, here, next));
    }
  }
  return nearest;
}

/**
 * Checks that the player resting in a span of a run is drawn only where the
 * server has it at some step up to the one after the step Toby is drawn
 * at, or between two such steps, and never back towards his run.
 *
 * @param {Run} run - What came of it.
 * @param {number} side - The side of his run the player is pushed to: 1
 *   away from the fence, -1 towards it.
 * @param {number} from - When the span starts, in milliseconds.
 * @param {number} to - When it ends, in milliseconds.
 * @param {string} told - The name of the run, for the messages.
 */
function expectOnlyWhereServerHasIt(
  run: Run,
  side: number,
  from: number,
  to: number,
  told: string,
): void {
  let previous: Frame | null = null;
  for (const frame of run.frames) {
    if (frame.time < from || frame.time > to || !isResting(frame.truth)) {
      previous = null;
      continue;
    }
    const at = `${told}, ${String(frame.time)} ms`;
    expect(
      measureFromServer(run, frame.drawn, frame.tobyStep),
      at,
    ).toBeLessThanOrEqual(PLACE_TOLERANCE);
    if (previous !== null) {
      const away: number =
        side *
        (measureOffRun(frame.drawn) - measureOffRun(previous.drawn));
      expect(away, at).toBeGreaterThanOrEqual(-PLACE_TOLERANCE);
    }
    previous = frame;
  }
}

describe('the forecast of the pushes of Toby', () => {
  it('draws a player resting in his way out of him but for a little', () => {
    for (const latency of LATENCIES) {
      for (const place of RESTING_PLACES) {
        const told: string = nameRun(latency, place);
        const after: Run = playResting(latency, place, true);
        for (const frame of after.frames) {
          expect(measureDepth(frame), `${told}, ${String(frame.time)} ms`)
            .toBeLessThanOrEqual(SINK_BOUND);
        }
      }
    }
    // Without the forecast, he runs into the player before it moves.
    const sunk: Run = playResting(150, [2.2, 0], false);
    expect(Math.max(...sunk.frames.map(measureDepth))).toBeGreaterThan(0.2);
  });

  it('leaves the prediction and its corrections as they were', () => {
    for (const latency of LATENCIES) {
      for (const place of RESTING_PLACES) {
        const told: string = nameRun(latency, place);
        const before: Run = play({
          latency,
          start: placeByRun(...place),
          inputs: SETTLING,
          isForeseen: false,
          isForecastLeftOut: true,
          duration: 16_000,
        });
        const after: Run = playResting(latency, place, true);
        expect(after.stamps, told).toEqual(before.stamps);
        expect(after.corrections, told).toEqual(before.corrections);
        expect(after.correctionCount, told).toBe(before.correctionCount);
        expect(after.correctionCount, told).toBeGreaterThan(0);
        expect(
          after.frames.map((frame: Frame) => frame.truth),
          told,
        ).toEqual(before.frames.map((frame: Frame) => frame.truth));
        expect(
          after.frames.map((frame: Frame) => frame.motion),
          told,
        ).toEqual(before.frames.map((frame: Frame) => frame.motion));
        expect(
          after.frames.map((frame: Frame) => frame.tobyStep),
          told,
        ).toEqual(before.frames.map((frame: Frame) => frame.tobyStep));
      }
    }
  });

  it('draws a resting player only where the server has it', () => {
    for (const latency of LATENCIES) {
      for (const place of [...RESTING_PLACES, ...FENCE_PLACES]) {
        const told: string = nameRun(latency, place);
        const run: Run = playResting(latency, place, true);
        const side: number = place[1] < 0 ? -1 : 1;
        expectOnlyWhereServerHasIt(run, side, 3000, 16_000, told);
      }
    }
  });

  it('draws the player where it truly is once he has run past', () => {
    for (const latency of LATENCIES) {
      for (const place of RESTING_PLACES) {
        const told: string = nameRun(latency, place);
        const { frames }: Run = playResting(latency, place, true);
        const last: Frame | undefined = frames.at(-1);
        expect(last?.drawn, told).toBe(last?.truth);
        // Between his runs, as he picks at the clover by the gate.
        const between: Frame[] = frames.filter(
          (frame: Frame) =>
            findTobyPose(frame.tobyStep).activity === 'Pick' &&
            frame.time > 8000 &&
            frame.time < 12_000,
        );
        expect(between.length, told).toBeGreaterThan(0);
        for (const frame of between) {
          expect(frame.drawn, `${told}, ${String(frame.time)} ms`).toBe(
            frame.truth,
          );
        }
      }
    }
  });

  it('draws a player that sets off as without it, after a glide', () => {
    const places: readonly (readonly [number, number])[] = [
      [2.2, 0.3],
      [2.2, 0],
      [1, -0.1],
      [3, 0.1],
    ];
    for (const latency of LATENCIES) {
      for (const place of places) {
        const passTime: number = findPassTime(place[0], latency);
        for (const delay of [-300, -150, 0, 150, 300, 600]) {
          for (const [along, off] of DIRECTIONS) {
            const setOff: number = passTime + delay;
            const told = `${nameRun(latency, place)}, set off ${String(
              delay,
            )} ms from his pass towards ${String(along)}, ${String(off)}`;
            const [on, without]: [Run, Run] = playBoth({
              latency,
              start: placeByRun(...place),
              inputs: [
                ...SETTLING,
                { time: setOff, input: steerByRun(along, off) },
                { time: setOff + 700, input: steerByRun(0, 0) },
              ],
              isForeseen: true,
              duration: setOff + 2500,
            });
            expectWalkingAsWithout(on, without, told);
            expectNoOvershoot(on, without, told);
            expectNoJump(on, without, told);
          }
        }
      }
    }
  });

  it('never draws a push of a player that stops where none comes', () => {
    let quiet = 0;
    for (const latency of LATENCIES) {
      for (const along of [1, 2.2, 3]) {
        const passTime: number = findPassTime(along, latency);
        for (let delay = -1200; delay <= 300; delay += 150) {
          for (const walk of [600, 1000]) {
            const stop: number = passTime + delay;
            const told = `${nameRun(latency, [along, 1.5])}, walked ${String(
              walk,
            )} ms to stop ${String(delay)} ms from his pass`;
            const [on, without]: [Run, Run] = playBoth({
              latency,
              start: placeByRun(along, 1.5),
              inputs: [
                { time: stop - walk, input: steerByRun(0, -1) },
                { time: stop, input: steerByRun(0, 0) },
              ],
              isForeseen: true,
              duration: stop + 2500,
            });
            expectNoJump(on, without, told);
            // Where the server never pushes the player once it stops.
            const stopped: number = on.server.findLastIndex(
              (motion: PlayerMotion) => !isResting(motion),
            );
            const rest: PlayerMotion | undefined = on.server[stopped + 1];
            if (
              rest === undefined ||
              !on.server
                .slice(stopped + 1)
                .every((motion: PlayerMotion) => isSamePlace(motion, rest))
            ) {
              continue;
            }
            quiet++;
            on.frames.forEach((frame: Frame, index: number) => {
              const other: Frame | undefined = without.frames[index];
              expect(
                other !== undefined && isSamePlace(frame.drawn, other.drawn),
                `${told}, ${String(frame.time)} ms`,
              ).toBe(true);
            });
          }
        }
      }
    }
    expect(quiet).toBeGreaterThan(20);
  });

  it('draws a player that walks up to him squatting where it is', () => {
    for (const latency of LATENCIES) {
      const passTime: number = findPassTime(3.75, latency);
      for (const delay of [-450, -300, -150, -50, 50]) {
        for (const walk of [600, 900, 1200]) {
          const setOff: number = passTime + delay;
          const told = `${String(latency)} ms, set off ${String(
            delay,
          )} ms from his pass, walking ${String(walk)} ms`;
          const [on, without]: [Run, Run] = playBoth({
            latency,
            start: placeByRun(3.75, 0.1),
            inputs: [
              ...SETTLING,
              { time: setOff, input: steerByRun(1, -1) },
              { time: setOff + walk, input: steerByRun(0, 0) },
            ],
            isForeseen: true,
            duration: setOff + walk + 4000,
          });
          expectNoJump(on, without, told);
          on.frames.forEach((frame: Frame, index: number) => {
            const other: Frame | undefined = without.frames[index];
            if (frame.time < setOff + walk + 1000 || other === undefined) {
              return;
            }
            expect(
              isSamePlace(frame.drawn, other.drawn),
              `${told}, ${String(frame.time)} ms`,
            ).toBe(true);
          });
        }
      }
    }
  });

  it('keeps a resting player pushed through a long silence', () => {
    for (const latency of LATENCIES) {
      for (const place of [
        [2.2, 0],
        [2.2, 0.3],
        [1, -0.1],
      ] as const) {
        const passTime: number = findPassTime(place[0], latency);
        for (const [before, after] of [
          [2500, 500],
          [500, 2500],
          [1500, 3500],
        ] as const) {
          const told = `${nameRun(latency, place)}, silent from ${String(
            before,
          )} ms before his pass to ${String(after)} ms after`;
          const silence = { from: passTime - before, to: passTime + after };
          const [on, without]: [Run, Run] = playBoth({
            latency,
            start: placeByRun(place[0], place[1]),
            inputs: SETTLING,
            isForeseen: true,
            duration: 12_000,
            silence,
          });
          const side: number = place[1] < 0 ? -1 : 1;
          expectOnlyWhereServerHasIt(on, side, 3000, 12_000, told);
          expectNoJump(on, without, told);
          const last: Frame | undefined = on.frames.at(-1);
          expect(last?.drawn, told).toBe(last?.truth);
        }
      }
    }
  });

  it('glides a player that dies as he pushes it to where it lies', () => {
    for (const latency of LATENCIES) {
      for (const place of [
        [2.2, 0],
        [2.2, 0.3],
      ] as const) {
        const passTime: number = findPassTime(place[0], latency);
        for (const delay of [-100, 0, 100, 200, 400]) {
          const told = `${nameRun(latency, place)}, killed ${String(
            delay,
          )} ms from his pass`;
          const death: number =
            Math.round((passTime + latency + delay) / STEP) * STEP;
          const [on, without]: [Run, Run] = playBoth({
            latency,
            start: placeByRun(place[0], place[1]),
            inputs: SETTLING,
            isForeseen: true,
            duration: death + 5000,
            death: { time: death, respawn: SPAWN_ON_RUN },
          });
          expectNoJump(on, without, told);
          const dead: Frame | undefined = on.frames.find(
            (frame: Frame) => frame.truth.action === 'Die',
          );
          expect(dead, told).toBeDefined();
          on.frames.forEach((frame: Frame, index: number) => {
            const other: Frame | undefined = without.frames[index];
            if (
              frame.truth.action !== 'Die' ||
              frame.time < (dead?.time ?? 0) + SMOOTHING_DURATION ||
              other === undefined
            ) {
              return;
            }
            expect(
              isSamePlace(frame.drawn, other.drawn),
              `${told}, ${String(frame.time)} ms`,
            ).toBe(true);
          });
        }
      }
    }
  });

  it('draws a player that died and came back unseen at once', () => {
    let drawnPushed = 0;
    for (const latency of LATENCIES) {
      const passTime: number = findPassTime(
        measureAlongRun(SPAWN_ON_RUN),
        latency,
      );
      for (const delay of [-100, 0, 100]) {
        const told = `${String(latency)} ms, killed ${String(
          delay,
        )} ms from his pass`;
        const death: number =
          Math.round((passTime + latency + delay) / STEP) * STEP;
        // The snapshots from just before it dies until just after it comes
        // back come together.
        const silence = {
          from: death - 100,
          to: death + DEATH_STEPS * STEP + 200,
          isHeld: true,
        };
        const [on, without]: [Run, Run] = playBoth({
          latency,
          start: SPAWN_ON_RUN,
          inputs: [],
          isForeseen: true,
          duration: silence.to + 2000,
          death: { time: death, respawn: SPAWN_ON_RUN },
          silence,
        });
        const arrival: number = silence.to + latency;
        on.frames.forEach((frame: Frame, index: number) => {
          const other: Frame | undefined = without.frames[index];
          if (other === undefined) {
            return;
          }
          if (frame.time < arrival && !isSamePlace(frame.drawn, other.drawn)) {
            drawnPushed++;
          }
          if (frame.time < arrival || frame.time > arrival + 1000) {
            return;
          }
          expect(
            measureApart(frame.drawn, other.drawn),
            `${told}, ${String(frame.time)} ms`,
          ).toBeLessThanOrEqual(PLACE_TOLERANCE);
        });
      }
    }
    expect(drawnPushed).toBeGreaterThan(0);
  });

  it('holds a resting player once the server is silent for long', () => {
    const horizon: number = FORECAST_HORIZON * SIMULATION_RATE;
    let held = 0;
    for (const latency of LATENCIES) {
      // Toby first reaches the player square in his way at this step.
      const reach: number =
        FIRST_RUN_STEP +
        (TOBY_ACTIVITY_STEPS.Run * (2.2 - REACH)) / RUN_LENGTH;
      // The server last tells of the player before the silence from as long
      // before he reaches it as the forecast foresees, or a little less, so
      // that the course ends before he pushes it or as he pushes it.
      for (let lead = -4; lead <= 6; lead++) {
        const lastTold: number =
          Math.floor((reach - horizon + lead) / SNAPSHOT_STEPS) *
          SNAPSHOT_STEPS;
        const silence = { from: lastTold * STEP + 1, to: 9000 };
        const told = `${String(latency)} ms, last told at step ${String(
          lastTold,
        )}`;
        const [on, without]: [Run, Run] = playBoth({
          latency,
          start: placeByRun(2.2, 0),
          inputs: [],
          isForeseen: true,
          duration: 11_000,
          silence,
        });
        expectNoJump(on, without, told);
        let place: GroundVector | null = null;
        for (const frame of on.frames) {
          if (
            frame.tobyStep < lastTold + horizon + 1 ||
            frame.time >= silence.to + latency
          ) {
            continue;
          }
          place ??= frame.drawn;
          expect(
            isSamePlace(frame.drawn, place),
            `${told}, ${String(frame.time)} ms`,
          ).toBe(true);
        }
        const pushed: PlayerMotion | undefined = on.server.at(-1);
        if (
          place !== null &&
          pushed !== undefined &&
          !isSamePlace(place, pushed)
        ) {
          held++;
        }
      }
    }
    expect(held).toBeGreaterThan(0);
  });

  it('draws the player at once after a long pause between frames', () => {
    for (const latency of LATENCIES) {
      for (const place of [
        [2.2, 0],
        [2.2, 0.3],
      ] as const) {
        const passTime: number = findPassTime(place[0], latency);
        for (const walk of [null, 400]) {
          const told = `${nameRun(latency, place)}, ${
            walk === null ? 'walking on' : 'stopped'
          }`;
          // The page is hidden as Toby pushes the player, which sets off
          // meanwhile, and stops again if it is to.
          const pause = { from: passTime, to: passTime + 1500 };
          const inputs: TimedInput[] = [
            ...SETTLING,
            { time: pause.from + 100, input: steerByRun(0, 1) },
          ];
          if (walk !== null) {
            inputs.push({
              time: pause.from + 100 + walk,
              input: steerByRun(0, 0),
            });
          }
          const [on, without]: [Run, Run] = playBoth({
            latency,
            start: placeByRun(place[0], place[1]),
            inputs,
            isForeseen: true,
            duration: pause.to + 1000,
            pause,
          });
          const index: number = on.frames.findIndex(
            (frame: Frame) => frame.time >= pause.to,
          );
          const before: Frame | undefined = on.frames[index - 1];
          const after: Frame | undefined = on.frames[index];
          const other: Frame | undefined = without.frames[index];
          const otherBefore: Frame | undefined = without.frames[index - 1];
          // Drawn pushed just before the pause, as without the forecast just
          // after.
          expect(
            before !== undefined &&
              otherBefore !== undefined &&
              !isSamePlace(before.drawn, otherBefore.drawn),
            told,
          ).toBe(true);
          expect(
            after !== undefined &&
              other !== undefined &&
              isSamePlace(after.drawn, other.drawn),
            told,
          ).toBe(true);
        }
      }
    }
  });

  it('hands over at a switch, and takes the pushes up again', () => {
    for (const latency of LATENCIES) {
      for (const place of [
        [2.2, 0],
        [2.2, 0.3],
      ] as const) {
        const passTime: number = findPassTime(place[0], latency);
        for (const name of ['forecast', 'smoothing'] as const) {
          for (const delay of [-250, -100, 0, 100]) {
            const off: number = passTime + delay;
            const on: number = off + 300;
            const told = `${nameRun(latency, place)}, ${name} off ${String(
              delay,
            )} ms from his pass`;
            const [run, without]: [Run, Run] = playBoth({
              latency,
              start: placeByRun(place[0], place[1]),
              inputs: SETTLING,
              isForeseen: true,
              duration: 12_000,
              toggles: [
                { time: off, name, isEnabled: false },
                { time: on, name, isEnabled: true },
              ],
            });
            expectNoJump(run, without, told);
            run.frames.forEach((frame: Frame, index: number) => {
              const other: Frame | undefined = without.frames[index];
              if (
                frame.time < off + SMOOTHING_DURATION ||
                frame.time >= on ||
                other === undefined
              ) {
                return;
              }
              expect(
                isSamePlace(frame.drawn, other.drawn),
                `${told}, ${String(frame.time)} ms`,
              ).toBe(true);
            });
            const side: number = place[1] < 0 ? -1 : 1;
            expectOnlyWhereServerHasIt(
              run,
              side,
              on + SMOOTHING_DURATION,
              12_000,
              told,
            );
          }
        }
      }
    }
  });

  it('never draws a push the server does not make, for a late input', () => {
    for (const latency of LATENCIES) {
      for (const along of [1, 2.2, 3]) {
        const passTime: number = findPassTime(along, latency);
        for (const delay of [-900, -700, -500, -300]) {
          for (const extra of [100, 150, 200]) {
            const stop: number = passTime + delay;
            const told = `${String(latency)} ms, ${String(
              along,
            )} m along, stopped ${String(delay)} ms from his pass, ${String(
              extra,
            )} ms late`;
            // It stops just short of his run, but its stop reaches the
            // server late, which stops it on the other side.
            const [on, without]: [Run, Run] = playBoth({
              latency,
              start: placeByRun(along, 1.5),
              inputs: [
                ...SETTLING,
                { time: stop - 950, input: steerByRun(0, -1) },
                { time: stop, input: steerByRun(0, 0), delay: extra },
              ],
              isForeseen: true,
              duration: stop + 2500,
            });
            expectNoJump(on, without, told);
            on.frames.forEach((frame: Frame, index: number) => {
              const other: Frame | undefined = without.frames[index];
              if (other === undefined || !isResting(frame.truth)) {
                return;
              }
              // Never drawn further from where the server has the player
              // than without the forecast.
              expect(
                measureFromServer(on, frame.drawn, frame.tobyStep),
                `${told}, ${String(frame.time)} ms`,
              ).toBeLessThanOrEqual(
                measureFromServer(on, other.drawn, frame.tobyStep) +
                  GLIDE_SLACK,
              );
            });
          }
        }
      }
    }
  });

  it('draws a walking player exactly as before', () => {
    // Across his run and back as he runs, then along it, into him as he
    // runs back, and away to rest far from him.
    const inputs: readonly TimedInput[] = [
      ...SETTLING,
      { time: 5000, input: steerByRun(0, -1) },
      { time: 6200, input: steerByRun(0.3, 1) },
      { time: 7000, input: steerByRun(-1, 0.1) },
      { time: 11_500, input: steerByRun(1, -0.1) },
      { time: 13_000, input: steerByRun(0.2, 1) },
      { time: 14_500, input: steerByRun(0, 0) },
    ];
    let deepest = 0;
    for (const latency of LATENCIES) {
      const told = `${String(latency)} ms`;
      const [after, before]: [Run, Run] = playBoth({
        latency,
        start: placeByRun(2.2, 1.5),
        inputs,
        isForeseen: true,
        duration: 16_000,
      });
      expect(after.frames.map((frame: Frame) => frame.drawn), told).toEqual(
        before.frames.map((frame: Frame) => frame.drawn),
      );
      for (const frame of before.frames) {
        if (!isResting(frame.motion)) {
          deepest = Math.max(deepest, measureDepth(frame));
        }
      }
    }
    // Walking, it is drawn reaching into him at times, and left so.
    expect(deepest).toBeGreaterThan(0.01);
  });

  it('does nothing with prediction switched off', () => {
    const prediction: PredictionSettings = { isEnabled: false };
    for (const latency of LATENCIES) {
      const place: readonly [number, number] = [2.2, 0];
      const told: string = nameRun(latency, place);
      const { frames }: Run = play(
        {
          latency,
          start: placeByRun(...place),
          inputs: SETTLING,
          isForeseen: true,
          duration: 16_000,
        },
        prediction,
      );
      for (const frame of frames) {
        expect(frame.drawn, `${told}, ${String(frame.time)} ms`).toEqual(
          frame.truth,
        );
      }
    }
  });
});
