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
 * @module client/tests/prediction Tests for the prediction of the player
 *   of the page.
 */

import { describe, expect, it } from 'vitest';

import {
  AuthoritativePlayer,
  CAVE_PASSAGE,
  DEATH_DURATION,
  PLAYER_RADIUS,
  SIMULATION_RATE,
  SNAPSHOT_RATE,
  SPAWN_YAW,
  TOBY_ENDS,
  TOBY_LOOP_STEPS,
  TOBY_RADIUS,
  VILLAGERS,
  WALK_SPEED,
  applyInput,
  createMotion,
  findSpawnPoint,
  findTobyPose,
  locateVillager,
  stepMotion,
} from '@clovervale/shared';
import type {
  GroundVector,
  InputProgress,
  MonsterState,
  PlayerInput,
  PlayerMotion,
  PlayerState,
  StampedInput,
  TobyPose,
  Villager,
} from '@clovervale/shared';
import { CAVE_LANDING } from '../../shared/src/cave.ts';
import { SLASH_STEPS, killMotion } from '../../shared/src/player-motion.ts';

import { DrawnPusherStep } from '../src/drawn-pusher-step.ts';
import { PlayerPrediction, placeOwnPlayer } from '../src/prediction.ts';

/** How long one step of the simulation lasts, in milliseconds. */
const STEP: number = 1000 / SIMULATION_RATE;

/** How far a player walks in one step, in metres. */
const STEP_LENGTH: number = WALK_SPEED / SIMULATION_RATE;

/** The number of simulation steps a dead player lies where it fell. */
const DEATH_STEPS: number = DEATH_DURATION * SIMULATION_RATE;

/** The number of simulation steps from one snapshot to the next. */
const STEPS_PER_SNAPSHOT: number = SIMULATION_RATE / SNAPSHOT_RATE;

/** The input that makes a player interact. */
const INTERACT: PlayerInput = { type: 'interact' };

/** The input that stops a player. */
const STOP: PlayerInput = steer(0, 0);

/** Where the players of the tests start. */
const START: PlayerMotion = createMotion({ x: 2, z: -3 }, 180);

/** A snapshot on its way to the page, as far as the prediction goes. */
interface SentSnapshot {
  /** The number of steps the server had taken when it was taken. */
  readonly step: number;
  /** How far the player had got with the inputs of the page then. */
  readonly progress: InputProgress;
}

/** An input of the page, and when the page has it. */
interface TimedInput {
  /** When the page has the input, in whole milliseconds. */
  readonly time: number;
  /** The input. */
  readonly input: PlayerInput;
  /**
   * How much longer than the others the input takes to reach the server,
   * in whole milliseconds.
   */
  readonly lateness?: number;
}

/** A page and a server, and what lies between them. */
interface Link {
  /** How long a message takes to the server, in whole milliseconds. */
  readonly uplink: number;
  /** How long a message takes to the page, in whole milliseconds. */
  readonly downlink: number;
  /**
   * How long after the clock of the page started the server takes its
   * first step, in whole milliseconds.
   */
  readonly phase: number;
  /** How long the page takes from frame to frame, in whole milliseconds. */
  readonly frame: number;
  /**
   * Whether the server takes a step before it receives the inputs that
   * arrive at that very moment, rather than after.
   */
  readonly stepsFirst?: boolean;
}

/** Where the server moves the player at once, after one of its steps. */
interface Relocation {
  /** The number of the step after which the player is moved, from 1. */
  readonly step: number;
  /** Where the player is moved to. */
  readonly position: { readonly x: number; readonly z: number };
  /** The yaw the player is turned to, in degrees. */
  readonly yaw: number;
}

/** What came of playing inputs over a link. */
interface Outcome {
  /** The prediction of the page in the end. */
  readonly prediction: PlayerPrediction;
  /** The player of the server in the end. */
  readonly server: AuthoritativePlayer;
  /** The number of snapshots the page was set right by. */
  readonly snapshotCount: number;
  /**
   * The most steps the page was ahead of what a snapshot told, over all
   * snapshots.
   */
  readonly lead: number;
  /** The least room the player of the server ever had from Toby, in metres. */
  readonly leastRoom: number;
  /**
   * Whether the server ever had the player where the step before would
   * have had it but for Toby: pushed by him, or stopped by him.
   */
  readonly isHindered: boolean;
  /** The inputs as the page stamped them, in order. */
  readonly stamps: readonly StampedInput[];
  /** The numbers of the steps of the server each input came into effect at. */
  readonly applied: readonly number[];
  /**
   * The step of the server the page told the next step of the player was to
   * be at, as it took each input in.
   */
  readonly nextSteps: readonly number[];
  /** The step of the server Toby was drawn at, frame by frame. */
  readonly drawnSteps: readonly DrawnStep[];
  /** How far the largest correction moved the player, in metres. */
  readonly largestCorrection: number;
  /** What the latest snapshot the page heard told of the player. */
  readonly latestTold: InputProgress | null;
}

/** The step of the server Toby is drawn at in a frame of the page. */
interface DrawnStep {
  /** The time of the frame on the clock of the page, in milliseconds. */
  readonly time: number;
  /** The number of the step, which may fall between two. */
  readonly step: number;
}

/**
 * Makes the input that steers a player.
 *
 * @param {number} x - The east-west component of the direction.
 * @param {number} z - The north-south component of the direction.
 * @returns {PlayerInput} The input.
 */
function steer(x: number, z: number): PlayerInput {
  return { type: 'move', direction: { x, z } };
}

/**
 * Plays the inputs of a page over a link to a server that moves the player
 * by the shared rules, and sends the page a snapshot every other step.
 *
 * @param {Link} link - What lies between the page and the server.
 * @param {readonly TimedInput[]} inputs - The inputs, in the order of
 *   their times.
 * @param {number} duration - How long to play for, in whole milliseconds.
 * @param {readonly Relocation[]} [relocations] - Where the server moves the
 *   player at once, and when, which the page cannot foresee.  None by
 *   default.
 * @param {readonly number[]} [deaths] - The numbers of the steps after
 *   which the server kills the player, from 1, which the page cannot
 *   foresee either.  None by default.
 * @param {PlayerMotion} [start] - The motion of the player before its
 *   first input, {@link START} by default.
 * @param {number | null} [joining] - The number of steps the server has
 *   taken when the player joins, for the page to start from the first
 *   snapshot that tells of the player, with the times of the inputs and the
 *   duration counted from then.  By default, `null`, the page starts at
 *   time 0, with the server, before its first step.
 * @returns {Outcome} What came of it.
 */
function play(
  link: Link,
  inputs: readonly TimedInput[],
  duration: number,
  relocations: readonly Relocation[] = [],
  deaths: readonly number[] = [],
  start: PlayerMotion = START,
  joining: number | null = null,
): Outcome {
  const server = new AuthoritativePlayer(start);
  let prediction: PlayerPrediction | null =
    joining === null ? new PlayerPrediction(start, 0, 0, 'village') : null;
  let pusherStep: DrawnPusherStep | null = null;
  let origin: number = joining === null ? 0 : Infinity;
  const upward = new Map<number, StampedInput[]>();
  const downward = new Map<number, SentSnapshot[]>();
  const pending: TimedInput[] = [...inputs];
  let stepCount: number = joining ?? 0;
  let snapshotCount = 0;
  let lead = 0;
  let leastRoom = Infinity;
  let isHindered = false;
  const stamps: StampedInput[] = [];
  const applied: number[] = [];
  const nextSteps: number[] = [];
  const drawnSteps: DrawnStep[] = [];
  let largestCorrection = 0;
  let latestTold: InputProgress | null = null;
  const receiveInputs = (time: number): void => {
    for (const input of upward.get(time) ?? []) {
      server.receiveInput(input);
    }
    upward.delete(time);
  };
  for (let time = 0; time <= origin + duration; time++) {
    while (
      prediction !== null &&
      origin + (pending[0]?.time ?? Infinity) <= time
    ) {
      const { input, lateness = 0 } = pending.shift() ?? { input: STOP };
      const arrival: number = time + link.uplink + lateness;
      nextSteps.push(prediction.readNextStep(time));
      const stamped: StampedInput = prediction.issueInput(input, time);
      stamps.push(stamped);
      upward.set(arrival, [...(upward.get(arrival) ?? []), stamped]);
    }
    if (link.stepsFirst !== true) {
      receiveInputs(time);
    }
    if (time >= link.phase && (time - link.phase) % STEP === 0) {
      const before: PlayerMotion = server.motion;
      stepCount++;
      const taken: StampedInput[] = server.step(
        stepCount,
        'village',
        false,
        [],
      );
      applied.push(...taken.map(() => stepCount));
      const toby: TobyPose = findTobyPose(stepCount);
      const after: PlayerMotion = server.motion;
      leastRoom = Math.min(
        leastRoom,
        Math.hypot(after.x - toby.x, after.z - toby.z) -
          TOBY_RADIUS -
          PLAYER_RADIUS,
      );
      const free: PlayerMotion = stepAway(
        taken.reduce(
          (motion: PlayerMotion, input: StampedInput) =>
            applyInput(motion, input),
          before,
        ),
      );
      isHindered ||=
        before.action !== 'Die' && (free.x !== after.x || free.z !== after.z);
      if (deaths.includes(stepCount)) {
        server.kill();
      }
      for (const relocation of relocations) {
        if (relocation.step === stepCount) {
          server.relocate(relocation.position, relocation.yaw);
        }
      }
      if (stepCount % STEPS_PER_SNAPSHOT === 0) {
        const arrival: number = time + link.downlink;
        const sent: SentSnapshot[] = downward.get(arrival) ?? [];
        downward.set(arrival, [
          ...sent,
          { step: stepCount, progress: server.progress },
        ]);
      }
    }
    receiveInputs(time);
    for (const { step, progress } of downward.get(time) ?? []) {
      latestTold = progress;
      if (prediction === null) {
        prediction = new PlayerPrediction(
          progress.motion,
          step,
          time,
          'village',
        );
        origin = time;
        continue;
      }
      const before: number = Math.hypot(
        prediction.motion.x - progress.motion.x,
        prediction.motion.z - progress.motion.z,
      );
      const corrections: number = prediction.correctionCount;
      prediction.reconcile(progress, step, time);
      if (prediction.correctionCount > corrections) {
        largestCorrection = Math.max(
          largestCorrection,
          prediction.lastCorrection ?? 0,
        );
      }
      snapshotCount++;
      lead = Math.max(lead, before / STEP_LENGTH);
    }
    downward.delete(time);
    if (prediction !== null && time % link.frame === 0) {
      prediction.readDrawn(time);
      pusherStep ??= new DrawnPusherStep(prediction);
      drawnSteps.push({ time, step: pusherStep.read(time) });
    }
  }
  if (prediction === null) {
    throw new Error('The page never heard from the server.');
  }
  return {
    prediction,
    server,
    snapshotCount,
    lead,
    leastRoom,
    isHindered,
    stamps,
    applied,
    nextSteps,
    drawnSteps,
    largestCorrection,
    latestTold,
  };
}

/**
 * The steps at which Toby picks at the clover at each end of his run, in
 * the order of the ends, when he stays at one end for seconds before and
 * after.
 */
const PICKING_STEPS: readonly number[] = TOBY_ENDS.map((end: GroundVector) => {
  for (let step = 0; step < TOBY_LOOP_STEPS; step++) {
    const toby: TobyPose = findTobyPose(step);
    if (toby.activity === 'Pick' && toby.x === end.x && toby.z === end.z) {
      return step;
    }
  }
  throw new Error('Toby never picks at the clover there.');
});

/**
 * Moves a player one step forward as the server would with Toby out of its
 * way, at the end of his run farther from it.
 *
 * @param {PlayerMotion} motion - The motion of the player.
 * @returns {PlayerMotion} The motion after the step.
 */
function stepAway(motion: PlayerMotion): PlayerMotion {
  const distances: number[] = TOBY_ENDS.map((end: GroundVector) =>
    Math.hypot(motion.x - end.x, motion.z - end.z),
  );
  const far: number = (distances[0] ?? 0) < (distances[1] ?? 0) ? 1 : 0;
  return stepMotion(motion, PICKING_STEPS[far] ?? 0, 'village', []);
}

/**
 * Moves the player of a server several steps of the simulation forward.
 *
 * @param {AuthoritativePlayer} player - The player.
 * @param {number} from - The number of the first step.
 * @param {number} count - The number of steps.
 */
function stepTimes(
  player: AuthoritativePlayer,
  from: number,
  count: number,
): void {
  for (let step = from; step < from + count; step++) {
    player.step(step, 'village', false, []);
  }
}

/**
 * Makes numbers that look random, the same ones every time.
 *
 * @param {number} seed - What tells one run of numbers from another.
 * @returns {() => number} Gives the next number, from 0 up to 1.
 */
function createRandom(seed: number): () => number {
  let state: number = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

/**
 * Makes up inputs as a player in a hurry would give them: turns, stops and
 * slashes, some of them within one step of each other, and a stop in the
 * end.
 *
 * @param {() => number} random - Gives the next random number.
 * @param {number} count - The number of inputs.
 * @returns {TimedInput[]} The inputs.
 */
function inventInputs(random: () => number, count: number): TimedInput[] {
  const inputs: TimedInput[] = [];
  let time = 300;
  for (let index = 0; index < count; index++) {
    const kind: number = random();
    let input: PlayerInput = INTERACT;
    if (kind < 0.6) {
      const turn: number = Math.floor(random() * 8) * (Math.PI / 4);
      input = steer(
        Math.round(Math.sin(turn) * 1000) / 1000,
        Math.round(Math.cos(turn) * 1000) / 1000,
      );
    } else if (kind < 0.8) {
      input = STOP;
    }
    inputs.push({ time, input });
    const pause: number = random();
    time += Math.floor(random() * (pause < 0.5 ? 60 : 500));
  }
  inputs.push({ time: time + 40, input: STOP });
  return inputs;
}

/** The links the inputs are played over: the delays, and the timing. */
const LINKS: readonly Link[] = [0, 1, 37, 50, 120, 250, 500].flatMap(
  (uplink: number) =>
    [0, 13, 100, 250, 500].flatMap((downlink: number) =>
      [0, 1, 17, 25, 49].map((phase: number) => ({
        uplink,
        downlink,
        phase,
        frame: 16 + ((uplink + downlink + phase) % 3),
      })),
    ),
);

/** A walk, with turns in quick succession, even within one step. */
const QUICK_TURNS: readonly TimedInput[] = [
  { time: 400, input: steer(1, 0) },
  { time: 407, input: steer(0.707, 0.707) },
  { time: 419, input: steer(0, 1) },
  { time: 433, input: steer(-0.707, 0.707) },
  { time: 461, input: steer(-1, 0) },
  { time: 500, input: steer(-0.707, -0.707) },
  { time: 501, input: steer(0, -1) },
  { time: 549, input: steer(0.707, -0.707) },
  { time: 551, input: steer(1, 0) },
  { time: 640, input: STOP },
  { time: 655, input: steer(0, 1) },
  { time: 691, input: STOP },
  { time: 740, input: steer(0, -1) },
  { time: 741, input: STOP },
  { time: 791, input: steer(1, 0) },
  { time: 1500, input: STOP },
];

/** Slashes, standing and walking, with moves and slashes during them. */
const SLASHES: readonly TimedInput[] = [
  { time: 300, input: INTERACT },
  { time: 320, input: steer(1, 0) },
  { time: 600, input: INTERACT },
  { time: 880, input: steer(0, 1) },
  { time: 1100, input: INTERACT },
  { time: 1110, input: STOP },
  { time: 1130, input: steer(-1, 0) },
  { time: 1400, input: INTERACT },
  { time: 1699, input: INTERACT },
  { time: 1701, input: INTERACT },
  { time: 1900, input: steer(0, -1) },
  { time: 2700, input: INTERACT },
  { time: 2720, input: STOP },
  { time: 3350, input: INTERACT },
  { time: 3352, input: INTERACT },
];

/**
 * A walk to the fountain and into its rim, a drink there with moves and
 * another interaction during it, a slash right by it facing away, and
 * another drink.
 */
const FOUNTAIN_VISIT: readonly TimedInput[] = [
  { time: 300, input: steer(-1, 0) },
  { time: 1633, input: steer(0, -1) },
  { time: 4300, input: STOP },
  { time: 4400, input: INTERACT },
  { time: 4700, input: INTERACT },
  { time: 4800, input: steer(1, 0) },
  { time: 5600, input: STOP },
  { time: 5650, input: steer(0, 1) },
  { time: 5700, input: STOP },
  { time: 5750, input: INTERACT },
  { time: 6500, input: steer(0, -1) },
  { time: 6800, input: STOP },
  { time: 6850, input: INTERACT },
  { time: 6860, input: steer(-1, 0) },
  { time: 7000, input: STOP },
];

/** Where a player appears at the spawn point in the way of Toby. */
const BY_TOBY_SPAWN: PlayerMotion = createMotion(findSpawnPoint(30), SPAWN_YAW);

/**
 * Where a player appears at the spawn point across the plaza from that
 * one, far from Toby.
 */
const FAR_SPAWN: PlayerMotion = createMotion(findSpawnPoint(31), SPAWN_YAW);

/** The way Toby runs from the end of his run by the cottage, one metre long. */
const RUN_WAY: GroundVector = (() => {
  const [first, second] = TOBY_ENDS;
  const length: number = Math.hypot(second.x - first.x, second.z - first.z);
  return {
    x: (second.x - first.x) / length,
    z: (second.z - first.z) / length,
  };
})();

/**
 * The way square to his run towards the back of the village, away from the
 * fence, one metre long.
 */
const OFF_RUN: GroundVector = { x: RUN_WAY.z, z: -RUN_WAY.x };

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
  return steer(
    RUN_WAY.x * along + OFF_RUN.x * off,
    RUN_WAY.z * along + OFF_RUN.z * off,
  );
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
 * A walk from the spawn point in his way along his run, a little off its
 * line, past him where he picks at the clover by the cottage, a rest
 * beyond, and a walk back after he has run off, past him where he picks at
 * the clover by the gate.
 */
const ALONG_HIS_RUN: readonly TimedInput[] = [
  { time: 300, input: steerByRun(-1, 0) },
  { time: 2400, input: STOP },
  { time: 6000, input: steerByRun(1, 0) },
  { time: 9600, input: STOP },
];

/**
 * A walk from the spawn point in his way along his run towards the gate,
 * with a slash by the way, and back towards the cottage, into him as he
 * runs the other way, and towards the gate again with a talk to him where
 * he picks at the clover there.
 */
const ABOUT_HIM: readonly TimedInput[] = [
  { time: 300, input: steerByRun(1, 0) },
  { time: 1300, input: INTERACT },
  { time: 4000, input: steerByRun(-1, 0) },
  { time: 7000, input: steerByRun(1, 0) },
  { time: 9800, input: INTERACT },
  { time: 11_000, input: STOP },
];

/**
 * Where players appear at the spawn points nearest the run of Toby but out
 * of his way.
 */
const BY_TOBY: readonly (readonly [string, PlayerMotion])[] = [14, 22, 28].map(
  (index: number): [string, PlayerMotion] => [
    `at spawn point ${String(index)}`,
    createMotion(findSpawnPoint(index), SPAWN_YAW),
  ],
);

/**
 * Walks, each after a rest, away from the run of Toby and back a little,
 * some of them shorter than a step, and a slash.
 */
const AFTER_RESTS: readonly TimedInput[] = [
  { time: 1000, input: steer(1, 0) },
  { time: 1475, input: STOP },
  { time: 2230, input: steer(0, 1) },
  { time: 2301, input: STOP },
  { time: 3013, input: steer(1, 0) },
  { time: 3020, input: STOP },
  { time: 3900, input: INTERACT },
  { time: 4800, input: steer(-1, 0) },
  { time: 5390, input: STOP },
];

/** Many short walks to and fro, each after a rest as long as the walk. */
const TO_AND_FRO: readonly TimedInput[] = Array.from(
  { length: 80 },
  (_: unknown, index: number): TimedInput => ({
    time: 1000 + index * 263,
    input: [steer(1, 0), STOP, steer(-1, 0), STOP][index % 4] ?? STOP,
  }),
);

/**
 * Tells how many steps the server has taken when a player joins over a
 * link, to start the players over the links at different points of the
 * course of Toby.
 *
 * @param {Link} link - The link.
 * @returns {number} The number of steps.
 */
function findJoiningStep(link: Link): number {
  return (link.uplink + 3 * link.downlink + 7 * link.phase) % TOBY_LOOP_STEPS;
}

/**
 * Walks away from the run of Toby and back a little, each after a rest of
 * two seconds, and a turn on the first walk that reaches the server late.
 */
const LATE_THEN_REST: readonly TimedInput[] = [
  { time: 300, input: steer(1, 0) },
  { time: 700, input: steer(0.6, -0.8), lateness: 300 },
  { time: 1000, input: STOP },
  { time: 3000, input: steer(-1, 0) },
  { time: 3400, input: STOP },
  { time: 5400, input: steer(0, -1) },
  { time: 5800, input: STOP },
];

/** Short walks to and fro by his run, each after a rest. */
const STOPS_AND_STARTS: readonly TimedInput[] = Array.from(
  { length: 24 },
  (_: unknown, index: number): TimedInput => ({
    time: 500 + index * 700,
    input: [steer(1, 0), STOP, steer(-1, 0), STOP][index % 4] ?? STOP,
  }),
);

/**
 * Makes short walks to and fro, each after a rest of two seconds, as the
 * time the inputs take to reach the server changes halfway through them.
 *
 * @param {number} early - How much longer than over the link the inputs of
 *   the first half take to reach the server, in whole milliseconds.
 * @param {number} late - How much longer than over the link the inputs of
 *   the second half take to reach the server, in whole milliseconds.
 * @returns {TimedInput[]} The inputs.
 */
function inventDelayChange(early: number, late: number): TimedInput[] {
  return Array.from(
    { length: 24 },
    (_: unknown, index: number): TimedInput => ({
      time: 500 + Math.floor(index / 2) * 2000 + (index % 2) * 400,
      input: index % 2 === 1 ? STOP : steer(index % 4 === 0 ? 1 : -1, 0),
      lateness: index < 12 ? early : late,
    }),
  );
}

/** The steady links the tests by Toby are played over. */
const TOBY_LINKS: readonly Link[] = [
  { uplink: 0, downlink: 0, phase: 0, frame: 16 },
  { uplink: 37, downlink: 13, phase: 17, frame: 17 },
  { uplink: 120, downlink: 100, phase: 49, frame: 16 },
  { uplink: 250, downlink: 250, phase: 25, frame: 18 },
  { uplink: 500, downlink: 500, phase: 1, frame: 16 },
];

describe('a prediction by Toby', () => {
  it('times its inputs by him as it does far from him, after a rest', () => {
    const link: Link = { uplink: 80, downlink: 80, phase: 0, frame: 16 };
    const near: Outcome = play(
      link,
      LATE_THEN_REST,
      8000,
      [],
      [],
      BY_TOBY_SPAWN,
    );
    const far: Outcome = play(link, LATE_THEN_REST, 8000, [], [], FAR_SPAWN);
    expect(near.isHindered).toBe(false);
    expect(near.stamps).toEqual(far.stamps);
    expect(near.applied).toEqual(far.applied);
    expect(near.prediction.correctionCount).toBe(
      far.prediction.correctionCount,
    );
    // The rest gives back the time the late input cost.
    const [, , , setOff] = near.stamps;
    const sent: number = (LATE_THEN_REST[3]?.time ?? 0) + link.uplink;
    expect(setOff?.after).toBeGreaterThan(0);
    expect(near.applied[3]).toBe(Math.ceil((sent - link.phase) / STEP) + 1);
  });

  it('leaves it to the server to push a player that rests in his way', () => {
    for (const link of TOBY_LINKS) {
      // It appears in his way, and stays there.
      const outcome: Outcome = play(link, [], 9000, [], [], BY_TOBY_SPAWN);
      const told = JSON.stringify(link);
      expect(measureOffRun(BY_TOBY_SPAWN), told).toBeLessThan(0.5);
      expect(outcome.isHindered, told).toBe(true);
      expect(outcome.prediction.correctionCount, told).toBeGreaterThan(0);
      expect(outcome.prediction.motion, told).toEqual(outcome.server.motion);
      // Off his way, where the server pushed it.
      expect(measureOffRun(outcome.prediction.motion), told).toBeGreaterThan(
        0.5,
      );
    }
  });

  it('draws him at an even pace, the player resting or not', () => {
    for (const link of TOBY_LINKS) {
      const { drawnSteps }: Outcome = play(
        link,
        STOPS_AND_STARTS,
        30_000,
        [],
        [],
        BY_TOBY_SPAWN,
      );
      const told = JSON.stringify(link);
      drawnSteps.slice(1).forEach((drawn: DrawnStep, index: number) => {
        const before: DrawnStep = drawnSteps[index] ?? drawn;
        const pace: number =
          ((drawn.step - before.step) * STEP) / (drawn.time - before.time);
        expect(pace, `${told} at ${String(drawn.time)}`).toBeGreaterThan(0.85);
        expect(pace, `${told} at ${String(drawn.time)}`).toBeLessThan(1.15);
      });
      // In the end, at the step the player is drawn at as it walks.
      const last: DrawnStep = drawnSteps.at(-1) ?? { time: 0, step: 0 };
      const walked: number =
        (last.time + link.uplink - link.phase) / STEP + 0.5;
      expect(Math.abs(last.step - walked), told).toBeLessThanOrEqual(1);
    }
  });
});

describe('the prediction of the player of the page', () => {
  it('starts as the server tells, with nothing to correct', () => {
    const prediction = new PlayerPrediction(START, 0, 1000, 'village');
    expect(prediction.motion).toEqual(START);
    expect(prediction.readDrawn(1500)).toEqual(START);
    expect(prediction.correctionCount).toBe(0);
    expect(prediction.lastCorrection).toBeNull();
  });

  it('moves the player at once on an input, when it rests', () => {
    const prediction = new PlayerPrediction(START, 0, 0, 'village');
    prediction.issueInput(steer(1, 0), 1234);
    expect(prediction.motion.action).toBe('Walk');
    expect(prediction.motion.x).toBeCloseTo(START.x + STEP_LENGTH);
    expect(prediction.motion.yaw).toBeCloseTo(90);
  });

  it('moves the player on at the rate of the server', () => {
    const prediction = new PlayerPrediction(START, 0, 0, 'village');
    prediction.issueInput(steer(1, 0), 1234);
    prediction.advance(1234 + STEP - 1);
    expect(prediction.motion.x).toBeCloseTo(START.x + STEP_LENGTH);
    prediction.advance(1234 + STEP);
    expect(prediction.motion.x).toBeCloseTo(START.x + STEP_LENGTH * 2);
    prediction.advance(1234 + 1000 - 1);
    expect(prediction.motion.x).toBeCloseTo(START.x + WALK_SPEED);
  });

  it('shows an input at the next step of a player that moves', () => {
    const prediction = new PlayerPrediction(START, 0, 0, 'village');
    prediction.issueInput(steer(1, 0), 1000);
    prediction.issueInput(steer(0, 1), 1020);
    expect(prediction.motion.yaw).toBeCloseTo(90);
    prediction.advance(1049);
    expect(prediction.motion.yaw).toBeCloseTo(90);
    prediction.advance(1050);
    expect(prediction.motion.yaw).toBeCloseTo(0);
    expect(prediction.motion.z).toBeCloseTo(START.z + STEP_LENGTH);
  });

  it('never takes two steps less than a step apart', () => {
    const prediction = new PlayerPrediction(START, 0, 0, 'village');
    prediction.issueInput(steer(1, 0), 1000);
    prediction.issueInput(STOP, 1010);
    prediction.advance(1050);
    expect(prediction.motion.action).toBe('Idle');
    prediction.issueInput(steer(1, 0), 1060);
    expect(prediction.motion.action).toBe('Idle');
    prediction.advance(1100);
    expect(prediction.motion.action).toBe('Walk');
    expect(prediction.motion.x).toBeCloseTo(START.x + STEP_LENGTH * 2);
  });

  it('starts a slash at once, and stands still for as long as it lasts', () => {
    const prediction = new PlayerPrediction(START, 0, 0, 'village');
    prediction.issueInput(steer(0, 1), 1000);
    prediction.advance(1100);
    const walking: PlayerMotion = prediction.motion;
    prediction.issueInput(INTERACT, 1120);
    prediction.advance(1150);
    expect(prediction.motion.action).toBe('Slash');
    prediction.issueInput(INTERACT, 1300);
    prediction.advance(1150 + STEP * (SLASH_STEPS - 1));
    expect(prediction.motion).toMatchObject({
      x: walking.x,
      z: walking.z,
      action: 'Slash',
    });
    prediction.advance(1150 + STEP * SLASH_STEPS);
    expect(prediction.motion.action).toBe('Walk');
    expect(prediction.motion.z).toBeCloseTo(walking.z + STEP_LENGTH);
    prediction.advance(3000);
    expect(prediction.motion.action).toBe('Walk');
  });

  it('drinks at the fountain, and slashes by it facing away', () => {
    const prediction = new PlayerPrediction(START, 0, 0, 'village');
    const pending: TimedInput[] = [...FOUNTAIN_VISIT];
    const actions: string[] = [];
    for (let time = 0; time <= 9000; time++) {
      while ((pending[0]?.time ?? Infinity) <= time) {
        prediction.issueInput(pending.shift()?.input ?? STOP, time);
      }
      prediction.advance(time);
      if (actions.at(-1) !== prediction.motion.action) {
        actions.push(prediction.motion.action);
      }
    }
    expect(actions).toEqual([
      'Idle',
      'Walk',
      'Idle',
      'Drink',
      'Walk',
      'Idle',
      'Walk',
      'Idle',
      'Slash',
      'Idle',
      'Walk',
      'Idle',
      'Drink',
      'Idle',
    ]);
  });

  it('tells when the latest input shows', () => {
    const prediction = new PlayerPrediction(START, 0, 0, 'village');
    prediction.issueInput(steer(1, 0), 1000);
    expect(prediction.inputStepTime).toBe(1000);
    prediction.issueInput(INTERACT, 1020);
    expect(prediction.inputStepTime).toBe(1000 + STEP);
    prediction.advance(1000 + STEP);
    expect(prediction.motion.action).toBe('Slash');
    expect(prediction.inputStepTime).toBe(1000 + STEP);
  });

  it('numbers its inputs, and tells the steps between them', () => {
    const prediction = new PlayerPrediction(START, 0, 0, 'village');
    const inputs: StampedInput[] = [
      prediction.issueInput(steer(1, 0), 1000),
      prediction.issueInput(steer(0, 1), 1120),
      prediction.issueInput(INTERACT, 1130),
      prediction.issueInput(STOP, 1150),
      prediction.issueInput(steer(1, 0), 5000),
    ];
    expect(inputs).toEqual([
      { type: 'move', sequence: 1, after: 0, direction: { x: 1, z: 0 } },
      { type: 'move', sequence: 2, after: 3, direction: { x: 0, z: 1 } },
      { type: 'interact', sequence: 3, after: 0 },
      { type: 'move', sequence: 4, after: 1, direction: { x: 0, z: 0 } },
      {
        type: 'move',
        sequence: 5,
        after: SLASH_STEPS,
        direction: { x: 1, z: 0 },
      },
    ]);
  });

  it('draws the player gliding from step to step', () => {
    const prediction = new PlayerPrediction(START, 0, 0, 'village');
    prediction.issueInput(steer(1, 0), 1000);
    expect(prediction.readDrawn(1000).x).toBe(START.x);
    expect(prediction.readDrawn(1000).action).toBe('Walk');
    expect(prediction.readDrawn(1010).x).toBeCloseTo(
      START.x + STEP_LENGTH * 0.2,
    );
    expect(prediction.readDrawn(1010).yaw).toBeCloseTo(162);
    expect(prediction.readDrawn(1075).x).toBeCloseTo(
      START.x + STEP_LENGTH * 1.5,
    );
    prediction.issueInput(STOP, 1080);
    expect(prediction.readDrawn(1100).x).toBeCloseTo(
      START.x + STEP_LENGTH * 2,
    );
    expect(prediction.readDrawn(1100)).toEqual(prediction.motion);
    expect(prediction.readDrawn(9000)).toEqual(prediction.motion);
  });

  it('counts the steps of the server on from where it starts', () => {
    const prediction = new PlayerPrediction(START, 100, 0, 'village');
    expect(prediction.step).toBe(100);
    prediction.issueInput(steer(1, 0), 1000);
    expect(prediction.step).toBe(121);
    prediction.advance(1100);
    expect(prediction.step).toBe(123);
  });

  it('takes the count of the steps of the server from what it tells', () => {
    const prediction = new PlayerPrediction(START, 100, 0, 'village');
    const input: StampedInput = prediction.issueInput(steer(1, 0), 1000);
    prediction.advance(1100);
    const server = new AuthoritativePlayer(START);
    server.receiveInput(input);
    stepTimes(server, 129, 2);
    prediction.reconcile(server.progress, 130, 1100);
    expect(prediction.correctionCount).toBe(0);
    expect(prediction.step).toBe(131);
    prediction.advance(1150);
    expect(prediction.step).toBe(132);
  });

  it('tells the step of the server its next step is to be', () => {
    const prediction = new PlayerPrediction(START, 100, 0, 'village');
    // At rest, the step that takes in an input sent then.
    expect(prediction.readNextStep(1000)).toBe(121);
    prediction.issueInput(steer(1, 0), 1000);
    expect(prediction.step).toBe(121);
    // Walking, the step after its last one.
    expect(prediction.readNextStep(1020)).toBe(122);
    prediction.issueInput(STOP, 1020);
    expect(prediction.readNextStep(1049)).toBe(122);
    prediction.advance(1050);
    expect(prediction.step).toBe(122);
    expect(prediction.motion.action).toBe('Idle');
    // At rest again, less than a step after its last one.
    expect(prediction.readNextStep(1060)).toBe(123);
    prediction.issueInput(INTERACT, 1060);
    expect(prediction.readNextStep(1070)).toBe(123);
    expect(prediction.motion.action).toBe('Idle');
    prediction.advance(1100);
    expect(prediction.step).toBe(123);
    expect(prediction.motion.action).toBe('Slash');
  });
});

describe('a prediction set right by the server', () => {
  it.each([
    ['a walk with turns in quick succession', QUICK_TURNS, 2600],
    ['slashes mixed with moves', SLASHES, 5000],
    ['drinks at the fountain and a slash by it', FOUNTAIN_VISIT, 9000],
  ])(
    'never needs a correction over a steady link, for %s',
    (_: string, inputs: readonly TimedInput[], duration: number) => {
      for (const link of LINKS) {
        for (const stepsFirst of [false, true]) {
          const outcome: Outcome = play(
            { ...link, stepsFirst },
            inputs,
            duration,
          );
          const told = JSON.stringify({ ...link, stepsFirst });
          expect(outcome.prediction.correctionCount, told).toBe(0);
          expect(outcome.prediction.motion, told).toEqual(
            outcome.server.motion,
          );
          expect(outcome.server.progress.sequence).toBe(inputs.length);
          expect(outcome.snapshotCount).toBeGreaterThan(15);
        }
      }
    },
  );

  it('never needs a correction for whatever a player does', () => {
    const random: () => number = createRandom(2026);
    for (let run = 0; run < 300; run++) {
      const inputs: TimedInput[] = inventInputs(random, 40);
      const link: Link = {
        uplink: Math.floor(random() * 400),
        downlink: Math.floor(random() * 400),
        phase: Math.floor(random() * STEP),
        frame: 5 + Math.floor(random() * 40),
        stepsFirst: random() < 0.5,
      };
      const end: number = (inputs.at(-1)?.time ?? 0) + 2000;
      const outcome: Outcome = play(link, inputs, end);
      const told = `run ${String(run)}: ${JSON.stringify(link)}`;
      expect(outcome.prediction.correctionCount, told).toBe(0);
      expect(outcome.prediction.motion, told).toEqual(outcome.server.motion);
      expect(outcome.server.progress.sequence, told).toBe(inputs.length);
    }
  });

  it('is ahead of the server by the delays both ways', () => {
    const inputs: TimedInput[] = [{ time: 1000, input: steer(1, 0) }];
    const link: Link = { uplink: 200, downlink: 200, phase: 7, frame: 16 };
    const outcome: Outcome = play(link, inputs, 4000);
    expect(outcome.prediction.correctionCount).toBe(0);
    expect(outcome.lead).toBeGreaterThanOrEqual(400 / STEP);
    expect(outcome.lead).toBeLessThanOrEqual(400 / STEP + 2);
    const direct: Link = { ...link, uplink: 0, downlink: 0 };
    const near: Outcome = play(direct, inputs, 4000);
    expect(near.lead).toBeLessThanOrEqual(2);
  });

  it.each([
    ['slows down', 0, 250],
    ['speeds up', 250, 0],
  ])(
    'times its inputs right again soon after the link to the server %s',
    (_: string, early: number, late: number) => {
      const inputs: TimedInput[] = inventDelayChange(early, late);
      const change: number = inputs.length / 2;
      for (const link of LINKS) {
        const outcome: Outcome = play(link, inputs, 26_000);
        const told = JSON.stringify(link);
        // Far from Toby, the steps the inputs come into effect at do not
        // move the player.
        expect(outcome.prediction.correctionCount, told).toBe(0);
        expect(outcome.prediction.motion, told).toEqual(outcome.server.motion);
        expect(outcome.server.progress.sequence, told).toBe(inputs.length);
        // The first walk after the change comes into effect at another step
        // than the page told, and those after the next rest at the very
        // step.
        expect(outcome.nextSteps[change], told).not.toBe(
          outcome.applied[change],
        );
        expect(outcome.nextSteps.slice(change + 2), told).toEqual(
          outcome.applied.slice(change + 2),
        );
      }
    },
  );

  it('counts a correction when an input reaches the server late', () => {
    const inputs: TimedInput[] = [
      { time: 1000, input: steer(1, 0) },
      { time: 1500, input: STOP, lateness: 120 },
    ];
    const link: Link = { uplink: 80, downlink: 80, phase: 0, frame: 16 };
    const { prediction, server }: Outcome = play(link, inputs, 3000);
    expect(prediction.correctionCount).toBe(1);
    expect((prediction.lastCorrection ?? 0) / STEP_LENGTH).toBeGreaterThan(
      0.99,
    );
    expect((prediction.lastCorrection ?? 0) / STEP_LENGTH).toBeLessThan(3.01);
    expect(prediction.motion).toEqual(server.motion);
    expect(prediction.readDrawn(3000)).toEqual(server.motion);
  });

  it('agrees with the server again after a correction', () => {
    const inputs: TimedInput[] = [
      { time: 1000, input: steer(1, 0) },
      { time: 1500, input: steer(0, 1), lateness: 120 },
      ...QUICK_TURNS.map(({ time, input }: TimedInput) => ({
        time: time + 2000,
        input,
      })),
    ];
    const link: Link = { uplink: 80, downlink: 80, phase: 0, frame: 16 };
    const { prediction, server }: Outcome = play(link, inputs, 5000);
    expect(prediction.correctionCount).toBe(1);
    expect(prediction.motion).toEqual(server.motion);
  });

  it.each([
    ['walking', QUICK_TURNS, 2600, [17, 29]],
    ['slashing', SLASHES, 5000, [8, 25, 61]],
    ['standing still', QUICK_TURNS, 2600, [4]],
  ])(
    'moves the player where the server moves it %s, once, without drifting',
    (
      _: string,
      inputs: readonly TimedInput[],
      duration: number,
      steps: readonly number[],
    ) => {
      const relocations: Relocation[] = steps.map((step: number) => ({
        step,
        position: { x: -1, z: 4 + step / 10 },
        yaw: 180,
      }));
      for (const link of LINKS) {
        const outcome: Outcome = play(link, inputs, duration, relocations);
        const told = JSON.stringify(link);
        expect(outcome.prediction.correctionCount, told).toBe(steps.length);
        expect(outcome.prediction.motion, told).toEqual(outcome.server.motion);
        expect(outcome.server.progress.sequence, told).toBe(inputs.length);
      }
    },
  );

  it('walks on from where the server moves it, as the keys tell', () => {
    const inputs: TimedInput[] = [{ time: 300, input: steer(1, 0) }];
    const link: Link = { uplink: 150, downlink: 150, phase: 3, frame: 16 };
    const relocation: Relocation = {
      step: 30,
      position: { x: -1, z: 4 },
      yaw: 180,
    };
    const { prediction, server }: Outcome = play(link, inputs, 3000, [
      relocation,
    ]);
    // Still walking, the page is ahead of the server, on the same line.
    expect(prediction.correctionCount).toBe(1);
    expect(prediction.motion).toMatchObject({ z: 4, action: 'Walk' });
    expect(server.motion).toMatchObject({ z: 4, action: 'Walk' });
    expect(prediction.motion.x).toBeGreaterThan(server.motion.x);
    expect(server.motion.x).toBeGreaterThan(-1 + 20 * STEP_LENGTH);
  });

  it.each([
    ['walking', QUICK_TURNS, 4000, 12],
    ['slashing', SLASHES, 6000, 25],
    ['standing still', QUICK_TURNS, 4000, 4],
  ])(
    'lets the player die and come back as the server does, %s',
    (
      _: string,
      inputs: readonly TimedInput[],
      duration: number,
      step: number,
    ) => {
      const revival: Relocation = {
        step: step + DEATH_STEPS,
        position: { x: -1, z: 4 },
        yaw: 180,
      };
      for (const link of LINKS) {
        const outcome: Outcome = play(link, inputs, duration, [revival], [
          step,
        ]);
        const told = JSON.stringify(link);
        expect(outcome.prediction.correctionCount, told).toBe(2);
        expect(outcome.prediction.motion, told).toEqual(outcome.server.motion);
        expect(outcome.server.progress.sequence, told).toBe(inputs.length);
      }
    },
  );

  it('keeps the player where it fell while it is dead', () => {
    const prediction = new PlayerPrediction(START, 0, 0, 'village');
    prediction.reconcile(
      { sequence: 0, steps: 2, motion: killMotion(START) },
      2,
      100,
    );
    prediction.issueInput(steer(1, 0), 200);
    prediction.issueInput(INTERACT, 300);
    expect(prediction.readDrawn(1000)).toMatchObject({
      x: START.x,
      z: START.z,
      yaw: START.yaw,
      action: 'Die',
    });
  });

  it('comes back walking as the keys held through death tell', () => {
    const prediction = new PlayerPrediction(START, 0, 0, 'village');
    prediction.reconcile(
      { sequence: 0, steps: 2, motion: killMotion(START) },
      2,
      100,
    );
    prediction.issueInput(steer(1, 0), 200);
    prediction.issueInput(INTERACT, 300);
    prediction.advance(2600);
    const server = new AuthoritativePlayer(START);
    server.kill();
    server.receiveInput({ ...steer(1, 0), sequence: 1, after: 0 });
    server.receiveInput({ ...INTERACT, sequence: 2, after: 0 });
    stepTimes(server, 1, DEATH_STEPS - 5);
    server.relocate({ x: -1, z: 4 }, 180);
    stepTimes(server, DEATH_STEPS - 4, 5);
    // The page is ahead of the server, on the same line.
    prediction.reconcile(server.progress, DEATH_STEPS, 2600);
    expect(prediction.motion).toMatchObject({ z: 4, action: 'Walk' });
    expect(prediction.motion.x).toBeGreaterThan(server.motion.x);
    prediction.advance(2800);
    expect(prediction.motion.action).toBe('Walk');
    expect(prediction.motion.x).toBeGreaterThan(-1 + 9 * STEP_LENGTH);
  });

  it('takes the word of the server for where the player is', () => {
    const prediction = new PlayerPrediction(START, 0, 0, 'village');
    const moved: PlayerMotion = { ...START, x: START.x + 3, z: START.z - 4 };
    prediction.reconcile({ sequence: 0, steps: 8, motion: moved }, 8, 500);
    expect(prediction.motion).toEqual(moved);
    expect(prediction.readDrawn(500)).toEqual(moved);
    expect(prediction.correctionCount).toBe(1);
    expect(prediction.lastCorrection).toBeCloseTo(5);
    prediction.reconcile({ sequence: 0, steps: 10, motion: moved }, 10, 600);
    expect(prediction.correctionCount).toBe(1);
  });

  it('moves what the server tells on by the inputs it has not got to', () => {
    const prediction = new PlayerPrediction(START, 0, 0, 'village');
    prediction.issueInput(steer(1, 0), 1000);
    prediction.issueInput(steer(0, 1), 1120);
    prediction.advance(1200);
    const moved: PlayerMotion = {
      ...START,
      x: START.x + 1 + STEP_LENGTH,
      yaw: 90,
      action: 'Walk',
      actionCount: 1,
      direction: { x: 1, z: 0 },
    };
    prediction.reconcile({ sequence: 1, steps: 1, motion: moved }, 25, 1200);
    expect(prediction.correctionCount).toBe(1);
    expect(prediction.lastCorrection).toBeCloseTo(1);
    expect(prediction.motion.x).toBeCloseTo(START.x + 1 + STEP_LENGTH * 3);
    expect(prediction.motion.z).toBeCloseTo(START.z + STEP_LENGTH * 2);
    expect(prediction.motion.yaw).toBeCloseTo(0);
  });

  it('tells the step the server told its motion at, until it moves on', () => {
    const prediction = new PlayerPrediction(START, 4, 0, 'village');
    expect(prediction.toldStep).toBe(4);
    prediction.reconcile({ sequence: 0, steps: 8, motion: START }, 8, 400);
    expect(prediction.toldStep).toBe(8);
    // A step of its own moves it on.
    prediction.issueInput(steer(1, 0), 1000);
    prediction.issueInput(steer(0, 0), 1200);
    prediction.advance(1500);
    expect(prediction.toldStep).toBeNull();
    // The server has yet to take the inputs in.
    prediction.reconcile({ sequence: 0, steps: 12, motion: START }, 12, 1500);
    expect(prediction.toldStep).toBeNull();
    // The server tells the very motion, after it has stopped.
    const { motion, step } = prediction;
    prediction.reconcile({ sequence: 2, steps: 5, motion }, step + 4, 1500);
    expect(prediction.motion).toBe(motion);
    expect(prediction.toldStep).toBe(step + 4);
  });
});

describe('a prediction that goes into another map', () => {
  /** The player as the server tells it, just arrived in the cave. */
  const LANDED: PlayerMotion = {
    ...createMotion(CAVE_LANDING, CAVE_LANDING.yaw),
    actionCount: 3,
  };

  it('starts afresh where the server tells, without a correction or a glide', () => {
    const prediction = new PlayerPrediction(START, 0, 0, 'village');
    prediction.issueInput(steer(1, 0), 1000);
    prediction.issueInput({ type: 'travel' }, 1100);
    prediction.issueInput(STOP, 1150);
    prediction.advance(1200);
    prediction.enterMap(
      'cave',
      { sequence: 3, steps: 1, motion: LANDED },
      30,
      1200,
    );
    expect(prediction.motion).toEqual(LANDED);
    expect(prediction.readDrawn(1200)).toEqual(LANDED);
    expect(prediction.correctionCount).toBe(0);
    expect(prediction.lastCorrection).toBeNull();
    expect(prediction.step).toBe(30);
  });

  it('moves the player on by the inputs the server has not got to there', () => {
    const prediction = new PlayerPrediction(START, 0, 0, 'village');
    prediction.issueInput({ type: 'travel' }, 1000);
    prediction.issueInput(steer(1, 0), 1100);
    prediction.advance(1300);
    prediction.enterMap(
      'cave',
      { sequence: 1, steps: 2, motion: LANDED },
      25,
      1300,
    );
    expect(prediction.motion.action).toBe('Walk');
    expect(prediction.motion.x).toBeGreaterThan(CAVE_LANDING.x);
    expect(prediction.motion.z).toBe(CAVE_LANDING.z);
    expect(prediction.readDrawn(1300)).toEqual(prediction.motion);
    expect(prediction.correctionCount).toBe(0);
  });

  it('slashes at a living dog in front rather than talk to the prisoner', () => {
    const edwin: Villager | undefined = VILLAGERS.find(
      (villager: Villager) => villager.id === 'edwin',
    );
    const at: GroundVector =
      edwin === undefined ? { x: NaN, z: NaN } : locateVillager(edwin, 0, []);
    const turned: PlayerMotion = createMotion(
      { x: at.x, z: CAVE_PASSAGE.north + PLAYER_RADIUS + 0.1 },
      135,
    );
    const dog: MonsterState = {
      id: 1,
      kind: 'cave-dog',
      x: turned.x + 1,
      z: turned.z,
      yaw: -90,
      action: 'Idle',
      actionCount: 0,
      health: 80,
      mode: 'chase',
    };
    const talking = new PlayerPrediction(turned, 0, 0, 'cave');
    talking.issueInput(INTERACT, 1000);
    expect(talking.motion.action).toBe('Talk');
    const slashing = new PlayerPrediction(turned, 0, 0, 'cave');
    slashing.noteMonsters([dog]);
    slashing.issueInput(INTERACT, 1000);
    expect(slashing.motion.action).toBe('Slash');
  });

  it('walks the player by the ground of the map it is in', () => {
    const prediction = new PlayerPrediction(START, 0, 0, 'village');
    prediction.enterMap('cave', { sequence: 0, steps: 0, motion: LANDED }, 4, 0);
    prediction.issueInput(steer(1, 0), 1000);
    prediction.advance(4000);
    expect(prediction.motion.x).toBeCloseTo(CAVE_PASSAGE.east - PLAYER_RADIUS);
  });

  it('goes on numbering its inputs from before', () => {
    const prediction = new PlayerPrediction(START, 0, 0, 'village');
    prediction.issueInput(steer(1, 0), 1000);
    prediction.issueInput({ type: 'travel' }, 1100);
    prediction.enterMap(
      'cave',
      { sequence: 2, steps: 1, motion: LANDED },
      30,
      1200,
    );
    expect(prediction.issueInput(STOP, 1300).sequence).toBe(3);
  });
});

describe('a prediction set right by the server, by Toby', () => {
  it.each([
    ['a walk along his run', ALONG_HIS_RUN, 11_000],
    ['a walk about him, with a talk or a slash', ABOUT_HIM, 12_800],
  ])(
    'never needs a correction over a steady link, for %s',
    (_: string, inputs: readonly TimedInput[], duration: number) => {
      for (const link of LINKS) {
        for (const stepsFirst of [false, true]) {
          const outcome: Outcome = play(
            { ...link, stepsFirst },
            inputs,
            duration,
            [],
            [],
            BY_TOBY_SPAWN,
          );
          const told = JSON.stringify({ ...link, stepsFirst });
          expect(outcome.isHindered, told).toBe(true);
          expect(outcome.leastRoom, told).toBeGreaterThan(-1e-9);
          expect(outcome.prediction.correctionCount, told).toBe(0);
          expect(outcome.prediction.motion, told).toEqual(
            outcome.server.motion,
          );
          expect(outcome.server.progress.sequence).toBe(inputs.length);
        }
      }
    },
  );

  it('rarely needs a correction setting off from rest into him, and small', () => {
    const random: () => number = createRandom(1121);
    const runs = 300;
    let hinderedCount = 0;
    let correctedCount = 0;
    let largest = 0;
    for (let run = 0; run < runs; run++) {
      const delay: number = Math.floor(random() * 200);
      const link: Link = {
        uplink: delay + Math.floor(random() * 5),
        downlink: delay + Math.floor(random() * 5),
        phase: Math.floor(random() * STEP),
        frame: 16,
        stepsFirst: random() < 0.5,
      };
      // A walk from the spawn point in his way to rest beside his run, out
      // of his way, and a walk across his way from there, at any point of
      // his course, on towards the fence.
      const [first] = TOBY_ENDS;
      const along: number = 0.8 + random() * 2.8;
      const beside: GroundVector = {
        x: first.x + RUN_WAY.x * along + OFF_RUN.x * 0.7,
        z: first.z + RUN_WAY.z * along + OFF_RUN.z * 0.7,
      };
      const distance: number = Math.hypot(
        beside.x - BY_TOBY_SPAWN.x,
        beside.z - BY_TOBY_SPAWN.z,
      );
      const walk: number = (distance / WALK_SPEED) * 1000;
      const setOff: number =
        1800 + walk + Math.floor(random() * TOBY_LOOP_STEPS * STEP);
      const inputs: TimedInput[] = [
        {
          time: 300,
          input: steer(
            (beside.x - BY_TOBY_SPAWN.x) / distance,
            (beside.z - BY_TOBY_SPAWN.z) / distance,
          ),
        },
        { time: 300 + walk, input: STOP },
        { time: setOff, input: steerByRun(0, -1) },
        { time: setOff + 1500, input: STOP },
      ];
      // Until the server can have told of the stop.
      const end: number = setOff + 1500 + link.uplink + link.downlink;
      const outcome: Outcome = play(link, inputs, end, [], [], BY_TOBY_SPAWN);
      hinderedCount += outcome.isHindered ? 1 : 0;
      correctedCount += outcome.prediction.correctionCount > 0 ? 1 : 0;
      largest = Math.max(largest, outcome.largestCorrection);
    }
    expect(hinderedCount).toBeGreaterThan(runs / 12);
    expect(correctedCount).toBeLessThan(runs / 20);
    // Less than two steps of his run.
    expect(largest).toBeLessThan(0.25);
  });

  it.each([
    ['appearing by him', null],
    ['joining at any point of his course', 0],
  ])(
    'sets the player where the server last told, for whatever it does %s',
    (_: string, joining: number | null) => {
      const random: () => number = createRandom(joining === null ? 1119 : 1120);
      let hinderedCount = 0;
      for (let run = 0; run < 100; run++) {
        const inputs: TimedInput[] = inventInputs(random, 40);
        const link: Link = {
          uplink: Math.floor(random() * 400),
          downlink: Math.floor(random() * 400),
          phase: Math.floor(random() * STEP),
          frame: 5 + Math.floor(random() * 40),
          stepsFirst: random() < 0.5,
        };
        const starts: PlayerMotion[] = [
          BY_TOBY_SPAWN,
          ...BY_TOBY.map(
            ([, motion]: readonly [string, PlayerMotion]) => motion,
          ),
        ];
        const start: PlayerMotion = starts[run % starts.length] ?? START;
        const end: number = (inputs.at(-1)?.time ?? 0) + 2000;
        const outcome: Outcome = play(
          link,
          inputs,
          end,
          [],
          [],
          start,
          joining === null ? null : Math.floor(random() * TOBY_LOOP_STEPS),
        );
        const told = `run ${String(run)}: ${JSON.stringify(link)}`;
        // At rest, with every input in effect.
        expect(outcome.latestTold?.sequence, told).toBe(inputs.length);
        expect(outcome.prediction.motion, told).toEqual(
          outcome.latestTold?.motion,
        );
        hinderedCount += outcome.isHindered ? 1 : 0;
      }
      expect(hinderedCount).toBeGreaterThan(5);
    },
  );

  it.each(
    BY_TOBY.flatMap(([where, start]: readonly [string, PlayerMotion]) => [
      [where, 'walks after rests', start, AFTER_RESTS, 7000],
      [where, 'turns in quick succession', start, QUICK_TURNS, 3000],
      [where, 'walks to and fro between rests', start, TO_AND_FRO, 23_000],
    ]),
  )(
    'never needs a correction over a steady link, joining %s, as it %s',
    (
      _where: string,
      _what: string,
      start: PlayerMotion,
      inputs: readonly TimedInput[],
      duration: number,
    ) => {
      for (const link of LINKS) {
        for (const stepsFirst of [false, true]) {
          const outcome: Outcome = play(
            { ...link, stepsFirst },
            inputs,
            duration,
            [],
            [],
            start,
            findJoiningStep(link),
          );
          const told = JSON.stringify({ ...link, stepsFirst });
          expect(outcome.prediction.correctionCount, told).toBe(0);
          expect(outcome.prediction.motion, told).toEqual(
            outcome.server.motion,
          );
          expect(outcome.server.progress.sequence).toBe(inputs.length);
        }
      }
    },
  );
});

describe('placeOwnPlayer', () => {
  const own: PlayerState = { id: 4, appearance: 2, x: 0, z: 0, yaw: 0,
    action: 'Idle', actionCount: 0, health: 70 };
  const other: PlayerState = { id: 9, appearance: 1, x: 5, z: 5, yaw: 90,
    action: 'Walk', actionCount: 3, health: 100 };
  const motion: PlayerMotion = {
    ...createMotion({ x: 1, z: 2 }, -90),
    action: 'Slash',
    actionCount: 7,
    actionSteps: 4,
  };
  const placed: PlayerState = { id: 4, appearance: 2, x: 1, z: 2, yaw: -90,
    action: 'Slash', actionCount: 7, health: 70 };

  it('shows the player of the page with the motion, in its place', () => {
    expect(placeOwnPlayer([own, other], own, motion)).toEqual([placed, other]);
    expect(placeOwnPlayer([other, own], own, motion)).toEqual([other, placed]);
  });

  it('adds the player of the page if it is not among the players', () => {
    expect(placeOwnPlayer([other], own, motion)).toEqual([other, placed]);
    expect(placeOwnPlayer([], own, motion)).toEqual([placed]);
  });
});
