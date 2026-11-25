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
 * @module client/obstacle-outlines Drawing on the ground what stands in the
 *   way of the players.
 */

import {
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineLoop,
  Vector3,
} from 'three';

import {
  findCorridorMouth,
  measureBoundaryReach,
  placePoint,
} from '@clovervale/shared';
import type {
  Boundary,
  BoundaryCorridor,
  GroundVector,
  Shape,
  Terrain,
} from '@clovervale/shared';

/** The color of the outline of an obstacle. */
const OBSTACLE_COLOR = '#d6283c';
/** The color of the outline of the boundary. */
const BOUNDARY_COLOR = '#1f4fd8';
/** The height of the outlines above the ground, in meters. */
const OUTLINE_HEIGHT = 0.02;
/** The length of a side of the outline of a circle at most, in meters. */
const ARC_LENGTH = 0.25;
/** The fewest sides of the outline of a circle. */
const MIN_ARC_COUNT = 16;

/**
 * Lists the corners of the outline of a circle.
 *
 * @param {GroundVector} center - The center of the circle.
 * @param {number} radius - The radius of the circle.
 * @returns {GroundVector[]} The corners, all on the circle.
 */
function listCirclePoints(
  center: GroundVector,
  radius: number,
): GroundVector[] {
  const count: number = Math.max(
    MIN_ARC_COUNT,
    Math.ceil((2 * Math.PI * radius) / ARC_LENGTH),
  );
  return Array.from({ length: count }, (_, index: number) => {
    const angle: number = (2 * Math.PI * index) / count;
    return {
      x: center.x + radius * Math.sin(angle),
      z: center.z + radius * Math.cos(angle),
    };
  });
}

/**
 * Lists the corners of the outline of a boundary, the corners of its road
 * among them, if it has one.
 *
 * @param {Boundary} boundary - The boundary.
 * @returns {GroundVector[]} The corners, all on its edge, in order around
 *   it.
 */
function listBoundaryPoints(boundary: Boundary): GroundVector[] {
  let offsets: GroundVector[] = listCirclePoints(
    { x: 0, z: 0 },
    boundary.radius,
  );
  const corridor: BoundaryCorridor | undefined = boundary.corridor;
  if (corridor !== undefined) {
    const right: GroundVector = findCorridorMouth(boundary, 1);
    const left: GroundVector = findCorridorMouth(boundary, -1);
    const start: number = Math.atan2(right.x, right.z);
    const end: number = Math.atan2(left.x, left.z) + 2 * Math.PI;
    offsets = [
      { x: corridor.halfWidth, z: corridor.length },
      right,
      ...offsets.filter((point: GroundVector) => {
        const turn: number = Math.atan2(point.x, point.z);
        const around: number = turn < 0 ? turn + 2 * Math.PI : turn;
        return around > start && around < end;
      }),
      left,
      { x: -corridor.halfWidth, z: corridor.length },
    ];
  }
  return offsets.map((point: GroundVector) => {
    const scale: number =
      measureBoundaryReach(boundary, point) / Math.hypot(point.x, point.z);
    return {
      x: boundary.x + point.x * scale,
      z: boundary.z + point.z * scale,
    };
  });
}

/**
 * Lists the corners of the outline of a shape.
 *
 * @param {Shape} shape - The shape.
 * @returns {GroundVector[]} The corners, the four corners of a box or
 *   points on a circle.
 */
function listShapePoints(shape: Shape): GroundVector[] {
  if (shape.shape === 'circle') {
    return listCirclePoints(shape, shape.radius);
  }
  const { halfWidth, halfDepth } = shape;
  return [
    { x: -halfWidth, z: -halfDepth },
    { x: halfWidth, z: -halfDepth },
    { x: halfWidth, z: halfDepth },
    { x: -halfWidth, z: halfDepth },
  ].map((corner: GroundVector) => placePoint(shape, corner));
}

/**
 * Creates a closed line on the ground.
 *
 * @param {readonly GroundVector[]} points - The corners of the line.
 * @param {LineBasicMaterial} material - The material of the line.
 * @returns {LineLoop} The line.
 */
function createOutline(
  points: readonly GroundVector[],
  material: LineBasicMaterial,
): LineLoop {
  const geometry = new BufferGeometry().setFromPoints(
    points.map(({ x, z }: GroundVector) => new Vector3(x, OUTLINE_HEIGHT, z)),
  );
  const outline = new LineLoop(geometry, material);
  // Drawn last, the outline shows through the models standing on it.
  outline.renderOrder = 1;
  return outline;
}

/**
 * Creates the outlines on the ground of the obstacles of a piece of ground,
 * each in one color, and of its boundary, in another, which show through
 * whatever stands on them.
 *
 * @param {Terrain} terrain - The ground.
 * @returns {Group} The outlines, the boundary last.
 */
export function createObstacleOutlines(terrain: Terrain): Group {
  const group = new Group();
  const obstacleMaterial = new LineBasicMaterial({
    color: OBSTACLE_COLOR,
    depthTest: false,
  });
  for (const shape of terrain.shapes) {
    group.add(createOutline(listShapePoints(shape), obstacleMaterial));
  }
  const boundary: Boundary = terrain.boundary;
  group.add(
    createOutline(
      listBoundaryPoints(boundary),
      new LineBasicMaterial({ color: BOUNDARY_COLOR, depthTest: false }),
    ),
  );
  return group;
}
