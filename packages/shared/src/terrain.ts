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
 * @module shared/terrain What stands in the way of the players, and how it
 *   stops them.
 *
 * Everything here that decides where a player ends up uses only the
 * arithmetic that gives the same result to the last bit in every
 * JavaScript engine, so that a browser and the server agree exactly.
 */

import type { GroundVector } from './movement.ts';

/** The radius of the body of a player on the ground, in meters. */
export const PLAYER_RADIUS = 0.3;

/**
 * How far a player may reach into an obstacle and still count as touching
 * it only, in meters, to allow for rounding.
 */
const OVERLAP_TOLERANCE = 1e-9;

/** The most times a move is pushed out of the obstacles in its way. */
const PUSH_PASSES = 4;

/** The number of terms of the series for the sine and the cosine. */
const SERIES_TERMS = 12;

/**
 * How far apart a walk is looked at for whether it stays within a boundary
 * with waves, in meters.
 */
const BOUNDARY_PATH_STEP = 0.25;

/** A turn around the Y axis, as its cosine and its sine. */
export interface Turn {
  /** The cosine of the turn. */
  readonly cos: number;
  /** The sine of the turn. */
  readonly sin: number;
}

/** Where something stands on the ground, and which way it faces. */
export interface Pose {
  /** The position along the X axis, in meters. */
  readonly x: number;
  /** The position along the Z axis, in meters. */
  readonly z: number;
  /** The turn around the Y axis from facing +Z toward +X, in degrees. */
  readonly yaw: number;
}

/** A round shape on the ground. */
export interface CircleShape {
  /** The shape discriminator. */
  readonly shape: 'circle';
  /** The center along the X axis, in meters. */
  readonly x: number;
  /** The center along the Z axis, in meters. */
  readonly z: number;
  /** The radius, in meters. */
  readonly radius: number;
}

/** A rectangle on the ground, turned around its center. */
export interface BoxShape {
  /** The shape discriminator. */
  readonly shape: 'box';
  /** The center along the X axis, in meters. */
  readonly x: number;
  /** The center along the Z axis, in meters. */
  readonly z: number;
  /** Half the size along its own X axis, in meters. */
  readonly halfWidth: number;
  /** Half the size along its own Z axis, in meters. */
  readonly halfDepth: number;
  /** The turn around the Y axis from facing +Z toward +X, in degrees. */
  readonly yaw: number;
}

/** A shape on the ground that players cannot walk into. */
export type Shape = CircleShape | BoxShape;

/**
 * A wave in the edge of a boundary, which swells it in and out a whole
 * number of times around its middle.
 */
export interface BoundaryWave {
  /** How many times the wave goes in and out around the middle. */
  readonly order: number;
  /**
   * How far the wave swells the edge out toward +Z, along the cosine of
   * its order times the turn from +Z toward +X, in meters.
   */
  readonly cos: number;
  /**
   * How far the wave swells the edge out along the sine of its order
   * times the turn from +Z toward +X, in meters.
   */
  readonly sin: number;
}

/**
 * The edge on the ground around a middle that players cannot leave: a
 * circle, or a circle that wanders in and out with its waves.
 */
export interface Boundary {
  /** The middle along the X axis, in meters. */
  readonly x: number;
  /** The middle along the Z axis, in meters. */
  readonly z: number;
  /**
   * The radius of the circle, in meters: how far out the edge lies on
   * average.
   */
  readonly radius: number;
  /** The waves of the edge, none for a circle. */
  readonly waves?: readonly BoundaryWave[];
}

/** An obstacle, ready for the tests against it. */
interface Obstacle {
  /** The shape of the obstacle. */
  readonly shape: Shape;
  /** The turn of the shape, for a box. */
  readonly turn: Turn;
  /** The distance from the center of the shape to its farthest point. */
  readonly reach: number;
}

/** A point, as the position of a player that can be changed in place. */
interface Spot {
  /** The position along the X axis, in meters. */
  x: number;
  /** The position along the Z axis, in meters. */
  z: number;
}

/**
 * Finds the cosine and the sine of a turn, alike to the last bit in every
 * JavaScript engine, unlike `Math.cos` and `Math.sin`.
 *
 * @param {number} yaw - The turn, in degrees.
 * @returns {Turn} The turn, exact for every multiple of 90 degrees.
 */
export function findTurn(yaw: number): Turn {
  const quarters: number = Math.round(yaw / 90);
  const angle: number = ((yaw - quarters * 90) * Math.PI) / 180;
  const square: number = angle * angle;
  let sin: number = angle;
  let cos = 1;
  let sinTerm: number = angle;
  let cosTerm = 1;
  for (let n = 1; n <= SERIES_TERMS; n++) {
    sinTerm = (-sinTerm * square) / (2 * n * (2 * n + 1));
    cosTerm = (-cosTerm * square) / ((2 * n - 1) * 2 * n);
    sin += sinTerm;
    cos += cosTerm;
  }
  switch (((quarters % 4) + 4) % 4) {
    case 1:
      return { cos: -sin, sin: cos };
    case 2:
      return { cos: -cos, sin: -sin };
    case 3:
      return { cos: sin, sin: -cos };
    default:
      return { cos, sin };
  }
}

/**
 * Turns a vector on the ground around the Y axis, the way a model turns.
 *
 * @param {GroundVector} vector - The vector.
 * @param {Turn} turn - The turn.
 * @returns {GroundVector} The turned vector.
 */
export function turnVector(vector: GroundVector, turn: Turn): GroundVector {
  return {
    x: vector.x * turn.cos + vector.z * turn.sin,
    z: vector.z * turn.cos - vector.x * turn.sin,
  };
}

/**
 * Measures how far out from its middle the edge of a boundary lies in a
 * direction, alike to the last bit in every JavaScript engine.
 *
 * @param {Boundary} boundary - The boundary.
 * @param {GroundVector} direction - The direction, of any length but zero.
 * @returns {number} The distance from the middle to the edge, in meters,
 *   the radius of the boundary in any direction if it has no waves, or for
 *   a direction of zero length.
 */
export function measureBoundaryReach(
  boundary: Boundary,
  direction: GroundVector,
): number {
  const waves: readonly BoundaryWave[] = boundary.waves ?? [];
  const length: number = Math.sqrt(
    direction.x * direction.x + direction.z * direction.z,
  );
  if (waves.length === 0 || length === 0) {
    return boundary.radius;
  }
  const once: Turn = { cos: direction.z / length, sin: direction.x / length };
  const most: number = Math.max(
    ...waves.map((wave: BoundaryWave) => wave.order),
  );
  const turns: Turn[] = [{ cos: 1, sin: 0 }];
  for (let order = 1; order <= most; order++) {
    const last: Turn = turns[order - 1] ?? once;
    turns.push({
      cos: last.cos * once.cos - last.sin * once.sin,
      sin: last.sin * once.cos + last.cos * once.sin,
    });
  }
  let reach: number = boundary.radius;
  for (const wave of waves) {
    const turn: Turn = turns[wave.order] ?? once;
    reach += wave.cos * turn.cos + wave.sin * turn.sin;
  }
  return reach;
}

/**
 * Finds where a point of a model stands in the world.
 *
 * @param {Pose} pose - Where the model stands, and which way it faces.
 * @param {GroundVector} local - The point, as the model has it before it
 *   is placed.
 * @returns {GroundVector} The point in the world.
 */
export function placePoint(pose: Pose, local: GroundVector): GroundVector {
  const turned: GroundVector = turnVector(local, findTurn(pose.yaw));
  return { x: pose.x + turned.x, z: pose.z + turned.z };
}

/**
 * Finds where a shape of a model lies in the world.
 *
 * @param {Pose} pose - Where the model stands, and which way it faces.
 * @param {Shape} shape - The shape, as the model has it before it is
 *   placed.
 * @returns {Shape} The shape in the world.
 */
export function placeShape(pose: Pose, shape: Shape): Shape {
  const center: GroundVector = placePoint(pose, shape);
  if (shape.shape === 'circle') {
    return { ...shape, x: center.x, z: center.z };
  }
  return { ...shape, x: center.x, z: center.z, yaw: pose.yaw + shape.yaw };
}

/**
 * Measures how far a point is from a line segment.
 *
 * @param {number} x - The point along the X axis.
 * @param {number} z - The point along the Z axis.
 * @param {GroundVector} start - One end of the segment.
 * @param {GroundVector} end - The other end of the segment.
 * @returns {number} The distance.
 */
function measureFromSegment(
  x: number,
  z: number,
  start: GroundVector,
  end: GroundVector,
): number {
  const dx: number = end.x - start.x;
  const dz: number = end.z - start.z;
  const length: number = dx * dx + dz * dz;
  let along = 0;
  if (length > 0) {
    along = ((x - start.x) * dx + (z - start.z) * dz) / length;
    along = Math.min(Math.max(along, 0), 1);
  }
  const ex: number = x - (start.x + along * dx);
  const ez: number = z - (start.z + along * dz);
  return Math.sqrt(ex * ex + ez * ez);
}

/**
 * Measures how far a point is from a rectangle around the origin.
 *
 * @param {number} x - The point along the X axis.
 * @param {number} z - The point along the Z axis.
 * @param {number} halfWidth - Half the size of the rectangle along X.
 * @param {number} halfDepth - Half the size of the rectangle along Z.
 * @returns {number} The distance, or how deep the point is inside as a
 *   negative number.
 */
function measureFromBox(
  x: number,
  z: number,
  halfWidth: number,
  halfDepth: number,
): number {
  const outX: number = Math.abs(x) - halfWidth;
  const outZ: number = Math.abs(z) - halfDepth;
  if (outX <= 0 && outZ <= 0) {
    return Math.max(outX, outZ);
  }
  const ex: number = Math.max(outX, 0);
  const ez: number = Math.max(outZ, 0);
  return Math.sqrt(ex * ex + ez * ez);
}

/**
 * Tells whether a line segment crosses a rectangle around the origin.
 *
 * @param {GroundVector} start - One end of the segment.
 * @param {GroundVector} end - The other end of the segment.
 * @param {number} halfWidth - Half the size of the rectangle along X.
 * @param {number} halfDepth - Half the size of the rectangle along Z.
 * @returns {boolean} Whether any point of the segment is in the rectangle.
 */
function isSegmentInBox(
  start: GroundVector,
  end: GroundVector,
  halfWidth: number,
  halfDepth: number,
): boolean {
  let enter = 0;
  let leave = 1;
  const axes: [number, number, number][] = [
    [start.x, end.x - start.x, halfWidth],
    [start.z, end.z - start.z, halfDepth],
  ];
  for (const [from, change, half] of axes) {
    if (change === 0) {
      if (Math.abs(from) > half) {
        return false;
      }
      continue;
    }
    const first: number = (-half - from) / change;
    const second: number = (half - from) / change;
    enter = Math.max(enter, Math.min(first, second));
    leave = Math.min(leave, Math.max(first, second));
    if (enter > leave) {
      return false;
    }
  }
  return true;
}

/**
 * The ground the players walk on: the obstacles that stand in their way,
 * and the boundary they cannot leave.
 *
 * Players do not stand in the way of each other.
 */
export class Terrain {
  /** The shapes of the obstacles, in the world. */
  readonly shapes: readonly Shape[];
  /** The boundary the players cannot leave. */
  readonly boundary: Boundary;
  readonly #obstacles: readonly Obstacle[];

  /**
   * Lays out the ground.
   *
   * @param {readonly Shape[]} shapes - The shapes of the obstacles.
   * @param {Boundary} boundary - The boundary the players cannot leave.
   */
  constructor(shapes: readonly Shape[], boundary: Boundary) {
    this.shapes = shapes;
    this.boundary = boundary;
    this.#obstacles = shapes.map((shape: Shape): Obstacle => {
      if (shape.shape === 'circle') {
        return { shape, turn: { cos: 1, sin: 0 }, reach: shape.radius };
      }
      const { halfWidth, halfDepth } = shape;
      return {
        shape,
        turn: findTurn(shape.yaw),
        reach: Math.sqrt(halfWidth * halfWidth + halfDepth * halfDepth),
      };
    });
  }

  /**
   * Finds where a player that walks from one point toward another ends
   * up, with the obstacles in its way.
   *
   * A player that walks into an obstacle at an angle slides along it, and
   * one that walks straight into it stops.  A player stays where it is if
   * the obstacles leave it no room.
   *
   * @param {GroundVector} from - Where the player stands, clear of the
   *   obstacles.
   * @param {GroundVector} to - Where the player would be with nothing in its
   *   way.
   * @returns {GroundVector} Where the player ends up, clear of the
   *   obstacles and within the boundary.
   */
  resolveMove(from: GroundVector, to: GroundVector): GroundVector {
    const spot: Spot = { x: to.x, z: to.z };
    for (let pass = 0; pass < PUSH_PASSES; pass++) {
      let isPushed = false;
      for (const obstacle of this.#obstacles) {
        if (pushOut(spot, obstacle)) {
          isPushed = true;
        }
      }
      if (keepWithin(spot, this.boundary)) {
        isPushed = true;
      }
      if (!isPushed) {
        break;
      }
    }
    if (!this.isClear(spot)) {
      return { x: from.x, z: from.z };
    }
    return { x: spot.x, z: spot.z };
  }

  /**
   * Tells whether a player can stand at a point.
   *
   * @param {GroundVector} point - The point.
   * @param {number} [clearance] - The least room the player must have
   *   between itself and every obstacle and the boundary, in meters, or
   *   none by default, when merely touching is clear.
   * @returns {boolean} Whether the player has that room there.
   */
  isClear(point: GroundVector, clearance = 0): boolean {
    const least: number = PLAYER_RADIUS + clearance - OVERLAP_TOLERANCE;
    for (const { shape, turn, reach } of this.#obstacles) {
      const dx: number = point.x - shape.x;
      const dz: number = point.z - shape.z;
      if (Math.abs(dx) >= reach + least || Math.abs(dz) >= reach + least) {
        continue;
      }
      if (shape.shape === 'circle') {
        if (Math.sqrt(dx * dx + dz * dz) - shape.radius < least) {
          return false;
        }
        continue;
      }
      const local: GroundVector = turnBack(dx, dz, turn);
      if (
        measureFromBox(local.x, local.z, shape.halfWidth, shape.halfDepth) <
        least
      ) {
        return false;
      }
    }
    return isWithin(point, this.boundary, least);
  }

  /**
   * Tells whether a player can walk in a straight line from one point to
   * another without touching anything.
   *
   * @param {GroundVector} from - Where the walk starts.
   * @param {GroundVector} to - Where the walk ends.
   * @param {number} [clearance] - The least room the player must have
   *   along the way between itself and every obstacle and the boundary, in
   *   meters, or none by default, when merely touching is clear.
   * @returns {boolean} Whether the player has that room all the way.
   */
  isPathClear(
    from: GroundVector,
    to: GroundVector,
    clearance = 0,
  ): boolean {
    const least: number = PLAYER_RADIUS + clearance - OVERLAP_TOLERANCE;
    for (const { shape, turn, reach } of this.#obstacles) {
      const distance: number = measureFromSegment(shape.x, shape.z, from, to);
      if (distance >= reach + least) {
        continue;
      }
      if (shape.shape === 'circle') {
        if (distance - shape.radius < least) {
          return false;
        }
        continue;
      }
      const start: GroundVector = turnBack(
        from.x - shape.x,
        from.z - shape.z,
        turn,
      );
      const end: GroundVector = turnBack(to.x - shape.x, to.z - shape.z, turn);
      if (measureSegmentFromBox(start, end, shape) < least) {
        return false;
      }
    }
    return isPathWithin(from, to, this.boundary, least);
  }
}

/**
 * Turns an offset from the center of a box into the frame of the box.
 *
 * @param {number} dx - The offset along the X axis of the world.
 * @param {number} dz - The offset along the Z axis of the world.
 * @param {Turn} turn - The turn of the box.
 * @returns {GroundVector} The offset along the axes of the box.
 */
function turnBack(dx: number, dz: number, turn: Turn): GroundVector {
  return {
    x: dx * turn.cos - dz * turn.sin,
    z: dx * turn.sin + dz * turn.cos,
  };
}

/**
 * Measures how far a line segment is from a box, in the frame of the box.
 *
 * @param {GroundVector} start - One end of the segment.
 * @param {GroundVector} end - The other end of the segment.
 * @param {BoxShape} box - The box.
 * @returns {number} The least distance, or zero if they meet.
 */
function measureSegmentFromBox(
  start: GroundVector,
  end: GroundVector,
  box: BoxShape,
): number {
  const { halfWidth, halfDepth } = box;
  if (isSegmentInBox(start, end, halfWidth, halfDepth)) {
    return 0;
  }
  // Apart, the two come closest at an end of the segment or a corner.
  let least: number = Math.min(
    measureFromBox(start.x, start.z, halfWidth, halfDepth),
    measureFromBox(end.x, end.z, halfWidth, halfDepth),
  );
  for (const x of [-halfWidth, halfWidth]) {
    for (const z of [-halfDepth, halfDepth]) {
      least = Math.min(least, measureFromSegment(x, z, start, end));
    }
  }
  return least;
}

/**
 * Tells whether a player at a point has some room within the boundary.
 *
 * @param {GroundVector} point - The point.
 * @param {Boundary} boundary - The boundary.
 * @param {number} least - The room the center of the player must have from
 *   the boundary, in meters.
 * @returns {boolean} Whether it has.
 */
function isWithin(
  point: GroundVector,
  boundary: Boundary,
  least: number,
): boolean {
  const offset: GroundVector = {
    x: point.x - boundary.x,
    z: point.z - boundary.z,
  };
  const distance: number = Math.sqrt(
    offset.x * offset.x + offset.z * offset.z,
  );
  return distance <= measureBoundaryReach(boundary, offset) - least;
}

/**
 * Tells whether a player that walks in a straight line from one point to
 * another keeps some room within the boundary all the way.
 *
 * @param {GroundVector} from - Where the walk starts.
 * @param {GroundVector} to - Where the walk ends.
 * @param {Boundary} boundary - The boundary.
 * @param {number} least - The room the center of the player must have from
 *   the boundary, in meters.
 * @returns {boolean} Whether it keeps that room at both ends, and, within
 *   a boundary with waves, at every point along the walk a quarter of a
 *   meter or less from the next.
 */
function isPathWithin(
  from: GroundVector,
  to: GroundVector,
  boundary: Boundary,
  least: number,
): boolean {
  if (!isWithin(from, boundary, least) || !isWithin(to, boundary, least)) {
    return false;
  }
  // A walk between two points within a circle stays within it.
  if ((boundary.waves ?? []).length === 0) {
    return true;
  }
  const dx: number = to.x - from.x;
  const dz: number = to.z - from.z;
  const steps: number = Math.ceil(
    Math.sqrt(dx * dx + dz * dz) / BOUNDARY_PATH_STEP,
  );
  for (let step = 1; step < steps; step++) {
    const share: number = step / steps;
    const point: GroundVector = {
      x: from.x + dx * share,
      z: from.z + dz * share,
    };
    if (!isWithin(point, boundary, least)) {
      return false;
    }
  }
  return true;
}

/**
 * Pushes a player out of an obstacle it reaches into, the shortest way.
 *
 * @param {Spot} spot - Where the player is, which changes to where it is
 *   pushed to.
 * @param {Obstacle} obstacle - The obstacle.
 * @returns {boolean} Whether the player was pushed.
 */
function pushOut(spot: Spot, obstacle: Obstacle): boolean {
  const { shape, turn, reach } = obstacle;
  const dx: number = spot.x - shape.x;
  const dz: number = spot.z - shape.z;
  const limit: number = reach + PLAYER_RADIUS;
  if (Math.abs(dx) >= limit || Math.abs(dz) >= limit) {
    return false;
  }
  if (shape.shape === 'circle') {
    const least: number = shape.radius + PLAYER_RADIUS;
    const square: number = dx * dx + dz * dz;
    if (square >= least * least) {
      return false;
    }
    const distance: number = Math.sqrt(square);
    if (distance === 0) {
      spot.x = shape.x + least;
      return true;
    }
    spot.x = shape.x + (dx / distance) * least;
    spot.z = shape.z + (dz / distance) * least;
    return true;
  }
  const { halfWidth, halfDepth } = shape;
  const local: GroundVector = turnBack(dx, dz, turn);
  const nearX: number = Math.min(Math.max(local.x, -halfWidth), halfWidth);
  const nearZ: number = Math.min(Math.max(local.z, -halfDepth), halfDepth);
  const ex: number = local.x - nearX;
  const ez: number = local.z - nearZ;
  const square: number = ex * ex + ez * ez;
  if (square >= PLAYER_RADIUS * PLAYER_RADIUS) {
    return false;
  }
  let pushed: GroundVector;
  if (square > 0) {
    const distance: number = Math.sqrt(square);
    pushed = {
      x: nearX + (ex / distance) * PLAYER_RADIUS,
      z: nearZ + (ez / distance) * PLAYER_RADIUS,
    };
  } else if (halfWidth - Math.abs(local.x) <= halfDepth - Math.abs(local.z)) {
    const side: number = local.x < 0 ? -1 : 1;
    pushed = { x: side * (halfWidth + PLAYER_RADIUS), z: local.z };
  } else {
    const side: number = local.z < 0 ? -1 : 1;
    pushed = { x: local.x, z: side * (halfDepth + PLAYER_RADIUS) };
  }
  const offset: GroundVector = turnVector(pushed, turn);
  spot.x = shape.x + offset.x;
  spot.z = shape.z + offset.z;
  return true;
}

/**
 * Pulls a player back within the boundary, if it has stepped out.
 *
 * @param {Spot} spot - Where the player is, which changes to where it is
 *   pulled back to.
 * @param {Boundary} boundary - The boundary.
 * @returns {boolean} Whether the player was pulled back.
 */
function keepWithin(spot: Spot, boundary: Boundary): boolean {
  const dx: number = spot.x - boundary.x;
  const dz: number = spot.z - boundary.z;
  const most: number =
    measureBoundaryReach(boundary, { x: dx, z: dz }) - PLAYER_RADIUS;
  const square: number = dx * dx + dz * dz;
  if (square <= most * most) {
    return false;
  }
  const distance: number = Math.sqrt(square);
  spot.x = boundary.x + (dx / distance) * most;
  spot.z = boundary.z + (dz / distance) * most;
  return true;
}
