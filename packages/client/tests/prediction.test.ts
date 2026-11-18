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
  DEATH_DURATION,
  SIMULATION_RATE,
  SLASH_STEPS,
  SNAPSHOT_RATE,
  WALK_SPEED,
  createMotion,
  killMotion,
} from '@clovervale/shared';
import type {
  InputProgress,
  PlayerInput,
  PlayerMotion,
  PlayerState,
  StampedInput,
} from '@clovervale/shared';

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
 * @returns {Outcome} What came of it.
 */
function play(
  link: Link,
  inputs: readonly TimedInput[],
  duration: number,
  relocations: readonly Relocation[] = [],
  deaths: readonly number[] = [],
): Outcome {
  const server = new AuthoritativePlayer(START);
  const prediction = new PlayerPrediction(START, 0);
  const upward = new Map<number, StampedInput[]>();
  const downward = new Map<number, InputProgress[]>();
  const pending: TimedInput[] = [...inputs];
  let stepCount = 0;
  let snapshotCount = 0;
  let lead = 0;
  const receiveInputs = (time: number): void => {
    for (const input of upward.get(time) ?? []) {
      server.receiveInput(input);
    }
    upward.delete(time);
  };
  for (let time = 0; time <= duration; time++) {
    while ((pending[0]?.time ?? Infinity) <= time) {
      const { input, lateness = 0 } = pending.shift() ?? { input: STOP };
      const arrival: number = time + link.uplink + lateness;
      const stamped: StampedInput = prediction.issueInput(input, time);
      upward.set(arrival, [...(upward.get(arrival) ?? []), stamped]);
    }
    if (link.stepsFirst !== true) {
      receiveInputs(time);
    }
    if (time >= link.phase && (time - link.phase) % STEP === 0) {
      server.step();
      stepCount++;
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
        const sent: InputProgress[] = downward.get(arrival) ?? [];
        downward.set(arrival, [...sent, server.progress]);
      }
    }
    receiveInputs(time);
    for (const progress of downward.get(time) ?? []) {
      const before: number = Math.hypot(
        prediction.motion.x - progress.motion.x,
        prediction.motion.z - progress.motion.z,
      );
      prediction.reconcile(progress, time);
      snapshotCount++;
      lead = Math.max(lead, before / STEP_LENGTH);
    }
    downward.delete(time);
    if (time % link.frame === 0) {
      prediction.readDrawn(time);
    }
  }
  return { prediction, server, snapshotCount, lead };
}

/**
 * Moves the player of a server several steps of the simulation forward.
 *
 * @param {AuthoritativePlayer} player - The player.
 * @param {number} count - The number of steps.
 */
function stepTimes(player: AuthoritativePlayer, count: number): void {
  for (let step = 0; step < count; step++) {
    player.step();
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

describe('the prediction of the player of the page', () => {
  it('starts as the server tells, with nothing to correct', () => {
    const prediction = new PlayerPrediction(START, 1000);
    expect(prediction.motion).toEqual(START);
    expect(prediction.readDrawn(1500)).toEqual(START);
    expect(prediction.correctionCount).toBe(0);
    expect(prediction.lastCorrection).toBeNull();
  });

  it('moves the player at once on an input, when it rests', () => {
    const prediction = new PlayerPrediction(START, 0);
    prediction.issueInput(steer(1, 0), 1234);
    expect(prediction.motion.action).toBe('Walk');
    expect(prediction.motion.x).toBeCloseTo(START.x + STEP_LENGTH);
    expect(prediction.motion.yaw).toBeCloseTo(90);
  });

  it('moves the player on at the rate of the server', () => {
    const prediction = new PlayerPrediction(START, 0);
    prediction.issueInput(steer(1, 0), 1234);
    prediction.advance(1234 + STEP - 1);
    expect(prediction.motion.x).toBeCloseTo(START.x + STEP_LENGTH);
    prediction.advance(1234 + STEP);
    expect(prediction.motion.x).toBeCloseTo(START.x + STEP_LENGTH * 2);
    prediction.advance(1234 + 1000 - 1);
    expect(prediction.motion.x).toBeCloseTo(START.x + WALK_SPEED);
  });

  it('shows an input at the next step of a player that moves', () => {
    const prediction = new PlayerPrediction(START, 0);
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
    const prediction = new PlayerPrediction(START, 0);
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
    const prediction = new PlayerPrediction(START, 0);
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

  it('numbers its inputs, and tells the steps between them', () => {
    const prediction = new PlayerPrediction(START, 0);
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
    const prediction = new PlayerPrediction(START, 0);
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
});

describe('a prediction set right by the server', () => {
  it.each([
    ['a walk with turns in quick succession', QUICK_TURNS, 2600],
    ['slashes mixed with moves', SLASHES, 5000],
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
    const prediction = new PlayerPrediction(START, 0);
    prediction.reconcile(
      { sequence: 0, steps: 2, motion: killMotion(START) },
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
    const prediction = new PlayerPrediction(START, 0);
    prediction.reconcile(
      { sequence: 0, steps: 2, motion: killMotion(START) },
      100,
    );
    prediction.issueInput(steer(1, 0), 200);
    prediction.issueInput(INTERACT, 300);
    prediction.advance(2600);
    const server = new AuthoritativePlayer(START);
    server.kill();
    server.receiveInput({ ...steer(1, 0), sequence: 1, after: 0 });
    server.receiveInput({ ...INTERACT, sequence: 2, after: 0 });
    stepTimes(server, DEATH_STEPS - 5);
    server.relocate({ x: -1, z: 4 }, 180);
    stepTimes(server, 5);
    // The page is ahead of the server, on the same line.
    prediction.reconcile(server.progress, 2600);
    expect(prediction.motion).toMatchObject({ z: 4, action: 'Walk' });
    expect(prediction.motion.x).toBeGreaterThan(server.motion.x);
    prediction.advance(2800);
    expect(prediction.motion.action).toBe('Walk');
    expect(prediction.motion.x).toBeGreaterThan(-1 + 9 * STEP_LENGTH);
  });

  it('takes the word of the server for where the player is', () => {
    const prediction = new PlayerPrediction(START, 0);
    const moved: PlayerMotion = { ...START, x: START.x + 3, z: START.z - 4 };
    prediction.reconcile({ sequence: 0, steps: 8, motion: moved }, 500);
    expect(prediction.motion).toEqual(moved);
    expect(prediction.readDrawn(500)).toEqual(moved);
    expect(prediction.correctionCount).toBe(1);
    expect(prediction.lastCorrection).toBeCloseTo(5);
    prediction.reconcile({ sequence: 0, steps: 10, motion: moved }, 600);
    expect(prediction.correctionCount).toBe(1);
  });

  it('moves what the server tells on by the inputs it has not got to', () => {
    const prediction = new PlayerPrediction(START, 0);
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
    prediction.reconcile({ sequence: 1, steps: 1, motion: moved }, 1200);
    expect(prediction.correctionCount).toBe(1);
    expect(prediction.lastCorrection).toBeCloseTo(1);
    expect(prediction.motion.x).toBeCloseTo(START.x + 1 + STEP_LENGTH * 3);
    expect(prediction.motion.z).toBeCloseTo(START.z + STEP_LENGTH * 2);
    expect(prediction.motion.yaw).toBeCloseTo(0);
  });
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
    slashSteps: 4,
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
