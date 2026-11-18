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
 * @module shared/tests/interaction Tests for what a player does when it
 *   interacts with the world.
 */

import { describe, expect, it } from 'vitest';

import {
  FOUNTAIN_REACH,
  FOUNTAIN_RIM_RADIUS,
  INTERACTION_HALF_ANGLE,
  PLAYER_RADIUS,
  PLAZA_CENTRE,
  TALK_REACH,
  findInteraction,
  findPlacement,
  findVillager,
} from '../src/index.ts';
import type { Placement, Pose } from '../src/index.ts';

/**
 * The farthest a player can stand from the centre of the fountain to drink
 * from it.
 */
const REACH: number = FOUNTAIN_RIM_RADIUS + PLAYER_RADIUS + FOUNTAIN_REACH;

/** Where Nancy the villager stands. */
const NANCY: Placement = findPlacement('npc-nancy.glb');

/** What Nancy says when a player talks to her. */
const NANCY_LINE =
  'Wild dogs prowl outside the village, and no one dares to go out any ' +
  'more. What are we to do?';

/**
 * Makes the pose of a player some way south of Nancy.
 *
 * @param {number} distance - How far from her it stands, from centre to
 *   centre, in metres.
 * @param {number} yaw - The way it faces, 180 to face her.
 * @returns {Pose} The pose.
 */
function standByNancy(distance: number, yaw: number): Pose {
  return { x: NANCY.x, z: NANCY.z + distance, yaw };
}

describe('findInteraction', () => {
  it('drinks by the rim of the fountain, facing it', () => {
    const z: number = PLAZA_CENTRE.z + FOUNTAIN_RIM_RADIUS + PLAYER_RADIUS;
    expect(findInteraction({ x: PLAZA_CENTRE.x, z, yaw: 180 })).toBe('Drink');
  });

  it('drinks as far from the rim as the fountain reaches', () => {
    const x: number = PLAZA_CENTRE.x + REACH - 1e-9;
    expect(findInteraction({ x, z: PLAZA_CENTRE.z, yaw: -90 })).toBe('Drink');
  });

  it('slashes beyond the reach of the fountain, facing it', () => {
    const x: number = PLAZA_CENTRE.x + REACH + 0.01;
    expect(findInteraction({ x, z: PLAZA_CENTRE.z, yaw: -90 })).toBe('Slash');
  });

  it('drinks facing to one side of the fountain within the angle', () => {
    const x: number = PLAZA_CENTRE.x + REACH - 0.1;
    const yaw: number = -90 + INTERACTION_HALF_ANGLE - 1;
    expect(findInteraction({ x, z: PLAZA_CENTRE.z, yaw })).toBe('Drink');
  });

  it('slashes by the fountain, facing too far to one side of it', () => {
    const x: number = PLAZA_CENTRE.x + REACH - 0.1;
    const yaw: number = -90 - INTERACTION_HALF_ANGLE - 1;
    expect(findInteraction({ x, z: PLAZA_CENTRE.z, yaw })).toBe('Slash');
  });

  it('slashes by the fountain, facing away from it', () => {
    const x: number = PLAZA_CENTRE.x + REACH - 0.1;
    expect(findInteraction({ x, z: PLAZA_CENTRE.z, yaw: 90 })).toBe('Slash');
  });

  it('slashes away from anything to interact with', () => {
    expect(findInteraction({ x: 11, z: 9, yaw: 0 })).toBe('Slash');
  });
});

describe('findInteraction by Nancy', () => {
  it('talks to her as far from her as she can be talked to', () => {
    expect(findInteraction(standByNancy(TALK_REACH - 1e-9, 180))).toBe('Talk');
  });

  it('talks to her facing to one side of her within the angle', () => {
    const yaw: number = 180 + INTERACTION_HALF_ANGLE - 1;
    expect(findInteraction(standByNancy(TALK_REACH - 0.1, yaw))).toBe('Talk');
  });

  it('slashes beyond her reach, facing her', () => {
    expect(findInteraction(standByNancy(TALK_REACH + 0.01, 180))).toBe(
      'Slash',
    );
  });

  it('slashes by her, facing away from her', () => {
    expect(findInteraction(standByNancy(TALK_REACH - 0.1, 0))).toBe('Slash');
  });
});

describe('findVillager', () => {
  it('finds Nancy, with her name and her line, facing her', () => {
    expect(findVillager(standByNancy(TALK_REACH - 0.1, 180))).toMatchObject({
      name: 'Nancy',
      line: NANCY_LINE,
    });
  });

  it('finds nobody by her, facing away from her', () => {
    expect(findVillager(standByNancy(TALK_REACH - 0.1, 0))).toBeNull();
  });

  it('finds nobody by the fountain, facing it', () => {
    const z: number = PLAZA_CENTRE.z + FOUNTAIN_RIM_RADIUS + PLAYER_RADIUS;
    expect(findVillager({ x: PLAZA_CENTRE.x, z, yaw: 180 })).toBeNull();
  });
});
