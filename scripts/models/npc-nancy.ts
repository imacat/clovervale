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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/17
// AI assistance: Claude Code (Anthropic)

/**
 * @module scripts/models/npc-nancy Nancy, a villager who stands in the
 *   town.
 */

import type { Quaternion } from 'three';

import {
  HEAD_CENTER,
  SIDES,
  SKINS,
  addHead,
  createHair,
  setFaceMaterials,
} from './characters.ts';
import type { Hair } from './characters.ts';
import {
  createBox,
  createEllipsoid,
  createLathe,
  createTube,
  place,
} from './geometry.ts';
import type { Placement, Shape, Triple } from './geometry.ts';
import { getItem } from './items.ts';
import { Model } from './model.ts';
import { Rig } from './rig.ts';
import type { BuiltModel, Pose, PoseKey, PoseSample, PoseSpec } from './rig.ts';

/**
 * Builds Nancy, a villager: a woman in a long dress, an apron and a straw
 * hat, with a basket on her arm, who sways and waves.
 *
 * @returns {BuiltModel} The animated model and the measurements taken while
 *   baking.
 */
export function buildNpcNancy(): BuiltModel {
  const model = new Model('NpcNancy');
  setFaceMaterials(model, SKINS.light);
  model.setMaterial('hair', '#8f3d24');
  model.setMaterial('dress', '#b5443f');
  model.setMaterial('cream', '#fbf1d8');
  model.setMaterial('straw', '#ecc965');
  model.setMaterial('basket', '#b07a3c');
  model.setMaterial('green', '#3f9d4f');
  model.setMaterial('shoe', '#6a4226');
  model.setMaterial('apple', '#e2463c');

  model.addBone('Hips', null, [0, 0.56, 0]);
  model.addBone('Chest', 'Hips', [0, 0.66, 0]);
  model.addBone('Head', 'Chest', [0, 0.98, 0]);
  for (const [side, x] of SIDES) {
    model.addBone(`UpperArm${side}`, 'Chest', [0.24 * x, 0.9, 0]);
    model.addBone(`ForeArm${side}`, `UpperArm${side}`, [0.24 * x, 0.73, 0]);
    model.addBone(`Hand${side}`, `ForeArm${side}`, [0.24 * x, 0.57, 0]);
  }

  addHead(model);
  const hair: Hair = createHair('braid');
  model.add('hair', hair.hair, 'Head');
  model.add('green', hair.accent, 'Head');
  const putOnHead = (shape: Shape): Shape =>
    place(place(shape, { rot: [-14, 0, 0] }), { pos: HEAD_CENTER });
  model.add(
    'straw',
    putOnHead(
      createLathe(
        [
          [0.24, 0.17],
          [0.52, 0.14],
          [0.53, 0.175],
          [0.32, 0.215],
          [0.3, 0.35],
          [0.2, 0.43],
          [0, 0.45],
        ],
        12,
      ),
    ),
    'Head',
  );
  model.add(
    'green',
    putOnHead(
      createLathe(
        [
          [0.318, 0.215],
          [0.34, 0.212],
          [0.332, 0.285],
          [0.306, 0.285],
        ],
        12,
      ),
    ),
    'Head',
  );
  for (let i = 0; i < 4; i++) {
    model.add(
      'green',
      putOnHead(
        place(
          place(createEllipsoid([0.05, 0.055, 0.02], 0), {
            pos: [0, 0.055, 0],
          }),
          { pos: [0.13, 0.31, 0.3], rot: [-12, 22, 45 + i * 90] },
        ),
      ),
      'Head',
    );
  }

  const flat: Placement = { scale: [1, 1, 0.9] };
  const thin: Placement = { scale: [1, 1, 0.8] };
  model.add(
    'dress',
    place(
      createLathe(
        [
          [0, 0],
          [0.37, 0],
          [0.375, 0.05],
          [0.33, 0.27],
          [0.19, 0.66],
          [0, 0.67],
        ],
        10,
      ),
      flat,
    ),
    'Hips',
  );
  model.add(
    'cream',
    place(
      createLathe(
        [
          [0.37, 0.03],
          [0.395, 0.03],
          [0.385, 0.1],
          [0.36, 0.1],
        ],
        10,
      ),
      flat,
    ),
    'Hips',
  );
  model.add(
    'cream',
    place(
      createLathe(
        [
          [0.35, 0.205],
          [0.342, 0.27],
          [0.203, 0.66],
          [0.19, 0.66],
        ],
        10,
        { phase: -1.5, from: 0, to: 3 },
      ),
      flat,
    ),
    'Hips',
  );
  model.add(
    'cream',
    place(
      createLathe(
        [
          [0.185, 0.63],
          [0.212, 0.63],
          [0.212, 0.69],
          [0.185, 0.69],
        ],
        10,
      ),
      flat,
    ),
    'Hips',
  );
  for (const x of [1, -1]) {
    model.add(
      'shoe',
      place(createEllipsoid([0.075, 0.05, 0.1], 0), {
        pos: [0.11 * x, 0.05, 0.3],
      }),
      'Hips',
    );
    model.add(
      'cream',
      place(createEllipsoid([0.1, 0.06, 0.035], 0), {
        pos: [0.085 * x, 0.675, -0.2],
        rot: [0, 0, 22 * x],
      }),
      'Hips',
    );
    model.add(
      'cream',
      place(createBox(0.05, 0.2, 0.02), {
        pos: [0.045 * x, 0.56, -0.225],
        rot: [-14, 0, 12 * x],
      }),
      'Hips',
    );
  }
  model.add(
    'cream',
    place(createEllipsoid([0.04, 0.04, 0.04], 0), { pos: [0, 0.67, -0.2] }),
    'Hips',
  );

  model.add(
    'skin',
    createLathe(
      [
        [0.062, 0.95],
        [0.062, 1.04],
      ],
      6,
    ),
    'Chest',
  );
  model.add(
    'dress',
    place(
      createLathe(
        [
          [0, 0.63],
          [0.17, 0.64],
          [0.19, 0.76],
          [0.18, 0.87],
          [0.125, 0.95],
          [0, 0.96],
        ],
        8,
      ),
      thin,
    ),
    'Chest',
  );
  model.add(
    'cream',
    place(
      createLathe(
        [
          [0.13, 0.92],
          [0.155, 0.925],
          [0.11, 0.985],
          [0.07, 0.985],
        ],
        8,
      ),
      thin,
    ),
    'Chest',
  );
  model.add(
    'cream',
    place(createBox(0.2, 0.2, 0.03), { pos: [0, 0.78, 0.145] }),
    'Chest',
  );

  for (const [side, x] of SIDES) {
    const moveAside = (shape: Shape): Shape =>
      place(shape, { pos: [0.24 * x, 0, 0] });
    model.add(
      'cream',
      moveAside(
        createLathe(
          [
            [0, 0.965],
            [0.075, 0.94],
            [0.1, 0.86],
            [0.085, 0.78],
            [0, 0.765],
          ],
          6,
        ),
      ),
      `UpperArm${side}`,
    );
    model.add(
      'skin',
      moveAside(
        createLathe(
          [
            [0, 0.8],
            [0.052, 0.78],
            [0.046, 0.6],
            [0, 0.59],
          ],
          6,
        ),
      ),
      `ForeArm${side}`,
    );
    model.add(
      'skin',
      place(createEllipsoid([0.058, 0.062, 0.062], 1), {
        pos: [0.24 * x, 0.555, 0],
      }),
      `Hand${side}`,
    );
  }

  const basket: Triple = [0.24, 0.39, 0];
  model.add(
    'basket',
    place(
      createLathe(
        [
          [0, 0],
          [0.1, 0],
          [0.14, 0.12],
          [0.12, 0.12],
          [0.09, 0.03],
          [0, 0.03],
        ],
        8,
      ),
      { pos: [basket[0], basket[1] - 0.06, 0] },
    ),
    'HandL',
  );
  const handle: Shape = createTube(
    [
      [0, 0.06, 0.12],
      [0, 0.16, 0.07],
      [0, 0.19, 0],
      [0, 0.16, -0.07],
      [0, 0.06, -0.12],
    ],
    [0.014, 0.014, 0.014, 0.014, 0.014],
    4,
    [1, 0, 0],
  );
  model.add('basket', place(handle, { pos: basket }), 'HandL');
  const fruit: (readonly [number, number, number, string])[] = [
    [0.045, 0.045, 0.03, 'apple'],
    [-0.05, 0.04, 0.04, 'green'],
    [0, 0.045, -0.055, 'apple'],
  ];
  for (const [x, y, z, material] of fruit) {
    model.add(
      material,
      place(createEllipsoid([0.05, 0.05, 0.05], 0), {
        pos: [basket[0] + x, basket[1] + y, z],
      }),
      'HandL',
    );
  }

  const rig = new Rig(model);
  const rest: PoseSpec = {
    UpperArmL: [0, 0, 10],
    ForeArmL: [-12, 0, 0],
    UpperArmR: [4, 0, -9],
    ForeArmR: [-16, 0, 0],
  };
  const waveUp: PoseSpec = { UpperArmR: [0, 0, -142] };
  const waveOut: PoseSpec = {
    ...rest,
    ...waveUp,
    ForeArmR: [0, 0, 30],
    Head: [0, 0, -8],
    Chest: [0, 0, 3],
  };
  const waveIn: PoseSpec = { ...waveOut, ForeArmR: [0, 0, -28] };
  const keys: PoseKey[] = [
    { t: 0, pose: rig.createPose(rest) },
    { t: 1.1, pose: rig.createPose(rest) },
    { t: 1.6, pose: rig.createPose(waveOut) },
    { t: 1.9, pose: rig.createPose(waveIn) },
    { t: 2.2, pose: rig.createPose(waveOut) },
    { t: 2.5, pose: rig.createPose(waveIn) },
    { t: 2.8, pose: rig.createPose(waveOut) },
    { t: 3.4, pose: rig.createPose(rest) },
    { t: 4, pose: rig.createPose(rest) },
  ];
  rig.bake(
    'Idle',
    4,
    (t: number): PoseSample => {
      const pose: Pose = rig.interpolate(keys, t);
      const angle: number = (2 * Math.PI * t) / 2;
      const breath: Pose = rig.createPose({
        Chest: [1.5 * (1 - Math.cos(angle)), 0, 1.2 * Math.sin(angle / 2)],
        Head: [-1.5 * (1 - Math.cos(angle)), 5 * Math.sin(angle / 2), 0],
        UpperArmL: [0, 0, 1.5 * (1 - Math.cos(angle))],
      });
      pose.rotations.forEach((q: Quaternion, i: number) => {
        q.multiply(getItem(breath.rotations, i));
      });
      return { pose };
    },
    { loop: true },
  );
  model.centerOn([]);
  return { model, report: rig.report };
}
