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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/20
// AI assistance: Claude Code (Anthropic)

/**
 * @module shared/tests/cave Tests for the passage and the chambers of the
 *   cave, and the ground the models of the cave take up.
 */

import { describe, expect, it } from 'vitest';

import {
  CAVE_CONTAINERS,
  CAVE_PASSAGE,
  CAVE_TERRAIN,
  NO_WORLD_ITEMS,
  PLAYER_RADIUS,
  VILLAGERS,
  WALK_SPEED,
  createMotion,
  findInteractable,
  locateVillager,
  stepMotion,
} from '../src/index.ts';
import type {
  CaveContainer,
  GroundVector,
  PlayerMotion,
  Pose,
} from '../src/index.ts';
import {
  CAVE_CELLS,
  CAVE_LANDING,
  CAVE_ROPE,
  CAVE_STORE_ROOMS,
} from '../src/cave.ts';
import { NavigationGraph } from '../src/navigation.ts';
import type { CaveRoom } from '../src/cave.ts';

/** The least room every point a test walks to has, in metres. */
const ROOM = 0.05;

/**
 * Finds the middle of a stretch of floor.
 *
 * @param {CaveRoom} room - The stretch.
 * @returns {GroundVector} Its middle.
 */
function findMiddle(room: CaveRoom): GroundVector {
  return { x: (room.west + room.east) / 2, z: (room.north + room.south) / 2 };
}

/**
 * Lists the points on a stretch of floor a player has room to stand at,
 * a grid of them just clear of its walls.
 *
 * @param {CaveRoom} room - The stretch.
 * @returns {GroundVector[]} The points.
 */
function listFloorPoints(room: CaveRoom): GroundVector[] {
  const inset: number = PLAYER_RADIUS + ROOM;
  const points: GroundVector[] = [];
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 4; j++) {
      points.push({
        x: room.west + inset + ((room.east - room.west - 2 * inset) * i) / 4,
        z:
          room.north + inset + ((room.south - room.north - 2 * inset) * j) / 4,
      });
    }
  }
  return points;
}

/**
 * Finds where the people and the things that stand on the floor of the
 * cave stand: the prisoner in his cell and the containers in the store
 * rooms.
 *
 * @returns {GroundVector[]} Where each of them stands.
 */
function listStanding(): GroundVector[] {
  return [
    ...CAVE_CONTAINERS,
    ...VILLAGERS.filter(({ map }) => map === 'cave').map((villager) =>
      locateVillager(villager, 0, []),
    ),
  ];
}

/**
 * Finds where a player stands in front of a container, close by it, facing
 * it.
 *
 * @param {CaveContainer} container - The container.
 * @returns {Pose} Where the player stands, and which way it faces.
 */
function findSpotBefore(container: CaveContainer): Pose {
  const yaw: number = (container.yaw * Math.PI) / 180;
  const distance = 0.75;
  return {
    x: container.x + Math.sin(yaw) * distance,
    z: container.z + Math.cos(yaw) * distance,
    yaw: container.yaw + 180,
  };
}

/** Every side chamber of the cave. */
const CHAMBERS: readonly CaveRoom[] = [...CAVE_STORE_ROOMS, ...CAVE_CELLS];

/**
 * Tells whether a point lies on the floor of the cave, as the plan has it:
 * on the passage, in a side chamber, or on the round bottom of the well
 * shaft at the west end of the passage.
 *
 * @param {GroundVector} point - The point.
 * @returns {boolean} Whether it does.
 */
function isOnPlan(point: GroundVector): boolean {
  const isIn = (room: CaveRoom): boolean =>
    point.x >= room.west &&
    point.x <= room.east &&
    point.z >= room.north &&
    point.z <= room.south;
  return (
    isIn(CAVE_PASSAGE) ||
    CHAMBERS.some(isIn) ||
    Math.hypot(point.x - CAVE_ROPE.x, point.z - CAVE_ROPE.z) <=
      CAVE_PASSAGE.south
  );
}

describe('the ground of the cave', () => {
  it('is clear on the passage and in every chamber, but where things stand', () => {
    const standing: GroundVector[] = listStanding();
    for (const room of [CAVE_PASSAGE, ...CHAMBERS]) {
      for (const point of listFloorPoints(room)) {
        const isNear = ({ x, z }: GroundVector): boolean =>
          Math.hypot(point.x - x, point.z - z) < 1;
        if (isNear(CAVE_ROPE) || standing.some(isNear)) {
          continue;
        }
        expect(CAVE_TERRAIN.isClear(point), JSON.stringify(point)).toBe(true);
      }
    }
  });

  it('leads from the landing to the rope, and into each store room', () => {
    const graph = new NavigationGraph(CAVE_TERRAIN);
    const byRope: GroundVector = { x: CAVE_ROPE.x + 0.8, z: CAVE_ROPE.z };
    expect(graph.findPath(CAVE_LANDING, byRope)).not.toBeNull();
    for (const room of CAVE_STORE_ROOMS) {
      expect(graph.findPath(CAVE_LANDING, findMiddle(room))).not.toBeNull();
    }
  });

  it('leads up to each container, close enough to open it', () => {
    const graph = new NavigationGraph(CAVE_TERRAIN);
    CAVE_CONTAINERS.forEach((container: CaveContainer, id: number) => {
      const spot: Pose = findSpotBefore(container);
      expect(CAVE_TERRAIN.isClear(spot), JSON.stringify(spot)).toBe(true);
      expect(graph.findPath(CAVE_LANDING, spot)).not.toBeNull();
      const motion: PlayerMotion = createMotion(spot, spot.yaw);
      expect(
        findInteractable(
          motion,
          0,
          { map: 'cave', monsters: [], items: NO_WORLD_ITEMS },
          'pick',
        ),
      ).toMatchObject({ type: 'container', id });
    });
  });

  it('keeps every player out of the cells, behind their bars', () => {
    const graph = new NavigationGraph(CAVE_TERRAIN);
    for (const cell of CAVE_CELLS) {
      const middle: GroundVector = findMiddle(cell);
      expect(CAVE_TERRAIN.isClear(middle)).toBe(true);
      expect(graph.findPath(CAVE_LANDING, middle)).toBeNull();
      const side: number = Math.sign(middle.z);
      for (const x of [cell.west + 0.4, middle.x, cell.east - 0.4]) {
        let motion: PlayerMotion = {
          ...createMotion({ x, z: 0 }, side > 0 ? 0 : 180),
          direction: { x: 0, z: side },
        };
        for (let step = 1; step <= 60; step++) {
          motion = stepMotion(motion, step, 'cave', []);
        }
        expect(Math.abs(motion.z)).toBeLessThanOrEqual(
          CAVE_PASSAGE.south - PLAYER_RADIUS,
        );
      }
    }
  });

  it('stops a player at the walls of the passage', () => {
    const from: GroundVector = { x: 9.25, z: 0 };
    for (const side of [-1, 1]) {
      const to: GroundVector = { x: 9.25, z: side * 3 };
      const stopped: GroundVector = CAVE_TERRAIN.resolveMove(from, to);
      expect(Math.abs(stopped.z)).toBeCloseTo(
        CAVE_PASSAGE.south - PLAYER_RADIUS,
      );
    }
  });

  it('stops a player at the foot of the slope', () => {
    const stopped: GroundVector = CAVE_TERRAIN.resolveMove(
      { x: CAVE_PASSAGE.east - 0.5, z: 0 },
      { x: CAVE_PASSAGE.east - 0.1, z: 0 },
    );
    expect(stopped.x).toBeCloseTo(CAVE_PASSAGE.east - PLAYER_RADIUS);
  });

  it('keeps a walking player at the foot of the slope', () => {
    let motion: PlayerMotion = {
      ...createMotion(CAVE_LANDING, 90),
      direction: { x: 1, z: 0 },
    };
    for (let step = 1; step <= 40; step++) {
      motion = stepMotion(motion, step, 'cave', []);
    }
    expect(motion.x).toBeCloseTo(CAVE_PASSAGE.east - PLAYER_RADIUS);
    expect(motion.x - CAVE_LANDING.x).toBeLessThan(WALK_SPEED * 2);
  });

  it('keeps a player off the coil of the rope', () => {
    expect(CAVE_TERRAIN.isClear(CAVE_ROPE)).toBe(false);
  });

  it('is clear nowhere off the plan', () => {
    const { boundary } = CAVE_TERRAIN;
    for (let x = boundary.x - boundary.radius; x <= boundary.x + boundary.radius; x += 0.25) {
      for (let z = -boundary.radius; z <= boundary.radius; z += 0.25) {
        const point: GroundVector = { x, z };
        if (CAVE_TERRAIN.isClear(point)) {
          expect(isOnPlan(point), JSON.stringify(point)).toBe(true);
        }
      }
    }
  });
});
