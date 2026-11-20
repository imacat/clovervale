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
 * @module shared/navigation Finding a way around the obstacles.
 */

import type { GroundVector } from './movement.ts';
import { PLAYER_RADIUS, placePoint } from './terrain.ts';
import type { Shape, Terrain } from './terrain.ts';
import { VILLAGE_TERRAIN } from './village-layout.ts';
import { findMapTerrain } from './world-map.ts';
import type { MapId } from './world-map.ts';

/**
 * The least room a player has between itself and anything in its way, as
 * it walks from one waypoint to another, in metres.
 */
export const WAYPOINT_CLEARANCE = 0.1;

/** The number of waypoints around a round obstacle. */
const CIRCLE_WAYPOINTS = 8;

/** A waypoint and the waypoints a player can walk to straight from it. */
interface Node {
  /** Where the waypoint is. */
  readonly point: GroundVector;
  /** The waypoints within straight reach, and how far each is. */
  readonly links: Link[];
}

/** A straight walk from one waypoint to another. */
interface Link {
  /** The index of the waypoint walked to. */
  readonly index: number;
  /** The length of the walk, in metres. */
  readonly distance: number;
}

/**
 * Measures how far apart two points are.
 *
 * @param {GroundVector} a - One point.
 * @param {GroundVector} b - The other point.
 * @returns {number} The distance between them, in metres.
 */
function measureDistance(a: GroundVector, b: GroundVector): number {
  const dx: number = a.x - b.x;
  const dz: number = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Places the waypoints around an obstacle: one off each corner of a box,
 * and a ring of them around a circle, each so far out that a player that
 * walks from one to the next has room to spare.
 *
 * @param {Shape} shape - The obstacle.
 * @returns {GroundVector[]} The waypoints.
 */
function placeShapeWaypoints(shape: Shape): GroundVector[] {
  const room: number = PLAYER_RADIUS + 2 * WAYPOINT_CLEARANCE;
  if (shape.shape === 'box') {
    const width: number = shape.halfWidth + room;
    const depth: number = shape.halfDepth + room;
    return [
      { x: -width, z: -depth },
      { x: width, z: -depth },
      { x: width, z: depth },
      { x: -width, z: depth },
    ].map((corner: GroundVector) => placePoint(shape, corner));
  }
  const reach: number =
    (shape.radius + room) / Math.cos(Math.PI / CIRCLE_WAYPOINTS);
  return Array.from({ length: CIRCLE_WAYPOINTS }, (_, index: number) => {
    const angle: number = (2 * Math.PI * index) / CIRCLE_WAYPOINTS;
    return {
      x: shape.x + reach * Math.sin(angle),
      z: shape.z + reach * Math.cos(angle),
    };
  });
}

/**
 * Places waypoints around the obstacles of a piece of ground.
 *
 * @param {Terrain} terrain - The ground.
 * @returns {GroundVector[]} The waypoints, each where a player has room to
 *   spare.
 */
export function placeWaypoints(terrain: Terrain): GroundVector[] {
  return terrain.shapes
    .flatMap(placeShapeWaypoints)
    .filter((point: GroundVector) =>
      terrain.isClear(point, WAYPOINT_CLEARANCE),
    );
}

/**
 * A graph of waypoints on a piece of ground, linked where a player can
 * walk straight from one to another, for finding the shortest way around
 * the obstacles.
 */
export class NavigationGraph {
  readonly #terrain: Terrain;
  readonly #nodes: readonly Node[];

  /**
   * Links the waypoints of a piece of ground.
   *
   * @param {Terrain} terrain - The ground.
   * @param {readonly GroundVector[]} [waypoints] - The waypoints, or ones
   *   placed around the obstacles by default.
   */
  constructor(
    terrain: Terrain,
    waypoints: readonly GroundVector[] = placeWaypoints(terrain),
  ) {
    this.#terrain = terrain;
    const nodes: Node[] = waypoints.map((point: GroundVector) => ({
      point,
      links: [],
    }));
    nodes.forEach((node: Node, index: number) => {
      nodes.slice(index + 1).forEach((next: Node, offset: number) => {
        if (terrain.isPathClear(node.point, next.point, WAYPOINT_CLEARANCE)) {
          const distance: number = measureDistance(node.point, next.point);
          node.links.push({ index: index + 1 + offset, distance });
          next.links.push({ index, distance });
        }
      });
    });
    this.#nodes = nodes;
  }

  /**
   * The waypoints of the graph.
   *
   * @returns {GroundVector[]} The waypoints.
   */
  get waypoints(): GroundVector[] {
    return this.#nodes.map((node: Node) => node.point);
  }

  /**
   * Finds the shortest way from one point to another over the waypoints.
   *
   * @param {GroundVector} from - Where the way starts.
   * @param {GroundVector} to - Where the way is to end.
   * @returns {GroundVector[] | null} The points to walk to, one straight
   *   walk after another, the last of which is the end, or `null` if there
   *   is no such way.  A player that walks it touches nothing, and keeps
   *   room to spare from anything between two waypoints.
   */
  findPath(from: GroundVector, to: GroundVector): GroundVector[] | null {
    if (this.#terrain.isPathClear(from, to)) {
      return [{ x: to.x, z: to.z }];
    }
    const count: number = this.#nodes.length;
    const costs: number[] = this.#nodes.map((node: Node) =>
      this.#terrain.isPathClear(from, node.point)
        ? measureDistance(from, node.point)
        : Infinity,
    );
    const previous: number[] = new Array<number>(count).fill(-1);
    const isDone: boolean[] = new Array<boolean>(count).fill(false);
    let best = Infinity;
    let last = -1;
    for (;;) {
      let current = -1;
      for (let index = 0; index < count; index++) {
        if (
          !isDone[index] &&
          (costs[index] ?? Infinity) < (costs[current] ?? Infinity)
        ) {
          current = index;
        }
      }
      const cost: number = costs[current] ?? Infinity;
      if (current === -1 || cost >= best) {
        break;
      }
      isDone[current] = true;
      const node: Node | undefined = this.#nodes[current];
      if (node === undefined) {
        break;
      }
      if (this.#terrain.isPathClear(node.point, to)) {
        const total: number = cost + measureDistance(node.point, to);
        if (total < best) {
          best = total;
          last = current;
        }
      }
      for (const { index, distance } of node.links) {
        if (!isDone[index] && cost + distance < (costs[index] ?? Infinity)) {
          costs[index] = cost + distance;
          previous[index] = current;
        }
      }
    }
    if (last === -1) {
      return null;
    }
    const path: GroundVector[] = [{ x: to.x, z: to.z }];
    for (let index = last; index !== -1; index = previous[index] ?? -1) {
      const node: Node | undefined = this.#nodes[index];
      if (node !== undefined) {
        path.unshift(node.point);
      }
    }
    return path;
  }
}

/** The graph of the village, once it is needed. */
let villageGraph: NavigationGraph | null = null;

/**
 * Finds the shortest way from one point of the village to another, around
 * its obstacles.
 *
 * @param {GroundVector} from - Where the way starts.
 * @param {GroundVector} to - Where the way is to end.
 * @returns {GroundVector[] | null} The points to walk to, one straight walk
 *   after another, the last of which is the end, or `null` if there is no
 *   such way.  A player that walks it touches nothing.
 */
export function findVillagePath(
  from: GroundVector,
  to: GroundVector,
): GroundVector[] | null {
  villageGraph ??= new NavigationGraph(VILLAGE_TERRAIN);
  return villageGraph.findPath(from, to);
}

/** The graph of each map, once it is needed. */
const mapGraphs = new Map<MapId, NavigationGraph>();

/**
 * Finds the shortest way from one point of a map to another, around its
 * obstacles.
 *
 * @param {MapId} map - The map.
 * @param {GroundVector} from - Where the way starts.
 * @param {GroundVector} to - Where the way is to end.
 * @returns {GroundVector[] | null} The points to walk to, one straight walk
 *   after another, the last of which is the end, or `null` if there is no
 *   such way.  A player that walks it touches nothing.
 */
export function findMapPath(
  map: MapId,
  from: GroundVector,
  to: GroundVector,
): GroundVector[] | null {
  if (map === 'village') {
    return findVillagePath(from, to);
  }
  let graph: NavigationGraph | undefined = mapGraphs.get(map);
  if (graph === undefined) {
    graph = new NavigationGraph(findMapTerrain(map));
    mapGraphs.set(map, graph);
  }
  return graph.findPath(from, to);
}
