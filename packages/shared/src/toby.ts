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
 * @module shared/toby Toby, the child who hunts for four-leaf clover
 *   between the cottage west of the plaza and the gate, and how he gets in
 *   the way of the players.
 *
 * His course is fixed: where he is, which way he faces and what he is doing
 * at any step of the simulation follow from the number of the step alone,
 * so that the server and its peers know them alike without being told.
 * Everything here that decides where he is and where a player ends up uses
 * only the arithmetic that gives the same result to the last bit in every
 * JavaScript engine: adding, subtracting, multiplying, dividing and square
 * roots.  His run slants, so the places it passes through are not exact in
 * floating point, but the server and its peers work them out alike.
 */

import { CLOVER_PATCHES } from './items.ts';
import { SIMULATION_RATE, WALK_SPEED, findYaw } from './movement.ts';
import type { GroundVector } from './movement.ts';
import type { Pusher } from './pusher.ts';
import { PLAYER_RADIUS } from './terrain.ts';
import type { Pose, Terrain } from './terrain.ts';

/** The radius of the body of Toby on the ground, in meters. */
export const TOBY_RADIUS = 0.25;

/**
 * The message of the line Toby exclaims to the players nearby as he finds
 * a four-leaf clover.
 */
export const TOBY_FOUND_LINE = 'villager.toby.found';

/** What Toby can be doing, in the order he does it at each end of his run. */
export const TOBY_ACTIVITIES = [
  'Squat',
  'Pick',
  'Rise',
  'Turn',
  'Run',
] as const;

/**
 * What Toby is doing: squatting down at a patch of clover, picking at it,
 * standing up, turning around, or running to the other patch.
 */
export type TobyActivity = (typeof TOBY_ACTIVITIES)[number];

/** The number of simulation steps each of the activities of Toby lasts. */
export const TOBY_ACTIVITY_STEPS: Readonly<Record<TobyActivity, number>> = {
  Squat: 10,
  Pick: 80,
  Rise: 10,
  Turn: 12,
  Run: 35,
};

/**
 * The middles of the patches of clover Toby picks at, at the two ends of
 * his run: the one on the grass between the cottage west of the plaza and
 * the fence, and the one just inside the gate, by the village sign.
 */
export const TOBY_CLOVERS: readonly [GroundVector, GroundVector] = [
  { x: -8, z: -0.2 },
  { x: -3.6, z: 3.4 },
];

/**
 * The numbers of the patches of clover Toby picks at, among
 * {@link CLOVER_PATCHES}, at the two ends of his run, in the order of
 * {@link TOBY_CLOVERS}.
 */
export const TOBY_PATCHES: readonly [number, number] = [
  findPatchNumber(TOBY_CLOVERS[0]),
  findPatchNumber(TOBY_CLOVERS[1]),
];

/**
 * How many steps into his picking at a patch of clover Toby's hand grabs
 * at the four-leaf clover of the patch, as his hand reaches into the
 * leaves for the second time.
 */
export const TOBY_GRAB_STEPS = 40;

/**
 * How many steps into his picking at a patch of clover Toby has put away a
 * four-leaf clover he has grabbed, having lifted it to look at it.
 */
export const TOBY_STOW_STEPS = 70;

/**
 * How far ahead of Toby the middle of the patch of clover he picks at lies
 * as he squats, in meters: just beyond his reach, so that he squats at its
 * edge with the clover in front of him.
 */
const CLOVER_DISTANCE = 0.625;

/**
 * How far around Toby turns at each end, in degrees, the way the yaw goes:
 * so that he faces the side of his run toward the fence halfway.
 */
const TURN_SWEEPS: readonly [number, number] = [180, -180];

/** The number of steps of the half of a loop that starts at one end. */
const HALF_LOOP_STEPS: number = TOBY_ACTIVITIES.reduce(
  (sum: number, activity: TobyActivity) => sum + TOBY_ACTIVITY_STEPS[activity],
  0,
);

/** The number of simulation steps of a whole loop of the course of Toby. */
export const TOBY_LOOP_STEPS: number = 2 * HALF_LOOP_STEPS;

/** The distance between the middles of the two patches, in meters. */
const PATCH_DISTANCE: number = Math.sqrt(
  (TOBY_CLOVERS[1].x - TOBY_CLOVERS[0].x) *
    (TOBY_CLOVERS[1].x - TOBY_CLOVERS[0].x) +
    (TOBY_CLOVERS[1].z - TOBY_CLOVERS[0].z) *
      (TOBY_CLOVERS[1].z - TOBY_CLOVERS[0].z),
);

/**
 * The way from the first patch to the second, and so of his run from its
 * first end to its second, one meter long.
 */
const COURSE: GroundVector = {
  x: (TOBY_CLOVERS[1].x - TOBY_CLOVERS[0].x) / PATCH_DISTANCE,
  z: (TOBY_CLOVERS[1].z - TOBY_CLOVERS[0].z) / PATCH_DISTANCE,
};

/**
 * Where Toby squats at each end of his run, at the edge of each patch, on
 * the straight line between them, with the patch in front of him: the end
 * by the cottage first.  He runs between the two in a straight line,
 * slanting from the grass by the cottage toward the gate.
 */
export const TOBY_ENDS: readonly [GroundVector, GroundVector] = [
  {
    x: TOBY_CLOVERS[0].x + COURSE.x * CLOVER_DISTANCE,
    z: TOBY_CLOVERS[0].z + COURSE.z * CLOVER_DISTANCE,
  },
  {
    x: TOBY_CLOVERS[1].x - COURSE.x * CLOVER_DISTANCE,
    z: TOBY_CLOVERS[1].z - COURSE.z * CLOVER_DISTANCE,
  },
];

/** The length of the run of Toby from one end to the other, in meters. */
const RUN_LENGTH: number = PATCH_DISTANCE - 2 * CLOVER_DISTANCE;

/** The speed Toby runs at, in meters per second. */
export const TOBY_RUN_SPEED: number =
  RUN_LENGTH / (TOBY_ACTIVITY_STEPS.Run / SIMULATION_RATE);

/**
 * The side Toby pushes a player square in his way to, across his run, one
 * meter long: toward the back of the village.
 */
const ASIDE: GroundVector = { x: COURSE.z, z: -COURSE.x };

/** The least distance between the centers of Toby and a player, in meters. */
const REACH: number = TOBY_RADIUS + PLAYER_RADIUS;

/**
 * How far a player may reach into Toby and still count as touching him
 * only, in meters, to allow for rounding.
 */
const OVERLAP_TOLERANCE = 1e-9;

/** Where Toby is at a moment, which way he faces, and what he is doing. */
export interface TobyPose extends Pose {
  /** What he is doing. */
  readonly activity: TobyActivity;
  /** How long he has been doing it, in seconds. */
  readonly elapsed: number;
}

/** A moment Toby's hand grabs at the four-leaf clover of a patch. */
export interface TobyGrab {
  /** The number of the step at which his hand grabs. */
  readonly step: number;
  /** The number of the patch, among {@link CLOVER_PATCHES}. */
  readonly patch: number;
}

/**
 * Finds the number of the patch of clover whose middle is at a point.
 *
 * @param {GroundVector} middle - The middle of the patch.
 * @returns {number} The number of the patch among {@link CLOVER_PATCHES}.
 * @throws {Error} If no patch has its middle there.
 */
function findPatchNumber(middle: GroundVector): number {
  const patch: number = CLOVER_PATCHES.findIndex(
    ({ x, z }: GroundVector) => x === middle.x && z === middle.z,
  );
  if (patch < 0) {
    throw new Error(
      `There is no patch of clover at ${String(middle.x)}, ` +
        `${String(middle.z)}.`,
    );
  }
  return patch;
}

/**
 * Eases a share of a move in and out.
 *
 * @param {number} share - How far the move has gone, from 0 to 1.
 * @returns {number} How far it has gone, eased, from 0 to 1.
 */
function easeShare(share: number): number {
  return share * share * (3 - 2 * share);
}

/**
 * Finds where Toby is, which way he faces and what he is doing at a step of
 * the simulation.
 *
 * He goes around the same loop forever, from step 0 on, as the server
 * counts its steps.  At the end of his run by the cottage, he squats down
 * at the edge of a patch of clover, facing it, picks at the leaves for a
 * few seconds, stands up, turns around, through facing the side of his run
 * toward the fence, and runs in a straight line to the other end, where he
 * does the same, and runs back.  He stays still but for his run.
 *
 * @param {number} step - The number of the step, which may fall between
 *   two steps, to show him between them.
 * @returns {TobyPose} Where he is, which way he faces, and what he is
 *   doing and for how long he has done it, the same for the same step
 *   everywhere.
 */
export function findTobyPose(step: number): TobyPose {
  const phase: number =
    step - Math.floor(step / TOBY_LOOP_STEPS) * TOBY_LOOP_STEPS;
  const end: 0 | 1 = phase < HALF_LOOP_STEPS ? 0 : 1;
  const from: GroundVector = TOBY_ENDS[end];
  const to: GroundVector = TOBY_ENDS[end === 0 ? 1 : 0];
  const outward: number = end === 0 ? -1 : 1;
  const facingClover: number = findYaw({
    x: COURSE.x * outward,
    z: COURSE.z * outward,
  });
  let since: number = phase - end * HALF_LOOP_STEPS;
  for (const activity of TOBY_ACTIVITIES) {
    const steps: number = TOBY_ACTIVITY_STEPS[activity];
    if (since >= steps && activity !== 'Run') {
      since -= steps;
      continue;
    }
    const elapsed: number = since / SIMULATION_RATE;
    if (activity === 'Turn') {
      const yaw: number =
        facingClover + TURN_SWEEPS[end] * easeShare(since / steps);
      return { x: from.x, z: from.z, yaw, activity, elapsed };
    }
    if (activity === 'Run') {
      const share: number = since / steps;
      return {
        x: from.x + (to.x - from.x) * share,
        z: from.z + (to.z - from.z) * share,
        yaw: facingClover + TURN_SWEEPS[end],
        activity,
        elapsed,
      };
    }
    return { x: from.x, z: from.z, yaw: facingClover, activity, elapsed };
  }
  // Every phase falls within one of the activities.
  throw new Error(`Toby has no place at step ${String(step)}.`);
}

/**
 * Finds the latest moment, at a step of the simulation or before it, that
 * Toby's hand grabs at the four-leaf clover of the patch he picks at.
 *
 * His hand grabs {@link TOBY_GRAB_STEPS} steps into each time he picks at
 * a patch, once at each end of his run, as {@link findTobyPose} has him.
 *
 * @param {number} step - The number of the step, which may fall between
 *   two steps.
 * @returns {TobyGrab} The step his hand grabs at, no later than the step
 *   given, and the patch it grabs at, the same for the same step
 *   everywhere.
 */
export function findTobyGrab(step: number): TobyGrab {
  const offset: number = TOBY_ACTIVITY_STEPS.Squat + TOBY_GRAB_STEPS;
  const half: number = Math.floor(
    (Math.floor(step) - offset) / HALF_LOOP_STEPS,
  );
  const end: number = half - Math.floor(half / 2) * 2;
  return {
    step: half * HALF_LOOP_STEPS + offset,
    patch: TOBY_PATCHES[end === 0 ? 0 : 1],
  };
}

/**
 * Measures how far a point is from Toby.
 *
 * @param {GroundVector} point - The point.
 * @param {GroundVector} toby - Where Toby is.
 * @returns {number} The distance between the two, in meters.
 */
function measureFrom(point: GroundVector, toby: GroundVector): number {
  const dx: number = point.x - toby.x;
  const dz: number = point.z - toby.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Pushes a player out of the way of Toby, if it is in his way.
 *
 * A player that Toby reaches into is pushed straight out to the side it is
 * on, across his run, until it only touches him; a player square in his
 * way is pushed toward the back of the village.  It is never pushed to the
 * other side.  Walls and the edge of the village stop the push as they stop
 * a walk, and a player with no room on its side is left overlapping him
 * rather than pushed into or through anything, even if there is open ground
 * on the other side.
 *
 * @param {GroundVector} position - Where the player stands, clear of the
 *   obstacles.
 * @param {GroundVector} toby - Where Toby is.
 * @param {Terrain} terrain - The ground the player stands on.
 * @returns {GroundVector} Where the player ends up, clear of the obstacles
 *   and within the boundary: where it was, if Toby does not reach into it.
 */
export function pushAside(
  position: GroundVector,
  toby: GroundVector,
  terrain: Terrain,
): GroundVector {
  const dx: number = position.x - toby.x;
  const dz: number = position.z - toby.z;
  const least: number = REACH - OVERLAP_TOLERANCE;
  if (dx * dx + dz * dz >= least * least) {
    return position;
  }
  const along: number = dx * COURSE.x + dz * COURSE.z;
  const across: number = dx * ASIDE.x + dz * ASIDE.z;
  // A player square in his way, but for rounding, goes the one way.
  const side: number = across < -OVERLAP_TOLERANCE ? -1 : 1;
  const shift: number =
    side * Math.sqrt(REACH * REACH - along * along) - across;
  const pushed: GroundVector = terrain.resolveMove(position, {
    x: position.x + ASIDE.x * shift,
    z: position.z + ASIDE.z * shift,
  });
  // A push that would take the player past something stops short of it.
  return terrain.isPathClear(position, pushed) ? pushed : position;
}

/**
 * Finds where a player that walks from one point toward another ends up,
 * with the obstacles and Toby in its way.
 *
 * Toby stops the player as the obstacles do: a player that walks into him
 * at an angle slides around him, and one that walks straight into him stops.
 * A player that overlaps him already, having had no room to be pushed out
 * of his way, may walk anywhere that does not take it further into him.
 *
 * @param {GroundVector} from - Where the player stands, clear of the
 *   obstacles.
 * @param {GroundVector} to - Where the player would be with nothing in its
 *   way.
 * @param {GroundVector} toby - Where Toby is.
 * @param {Terrain} terrain - The ground the player walks on.
 * @returns {GroundVector} Where the player ends up, clear of the obstacles
 *   and within the boundary.
 */
export function resolveWalk(
  from: GroundVector,
  to: GroundVector,
  toby: GroundVector,
  terrain: Terrain,
): GroundVector {
  const walked: GroundVector = terrain.resolveMove(from, to);
  const distance: number = measureFrom(walked, toby);
  if (distance >= REACH - OVERLAP_TOLERANCE) {
    return walked;
  }
  const before: number = measureFrom(from, toby);
  if (before < REACH - OVERLAP_TOLERANCE) {
    return distance >= before ? walked : from;
  }
  // A walk that stops at his very middle is pushed back the way it came.
  const out: GroundVector =
    distance === 0
      ? from
      : {
          x: toby.x + ((walked.x - toby.x) / distance) * REACH,
          z: toby.z + ((walked.z - toby.z) / distance) * REACH,
        };
  const slid: GroundVector = terrain.resolveMove(from, out);
  return measureFrom(slid, toby) >= REACH - OVERLAP_TOLERANCE ? slid : from;
}

/**
 * Tells how far Toby can have pushed a player within a time before a step,
 * by where the player is after the step.
 *
 * @param {GroundVector} position - Where the player is after the step.
 * @param {number} step - The number of the step.
 * @param {number} span - The time, in milliseconds.
 * @returns {number} The furthest he pushes a player as he passes it, in
 *   meters, if the player is near enough to him to have been pushed within
 *   the time, or 0 otherwise.
 */
export function measurePushReach(
  position: GroundVector,
  step: number,
  span: number,
): number {
  const near: number = REACH + ((TOBY_RUN_SPEED + WALK_SPEED) * span) / 1000;
  return measureFrom(position, findTobyPose(step)) <= near ? REACH : 0;
}

/**
 * How Toby gets in the way of the players: where his course has him, as
 * {@link findTobyPose} tells, how he pushes a player aside, as
 * {@link pushAside} tells, and how he stops one that walks into him, as
 * {@link resolveWalk} tells, with his run as the fastest he goes.
 */
export const TOBY_PUSHER: Pusher = {
  reach: REACH,
  speed: TOBY_RUN_SPEED,
  locate: findTobyPose,
  pushAside,
  resolveWalk,
};
