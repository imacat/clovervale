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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/23
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/tests/head-top Tests for where the top of the head of a
 *   villager or a player is.
 */

import { BoxGeometry, Mesh, Object3D } from 'three';
import type { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { findPlacement, findTobyPose, getVillager } from '@clovervale/shared';
import type { Placement, TobyPose, Villager } from '@clovervale/shared';

import { findFigureTop, findHeadTop } from '../src/head-top.ts';

/** Nancy the villager. */
const NANCY: Villager = getVillager('nancy');

/** Toby, the child who goes about by the gate. */
const TOBY: Villager = getVillager('toby');

/** Where Nancy stands. */
const SPOT: Placement = findPlacement('nancy');

describe('findHeadTop', () => {
  it('finds the top of the model of a villager where it stands', () => {
    const root = new Object3D();
    const body = new Mesh(new BoxGeometry(0.6, 1.6, 0.6));
    body.position.y = 0.8;
    root.add(body);
    root.position.set(SPOT.x, 0, SPOT.z);
    const top: Vector3 = findHeadTop(NANCY, root, 0, []);
    expect(top.x).toBeCloseTo(SPOT.x);
    expect(top.y).toBeCloseTo(1.6);
    expect(top.z).toBeCloseTo(SPOT.z);
  });

  it('finds the top of Toby where he is at the step', () => {
    const root = new Object3D();
    const body = new Mesh(new BoxGeometry(0.4, 1.1, 0.4));
    body.position.y = 0.55;
    root.add(body);
    const toby: TobyPose = findTobyPose(150);
    root.position.set(toby.x, 0, toby.z);
    const top: Vector3 = findHeadTop(TOBY, root, 150, []);
    expect(top.x).toBeCloseTo(toby.x);
    expect(top.y).toBeCloseTo(1.1);
    expect(top.z).toBeCloseTo(toby.z);
  });

  it('takes a usual height where the villager stands without its model', () => {
    const top: Vector3 = findHeadTop(NANCY, null, 0, []);
    expect(top.x).toBeCloseTo(SPOT.x);
    expect(top.y).toBeGreaterThan(1);
    expect(top.z).toBeCloseTo(SPOT.z);
  });
});

describe('findFigureTop', () => {
  it('finds the top of the model of a player where it stands', () => {
    const root = new Object3D();
    const body = new Mesh(new BoxGeometry(0.6, 1.7, 0.4));
    body.position.y = 0.85;
    root.add(body);
    root.position.set(3, 0, -2);
    const top: Vector3 = findFigureTop(root);
    expect(top.x).toBe(3);
    expect(top.y).toBeCloseTo(1.7);
    expect(top.z).toBe(-2);
  });
});
