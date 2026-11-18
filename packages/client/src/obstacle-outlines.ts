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

import { placePoint } from '@clovervale/shared';
import type {
  Boundary,
  GroundVector,
  Shape,
  Terrain,
} from '@clovervale/shared';

/** The colour of the outline of an obstacle. */
const OBSTACLE_COLOUR = '#d6283c';
/** The colour of the outline of the boundary. */
const BOUNDARY_COLOUR = '#1f4fd8';
/** The height of the outlines above the ground, in metres. */
const OUTLINE_HEIGHT = 0.02;
/** The length of a side of the outline of a circle at most, in metres. */
const ARC_LENGTH = 0.25;
/** The fewest sides of the outline of a circle. */
const MIN_ARC_COUNT = 16;

/**
 * Lists the corners of the outline of a circle.
 *
 * @param {GroundVector} centre - The centre of the circle.
 * @param {number} radius - The radius of the circle.
 * @returns {GroundVector[]} The corners, all on the circle.
 */
function listCirclePoints(
  centre: GroundVector,
  radius: number,
): GroundVector[] {
  const count: number = Math.max(
    MIN_ARC_COUNT,
    Math.ceil((2 * Math.PI * radius) / ARC_LENGTH),
  );
  return Array.from({ length: count }, (_, index: number) => {
    const angle: number = (2 * Math.PI * index) / count;
    return {
      x: centre.x + radius * Math.sin(angle),
      z: centre.z + radius * Math.cos(angle),
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
 * each in one colour, and of its boundary, in another, which show through
 * whatever stands on them.
 *
 * @param {Terrain} terrain - The ground.
 * @returns {Group} The outlines, the boundary last.
 */
export function createObstacleOutlines(terrain: Terrain): Group {
  const group = new Group();
  const obstacleMaterial = new LineBasicMaterial({
    color: OBSTACLE_COLOUR,
    depthTest: false,
  });
  for (const shape of terrain.shapes) {
    group.add(createOutline(listShapePoints(shape), obstacleMaterial));
  }
  const boundary: Boundary = terrain.boundary;
  group.add(
    createOutline(
      listCirclePoints(boundary, boundary.radius),
      new LineBasicMaterial({ color: BOUNDARY_COLOUR, depthTest: false }),
    ),
  );
  return group;
}
